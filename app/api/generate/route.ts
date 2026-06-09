// app/api/generate/route.ts
// Server-side STRUCTURED streaming endpoint. The browser only ever talks to this
// route — the model call and any API keys never reach the client.
//
// We stream a typed object (title? + body + hashtags) with `streamObject` (AI SDK v6)
// validated against the shared Zod schema from POS-4. Both the real-model path and the
// no-credential mock path emit the SAME wire format — growing JSON text — so the
// client (`useObject`) parses them identically and the app works end to end with or
// without an API key.
//
// POS-9 production polish layered on top of that core flow:
//   - per-client rate limiting (429 + Retry-After) BEFORE we spend a model call,
//   - token usage / cost / latency recorded per request (logs + /api/metrics panel),
//   - the prompt-template version used is recorded with every generation,
//   - bounded retries + structured error logging on the real-model path.

import { streamObject } from "ai";
import { after } from "next/server";
import { z } from "zod";
import { resolveModel } from "@/lib/resolve-model";
import { PROVIDERS, isValidSelection, type ProviderId } from "@/lib/models";
import { buildPrompt, PLATFORMS, LANGUAGES, TONES } from "@/lib/prompts";
import { GenerationModelSchema } from "@/lib/generation";
import { mockObjectStream } from "@/lib/mock";
import { generationLimiter, clientKeyFromHeaders } from "@/lib/rate-limit";
import { recordMetric, type GenerationStatus } from "@/lib/metrics";
import { recordActivation } from "@/lib/activation";

// Streaming generations can run longer than a default request; give them room.
export const maxDuration = 30;

// Bounded retries on transient provider/gateway errors (incl. 429s). The AI SDK
// retries with backoff; if it still fails the error surfaces to the stream and the
// UI shows a retry affordance.
const MAX_RETRIES = 2;

// Rough token estimate (~4 chars/token) for the mock path, which has no real usage —
// just enough to make the metrics panel meaningful with zero credential.
const estimateTokens = (text: string): number => Math.max(1, Math.round(text.length / 4));

const PROVIDER_IDS = PROVIDERS.map((p) => p.id) as [string, ...string[]];

const GenerateRequest = z
  .object({
    source: z.string().trim().min(1, "Missing source text"),
    platform: z.enum(PLATFORMS),
    language: z.enum(LANGUAGES),
    tone: z.enum(TONES),
    provider: z.enum(PROVIDER_IDS),
    model: z.string().min(1),
  })
  .refine((b) => isValidSelection(b.provider, b.model), {
    message: "Invalid provider or model",
    path: ["model"],
  });

/** Did this error come back as an HTTP 429 (rate limited) from the gateway/provider? */
function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { statusCode?: number; status?: number; message?: string };
  if (e.statusCode === 429 || e.status === 429) return true;
  return typeof e.message === "string" && /rate.?limit|429|too many requests/i.test(e.message);
}

// POS-15: the opaque, client-generated session id (sessionStorage UUID) used to count
// distinct activated sessions. We sanitize defensively — bound the length and accept
// only id-shaped characters — so a junk header can't poison the activation Set. No PII:
// this is a random id the browser made up, not an IP or fingerprint.
function sessionIdFromHeaders(headers: Headers): string | undefined {
  const raw = headers.get("x-session-id");
  if (!raw) return undefined;
  const id = raw.trim().slice(0, 100);
  return /^[A-Za-z0-9_-]{8,100}$/.test(id) ? id : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = GenerateRequest.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { source, platform, language, tone, provider, model } = parsed.data;
  const input = { source, platform, language, tone };
  const { system, user, meta } = buildPrompt(input);
  const promptVersion = meta.version;
  const requestId = crypto.randomUUID();
  const sessionId = sessionIdFromHeaders(req.headers);

  // --- Rate limit: reject early, before spending a model call ----------------------
  const rl = generationLimiter.check(clientKeyFromHeaders(req.headers));
  if (!rl.ok) {
    recordMetric({
      id: requestId,
      platform,
      language,
      tone,
      provider,
      model,
      mode: resolveModel(provider as ProviderId, model) ? "live" : "mock",
      promptVersion,
      status: "rate_limited",
      latencyMs: 0,
      errorMessage: `Rate limit exceeded (${rl.limit}/window)`,
    });
    return Response.json(
      {
        error: "Rate limit exceeded. Please wait a moment and try again.",
        retryAfter: rl.retryAfterSec,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(rl.retryAfterSec),
          "x-request-id": requestId,
        },
      },
    );
  }

  // Headers known up front and returned on every streamed response. Usage/cost/latency
  // aren't known until the stream finishes, so those go to logs + /api/metrics, not headers.
  const baseHeaders: Record<string, string> = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "x-request-id": requestId,
    "x-prompt-version": promptVersion,
  };

  const start = Date.now();
  const resolved = resolveModel(provider as ProviderId, model);

  // --- No live credential → stream the mock object (zero cost, end-to-end) ----------
  if (!resolved) {
    const mock = mockObjectStream(input);
    // Tee so we can measure the emitted bytes and record a metric on close without
    // disturbing the bytes the client receives. We register the metering with `after()`
    // so the serverless runtime keeps the instance alive to finish it AFTER the response
    // streams out — a bare fire-and-forget gets suspended once the body flushes, which
    // silently dropped both the metric and (POS-15) the activation count on Fluid Compute.
    const [toClient, toMeter] = mock.tee();
    after(
      meterMockStream(toMeter, {
        requestId,
        platform,
        language,
        tone,
        provider,
        model,
        promptVersion,
        promptText: `${system}\n${user}`,
        start,
        sessionId,
      }),
    );
    return new Response(toClient, {
      headers: { ...baseHeaders, "x-generation-mode": "mock" },
    });
  }

  // --- Real model → stream a structured object, with bounded retries & metrics ------
  const result = streamObject({
    model: resolved,
    schema: GenerationModelSchema,
    system,
    prompt: user,
    maxRetries: MAX_RETRIES,
    onError({ error }) {
      const status: GenerationStatus = isRateLimitError(error) ? "rate_limited" : "error";
      recordMetric({
        id: requestId,
        platform,
        language,
        tone,
        provider,
        model,
        mode: "live",
        promptVersion,
        status,
        latencyMs: Date.now() - start,
        errorMessage: errorMessage(error),
      });
    },
    onFinish({ usage, error }) {
      // `error` set (e.g. final object failed schema validation) → partial generation.
      const status: GenerationStatus = error ? "partial" : "ok";
      // POS-15: a clean "ok" finish is a completed generation → activation signal.
      if (status === "ok") recordActivation(sessionId);
      recordMetric({
        id: requestId,
        platform,
        language,
        tone,
        provider,
        model,
        mode: "live",
        promptVersion,
        status,
        usage: { inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens },
        latencyMs: Date.now() - start,
        errorMessage: error ? errorMessage(error) : undefined,
      });
    },
  });

  return result.toTextStreamResponse({
    headers: { ...baseHeaders, "x-generation-mode": "live" },
  });
}

interface MockMeterContext {
  requestId: string;
  platform: string;
  language: string;
  tone: string;
  provider: string;
  model: string;
  promptVersion: string;
  promptText: string;
  start: number;
  sessionId?: string;
}

/** Drain the metering branch of the mock stream and record a metric on completion. */
async function meterMockStream(
  stream: ReadableStream<Uint8Array>,
  ctx: MockMeterContext,
): Promise<void> {
  const reader = stream.getReader();
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) bytes += value.byteLength;
    }
  } catch {
    // Mock never errors, but never let metering reject.
  }
  // POS-15: the mock stream always completes → counts as a completed generation,
  // so the activation counter works on the zero-credential path too.
  recordActivation(ctx.sessionId);
  recordMetric({
    id: ctx.requestId,
    platform: ctx.platform,
    language: ctx.language,
    tone: ctx.tone,
    provider: ctx.provider,
    model: ctx.model,
    mode: "mock",
    promptVersion: ctx.promptVersion,
    status: "ok",
    inputTokens: estimateTokens(ctx.promptText),
    // The wire format is ~1 byte/char JSON, so bytes ≈ chars for the ~4 chars/token estimate.
    outputTokens: Math.max(1, Math.round(bytes / 4)),
    latencyMs: Date.now() - ctx.start,
  });
}

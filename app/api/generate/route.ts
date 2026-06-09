// app/api/generate/route.ts
// Server-side streaming endpoint. The browser ONLY ever talks to this route — the
// model call and any API keys never reach the client. (Interview talking point #1.)
//
// The request is validated with Zod against the prompt registry. Provider + model are
// chosen by the user; if a live credential exists (AI Gateway, or that provider's own
// key as a fallback) we stream from the model, otherwise we fall back to the mock.
// Both paths return the SAME plain-text stream, so the client is unchanged.

import { streamText } from "ai";
import { z } from "zod";
import { resolveModel } from "@/lib/resolve-model";
import { PROVIDERS, isValidSelection, type ProviderId } from "@/lib/models";
import { buildPrompt, PLATFORMS, LANGUAGES, TONES } from "@/lib/prompts";
import { mockStream } from "@/lib/mock";

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

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = GenerateRequest.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const { source, platform, language, tone, provider, model } = parsed.data;
  const input = { source, platform, language, tone };
  const prompt = buildPrompt(input);

  // No live credential (no gateway + no provider key) → stream the mock so the app
  // still works end to end with zero cost.
  const resolved = resolveModel(provider as ProviderId, model);
  if (!resolved) {
    return new Response(mockStream(input), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // Real model → stream from the chosen provider (via gateway or provider SDK).
  const result = streamText({ model: resolved, prompt });
  return result.toTextStreamResponse();
}

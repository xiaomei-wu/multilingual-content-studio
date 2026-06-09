// app/api/generate/route.ts
// Server-side STRUCTURED streaming endpoint. The browser only ever talks to this
// route — the model call and any API keys never reach the client.
//
// We stream a typed object (title? + body + hashtags) with `streamObject` (AI SDK v6)
// validated against the shared Zod schema from POS-4. Both the real-model path and the
// no-credential mock path emit the SAME wire format — growing JSON text — so the
// client (`useObject`) parses them identically and the app works end to end with or
// without an API key.

import { streamObject } from "ai";
import { z } from "zod";
import { resolveModel } from "@/lib/resolve-model";
import { PROVIDERS, isValidSelection, type ProviderId } from "@/lib/models";
import { buildPrompt, PLATFORMS, LANGUAGES, TONES } from "@/lib/prompts";
import { GenerationModelSchema } from "@/lib/generation";
import { mockObjectStream } from "@/lib/mock";

// Streaming generations can run longer than a default request; give them room.
export const maxDuration = 30;

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
    return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { source, platform, language, tone, provider, model } = parsed.data;
  const input = { source, platform, language, tone };
  const { system, user } = buildPrompt(input);

  // No live credential (no gateway + no provider key) → stream the mock object so the
  // app still works end to end with zero cost.
  const resolved = resolveModel(provider as ProviderId, model);
  if (!resolved) {
    return new Response(mockObjectStream(input), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // Real model → stream a structured object validated against the shared schema.
  const result = streamObject({
    model: resolved,
    schema: GenerationModelSchema,
    system,
    prompt: user,
  });
  return result.toTextStreamResponse();
}

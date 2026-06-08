// app/api/generate/route.ts
// Server-side streaming endpoint. The browser ONLY ever talks to this route — the
// model call and your API keys never reach the client. (Interview talking point #1.)
//
// Provider + model are chosen by the user and validated against the registry. If the
// selected provider's key is configured we stream from it; otherwise we fall back to
// the mock. Both paths return the SAME plain-text stream, so the client is unchanged.

import { streamText } from "ai";
import { resolveModel } from "@/lib/resolve-model";
import { getProvider, isValidSelection } from "@/lib/models";
import {
  buildPrompt,
  PLATFORMS,
  LANGUAGES,
  TONES,
  type PromptInput,
} from "@/lib/prompts";
import { mockStream } from "@/lib/mock";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { source, platform, language, tone, provider, model } = body ?? {};

  if (typeof source !== "string" || !source.trim()) {
    return new Response("Missing source text", { status: 400 });
  }
  if (
    !PLATFORMS.includes(platform) ||
    !LANGUAGES.includes(language) ||
    !TONES.includes(tone)
  ) {
    return new Response("Invalid platform, language, or tone", { status: 400 });
  }
  if (!isValidSelection(provider, model)) {
    return new Response("Invalid provider or model", { status: 400 });
  }

  const input: PromptInput = { source, platform, language, tone };
  const prompt = buildPrompt(input);

  // ── Selected provider has no key → mock fallback ──
  const providerInfo = getProvider(provider)!;
  if (!process.env[providerInfo.envVar]) {
    return new Response(mockStream(input), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // ── Real model → stream from the chosen provider ──
  const result = streamText({
    model: resolveModel(provider, model),
    prompt,
  });

  return result.toTextStreamResponse();
}

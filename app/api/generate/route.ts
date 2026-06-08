// app/api/generate/route.ts
// Server-side streaming endpoint. The browser ONLY ever talks to this route — the
// model call and your API key never reach the client. (Interview talking point #1.)
//
// Behaviour is config-driven: if GOOGLE_GENERATIVE_AI_API_KEY is set we stream from
// Gemini; if not, we fall back to the mock. So anyone can clone the repo and run the
// full UX with zero setup, and we never burn quota while developing. Both paths return
// the SAME plain-text stream, so the client read-loop is identical either way.

import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import {
  buildPrompt,
  PLATFORMS,
  LANGUAGES,
  TONES,
  type PromptInput,
} from "@/lib/prompts";
import { mockStream } from "@/lib/mock";

// Fast and free-tier-friendly. Swap for another Gemini id (e.g. "gemini-flash-latest"
// or "gemini-2.0-flash") — see @ai-sdk/google for the supported model IDs.
const MODEL = "gemini-2.5-flash";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { source, platform, language, tone } = body ?? {};

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

  const input: PromptInput = { source, platform, language, tone };
  const prompt = buildPrompt(input);

  // ── No API key → mock fallback (keeps the app runnable for anyone) ──
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return new Response(mockStream(input), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // ── Real model → stream the completion from Gemini ──
  const result = streamText({
    model: google(MODEL),
    prompt,
  });

  return result.toTextStreamResponse();
}

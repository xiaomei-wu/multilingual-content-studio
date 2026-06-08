// app/api/generate/route.ts
// Server-side streaming endpoint. The browser ONLY ever talks to this route — the
// model call and your API key never reach the client. (Interview talking point #1.)
//
// Behaviour is config-driven: if OPENAI_API_KEY is set we stream from the real model;
// if not, we fall back to the mock. That means anyone can clone the repo and run the
// full UX with zero setup, and we never burn tokens while developing. Both paths
// return the SAME plain-text stream, so the client read-loop is identical either way.

import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  buildPrompt,
  PLATFORMS,
  LANGUAGES,
  TONES,
  type PromptInput,
} from "@/lib/prompts";
import { mockStream } from "@/lib/mock";

// Cheap, fast, good-enough for drafting. Swap for another OpenAI model id if you like.
const MODEL = "gpt-4o-mini";

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
  if (!process.env.OPENAI_API_KEY) {
    return new Response(mockStream(input), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // ── Real model → stream the completion ──
  const result = streamText({
    model: openai(MODEL),
    prompt,
  });

  return result.toTextStreamResponse();
}

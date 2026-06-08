// app/api/generate/route.ts
// Server-side streaming endpoint. The browser ONLY ever talks to this route — the
// model call (and, later, your real API key) never reaches the client. That boundary
// is the whole reason this lives on the server. (Interview talking point #1.)

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
  const { source, platform, language, tone } = body ?? {};

  // Basic validation now; we'll harden this with Zod when we add structured output.
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

  // ── MOCK MODE (no API key yet) ──────────────────────────────────────────────
  // We stream a placeholder so the full pipeline + UI work with zero cost.
  // NEXT STEP — to go live, install `ai` + `@ai-sdk/openai`, then replace the two
  // lines below with:
  //
  //   import { streamText } from "ai";
  //   import { openai } from "@ai-sdk/openai";
  //   const result = streamText({ model: openai("gpt-4o-mini"), prompt });
  //   return result.toTextStreamResponse();
  //
  // The client doesn't change — both return a plain text stream.
  void prompt; // built and ready; the real model will consume it next step
  const stream = mockStream(input);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

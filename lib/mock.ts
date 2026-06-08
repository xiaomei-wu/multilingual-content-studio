// lib/mock.ts
// A fake "model" that streams placeholder text token-by-token, so we can build and
// test the entire UX with NO API key and NO cost. It returns a standard web
// ReadableStream of UTF-8 bytes — exactly the shape the real model will return later
// via `streamText(...).toTextStreamResponse()`, so the client code never changes.

import { PLATFORM_LABELS, LANGUAGE_LABELS, type PromptInput } from "./prompts";

export function mockStream({ platform, language, source }: PromptInput): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const preview = source.trim().slice(0, 80).replace(/\s+/g, " ");

  const text =
    `✨ [MOCK · ${PLATFORM_LABELS[platform]} · ${LANGUAGE_LABELS[language]}]\n\n` +
    "This is a simulated post — no real model was called. Once you add an API key, " +
    "real output will stream through this exact same pipeline.\n\n" +
    `Source preview: "${preview}${source.trim().length > 80 ? "…" : ""}"\n\n` +
    "#ContentStudio #BuildInPublic";

  // Split into word-ish chunks so it visibly "types" like a real LLM stream.
  const tokens = text.match(/\S+\s*/g) ?? [text];

  let i = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i >= tokens.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(tokens[i]));
      i++;
      await new Promise((resolve) => setTimeout(resolve, 35)); // simulate token latency
    },
  });
}

// lib/mock.ts
// A fake "model" that streams a STRUCTURED generation object token-by-token, so we
// can build and test the entire UX with NO API key and NO cost. It streams the
// object as growing JSON text — exactly the wire format that
// `streamObject(...).toTextStreamResponse()` produces and that `useObject` parses on
// the client — so the client code is identical for the mock and the real model.

import {
  PLATFORM_LABELS,
  LANGUAGE_LABELS,
  platformTemplate,
  type PromptInput,
} from "./prompts";
import type { GenerationOutput } from "./generation";

/** Build a plausible, platform-appropriate mock generation from the inputs. */
export function mockGeneration({ platform, language, source }: PromptInput): GenerationOutput {
  const preview = source.trim().slice(0, 80).replace(/\s+/g, " ");
  const truncated = source.trim().length > 80 ? "…" : "";
  const t = platformTemplate(platform);

  const body =
    `✨ [MOCK · ${PLATFORM_LABELS[platform]} · ${LANGUAGE_LABELS[language]}]\n\n` +
    "This is a simulated post — no real model was called. Add an API key " +
    "(or AI Gateway credential) and real output streams through this exact same pipeline.\n\n" +
    `Source preview: "${preview}${truncated}"`;

  return {
    title: t.requiresTitle ? `✨ ${PLATFORM_LABELS[platform]} 模拟标题` : undefined,
    body,
    // Respect the platform's hashtag ceiling so the mock validates cleanly.
    hashtags: ["ContentStudio", "BuildInPublic", "Multilingual"].slice(0, Math.max(t.hashtags.min, 1)),
  };
}

/**
 * Stream the mock generation as chunked JSON text. The client accumulates the text
 * and parses partial JSON, so fields appear progressively — just like a real model.
 */
export function mockObjectStream(input: PromptInput): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  // Emit the same wire shape the real model streams (GenerationModelSchema): all three
  // keys present, `title` as null when the platform has none.
  const obj = mockGeneration(input);
  const json = JSON.stringify({
    title: obj.title ?? null,
    body: obj.body,
    hashtags: obj.hashtags,
  });

  // Split into small chunks so it visibly "types" like a streamed object.
  // (JSON.stringify escapes newlines, so the string has no literal line breaks.)
  const chunks = json.match(/.{1,8}/g) ?? [json];

  let i = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]));
      i++;
      await new Promise((resolve) => setTimeout(resolve, 30)); // simulate token latency
    },
  });
}

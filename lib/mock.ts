// lib/mock.ts
// A fake "model" that streams a STRUCTURED generation object token-by-token, so we
// can build and test the entire UX with NO API key and NO cost. It streams the
// object as growing JSON text — exactly the wire format that
// `streamObject(...).toTextStreamResponse()` produces and that `useObject` parses on
// the client — so the client code is identical for the mock and the real model.

import {
  PLATFORM_LABELS,
  LANGUAGE_LABELS,
  TONE_LABELS,
  platformTemplate,
  type Language,
  type Tone,
  type PromptInput,
} from "./prompts";
import type { GenerationOutput } from "./generation";

// Localized copy so the mock is genuinely WRITTEN IN the chosen target language — not
// English with a label slapped on. This lets a preview deploy with no credential still
// demonstrate POS-7 end to end: switching language/tone visibly changes the output.

interface MockStrings {
  /** Headline used for platforms that require a title. */
  title: string;
  /** Explanatory sentence (in the target language). */
  explainer: string;
  /** "Source preview" label (in the target language). */
  sourceLabel: string;
}

const MOCK_STRINGS: Record<Language, MockStrings> = {
  en: {
    title: "Mock headline",
    explainer:
      "This is a simulated post — no real model was called. Add an API key (or AI Gateway credential) and real output streams through this exact same pipeline.",
    sourceLabel: "Source preview",
  },
  de: {
    title: "Mock-Titel",
    explainer:
      "Dies ist ein simulierter Beitrag — es wurde kein echtes Modell aufgerufen. Füge einen API-Schlüssel (oder AI-Gateway-Zugang) hinzu, und echte Ausgaben fließen durch genau diese Pipeline.",
    sourceLabel: "Quellenvorschau",
  },
  zh: {
    title: "模拟标题",
    explainer:
      "这是一篇模拟帖子——没有调用真实模型。添加 API 密钥（或 AI Gateway 凭证），真实输出就会通过同一条管道流式生成。",
    sourceLabel: "来源预览",
  },
};

// A short, localized tone descriptor so changing the tone selector visibly changes the
// mock output (the real-model path gets tone via the prompt fragments in prompts.ts).
const TONE_DESCRIPTOR: Record<Language, Record<Tone, string>> = {
  en: { professional: "polished & credible", casual: "relaxed & friendly", punchy: "bold & energetic" },
  de: { professional: "seriös & glaubwürdig", casual: "locker & freundlich", punchy: "kraftvoll & energisch" },
  zh: { professional: "专业且可信", casual: "轻松友好", punchy: "大胆有力" },
};

/** Build a plausible, platform-appropriate mock generation from the inputs. */
export function mockGeneration({ platform, language, tone, source }: PromptInput): GenerationOutput {
  const preview = source.trim().slice(0, 80).replace(/\s+/g, " ");
  const truncated = source.trim().length > 80 ? "…" : "";
  const t = platformTemplate(platform);
  const s = MOCK_STRINGS[language];

  // The tag line carries platform · language · tone FIRST, so it survives the maxChars
  // truncation below and the chosen language/tone stay visible even on length-capped X.
  let body =
    `✨ [MOCK · ${PLATFORM_LABELS[platform]} · ${LANGUAGE_LABELS[language]} · ${TONE_LABELS[tone]}]\n` +
    `(${TONE_DESCRIPTOR[language][tone]})\n\n` +
    `${s.explainer}\n\n` +
    `${s.sourceLabel}: "${preview}${truncated}"`;

  // Keep the mock within the platform's hard length limit so it always validates cleanly.
  if (t.maxChars !== undefined && body.length > t.maxChars) {
    body = body.slice(0, t.maxChars - 1).trimEnd() + "…";
  }

  return {
    title: t.requiresTitle ? `✨ ${s.title}` : undefined,
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

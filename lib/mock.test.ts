// lib/mock.test.ts
// The no-credential mock must produce a platform-valid generation and stream it as
// JSON text that reassembles into the same object — the contract the client relies on.

import { describe, it, expect } from "vitest";
import { mockGeneration, mockObjectStream } from "./mock";
import { validateGeneration, coerceGeneration } from "./generation";
import { PLATFORMS, type PromptInput } from "./prompts";

const baseInput = (overrides: Partial<PromptInput> = {}): PromptInput => ({
  source: "Our new API cuts onboarding from days to minutes.",
  platform: "linkedin",
  language: "en",
  tone: "professional",
  ...overrides,
});

async function drain(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe("mockGeneration — platform-valid output", () => {
  it.each(PLATFORMS)("produces a generation that passes %s constraints", (platform) => {
    const gen = mockGeneration(baseInput({ platform }));
    const result = validateGeneration(gen, platform);
    expect(result.ok).toBe(true);
  });

  it("includes a title only for platforms that require one", () => {
    expect(mockGeneration(baseInput({ platform: "xiaohongshu" })).title).toBeTruthy();
    expect(mockGeneration(baseInput({ platform: "linkedin" })).title).toBeUndefined();
  });

  it("writes the body in the chosen target language", () => {
    // German and Chinese mocks must contain language-native copy, not English boilerplate —
    // this is what makes a credential-free preview deploy demonstrate POS-7.
    expect(mockGeneration(baseInput({ language: "de" })).body).toContain("simulierter Beitrag");
    expect(mockGeneration(baseInput({ language: "zh" })).body).toContain("模拟帖子");
    expect(mockGeneration(baseInput({ language: "en" })).body).toContain("simulated post");
  });

  it("reflects the chosen tone so changing tone changes the output", () => {
    const professional = mockGeneration(baseInput({ tone: "professional" })).body;
    const punchy = mockGeneration(baseInput({ tone: "punchy" })).body;
    expect(professional).not.toEqual(punchy);
    expect(professional).toContain("Professional");
    expect(punchy).toContain("Punchy");
  });
});

describe("mockObjectStream — JSON wire format", () => {
  it("streams chunked JSON that reassembles into the generation", async () => {
    const text = await drain(mockObjectStream(baseInput()));
    const reparsed = coerceGeneration(text);
    expect(reparsed.body).toContain("[MOCK");
    expect(JSON.parse(text)).toHaveProperty("body");
  });
});

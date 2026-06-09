// lib/generation.test.ts
// The generation output schema must be typed, validated, and — above all — never
// break the UI: coerceGeneration always returns a renderable object.

import { describe, it, expect } from "vitest";
import {
  GenerationOutputSchema,
  generationSchemaFor,
  validateGeneration,
  coerceGeneration,
} from "./generation";

describe("GenerationOutputSchema (base shape)", () => {
  it("accepts a well-formed object and strips leading '#' from hashtags", () => {
    const parsed = GenerationOutputSchema.parse({
      title: "Hello",
      body: "A real post body.",
      hashtags: ["#BuildInPublic", "ai"],
    });
    expect(parsed.body).toBe("A real post body.");
    expect(parsed.hashtags).toEqual(["BuildInPublic", "ai"]);
  });

  it("defaults hashtags to an empty array and title to undefined", () => {
    const parsed = GenerationOutputSchema.parse({ body: "Body only." });
    expect(parsed.hashtags).toEqual([]);
    expect(parsed.title).toBeUndefined();
  });

  it("rejects an empty body", () => {
    expect(GenerationOutputSchema.safeParse({ body: "   " }).success).toBe(false);
  });
});

describe("generationSchemaFor — platform constraints", () => {
  it("requires a title for 小红书", () => {
    const r = validateGeneration({ body: "no title here", hashtags: ["a", "b", "c"] }, "xiaohongshu");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("title");
  });

  it("enforces the 280-char ceiling for X", () => {
    const long = "x".repeat(281);
    const r = validateGeneration({ body: long }, "x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("280");
  });

  it("rejects too many hashtags for X (max 1)", () => {
    const r = validateGeneration({ body: "short", hashtags: ["one", "two"] }, "x");
    expect(r.ok).toBe(false);
  });

  it("accepts a valid LinkedIn generation", () => {
    const r = validateGeneration({ body: "A solid LinkedIn post.", hashtags: ["ai", "build"] }, "linkedin");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.body).toBe("A solid LinkedIn post.");
  });

  it("accepts a valid 小红书 generation with a title", () => {
    const r = validateGeneration(
      { title: "✨ 上手指南", body: "正文内容。", hashtags: ["效率", "工具", "AI"] },
      "xiaohongshu",
    );
    expect(r.ok).toBe(true);
  });

  it("produces a usable schema object per platform", () => {
    expect(generationSchemaFor("linkedin")).toBeDefined();
    expect(generationSchemaFor("x")).toBeDefined();
    expect(generationSchemaFor("xiaohongshu")).toBeDefined();
  });
});

describe("coerceGeneration — never breaks the UI", () => {
  it("treats plain text as the body", () => {
    const out = coerceGeneration("Just some streamed text.");
    expect(out.body).toBe("Just some streamed text.");
    expect(out.hashtags).toEqual([]);
  });

  it("parses a JSON string into structured fields", () => {
    const out = coerceGeneration('{"title":"T","body":"B","hashtags":["#x"]}');
    expect(out.title).toBe("T");
    expect(out.body).toBe("B");
    expect(out.hashtags).toEqual(["x"]);
  });

  it("validates a structured object", () => {
    const out = coerceGeneration({ body: "Object body", hashtags: ["a"] });
    expect(out.body).toBe("Object body");
    expect(out.hashtags).toEqual(["a"]);
  });

  it("falls back to a placeholder for empty / garbage input rather than throwing", () => {
    expect(coerceGeneration("").body).toBe("—");
    expect(coerceGeneration(null).body).toBe("—");
    expect(coerceGeneration({ nope: true }).body).toBeTruthy();
    expect(() => coerceGeneration(undefined)).not.toThrow();
  });

  it("recovers from malformed JSON by using the raw text", () => {
    const out = coerceGeneration('{"body": broken');
    expect(out.body).toBe('{"body": broken');
  });
});

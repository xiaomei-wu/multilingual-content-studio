// lib/prompts.test.ts
// Acceptance check: every platform × language × tone combination (3 × 3 × 3 = 27)
// composes into a valid, fully-populated structured prompt.

import { describe, it, expect } from "vitest";
import {
  PLATFORMS,
  LANGUAGES,
  TONES,
  LANGUAGE_LABELS,
  buildPrompt,
  renderPrompt,
  promptVersion,
  platformTemplate,
} from "./prompts";

const SOURCE = "Our new API cuts onboarding time from days to minutes.";

// The full cartesian product of the three dimensions.
const COMBOS = PLATFORMS.flatMap((platform) =>
  LANGUAGES.flatMap((language) => TONES.map((tone) => ({ platform, language, tone }))),
);

describe("buildPrompt — every platform × language × tone combo", () => {
  it("covers all 27 combinations", () => {
    expect(COMBOS).toHaveLength(PLATFORMS.length * LANGUAGES.length * TONES.length);
    expect(COMBOS).toHaveLength(27);
  });

  it.each(COMBOS)("builds a valid prompt for %o", ({ platform, language, tone }) => {
    const prompt = buildPrompt({ source: SOURCE, platform, language, tone });

    // System + user are both present and non-trivial.
    expect(prompt.system.length).toBeGreaterThan(10);
    expect(prompt.user.length).toBeGreaterThan(30);

    // The source material is embedded verbatim.
    expect(prompt.user).toContain(SOURCE);

    // The target language is named in the instruction.
    expect(prompt.user).toContain("Write the post in ");

    // Meta echoes the requested dimensions and carries a composite version stamp.
    expect(prompt.meta.platform).toBe(platform);
    expect(prompt.meta.language).toBe(language);
    expect(prompt.meta.tone).toBe(tone);
    expect(prompt.meta.version).toBe(promptVersion(platform, language, tone));
    expect(prompt.meta.version).toContain(`${platform}@`);
    expect(prompt.meta.version).toContain(`lang-${language}@`);
    expect(prompt.meta.version).toContain(`tone-${tone}@`);

    // Constraints mirror the platform template.
    const t = platformTemplate(platform);
    expect(prompt.meta.constraints.requiresTitle).toBe(t.requiresTitle);
    expect(prompt.meta.constraints.maxChars).toBe(t.maxChars);
    expect(prompt.meta.constraints.hashtags).toEqual(t.hashtags);
  });
});

describe("composability & versioning", () => {
  it("changing only the platform changes only the platform segment of the version", () => {
    const a = promptVersion("linkedin", "en", "professional");
    const b = promptVersion("x", "en", "professional");
    expect(a).not.toBe(b);
    // language + tone + core segments are identical
    expect(a.split("|").slice(2)).toEqual(b.split("|").slice(2));
  });

  it("is deterministic — same input yields the same prompt", () => {
    const input = { source: SOURCE, platform: "linkedin", language: "de", tone: "punchy" } as const;
    expect(buildPrompt(input)).toEqual(buildPrompt(input));
  });

  it("trims surrounding whitespace from the source", () => {
    const p = buildPrompt({ source: `   ${SOURCE}   `, platform: "x", language: "en", tone: "casual" });
    expect(p.user).toContain(SOURCE);
    expect(p.user).not.toContain(`   ${SOURCE}`);
  });
});

describe("renderPrompt", () => {
  it("flattens system + user into one string", () => {
    const input = { source: SOURCE, platform: "xiaohongshu", language: "zh", tone: "casual" } as const;
    const { system, user } = buildPrompt(input);
    const flat = renderPrompt(input);
    expect(flat).toBe(`${system}\n\n${user}`);
  });
});

describe("label coverage", () => {
  it("has a language label for every language", () => {
    for (const l of LANGUAGES) expect(LANGUAGE_LABELS[l]).toBeTruthy();
  });
});

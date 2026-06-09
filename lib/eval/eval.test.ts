// lib/eval/eval.test.ts
// Unit tests for the DETERMINISTIC core of the eval harness — language detection,
// rule checks, score aggregation, and the prompt fingerprint. These run with no
// network in the normal `pnpm test` suite; the live LLM-judge run is a separate
// CLI command (`pnpm eval`) so the unit suite stays fast and offline.

import { describe, it, expect } from "vitest";
import { detectLanguage, languageMatches } from "./language";
import { runRuleChecks } from "./rules";
import { scoreCase, aggregate, judgeAverage, MIN_DIMENSION_SCORE } from "./score";
import { promptFingerprint } from "./history";
import { DATASET } from "./dataset";
import type { JudgeScores } from "./judge";
import type { GenerationOutput } from "../generation";

const perfectJudge: JudgeScores = {
  constraintAdherence: 5,
  languageCorrectness: 5,
  keyPointCapture: 5,
  toneMatch: 5,
  notes: "great",
};

describe("detectLanguage", () => {
  it("detects Chinese by script", () => {
    expect(detectLanguage("今天我们发布了一个全新的产品，非常激动！").lang).toBe("zh");
  });

  it("detects German via stopwords and umlauts", () => {
    expect(detectLanguage("Wir haben heute ein neues Produkt für unsere Kunden veröffentlicht und sind sehr stolz.").lang).toBe("de");
  });

  it("detects English via stopwords", () => {
    expect(detectLanguage("We are launching a new product for our customers and the team is proud of it.").lang).toBe("en");
  });

  it("languageMatches gives short ambiguous text the benefit of the doubt", () => {
    // Too short to be confident → should not be penalized as a mismatch.
    expect(languageMatches("OK!", "de")).toBe(true);
  });

  it("languageMatches flags a confident mismatch", () => {
    expect(languageMatches("今天我们发布了一个全新的产品，非常激动！", "en")).toBe(false);
  });
});

describe("runRuleChecks", () => {
  it("passes a clean X post and fails an over-length one", () => {
    const ok: GenerationOutput = { title: undefined, body: "A sharp single idea about shipping fast.", hashtags: ["ship"] };
    expect(runRuleChecks(ok, "x", "en").allPass).toBe(true);

    const tooLong: GenerationOutput = { title: undefined, body: "x".repeat(300), hashtags: [] };
    const res = runRuleChecks(tooLong, "x", "en");
    expect(res.allPass).toBe(false);
    expect(res.checks.find((c) => c.id === "length")?.pass).toBe(false);
  });

  it("requires a title for 小红书", () => {
    const noTitle: GenerationOutput = { title: undefined, body: "正文内容在这里。", hashtags: ["a", "b", "c"] };
    const res = runRuleChecks(noTitle, "xiaohongshu", "zh");
    expect(res.checks.find((c) => c.id === "title")?.pass).toBe(false);
  });

  it("enforces the hashtag band", () => {
    const tooMany: GenerationOutput = { title: undefined, body: "Body.", hashtags: ["a", "b"] };
    expect(runRuleChecks(tooMany, "x", "en").checks.find((c) => c.id === "hashtags")?.pass).toBe(false);
  });
});

describe("scoreCase + aggregate", () => {
  it("passes only when rules pass AND every judge dim ≥ threshold", () => {
    const rules = runRuleChecks({ title: undefined, body: "A crisp idea.", hashtags: ["x"] }, "x", "en");
    expect(scoreCase("ok", rules, perfectJudge).pass).toBe(true);

    const lowJudge: JudgeScores = { ...perfectJudge, keyPointCapture: MIN_DIMENSION_SCORE - 1 };
    const scored = scoreCase("low", rules, lowJudge);
    expect(scored.pass).toBe(false);
    expect(scored.failReasons.some((r) => r.includes("keyPointCapture"))).toBe(true);
  });

  it("fails on a rule violation even with a perfect judge", () => {
    const badRules = runRuleChecks({ title: undefined, body: "y".repeat(400), hashtags: [] }, "x", "en");
    const scored = scoreCase("rulefail", badRules, perfectJudge);
    expect(scored.pass).toBe(false);
    expect(scored.failReasons.some((r) => r.startsWith("rule:length"))).toBe(true);
  });

  it("computes pass-rate and dimension averages", () => {
    const rules = runRuleChecks({ title: undefined, body: "A crisp idea.", hashtags: ["x"] }, "x", "en");
    const pass = scoreCase("a", rules, perfectJudge);
    const fail = scoreCase("b", rules, { ...perfectJudge, toneMatch: 1 });
    const agg = aggregate([pass, fail]);
    expect(agg.passRate).toBe(50);
    expect(agg.passed).toBe(1);
    expect(agg.dimensionAverages.toneMatch).toBe(3); // (5 + 1) / 2
  });

  it("judgeAverage averages the four dimensions", () => {
    expect(judgeAverage(perfectJudge)).toBe(5);
    expect(judgeAverage({ ...perfectJudge, constraintAdherence: 1 })).toBe(4); // (1+5+5+5)/4
  });
});

describe("promptFingerprint", () => {
  it("is order-independent and de-duplicated", () => {
    const a = promptFingerprint(["core@v1|x@v1", "core@v1|linkedin@v1"]);
    const b = promptFingerprint(["core@v1|linkedin@v1", "core@v1|x@v1"]);
    expect(a).toBe(b);
    expect(a.split("|").filter((p) => p === "core@v1").length).toBe(1);
  });

  it("changes when a fragment version bumps", () => {
    const before = promptFingerprint(["core@v1|linkedin@v1"]);
    const after = promptFingerprint(["core@v1|linkedin@v2"]);
    expect(before).not.toBe(after);
  });
});

describe("DATASET", () => {
  it("has 10 cases covering all three languages and platforms", () => {
    expect(DATASET).toHaveLength(10);
    expect(new Set(DATASET.map((c) => c.language))).toEqual(new Set(["en", "de", "zh"]));
    expect(new Set(DATASET.map((c) => c.platform))).toEqual(new Set(["linkedin", "x", "xiaohongshu"]));
    expect(new Set(DATASET.map((c) => c.id)).size).toBe(10); // unique ids
    for (const c of DATASET) expect(c.keyPoints.length).toBeGreaterThan(0);
  });
});

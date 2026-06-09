// lib/eval/rules.ts
// The DETERMINISTIC half of the rubric: rule-based checks that need no model and
// never flake. They cover exactly the constraints we can verify mechanically —
// body length, hashtag count, title requirement, and a language sanity check —
// derived from the SAME platform template the prompt is built from, so the eval
// and the generator can never drift apart.
//
// These checks are "hard gates": a case only passes if every applicable rule
// passes. The LLM judge (judge.ts) scores the softer, semantic dimensions on top.

import { platformTemplate, type Platform, type Language } from "../prompts";
import type { GenerationOutput } from "../generation";
import { languageMatches } from "./language";

export interface RuleCheck {
  /** Stable id, e.g. "length" — used in reports and history. */
  id: string;
  /** Human-readable label. */
  label: string;
  pass: boolean;
  /** Short explanation of the result (the measured value vs. the limit). */
  detail: string;
}

export interface RuleResult {
  checks: RuleCheck[];
  /** True only when every check passed. */
  allPass: boolean;
}

/**
 * Run every mechanical check for one generation against its platform + language.
 * Pure and synchronous — fully unit-testable with no network.
 */
export function runRuleChecks(
  output: GenerationOutput,
  platform: Platform,
  language: Language,
): RuleResult {
  const t = platformTemplate(platform);
  const checks: RuleCheck[] = [];

  // 1. Body length ceiling (only platforms that enforce one).
  if (t.maxChars !== undefined) {
    const len = output.body.length;
    checks.push({
      id: "length",
      label: "Body within length limit",
      pass: len <= t.maxChars,
      detail: `${len}/${t.maxChars} chars`,
    });
  }

  // 2. Hashtag count within the platform's allowed band.
  const tagCount = output.hashtags.length;
  checks.push({
    id: "hashtags",
    label: "Hashtag count in range",
    pass: tagCount >= t.hashtags.min && tagCount <= t.hashtags.max,
    detail: `${tagCount} (allowed ${t.hashtags.min}–${t.hashtags.max})`,
  });

  // 3. Title presence when the platform requires one (e.g. 小红书).
  if (t.requiresTitle) {
    const hasTitle = Boolean(output.title && output.title.trim());
    checks.push({
      id: "title",
      label: "Required title present",
      pass: hasTitle,
      detail: hasTitle ? "present" : "missing",
    });
  }

  // 4. Non-empty body — the one field every platform must produce.
  const hasBody = Boolean(output.body && output.body.trim());
  checks.push({
    id: "body",
    label: "Non-empty body",
    pass: hasBody,
    detail: hasBody ? "ok" : "empty",
  });

  // 5. Language sanity check (a floor; the judge is authoritative).
  const langOk = languageMatches(output.body, language);
  checks.push({
    id: "language",
    label: "Target language (heuristic)",
    pass: langOk,
    detail: langOk ? `looks like ${language}` : `not detected as ${language}`,
  });

  return { checks, allPass: checks.every((c) => c.pass) };
}

// lib/eval/judge.ts
// LLM-as-judge: a SECOND, independent model grades each generation 1–5 on the four
// rubric dimensions. It returns structured output (a Zod-validated object) via
// `generateObject`, so the scores are machine-readable, not prose we have to parse.
//
// The judge is deliberately given the source + the expected key points so it can
// catch missing facts AND fabrication. When no live credential exists, a
// deterministic mock judge derives plausible scores from the rule checks, so the
// pipeline still produces a result (clearly flagged as a dry run).

import { generateObject } from "ai";
import { z } from "zod";
import {
  PLATFORM_LABELS,
  LANGUAGE_LABELS,
  TONE_LABELS,
  platformTemplate,
  type Platform,
  type Language,
  type Tone,
} from "../prompts";
import type { GenerationOutput } from "../generation";
import { resolveEvalModel } from "./model";
import type { RuleResult } from "./rules";

// 1–5 integer scale per dimension. Names match the rubric in the issue.
const ScoreScale = z.number().int().min(1).max(5);

export const JudgeSchema = z.object({
  constraintAdherence: ScoreScale.describe(
    "Does the post follow the platform's format/length/structure conventions? 5 = perfectly idiomatic for the platform.",
  ),
  languageCorrectness: ScoreScale.describe(
    "Is the post written entirely in the requested target language? 5 = fully correct, natural, no stray other-language text.",
  ),
  keyPointCapture: ScoreScale.describe(
    "Does it capture the source's key points without inventing facts? 5 = all key points present, nothing fabricated.",
  ),
  toneMatch: ScoreScale.describe(
    "Does the voice match the requested tone? 5 = nails the tone.",
  ),
  notes: z.string().describe("One or two sentences justifying the lowest score(s)."),
});

export type JudgeScores = z.infer<typeof JudgeSchema>;

export const JUDGE_DIMENSIONS = [
  "constraintAdherence",
  "languageCorrectness",
  "keyPointCapture",
  "toneMatch",
] as const;
export type JudgeDimension = (typeof JUDGE_DIMENSIONS)[number];

export interface JudgeInput {
  source: string;
  keyPoints: string[];
  platform: Platform;
  language: Language;
  tone: Tone;
  output: GenerationOutput;
}

export interface JudgeResult {
  scores: JudgeScores;
  mock: boolean;
}

function renderOutput(output: GenerationOutput): string {
  const parts: string[] = [];
  if (output.title) parts.push(`TITLE: ${output.title}`);
  parts.push(`BODY: ${output.body}`);
  parts.push(`HASHTAGS: ${output.hashtags.length ? output.hashtags.join(", ") : "(none)"}`);
  return parts.join("\n");
}

function buildJudgePrompt(input: JudgeInput): { system: string; prompt: string } {
  const t = platformTemplate(input.platform);
  const constraints = [
    t.maxChars !== undefined ? `body ≤ ${t.maxChars} chars` : null,
    `${t.hashtags.min}–${t.hashtags.max} hashtags`,
    t.requiresTitle ? "a title is required" : "no title needed",
  ]
    .filter(Boolean)
    .join("; ");

  const system =
    "You are a meticulous content-quality reviewer for a multilingual social-media studio. " +
    "Grade the generated post strictly on the rubric. Be critical: reserve 5 for genuinely excellent output. " +
    "Score only what the rubric asks; do not reward length or extra content.";

  const prompt = [
    `PLATFORM: ${PLATFORM_LABELS[input.platform]} (${constraints})`,
    `TARGET LANGUAGE: ${LANGUAGE_LABELS[input.language]}`,
    `REQUESTED TONE: ${TONE_LABELS[input.tone]}`,
    "",
    "SOURCE MATERIAL:",
    input.source.trim(),
    "",
    "KEY POINTS THE POST MUST CAPTURE:",
    ...input.keyPoints.map((p) => `- ${p}`),
    "",
    "GENERATED POST TO GRADE:",
    renderOutput(input.output),
    "",
    "Grade each rubric dimension from 1 (poor) to 5 (excellent).",
  ].join("\n");

  return { system, prompt };
}

/**
 * Deterministic stand-in used when no live credential exists. It is intentionally
 * conservative: it leans on the mechanical rule results so a dry run still produces
 * a coherent, reproducible score — never a fake "all 5s".
 */
export function mockJudge(input: JudgeInput, rules: RuleResult): JudgeResult {
  const ruleById = (id: string) => rules.checks.find((c) => c.id === id);
  const langOk = ruleById("language")?.pass ?? true;
  const lengthOk = ruleById("length")?.pass ?? true;
  const tagsOk = ruleById("hashtags")?.pass ?? true;
  const titleOk = ruleById("title")?.pass ?? true;

  const constraintAdherence = lengthOk && tagsOk && titleOk ? 4 : 2;
  const languageCorrectness = langOk ? 4 : 1;
  // Mock generation echoes a source preview, so partial capture is a fair default.
  const keyPointCapture = 3;
  const toneMatch = 3;

  return {
    scores: {
      constraintAdherence,
      languageCorrectness,
      keyPointCapture,
      toneMatch,
      notes: "Mock judge (no live credential): scores derived from rule checks, not a real model.",
    },
    mock: true,
  };
}

/**
 * Grade one generation with the judge model. Falls back to the deterministic mock
 * judge when `judgeSpec` can't be resolved to a live credential.
 */
export async function judgeGeneration(
  input: JudgeInput,
  judgeSpec: string,
  rules: RuleResult,
): Promise<JudgeResult> {
  const model = resolveEvalModel(judgeSpec);
  if (!model) return mockJudge(input, rules);

  const { system, prompt } = buildJudgePrompt(input);
  const { object } = await generateObject({
    model,
    schema: JudgeSchema,
    system,
    prompt,
  });
  return { scores: object, mock: false };
}

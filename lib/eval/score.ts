// lib/eval/score.ts
// Turns the raw rule + judge results into a per-case verdict and an overall
// PASS-RATE %. Pure and deterministic so the thresholds are unit-testable without
// touching a model.
//
// Pass policy (a case passes only if BOTH halves agree):
//   1. every mechanical rule check passes (hard gate), AND
//   2. every judge dimension is at or above MIN_DIMENSION_SCORE.
// This keeps a post from "passing" on vibes while violating a hard constraint, and
// from passing the constraints while being in the wrong language or off-topic.

import type { RuleResult } from "./rules";
import { JUDGE_DIMENSIONS, type JudgeScores } from "./judge";

/** Lowest acceptable score on any single judge dimension (1–5 scale). */
export const MIN_DIMENSION_SCORE = 3;

export interface CaseScore {
  caseId: string;
  rules: RuleResult;
  judge: JudgeScores;
  /** Mean of the four judge dimensions. */
  judgeAverage: number;
  pass: boolean;
  /** Short machine-readable reasons a case failed (empty when it passed). */
  failReasons: string[];
}

export function judgeAverage(scores: JudgeScores): number {
  const sum = JUDGE_DIMENSIONS.reduce((acc, dim) => acc + scores[dim], 0);
  return sum / JUDGE_DIMENSIONS.length;
}

/** Combine the two halves of the rubric into one verdict for a single case. */
export function scoreCase(caseId: string, rules: RuleResult, judge: JudgeScores): CaseScore {
  const failReasons: string[] = [];

  for (const check of rules.checks) {
    if (!check.pass) failReasons.push(`rule:${check.id} (${check.detail})`);
  }
  for (const dim of JUDGE_DIMENSIONS) {
    if (judge[dim] < MIN_DIMENSION_SCORE) {
      failReasons.push(`judge:${dim}=${judge[dim]}`);
    }
  }

  return {
    caseId,
    rules,
    judge,
    judgeAverage: judgeAverage(judge),
    pass: failReasons.length === 0,
    failReasons,
  };
}

export interface Aggregate {
  total: number;
  passed: number;
  /** Pass-rate as a 0–100 percentage. */
  passRate: number;
  /** Mean judge score per dimension across all cases. */
  dimensionAverages: Record<string, number>;
  /** Mean of all judge averages. */
  overallJudgeAverage: number;
}

/** Roll per-case scores up into the headline pass-rate and dimension averages. */
export function aggregate(scores: CaseScore[]): Aggregate {
  const total = scores.length;
  const passed = scores.filter((s) => s.pass).length;
  const passRate = total === 0 ? 0 : (passed / total) * 100;

  const dimensionAverages: Record<string, number> = {};
  for (const dim of JUDGE_DIMENSIONS) {
    const sum = scores.reduce((acc, s) => acc + s.judge[dim], 0);
    dimensionAverages[dim] = total === 0 ? 0 : sum / total;
  }

  const overallJudgeAverage =
    total === 0 ? 0 : scores.reduce((acc, s) => acc + s.judgeAverage, 0) / total;

  return { total, passed, passRate, dimensionAverages, overallJudgeAverage };
}

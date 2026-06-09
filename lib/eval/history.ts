// lib/eval/history.ts
// Persists each run so prompt changes can be MEASURED, not guessed. We key every
// run by a prompt FINGERPRINT — a stable summary of the fragment versions exercised
// (core/platform/language/tone, from prompts.ts). Bump any template version and the
// fingerprint changes, so a run after a prompt edit lands as a new datapoint and the
// harness can show the score delta against the last run of the same fingerprint.
//
// Storage is a simple append-only JSONL log plus a `latest.json` snapshot, under
// `eval-results/` (git-ignored — these are run artifacts, not source).

import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Aggregate } from "./score";

export const RESULTS_DIR = join(process.cwd(), "eval-results");
const HISTORY_PATH = join(RESULTS_DIR, "history.jsonl");
const LATEST_PATH = join(RESULTS_DIR, "latest.json");

export interface RunRecord {
  timestamp: string;
  /** "live" when a real model graded, "mock" for a dry run. */
  mode: "live" | "mock";
  genModel: string;
  judgeModel: string;
  /** Stable summary of the prompt-fragment versions this run exercised. */
  promptFingerprint: string;
  passRate: number;
  passed: number;
  total: number;
  overallJudgeAverage: number;
  dimensionAverages: Record<string, number>;
}

/**
 * Build the fingerprint from the set of per-case prompt versions. Sorted + de-duped
 * so it's deterministic regardless of case order; joined into one short string.
 */
export function promptFingerprint(promptVersions: string[]): string {
  const fragments = new Set<string>();
  for (const v of promptVersions) {
    for (const part of v.split("|")) fragments.add(part);
  }
  return [...fragments].sort().join("|");
}

export function buildRunRecord(params: {
  timestamp: string;
  mode: "live" | "mock";
  genModel: string;
  judgeModel: string;
  promptFingerprint: string;
  aggregate: Aggregate;
}): RunRecord {
  const { aggregate } = params;
  return {
    timestamp: params.timestamp,
    mode: params.mode,
    genModel: params.genModel,
    judgeModel: params.judgeModel,
    promptFingerprint: params.promptFingerprint,
    passRate: aggregate.passRate,
    passed: aggregate.passed,
    total: aggregate.total,
    overallJudgeAverage: aggregate.overallJudgeAverage,
    dimensionAverages: aggregate.dimensionAverages,
  };
}

/** Read all prior runs (oldest → newest). Returns [] if nothing recorded yet. */
export function readHistory(): RunRecord[] {
  if (!existsSync(HISTORY_PATH)) return [];
  return readFileSync(HISTORY_PATH, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunRecord);
}

/**
 * Most recent prior run sharing the same prompt fingerprint — i.e. comparable.
 * This is what we diff against to show "did this prompt version move the needle?".
 */
export function lastRunForFingerprint(
  history: RunRecord[],
  fingerprint: string,
): RunRecord | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].promptFingerprint === fingerprint) return history[i];
  }
  return undefined;
}

/** Append the run to the history log and overwrite the latest snapshot. */
export function persistRun(record: RunRecord): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  appendFileSync(HISTORY_PATH, JSON.stringify(record) + "\n", "utf8");
  writeFileSync(LATEST_PATH, JSON.stringify(record, null, 2) + "\n", "utf8");
}

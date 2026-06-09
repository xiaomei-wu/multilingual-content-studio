// lib/eval/run.ts
// CLI entry point for the eval harness — the senior signal that proves generation
// actually works. Run it with `pnpm eval` (see package.json).
//
//   pnpm eval                       # live if a credential is present, else a mock dry run
//   pnpm eval --mock                # force the mock pipeline (no model calls)
//   EVAL_GEN_MODEL=anthropic/claude-haiku-4-5 pnpm eval
//   EVAL_JUDGE_MODEL=openai/gpt-4o EVAL_MIN_PASS_RATE=80 pnpm eval
//
// It runs every dataset case through generate → rule checks → LLM judge → score,
// prints a per-case table and the headline PASS-RATE %, persists the run keyed by
// prompt fingerprint, shows the delta vs. the last comparable run, and exits non-zero
// when the pass-rate is below the gate (so CI can fail on a regression).

import { DATASET } from "./dataset";
import { DEFAULT_GEN_SPEC, DEFAULT_JUDGE_SPEC, MOCK_SPEC, resolveEvalModel } from "./model";
import { generateForEval } from "./generate";
import { runRuleChecks } from "./rules";
import { judgeGeneration } from "./judge";
import { scoreCase, aggregate, MIN_DIMENSION_SCORE, type CaseScore } from "./score";
import { JUDGE_DIMENSIONS } from "./judge";
import {
  buildRunRecord,
  persistRun,
  promptFingerprint,
  readHistory,
  lastRunForFingerprint,
} from "./history";

// --- Config from env / flags --------------------------------------------------

const FORCE_MOCK = process.argv.includes("--mock");
const GEN_SPEC = process.env.EVAL_GEN_MODEL || DEFAULT_GEN_SPEC;
const JUDGE_SPEC = process.env.EVAL_JUDGE_MODEL || DEFAULT_JUDGE_SPEC;
const MIN_PASS_RATE = Number(process.env.EVAL_MIN_PASS_RATE ?? 70);
const CONCURRENCY = Math.max(1, Number(process.env.EVAL_CONCURRENCY ?? 3));

// A run is "mock" unless BOTH the generator and judge resolve to a live credential.
const liveAvailable = !FORCE_MOCK && Boolean(resolveEvalModel(GEN_SPEC) && resolveEvalModel(JUDGE_SPEC));
const genSpec = FORCE_MOCK ? "(mock)" : GEN_SPEC;
const judgeSpec = FORCE_MOCK ? "(mock)" : JUDGE_SPEC;

// --- Small concurrency pool (gentle on rate limits) ---------------------------

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// --- One case end to end ------------------------------------------------------

interface CaseRun {
  score: CaseScore;
  promptVersion: string;
  mock: boolean;
  judgeMock: boolean;
}

async function runCase(c: (typeof DATASET)[number]): Promise<CaseRun> {
  const input = { source: c.source, platform: c.platform, language: c.language, tone: c.tone };
  const genCallSpec = FORCE_MOCK ? MOCK_SPEC : GEN_SPEC;
  const judgeCallSpec = FORCE_MOCK ? MOCK_SPEC : JUDGE_SPEC;
  const gen = await generateForEval(input, genCallSpec).catch(() => null);

  // generateForEval falls back to mock internally; a thrown error means a live call
  // failed (e.g. auth/rate limit) — treat as a hard fail rather than crashing the run.
  if (!gen) {
    const rules = { checks: [{ id: "generation", label: "Generation succeeded", pass: false, detail: "model call failed" }], allPass: false };
    const judge = { constraintAdherence: 1, languageCorrectness: 1, keyPointCapture: 1, toneMatch: 1, notes: "Generation failed." };
    return { score: scoreCase(c.id, rules, judge), promptVersion: "(failed)", mock: false, judgeMock: false };
  }

  const rules = runRuleChecks(gen.output, c.platform, c.language);
  const judge = await judgeGeneration(
    { source: c.source, keyPoints: c.keyPoints, platform: c.platform, language: c.language, tone: c.tone, output: gen.output },
    judgeCallSpec,
    rules,
  );

  return {
    score: scoreCase(c.id, rules, judge.scores),
    promptVersion: gen.promptVersion,
    mock: gen.mock,
    judgeMock: judge.mock,
  };
}

// --- Reporting ----------------------------------------------------------------

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function printReport(runs: CaseRun[]) {
  console.log("\nPer-case results");
  console.log("─".repeat(78));
  for (const { score } of runs) {
    const mark = score.pass ? "PASS" : "FAIL";
    const dims = JUDGE_DIMENSIONS.map((d) => `${d[0]}${d[1]}${score.judge[d]}`).join(" "); // e.g. co4 la5 ke4 to4
    console.log(`  [${mark}] ${score.caseId.padEnd(26)} judge≈${score.judgeAverage.toFixed(2)}  ${dims}`);
    if (!score.pass) console.log(`         ↳ ${score.failReasons.join(", ")}`);
  }
}

// --- Main ---------------------------------------------------------------------

async function main() {
  const mode: "live" | "mock" = liveAvailable ? "live" : "mock";
  const timestamp = new Date().toISOString();

  console.log("Multilingual Content Studio — Eval Harness");
  console.log("─".repeat(78));
  console.log(`  mode        : ${mode}${mode === "mock" ? "  (no live credential — dry run; scores are illustrative)" : ""}`);
  console.log(`  generator   : ${genSpec}`);
  console.log(`  judge       : ${judgeSpec}`);
  console.log(`  cases       : ${DATASET.length}`);
  console.log(`  pass gate   : every rule check passes AND every judge dim ≥ ${MIN_DIMENSION_SCORE}; run gate ≥ ${pct(MIN_PASS_RATE)}`);

  const runs = await mapPool(DATASET, CONCURRENCY, (c) => runCase(c));

  printReport(runs);

  const agg = aggregate(runs.map((r) => r.score));
  const fingerprint = promptFingerprint(runs.map((r) => r.promptVersion).filter((v) => v !== "(failed)"));

  console.log("\nSummary");
  console.log("─".repeat(78));
  console.log(`  PASS-RATE   : ${pct(agg.passRate)}  (${agg.passed}/${agg.total})`);
  console.log(`  judge avg   : ${agg.overallJudgeAverage.toFixed(2)} / 5`);
  for (const dim of JUDGE_DIMENSIONS) {
    console.log(`    - ${dim.padEnd(20)}: ${agg.dimensionAverages[dim].toFixed(2)}`);
  }
  console.log(`  prompt fp   : ${fingerprint}`);

  // Delta vs. the last comparable run (same prompt fingerprint).
  const history = readHistory();
  const prior = lastRunForFingerprint(history, fingerprint);
  if (prior) {
    const delta = agg.passRate - prior.passRate;
    const sign = delta > 0 ? "+" : "";
    console.log(`  vs last run : ${sign}${delta.toFixed(1)} pts (was ${pct(prior.passRate)} on ${prior.timestamp.slice(0, 19)})`);
  } else {
    console.log(`  vs last run : (no prior run for this prompt version — baseline)`);
  }

  // Persist (skip for forced mock so dry runs don't pollute the tracked history).
  if (!FORCE_MOCK) {
    const record = buildRunRecord({ timestamp, mode, genModel: genSpec, judgeModel: judgeSpec, promptFingerprint: fingerprint, aggregate: agg });
    persistRun(record);
    console.log(`\n  recorded to eval-results/history.jsonl`);
  }

  const gatePass = agg.passRate >= MIN_PASS_RATE;
  console.log(`\n  ${gatePass ? "✅ PASS" : "❌ FAIL"} — pass-rate ${pct(agg.passRate)} ${gatePass ? "≥" : "<"} gate ${pct(MIN_PASS_RATE)}\n`);
  process.exit(gatePass ? 0 : 1);
}

main().catch((err) => {
  console.error("Eval harness crashed:", err);
  process.exit(2);
});

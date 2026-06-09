// lib/metrics.ts
// Per-request observability for generations (POS-9: "log token usage, cost, and
// latency per request, visible in logs or a simple panel"). Every generation —
// real or mock, success or failure — records one GenerationMetric here. We do TWO
// things with it:
//   1. emit a structured JSON line to the server logs (grep `[generation]`), and
//   2. keep the last N in an in-memory ring buffer that GET /api/metrics serves to
//      the in-app metrics panel.
//
// In-memory + per-instance, matching the rate limiter: fine for a single-instance
// demo, swap for Postgres/analytics in production behind the same record() call.

import { estimateCost, type TokenUsage } from "./pricing";

export type GenerationStatus = "ok" | "partial" | "error" | "rate_limited";
export type GenerationMode = "live" | "mock";

export interface GenerationMetric {
  /** Per-request id, also returned to the client via the `x-request-id` header. */
  id: string;
  /** ISO timestamp of when the request finished. */
  at: string;
  platform: string;
  language: string;
  tone: string;
  provider: string;
  model: string;
  mode: GenerationMode;
  /** Composite prompt-template version that produced this generation (POS-4). */
  promptVersion: string;
  status: GenerationStatus;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  /** USD cost estimate, or null when the model is unpriced / tokens unknown. */
  costUsd: number | null;
  latencyMs: number;
  errorMessage?: string;
}

/** What you pass to record(); cost is derived, `at` defaults to now. */
export type GenerationMetricInput = Omit<GenerationMetric, "costUsd" | "at"> & {
  usage?: TokenUsage;
  at?: string;
};

const MAX_METRICS = 50;
const ring: GenerationMetric[] = [];

/**
 * Record one generation. Computes the cost from usage + the price table, appends to
 * the ring buffer (capped), and logs a structured line. Returns the stored metric.
 */
export function recordMetric(input: GenerationMetricInput): GenerationMetric {
  const { usage, at, ...rest } = input;
  const costUsd = usage ? estimateCost(rest.provider, rest.model, usage) : null;

  const metric: GenerationMetric = {
    ...rest,
    at: at ?? new Date().toISOString(),
    inputTokens: usage?.inputTokens ?? rest.inputTokens,
    outputTokens: usage?.outputTokens ?? rest.outputTokens,
    totalTokens:
      rest.totalTokens ??
      (usage && (usage.inputTokens !== undefined || usage.outputTokens !== undefined)
        ? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
        : undefined),
    costUsd,
  };

  ring.push(metric);
  if (ring.length > MAX_METRICS) ring.shift();

  // Structured log line — satisfies "visible in logs" independently of the panel.
  console.log(
    `[generation] ${JSON.stringify({
      id: metric.id,
      status: metric.status,
      mode: metric.mode,
      model: `${metric.provider}/${metric.model}`,
      promptVersion: metric.promptVersion,
      inputTokens: metric.inputTokens,
      outputTokens: metric.outputTokens,
      costUsd: metric.costUsd,
      latencyMs: metric.latencyMs,
    })}`,
  );

  return metric;
}

export interface MetricsSummary {
  count: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export interface MetricsSnapshot {
  recent: GenerationMetric[];
  summary: MetricsSummary;
}

/** Most-recent-first view of the ring buffer plus rolled-up aggregates. */
export function getMetrics(): MetricsSnapshot {
  const recent = [...ring].reverse();
  const count = recent.length;
  const totalCostUsd = recent.reduce((s, m) => s + (m.costUsd ?? 0), 0);
  const totalLatency = recent.reduce((s, m) => s + m.latencyMs, 0);
  const totalInputTokens = recent.reduce((s, m) => s + (m.inputTokens ?? 0), 0);
  const totalOutputTokens = recent.reduce((s, m) => s + (m.outputTokens ?? 0), 0);
  return {
    recent,
    summary: {
      count,
      totalCostUsd,
      avgLatencyMs: count ? Math.round(totalLatency / count) : 0,
      totalInputTokens,
      totalOutputTokens,
    },
  };
}

/** Test helper: clear the in-memory buffer. */
export function _resetMetrics(): void {
  ring.length = 0;
}

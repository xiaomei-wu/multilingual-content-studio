// lib/metrics.test.ts
// The metrics buffer must derive cost from usage, roll up correct aggregates, keep the
// most-recent-first order, and cap its size so it can't grow unbounded.

import { describe, it, expect, beforeEach } from "vitest";
import { recordMetric, getMetrics, _resetMetrics } from "./metrics";

const base = {
  platform: "linkedin",
  language: "en",
  tone: "professional",
  provider: "openai",
  model: "gpt-4o-mini",
  mode: "live" as const,
  promptVersion: "core@v1|linkedin@v1|lang-en@v1|tone-professional@v1",
  status: "ok" as const,
};

beforeEach(() => _resetMetrics());

describe("recordMetric", () => {
  it("derives cost and total tokens from usage", () => {
    const m = recordMetric({
      ...base,
      id: "1",
      latencyMs: 800,
      usage: { inputTokens: 500, outputTokens: 200 },
    });
    expect(m.inputTokens).toBe(500);
    expect(m.outputTokens).toBe(200);
    expect(m.totalTokens).toBe(700);
    expect(m.costUsd).toBeCloseTo(0.000195, 10);
  });

  it("records a null cost for an unpriced (e.g. mock) model without throwing", () => {
    const m = recordMetric({
      ...base,
      id: "1",
      model: "mock-model",
      mode: "mock",
      latencyMs: 50,
      inputTokens: 10,
      outputTokens: 20,
    });
    expect(m.costUsd).toBeNull();
    expect(m.totalTokens).toBeUndefined();
  });

  it("records failures (no usage) cleanly", () => {
    const m = recordMetric({
      ...base,
      id: "err",
      status: "rate_limited",
      latencyMs: 0,
      errorMessage: "Rate limit exceeded",
    });
    expect(m.status).toBe("rate_limited");
    expect(m.costUsd).toBeNull();
  });
});

describe("getMetrics", () => {
  it("returns most-recent-first with rolled-up aggregates", () => {
    recordMetric({ ...base, id: "1", latencyMs: 1000, usage: { inputTokens: 100, outputTokens: 100 } });
    recordMetric({ ...base, id: "2", latencyMs: 2000, usage: { inputTokens: 200, outputTokens: 200 } });

    const { recent, summary } = getMetrics();
    expect(recent.map((m) => m.id)).toEqual(["2", "1"]); // newest first
    expect(summary.count).toBe(2);
    expect(summary.avgLatencyMs).toBe(1500);
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.totalOutputTokens).toBe(300);
    expect(summary.totalCostUsd).toBeGreaterThan(0);
  });

  it("caps the buffer at 50 entries", () => {
    for (let i = 0; i < 60; i++) {
      recordMetric({ ...base, id: `m${i}`, latencyMs: 1 });
    }
    const { recent, summary } = getMetrics();
    expect(recent).toHaveLength(50);
    expect(summary.count).toBe(50);
    // Oldest 10 were evicted; newest survives at the front.
    expect(recent[0].id).toBe("m59");
    expect(recent.some((m) => m.id === "m9")).toBe(false);
  });

  it("starts empty with zeroed aggregates", () => {
    const { recent, summary } = getMetrics();
    expect(recent).toHaveLength(0);
    expect(summary).toMatchObject({ count: 0, totalCostUsd: 0, avgLatencyMs: 0 });
  });
});

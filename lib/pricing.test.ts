// lib/pricing.test.ts
// Cost estimation must be correct for priced models and honest (null) for everything else.

import { describe, it, expect } from "vitest";
import { estimateCost, priceFor, MODEL_PRICES } from "./pricing";
import { PROVIDERS } from "./models";

describe("estimateCost", () => {
  it("computes cost from input + output tokens at the model's per-MTok rate", () => {
    // gpt-4o-mini: $0.15/MTok in, $0.60/MTok out.
    const cost = estimateCost("openai", "gpt-4o-mini", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.75, 10);
  });

  it("handles realistic small token counts", () => {
    const cost = estimateCost("openai", "gpt-4o-mini", {
      inputTokens: 500,
      outputTokens: 200,
    });
    // 500*0.15/1e6 + 200*0.60/1e6 = 0.000075 + 0.00012
    expect(cost).toBeCloseTo(0.000195, 10);
  });

  it("returns null for an unknown / unpriced model", () => {
    expect(estimateCost("openai", "totally-made-up", { inputTokens: 100 })).toBeNull();
  });

  it("returns null when no token counts are available", () => {
    expect(estimateCost("openai", "gpt-4o-mini", {})).toBeNull();
  });

  it("treats a missing side as zero rather than failing", () => {
    const cost = estimateCost("openai", "gpt-4o-mini", { outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(0.6, 10);
  });
});

describe("price table", () => {
  it("has a price for every model exposed in the picker", () => {
    for (const provider of PROVIDERS) {
      for (const model of provider.models) {
        expect(priceFor(provider.id, model.id), `${provider.id}/${model.id}`).not.toBeNull();
      }
    }
  });

  it("uses positive rates throughout", () => {
    for (const price of Object.values(MODEL_PRICES)) {
      expect(price.inputPerMTok).toBeGreaterThan(0);
      expect(price.outputPerMTok).toBeGreaterThan(0);
    }
  });
});

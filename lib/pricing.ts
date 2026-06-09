// lib/pricing.ts
// Per-model token pricing so we can attach a $ cost to every real generation
// (POS-9: "log token usage, cost, and latency per request"). Pure data + a pure
// `estimateCost` function, so it's trivially unit-testable and importable anywhere.
//
// Prices are USD per 1,000,000 tokens and are LIST-PRICE ESTIMATES for the models we
// expose in the picker — good enough to surface relative cost in the metrics panel,
// not an invoice. Unknown models return `null` (we log "cost unknown" rather than a
// wrong number). Keyed by the same `"provider/model"` string the gateway uses.

export interface ModelPrice {
  /** USD per 1M input (prompt) tokens. */
  inputPerMTok: number;
  /** USD per 1M output (completion) tokens. */
  outputPerMTok: number;
}

// Keep these aligned with the models in lib/models.ts. Estimates — override freely.
export const MODEL_PRICES: Record<string, ModelPrice> = {
  // OpenAI
  "openai/gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  "openai/gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10 },
  "openai/gpt-4.1-mini": { inputPerMTok: 0.4, outputPerMTok: 1.6 },
  "openai/gpt-5-mini": { inputPerMTok: 0.25, outputPerMTok: 2 },
  // Google Gemini
  "google/gemini-2.5-flash": { inputPerMTok: 0.3, outputPerMTok: 2.5 },
  "google/gemini-2.0-flash": { inputPerMTok: 0.1, outputPerMTok: 0.4 },
  "google/gemini-2.5-pro": { inputPerMTok: 1.25, outputPerMTok: 10 },
  // Anthropic Claude
  "anthropic/claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
  "anthropic/claude-sonnet-4-5": { inputPerMTok: 3, outputPerMTok: 15 },
  "anthropic/claude-opus-4-5": { inputPerMTok: 5, outputPerMTok: 25 },
};

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

/** Look up the price for a `provider/model` spec, or `null` if we don't have it. */
export function priceFor(provider: string, model: string): ModelPrice | null {
  return MODEL_PRICES[`${provider}/${model}`] ?? null;
}

/**
 * Estimate the USD cost of a single request from its token usage.
 * Returns `null` when the model is unpriced or token counts are unavailable, so the
 * caller can record "cost unknown" rather than a misleading $0.
 */
export function estimateCost(
  provider: string,
  model: string,
  usage: TokenUsage,
): number | null {
  const price = priceFor(provider, model);
  if (!price) return null;
  const input = usage.inputTokens;
  const output = usage.outputTokens;
  if (input === undefined && output === undefined) return null;
  const cost =
    ((input ?? 0) * price.inputPerMTok + (output ?? 0) * price.outputPerMTok) /
    1_000_000;
  return cost;
}

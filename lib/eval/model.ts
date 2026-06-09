// lib/eval/model.ts
// Resolves the "provider/model" specs the eval harness uses for BOTH the generator
// under test and the independent judge. It reuses the app's gateway-first
// resolveModel (POS-3) so the harness exercises the exact same model path the
// product does — gateway when configured, provider SDK as the local fallback.

import type { LanguageModel } from "ai";
import { resolveModel } from "../resolve-model";
import { getProvider, type ProviderId } from "../models";

// Cheap, fast defaults. The judge defaults to a STRONGER, different model than the
// generator so "a second model grades the first" is a real independent signal, not
// self-grading. Override either with EVAL_GEN_MODEL / EVAL_JUDGE_MODEL.
export const DEFAULT_GEN_SPEC = "openai/gpt-4o-mini";
export const DEFAULT_JUDGE_SPEC = "openai/gpt-4o";

export interface ModelSpec {
  provider: ProviderId;
  modelId: string;
  /** Original "provider/model" string, for reporting. */
  spec: string;
}

/** Parse a "provider/model" string (model id may itself contain slashes). */
export function parseModelSpec(spec: string): ModelSpec {
  const slash = spec.indexOf("/");
  if (slash === -1) {
    throw new Error(`Invalid model spec "${spec}" — expected "provider/model".`);
  }
  const provider = spec.slice(0, slash);
  const modelId = spec.slice(slash + 1);
  if (!getProvider(provider) || !modelId) {
    throw new Error(`Invalid model spec "${spec}" — unknown provider or empty model id.`);
  }
  return { provider: provider as ProviderId, modelId, spec };
}

/** Sentinel spec that forces the mock path without touching any credential. */
export const MOCK_SPEC = "mock";

/**
 * Resolve a spec to a LanguageModel, or null when no live credential exists
 * (the caller then runs in mock mode). The MOCK_SPEC sentinel short-circuits to
 * null so callers can force a dry run.
 */
export function resolveEvalModel(spec: string): LanguageModel | null {
  if (spec === MOCK_SPEC) return null;
  const { provider, modelId } = parseModelSpec(spec);
  return resolveModel(provider, modelId);
}

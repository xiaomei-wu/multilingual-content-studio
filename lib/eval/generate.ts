// lib/eval/generate.ts
// One-shot (non-streaming) generation for the harness. The product route streams
// with `streamObject`; for scoring we want the finished object, so we use the
// matching `generateObject` with the SAME prompt builder (POS-4) and the SAME Zod
// schema (POS-5). When no live credential exists we fall back to the mock — so the
// harness is runnable in CI and the full pipeline (rules + judge) can be exercised
// end to end at zero cost.

import { generateObject } from "ai";
import { buildPrompt, type PromptInput } from "../prompts";
import { GenerationModelSchema, coerceGeneration, type GenerationOutput } from "../generation";
import { mockGeneration } from "../mock";
import { resolveEvalModel } from "./model";

export interface GenerationResult {
  output: GenerationOutput;
  /** Composite prompt version stamp (e.g. core@v1|linkedin@v1|…). */
  promptVersion: string;
  /** True when produced by the mock rather than a live model. */
  mock: boolean;
}

/**
 * Generate one post for an eval case. `genSpec` is a "provider/model" string;
 * if it can't be resolved to a live credential, returns the mock generation.
 */
export async function generateForEval(
  input: PromptInput,
  genSpec: string,
): Promise<GenerationResult> {
  const { system, user, meta } = buildPrompt(input);
  const model = resolveEvalModel(genSpec);

  if (!model) {
    return { output: mockGeneration(input), promptVersion: meta.version, mock: true };
  }

  const { object } = await generateObject({
    model,
    schema: GenerationModelSchema,
    system,
    prompt: user,
  });

  // coerceGeneration normalizes (e.g. null title → undefined, strips '#') and
  // guarantees a renderable object, mirroring the product's resilience contract.
  return { output: coerceGeneration(object), promptVersion: meta.version, mock: false };
}

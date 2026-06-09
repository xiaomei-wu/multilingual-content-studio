// lib/generation.ts
// The Zod schema for the STRUCTURED OUTPUT of a generation. Today the model streams
// plain text; from POS-5 onward we also want a typed, validated object (title? + body
// + hashtags) so the UI can render fields, enforce platform limits, and copy parts
// independently. Validation lives here so it is shared by the API route, the eval
// harness, and the tests — and so the rules can never drift from the prompt
// constraints (both are derived from the same platform template).
//
// Design rule: "never breaks the UI." `coerceGeneration` ALWAYS returns a usable
// object — it parses structured JSON when the model returns it, and falls back to
// treating any plain text as the body otherwise. It never throws.

import { z } from "zod";
import { platformTemplate, type Platform } from "./prompts";

// Base shape, platform-agnostic. `.catch`/`.default` keep parsing resilient.
// The `.describe()` lines double as instructions to the model: `streamObject`
// feeds them to the provider so each field is filled with the right content
// (e.g. hashtags land in `hashtags`, not glued onto the end of `body`).
export const GenerationOutputSchema = z.object({
  /** Optional headline (required for 小红书; see the platform-aware schema). */
  title: z
    .string()
    .trim()
    .nullable()
    .optional()
    .describe("Short headline for the post. Only platforms that need a title (e.g. 小红书) should set this.")
    .transform((t) => (t ? t : undefined)),
  /** The post body — the one field every platform must produce. */
  body: z
    .string()
    .trim()
    .min(1, "Generation must include a non-empty body")
    .describe("The full post text, ready to publish. Do NOT include hashtags here — put those in the hashtags field."),
  /** Hashtags WITHOUT the leading '#'. */
  hashtags: z
    .array(z.string().trim().min(1))
    .default([])
    .describe("Relevant hashtags, each WITHOUT the leading '#'.")
    .transform((tags) => tags.map((t) => t.replace(/^#+/, "").trim()).filter(Boolean)),
});

export type GenerationOutput = z.infer<typeof GenerationOutputSchema>;

/**
 * The schema we hand to `streamObject` (server) and `useObject` (client). It mirrors
 * the base shape but is shaped for STRICT structured-output mode: OpenAI requires every
 * property to be present in `required`, so `title` is `.nullable()` (always present, may
 * be null) rather than `.optional()` (omitted from `required`, which OpenAI rejects).
 * Kept transform-free so the generated JSON Schema stays clean across providers.
 */
export const GenerationModelSchema = z.object({
  title: z
    .string()
    .nullable()
    .describe("Short headline. Set to null unless the platform needs a title (e.g. 小红书)."),
  body: z.string().describe("The full publish-ready post text. Do NOT include hashtags here."),
  hashtags: z.array(z.string()).describe("Relevant hashtags, each WITHOUT the leading '#'. May be empty."),
});

export type GenerationModelOutput = z.infer<typeof GenerationModelSchema>;

/**
 * Platform-aware schema: layers the platform template's structural constraints
 * (max body length, hashtag count, title requirement) on top of the base shape.
 * Use this to VALIDATE a finished generation against the rules the prompt asked for.
 */
export function generationSchemaFor(platform: Platform) {
  const t = platformTemplate(platform);
  return GenerationOutputSchema.superRefine((value, ctx) => {
    if (t.requiresTitle && !value.title) {
      ctx.addIssue({
        code: "custom",
        path: ["title"],
        message: `${platform} posts require a title`,
      });
    }
    if (t.maxChars !== undefined && value.body.length > t.maxChars) {
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: `${platform} body must be ≤ ${t.maxChars} characters (got ${value.body.length})`,
      });
    }
    if (value.hashtags.length > t.hashtags.max) {
      ctx.addIssue({
        code: "custom",
        path: ["hashtags"],
        message: `${platform} allows at most ${t.hashtags.max} hashtags (got ${value.hashtags.length})`,
      });
    }
  });
}

/**
 * Validate without throwing. Returns the parsed object, or `null` plus the flattened
 * errors so the caller can decide what to do.
 */
export function validateGeneration(
  raw: unknown,
  platform: Platform,
): { ok: true; data: GenerationOutput } | { ok: false; errors: string[] } {
  const result = generationSchemaFor(platform).safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: result.error.issues.map((i) => i.message) };
}

/**
 * ALWAYS returns a renderable GenerationOutput — never throws, so the UI is never
 * broken by a malformed model response. Accepts:
 *   - a structured object (validated by the base schema),
 *   - a JSON string (parsed, then validated),
 *   - or any plain string (used verbatim as the body).
 */
export function coerceGeneration(raw: unknown): GenerationOutput {
  // Plain text → treat the whole thing as the body.
  if (typeof raw === "string") {
    const text = raw.trim();
    const asJson = tryParseJson(text);
    if (asJson !== undefined) {
      const parsed = GenerationOutputSchema.safeParse(asJson);
      if (parsed.success) return parsed.data;
    }
    return { title: undefined, body: text || "—", hashtags: [] };
  }

  // Object → validate against the base schema, fall back to a stringified body.
  const parsed = GenerationOutputSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return { title: undefined, body: safeStringify(raw), hashtags: [] };
}

function tryParseJson(text: string): unknown | undefined {
  if (!(text.startsWith("{") || text.startsWith("["))) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function safeStringify(value: unknown): string {
  try {
    const s = JSON.stringify(value);
    return s && s !== "{}" && s !== "null" ? s : "—";
  } catch {
    return "—";
  }
}

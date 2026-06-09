// lib/prompts.ts
// The prompt engineering layer: prompts are COMPOSED from small, independently
// versioned fragments — one per platform, language, and tone. Keeping this in code
// (rather than glued together inside a component) lets us (a) unit-test every combo,
// (b) bump a single template's version without touching the others, and (c) measure
// the effect of a prompt change with the eval harness in Week 3.
//
// `buildPrompt` returns a STRUCTURED prompt ({ system, user, meta }) so callers can
// pass system/user separately to the model and read the composite version + the
// platform constraints (used to build the matching Zod output schema in generation.ts).

// --- Dimensions ---------------------------------------------------------------

export const PLATFORMS = ["linkedin", "x", "xiaohongshu"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const LANGUAGES = ["en", "de", "zh"] as const;
export type Language = (typeof LANGUAGES)[number];

export const TONES = ["professional", "casual", "punchy"] as const;
export type Tone = (typeof TONES)[number];

// --- Display labels (used by the UI dropdowns) --------------------------------

export const PLATFORM_LABELS: Record<Platform, string> = {
  linkedin: "LinkedIn",
  x: "X / Twitter",
  xiaohongshu: "小红书",
};
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  de: "Deutsch",
  zh: "中文",
};
export const TONE_LABELS: Record<Tone, string> = {
  professional: "Professional",
  casual: "Casual",
  punchy: "Punchy",
};

// --- Platform templates (each independently versioned) ------------------------
// A platform template carries the writing instructions AND the structural
// constraints that the generation output must satisfy (max length, hashtag count,
// whether a title is required). generation.ts derives the Zod schema from these,
// so the prompt and the validation can never drift apart.

export interface HashtagRule {
  min: number;
  max: number;
}

export interface PlatformTemplate {
  /** Bump when THIS platform's prompt changes — independent of the others. */
  version: string;
  /** Writing instructions injected into the prompt. */
  instructions: string;
  /** Hard character ceiling on the body, if the platform enforces one. */
  maxChars?: number;
  /** Whether the structured output must include a title. */
  requiresTitle: boolean;
  /** Allowed number of hashtags. */
  hashtags: HashtagRule;
}

const PLATFORM_TEMPLATES: Record<Platform, PlatformTemplate> = {
  linkedin: {
    version: "v1",
    instructions:
      "Write a LinkedIn post. Professional but human: a strong hook as the first line, 3–6 short paragraphs, and 1–3 relevant hashtags at the end. No clickbait.",
    requiresTitle: false,
    hashtags: { min: 1, max: 3 },
  },
  x: {
    version: "v1",
    instructions:
      "Write a single X/Twitter post under 280 characters. One sharp idea, punchy, at most one hashtag.",
    maxChars: 280,
    requiresTitle: false,
    hashtags: { min: 0, max: 1 },
  },
  xiaohongshu: {
    version: "v1",
    instructions:
      "Write a 小红书 (Xiaohongshu) post: a catchy title with an emoji, a warm personal tone, short scannable lines, and 3–5 hashtags in #tag# format.",
    requiresTitle: true,
    hashtags: { min: 3, max: 5 },
  },
};

// --- Language templates -------------------------------------------------------

interface LanguageTemplate {
  version: string;
  /** Native language name, for the instruction line. */
  name: string;
}

const LANGUAGE_TEMPLATES: Record<Language, LanguageTemplate> = {
  en: { version: "v1", name: "English" },
  de: { version: "v1", name: "German" },
  zh: { version: "v1", name: "Simplified Chinese" },
};

// --- Tone templates -----------------------------------------------------------

interface ToneTemplate {
  version: string;
  instructions: string;
}

const TONE_TEMPLATES: Record<Tone, ToneTemplate> = {
  professional: { version: "v1", instructions: "Tone: polished and credible." },
  casual: {
    version: "v1",
    instructions: "Tone: relaxed and conversational, like talking to a friend.",
  },
  punchy: { version: "v1", instructions: "Tone: bold, energetic, and concise." },
};

// Version of the shared "core" scaffolding (the system role + the source-handling
// rules). Bump when the framing around the fragments changes.
const CORE_VERSION = "v1";

// --- Accessors (so other modules don't reach into the private maps) -----------

export function platformTemplate(platform: Platform): PlatformTemplate {
  return PLATFORM_TEMPLATES[platform];
}

// --- The composable builder ---------------------------------------------------

export interface PromptInput {
  source: string;
  platform: Platform;
  language: Language;
  tone: Tone;
}

export interface PromptConstraints {
  maxChars?: number;
  requiresTitle: boolean;
  hashtags: HashtagRule;
}

export interface StructuredPrompt {
  /** System role + framing — what the model IS. */
  system: string;
  /** User instruction + the source material — what to DO. */
  user: string;
  meta: {
    platform: Platform;
    language: Language;
    tone: Tone;
    /** Composite, human-readable version stamp across every fragment used. */
    version: string;
    /** Structural constraints the generated output must satisfy. */
    constraints: PromptConstraints;
  };
}

/**
 * Composite version stamp, e.g. `core@v1|linkedin@v1|lang-en@v1|tone-casual@v1`.
 * Stored alongside generations so the eval harness can attribute scores to the exact
 * combination of fragment versions that produced them.
 */
export function promptVersion(platform: Platform, language: Language, tone: Tone): string {
  return [
    `core@${CORE_VERSION}`,
    `${platform}@${PLATFORM_TEMPLATES[platform].version}`,
    `lang-${language}@${LANGUAGE_TEMPLATES[language].version}`,
    `tone-${tone}@${TONE_TEMPLATES[tone].version}`,
  ].join("|");
}

/**
 * Compose a structured prompt from the platform × language × tone fragments.
 * Pure and deterministic — the unit tests assert that every one of the 27 combos
 * produces a valid prompt.
 */
export function buildPrompt({ source, platform, language, tone }: PromptInput): StructuredPrompt {
  const platformT = PLATFORM_TEMPLATES[platform];
  const languageT = LANGUAGE_TEMPLATES[language];
  const toneT = TONE_TEMPLATES[tone];

  const system = "You are an expert social-media writer who adapts voice per platform.";

  const user = [
    platformT.instructions,
    `Write the post in ${languageT.name}.`,
    toneT.instructions,
    "Base it strictly on the source material below. Capture its key points; do not invent facts.",
    "Return only the post text — no preamble, no explanation.",
    "",
    "--- SOURCE ---",
    source.trim(),
  ].join("\n");

  return {
    system,
    user,
    meta: {
      platform,
      language,
      tone,
      version: promptVersion(platform, language, tone),
      constraints: {
        maxChars: platformT.maxChars,
        requiresTitle: platformT.requiresTitle,
        hashtags: platformT.hashtags,
      },
    },
  };
}

/**
 * Flatten a structured prompt to a single string (system + user), for callers that
 * use the AI SDK's single-`prompt` text path rather than separate system/messages.
 */
export function renderPrompt(input: PromptInput): string {
  const { system, user } = buildPrompt(input);
  return `${system}\n\n${user}`;
}

// lib/prompts.ts
// The prompt builder: composable functions of (platform × language × tone).
// Kept in code (not glued together inside a component) and version-stamped, so in
// Week 3 we can change prompts and measure the effect with the eval harness.

export const PLATFORMS = ["linkedin", "x", "xiaohongshu"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const LANGUAGES = ["en", "de", "zh"] as const;
export type Language = (typeof LANGUAGES)[number];

export const TONES = ["professional", "casual", "punchy"] as const;
export type Tone = (typeof TONES)[number];

// Bump this whenever the prompt logic changes — the eval harness tracks scores per version.
export const PROMPT_VERSION = "v1";

// --- Display labels (used by the UI dropdowns) ---
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

// --- Prompt fragments ---
const PLATFORM_RULES: Record<Platform, string> = {
  linkedin:
    "Write a LinkedIn post. Professional but human: a strong hook as the first line, 3–6 short paragraphs, and 1–3 relevant hashtags at the end. No clickbait.",
  x: "Write a single X/Twitter post under 280 characters. One sharp idea, punchy, at most one hashtag.",
  xiaohongshu:
    "Write a 小红书 (Xiaohongshu) post: a catchy title with an emoji, a warm personal tone, short scannable lines, and 3–5 hashtags in #tag# format.",
};

const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  de: "German",
  zh: "Simplified Chinese",
};

const TONE_RULES: Record<Tone, string> = {
  professional: "Tone: polished and credible.",
  casual: "Tone: relaxed and conversational, like talking to a friend.",
  punchy: "Tone: bold, energetic, and concise.",
};

export interface PromptInput {
  source: string;
  platform: Platform;
  language: Language;
  tone: Tone;
}

export function buildPrompt({ source, platform, language, tone }: PromptInput): string {
  return [
    "You are an expert social-media writer.",
    PLATFORM_RULES[platform],
    `Write the post in ${LANGUAGE_NAMES[language]}.`,
    TONE_RULES[tone],
    "Base it strictly on the source material below. Capture its key points; do not invent facts.",
    "Return only the post text — no preamble, no explanation.",
    "",
    "--- SOURCE ---",
    source.trim(),
  ].join("\n");
}

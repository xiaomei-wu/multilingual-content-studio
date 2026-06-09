// lib/eval/language.ts
// Dependency-free language detection for the rule-based half of the eval harness.
// This is a cheap SANITY check ("did the model answer in roughly the right
// language?"), not a linguistics-grade detector — the LLM judge gives the
// authoritative language verdict. We avoid an external dep so the harness stays
// installable and the pure logic stays unit-testable with no network.

import type { Language } from "../prompts";

export interface LanguageGuess {
  /** Best-guess language, or "unknown" when there isn't enough signal. */
  lang: Language | "unknown";
  /** True when the signal was strong enough to trust the guess. */
  confident: boolean;
}

// German-specific letters and a handful of very common function words. English
// shares the Latin alphabet, so we lean on these German markers to separate the two.
const GERMAN_CHARS = /[äöüß]/i;
const GERMAN_WORDS =
  /\b(und|der|die|das|ist|nicht|ein|eine|mit|für|auf|wir|sie|ich|du|als|auch|aber|sehr|wie|von|im|zum|zur)\b/gi;
const ENGLISH_WORDS =
  /\b(the|and|is|to|of|a|in|for|we|you|it|this|that|with|on|are|our|your|as|at|be|have)\b/gi;

/** Fraction of CJK (Han) characters among all letter-ish characters. */
function cjkRatio(text: string): number {
  const cjk = (text.match(/[㐀-鿿]/g) ?? []).length;
  const letters = (text.match(/[\p{L}]/gu) ?? []).length;
  if (letters === 0) return 0;
  return cjk / letters;
}

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/**
 * Heuristic language detection across the three languages the studio supports.
 * Strategy: Chinese is unambiguous by script; English vs. German is decided by
 * German-specific letters and a stopword tug-of-war.
 */
export function detectLanguage(text: string): LanguageGuess {
  const trimmed = text.trim();
  if (!trimmed) return { lang: "unknown", confident: false };

  // Chinese: decided purely by script share — robust and unambiguous.
  if (cjkRatio(trimmed) > 0.2) return { lang: "zh", confident: true };

  const german = countMatches(trimmed, GERMAN_WORDS) + (GERMAN_CHARS.test(trimmed) ? 2 : 0);
  const english = countMatches(trimmed, ENGLISH_WORDS);

  if (german === 0 && english === 0) {
    // Latin text with no recognizable stopwords (e.g. very short posts): default to
    // English but flag it as low-confidence so callers don't over-penalize.
    return { lang: "en", confident: false };
  }
  if (german > english) return { lang: "de", confident: german - english >= 2 };
  return { lang: "en", confident: english - german >= 2 };
}

/**
 * Does the text plausibly match the expected target language? Low-confidence
 * guesses are treated as a match (benefit of the doubt) so the rule check stays a
 * floor, not a nitpick — the judge handles the nuanced call.
 */
export function languageMatches(text: string, expected: Language): boolean {
  const guess = detectLanguage(text);
  if (guess.lang === expected) return true;
  if (!guess.confident) return true;
  return false;
}

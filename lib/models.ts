// lib/models.ts
// CLIENT-SAFE registry of providers + models. Pure data (no SDK imports), so it can be
// imported by both the UI and the server. Env-var NAMES live here (not secret); the
// actual SDK provider factories live in resolve-model.ts (server-only).

export type ProviderId = "openai" | "google" | "anthropic";

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  envVar: string;
  models: ModelOption[];
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    envVar: "OPENAI_API_KEY",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini (fast, cheap)" },
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
      { id: "gpt-5-mini", label: "GPT-5 mini" },
    ],
  },
  {
    id: "google",
    label: "Google Gemini",
    envVar: "GOOGLE_GENERATIVE_AI_API_KEY",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (fast)" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    envVar: "ANTHROPIC_API_KEY",
    models: [
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fast)" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
    ],
  },
];

export const DEFAULT_PROVIDER: ProviderId = "openai";
export const DEFAULT_MODEL = "gpt-4o-mini";

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function isValidSelection(provider: string, model: string): boolean {
  const p = getProvider(provider);
  return !!p && p.models.some((m) => m.id === model);
}

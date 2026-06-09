// lib/resolve-model.ts
// SERVER-ONLY. Turns a provider id + model id into something `streamText` can use.
//
// Gateway-first (POS-3 acceptance criteria): when an AI Gateway credential is present
// we return a plain `"provider/model"` string. AI SDK v6 resolves that through the
// Vercel AI Gateway — one credential covers every provider, and NO provider-specific
// SDK is involved. The provider SDKs below are the "unless required" fallback: they
// only kick in for local dev when a single provider key (e.g. OPENAI_API_KEY) is set
// and no gateway credential exists. Returns `null` when no usable credential is found,
// which tells the caller to stream the mock instead.

import type { LanguageModel } from "ai";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { getProvider, type ProviderId } from "./models";

/**
 * True when the AI Gateway can be reached: either an explicit `AI_GATEWAY_API_KEY`
 * (local / any host) or a Vercel OIDC token (auto-injected on Vercel deployments).
 */
export function gatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

/**
 * True when *this* provider can serve a live request — via the gateway (covers all
 * providers) or via its own provider key as a fallback.
 */
export function providerIsLive(provider: ProviderId): boolean {
  if (gatewayConfigured()) return true;
  const info = getProvider(provider);
  return Boolean(info && process.env[info.envVar]);
}

export function resolveModel(provider: ProviderId, modelId: string): LanguageModel | null {
  // Gateway-first: route the "provider/model" string through the Vercel AI Gateway.
  if (gatewayConfigured()) {
    return `${provider}/${modelId}`;
  }

  // Fallback (no gateway): use the provider SDK directly with its own key, if present.
  const info = getProvider(provider);
  if (!info || !process.env[info.envVar]) {
    return null; // no credential → caller streams the mock
  }

  switch (provider) {
    case "openai":
      return openai(modelId);
    case "google":
      return google(modelId);
    case "anthropic":
      return anthropic(modelId);
    default:
      return null;
  }
}

// lib/resolve-model.ts
// SERVER-ONLY. Maps a provider id + model id to a concrete AI SDK model instance.
// This is the ONLY place the provider SDKs are imported, so they never reach the
// client bundle. Adding a new provider = install its @ai-sdk/* package, add a case
// here, and add an entry in models.ts.

import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import type { ProviderId } from "./models";

export function resolveModel(provider: ProviderId, modelId: string) {
  switch (provider) {
    case "openai":
      return openai(modelId);
    case "google":
      return google(modelId);
    case "anthropic":
      return anthropic(modelId);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

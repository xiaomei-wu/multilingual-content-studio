# Multilingual Content Studio

Paste a source text once and generate platform-ready social posts — **LinkedIn**, **X**,
and **小红书 (Xiaohongshu)** — in **English / Deutsch / 中文** with tone control, streamed
live token-by-token. AI-assisted draft, human review on top.

Built with Next.js (App Router) + TypeScript, the [Vercel AI SDK v6](https://sdk.vercel.ai),
Zod, and the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway).

## Getting started

```bash
pnpm install
cp .env.example .env.local   # optional — see "Environment variables" below
pnpm dev                     # http://localhost:3200
```

With **no** credential configured the app runs end to end against a built-in **mock**
model (zero cost), so you can develop the full UX without a key. Add a credential to
stream from a real model.

## Environment variables

All variables are optional; see [`.env.example`](./.env.example). Set them in
`.env.local` for local dev (git-ignored) or in the Vercel project for deployments.
**Never commit real keys.**

| Variable | Required? | Purpose |
| --- | --- | --- |
| `AI_GATEWAY_API_KEY` | Preferred | Routes every provider through the Vercel AI Gateway using `"provider/model"` strings. One key covers OpenAI, Google, and Anthropic — no provider SDK key needed. |
| `VERCEL_OIDC_TOKEN` | Auto on Vercel | Auto-injected on Vercel deployments; authenticates the AI Gateway with no manual key. |
| `OPENAI_API_KEY` | Fallback | Enables OpenAI models directly when the gateway is not configured. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Fallback | Enables Google Gemini models directly. |
| `ANTHROPIC_API_KEY` | Fallback | Enables Anthropic Claude models directly. |

**Credential resolution order** (see `lib/resolve-model.ts`):

1. **AI Gateway** — if `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` is present, the model
   is resolved as a `"provider/model"` string through the gateway. No provider SDK is used.
2. **Provider SDK fallback** — otherwise, if the selected provider's own key is set, that
   provider's SDK is used directly (the "unless required" escape hatch).
3. **Mock** — if neither is available, the request streams the mock model.

## How it works

The browser only ever talks to `POST /api/generate`; model calls and keys never reach the
client. The request is validated with Zod against the prompt registry, the prompt is
composed from `(platform × language × tone)` in `lib/prompts.ts`, and the response is
streamed back with `streamText(...).toTextStreamResponse()`. The mock and the real model
return the identical plain-text stream, so the client code is unchanged either way.

| Path | Role |
| --- | --- |
| `app/api/generate/route.ts` | Zod-validated streaming generation endpoint. |
| `app/api/config/route.ts` | Reports which providers are "live" (booleans only). |
| `lib/models.ts` | Client-safe provider/model registry (no SDK imports). |
| `lib/resolve-model.ts` | Server-only gateway-first model resolution. |
| `lib/prompts.ts` | Versioned, composable prompt builder. |
| `lib/mock.ts` | Zero-cost streaming mock model. |

> Persistence (a database layer) is **off the current MVP path** and intentionally not
> part of this branch — generation and review are the focus first.

## Deploy

Deploy on [Vercel](https://vercel.com/new). On Vercel the AI Gateway authenticates via the
auto-injected `VERCEL_OIDC_TOKEN`, so no key configuration is needed to stream live.

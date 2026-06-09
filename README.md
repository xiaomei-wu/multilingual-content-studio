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
| `lib/eval/` | Eval harness — proves generation quality (see below). |

> Persistence (a database layer) is **off the current MVP path** and intentionally not
> part of this branch — generation and review are the focus first.

## Eval harness

The eval harness is how we _prove_ generation works and measure the effect of prompt
changes. It runs 10 fixed, varied inputs (`lib/eval/dataset.ts` — across length, topic,
and the en/de/zh languages × every platform) through `generate → rule checks → LLM judge`
and prints a **pass-rate %**.

```bash
pnpm eval            # live if a credential is present, else a mock dry run
pnpm eval --mock     # force the offline mock pipeline (no model calls, no cost)
```

Each output is scored two ways:

- **Rule-based** (`lib/eval/rules.ts`, deterministic): body length ≤ platform limit,
  hashtag count in range, required title present, and a language sanity check.
- **LLM-as-judge** (`lib/eval/judge.ts`): a _second, independent_ model grades each
  output 1–5 on four rubric dimensions — constraint adherence, target-language
  correctness, key-point capture, and tone match.

A case passes only when **every rule check passes AND every judge dimension ≥ 3**. Configure
with env vars: `EVAL_GEN_MODEL`, `EVAL_JUDGE_MODEL` (both `"provider/model"`),
`EVAL_MIN_PASS_RATE` (CI gate, default 70), `EVAL_CONCURRENCY`.

Runs are keyed by a **prompt fingerprint** (the set of fragment versions from
`lib/prompts.ts`) and appended to `eval-results/history.jsonl`, so bumping a template
version lands as a new datapoint and the harness reports the pass-rate delta vs. the last
comparable run. The harness exits non-zero when the pass-rate is below the gate, so it
doubles as a CI check. The deterministic scoring logic is unit-tested in
`lib/eval/eval.test.ts` (runs offline in `pnpm test`).

## Deploy

Deploy on [Vercel](https://vercel.com/new). On Vercel the AI Gateway authenticates via the
auto-injected `VERCEL_OIDC_TOKEN`, so no key configuration is needed to stream live.

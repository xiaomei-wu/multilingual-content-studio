"use client";

import { experimental_useObject as useObject } from "@ai-sdk/react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  PROVIDERS,
  getProvider,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  type ProviderId,
} from "@/lib/models";
import {
  PLATFORMS,
  LANGUAGES,
  TONES,
  PLATFORM_LABELS,
  LANGUAGE_LABELS,
  TONE_LABELS,
  platformTemplate,
  type Platform,
  type Language,
  type Tone,
} from "@/lib/prompts";
import { GenerationModelSchema, validateGeneration } from "@/lib/generation";

type Option = { value: string; label: string };
type Draft = { title: string; body: string; hashtags: string };

// POS-9: classified, user-facing failure so each card can show the right recovery copy.
type Failure = {
  kind: "rate_limit" | "partial" | "generic";
  message: string;
};

const emptyDraft: Draft = { title: "", body: "", hashtags: "" };

// POS-19: per-platform brand accent (8px dot in card + section headers).
const PLATFORM_DOT: Record<Platform, string> = {
  linkedin: "#0A66C2",
  x: "#000000",
  xiaohongshu: "#FF2442",
};
// POS-19: compact language chip shown in each card header (EN / DE / ZH).
const LANGUAGE_SHORT: Record<Language, string> = { en: "EN", de: "DE", zh: "ZH" };

// POS-19: a card's identity is now (platform × language), not platform alone.
const cardKey = (platform: Platform, language: Language) => `${platform}:${language}`;

// Map a raw stream/fetch error into a friendly, classified failure. The /api/generate
// route returns a 429 (with a "Rate limit exceeded" body) when the client is over the
// limit; we detect that so the UI nudges the user to wait rather than just "failed".
function classifyError(err: unknown): Failure {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (/rate.?limit|429|too many requests/i.test(message)) {
    return {
      kind: "rate_limit",
      message: "You're generating too quickly. Wait a few seconds, then retry.",
    };
  }
  return { kind: "generic", message: "Something went wrong generating this post." };
}

// The shared inputs every card streams against. Platform AND language are NOT here —
// each card fills those in from its own (platform × language) identity.
type SharedRequest = {
  source: string;
  tone: Tone;
  provider: ProviderId;
  model: string;
};

// Imperative handle each card exposes so the parent's "Generate" can fan out to
// every selected (platform × language) cell at once without an effect/token dance.
type CardHandle = { start: () => void };

// POS-15: an opaque, anonymous per-session id used ONLY so the server can count
// distinct activated sessions (the launch North Star). A random UUID kept in
// sessionStorage — no PII, never sent anywhere but our own /api/generate. Created
// lazily on the first generation; falls back to an ephemeral id if storage is blocked.
let cachedSessionId: string | undefined;
function getSessionId(): string {
  if (cachedSessionId) return cachedSessionId;
  try {
    const existing = sessionStorage.getItem("mcs.sessionId");
    if (existing) return (cachedSessionId = existing);
    const id = crypto.randomUUID();
    sessionStorage.setItem("mcs.sessionId", id);
    return (cachedSessionId = id);
  } catch {
    return (cachedSessionId ??= crypto.randomUUID());
  }
}

// hashtags <-> comma-separated string, the editable representation.
const parseHashtags = (s: string): string[] =>
  s.split(",").map((t) => t.replace(/^#+/, "").trim()).filter(Boolean);
const formatHashtags = (tags: readonly (string | undefined)[]): string =>
  tags
    .filter((t): t is string => Boolean(t))
    .map((t) => t.replace(/^#+/, "").trim())
    .filter(Boolean)
    .join(", ");

export default function Home() {
  const [source, setSource] = useState("");
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_PROVIDER);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  // POS-6: multiple platforms generate in parallel, one card each.
  const [selected, setSelected] = useState<Platform[]>(["linkedin"]);
  // POS-19: multi-language multi-select — all three on by default to surface the
  // full multilingual value on first visit.
  const [languages, setLanguages] = useState<Language[]>([...LANGUAGES]);
  const [tone, setTone] = useState<Tone>("professional");
  const [configured, setConfigured] = useState<Record<string, boolean> | null>(null);

  // Imperative handles to each mounted card, keyed by (platform × language).
  const cardHandles = useRef(new Map<string, CardHandle>());
  // Per-card streaming state, reported up by the cards (idempotent by card key).
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setConfigured(d.configured))
      .catch(() => setConfigured(null));
  }, []);

  function changeProvider(id: string) {
    const p = getProvider(id);
    if (!p) return;
    setProvider(p.id);
    setModel(p.models[0].id);
  }

  function togglePlatform(p: Platform) {
    setSelected((curr) =>
      curr.includes(p)
        ? curr.filter((x) => x !== p)
        // keep the canonical PLATFORMS order so sections don't jump around.
        : PLATFORMS.filter((x) => curr.includes(x) || x === p),
    );
  }

  function toggleLanguage(l: Language) {
    setLanguages((curr) =>
      curr.includes(l)
        ? curr.filter((x) => x !== l)
        // keep the canonical LANGUAGES order so language columns stay stable.
        : LANGUAGES.filter((x) => curr.includes(x) || x === l),
    );
  }

  const providerModels = getProvider(provider)?.models ?? [];
  const isLive = configured?.[provider] === true;
  const isBusy = Object.values(loadingMap).some(Boolean);

  // POS-9: bump a signal each time a generation batch finishes so the metrics panel
  // refreshes with the just-recorded token usage / cost / latency.
  const [metricsSignal, setMetricsSignal] = useState(0);
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !isBusy) setMetricsSignal((n) => n + 1);
    wasBusy.current = isBusy;
  }, [isBusy]);

  const request: SharedRequest = useMemo(
    () => ({ source, tone, provider, model }),
    [source, tone, provider, model],
  );

  // POS-19: the generation matrix — one card per selected platform × language.
  const postCount = selected.length * languages.length;
  const canGenerate =
    source.trim().length > 0 && selected.length > 0 && languages.length > 0;

  // Fan out: kick off one independent stream per (platform × language) cell.
  function generate() {
    if (!canGenerate) return;
    selected.forEach((p) =>
      languages.forEach((l) => cardHandles.current.get(cardKey(p, l))?.start()),
    );
  }

  const registerCard = useCallback((key: string, handle: CardHandle | null) => {
    if (handle) cardHandles.current.set(key, handle);
    else cardHandles.current.delete(key);
  }, []);

  const onLoadingChange = useCallback((key: string, loading: boolean) => {
    setLoadingMap((m) => ({ ...m, [key]: loading }));
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Multilingual Content Studio
          </h1>
          <p className="text-sm text-gray-500">
            Paste once — get on-brand, editable posts for every platform and language,
            streaming live in parallel.
          </p>
        </div>
        <LiveBadge configured={configured} isLive={isLive} />
      </header>

      <textarea
        className="h-36 w-full rounded-lg border border-gray-300 bg-white p-3 text-sm"
        placeholder="Paste an article, transcript, or rough notes…"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <ChipGroup
          label="Languages"
          options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }))}
          isOn={(v) => languages.includes(v as Language)}
          onToggle={(v) => toggleLanguage(v as Language)}
        />
        <Select
          label="Tone"
          value={tone}
          onChange={(v) => setTone(v as Tone)}
          options={TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }))}
        />
      </div>

      <ChipGroup
        label="Platforms"
        options={PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))}
        isOn={(v) => selected.includes(v as Platform)}
        onToggle={(v) => togglePlatform(v as Platform)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={generate}
          disabled={!canGenerate}
          className="rounded-lg bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {isBusy
            ? "Generating…"
            : `Generate ${postCount} post${postCount === 1 ? "" : "s"}`}
        </button>
        {selected.length === 0 && (
          <span className="text-xs text-gray-400">Select at least one platform.</span>
        )}
        {selected.length > 0 && languages.length === 0 && (
          <span className="text-xs text-gray-400">Select at least one language.</span>
        )}
      </div>

      {postCount > 0 && (
        <div className="space-y-8">
          {selected.map((platform) => (
            <section key={platform} className="space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: PLATFORM_DOT[platform] }}
                />
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  {PLATFORM_LABELS[platform]}
                </h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {languages.map((language) => {
                  const key = cardKey(platform, language);
                  return (
                    <PlatformCard
                      // Key by (platform × language) so each card keeps its own
                      // draft / stream identity.
                      key={key}
                      cardId={key}
                      platform={platform}
                      language={language}
                      request={request}
                      onLoadingChange={onLoadingChange}
                      ref={(h) => registerCard(key, h)}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* POS-19: power-user controls — provider/model selection + observability —
          live behind an Advanced toggle, hidden by default so first-run users see
          only the content workflow. */}
      <details className="rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-gray-600">
          ⚙ Advanced
        </summary>
        <div className="space-y-4 border-t border-gray-200 px-3 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              label="Provider"
              value={provider}
              onChange={changeProvider}
              options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))}
            />
            <Select
              label="Model"
              value={model}
              onChange={setModel}
              options={providerModels.map((m) => ({ value: m.id, label: m.label }))}
            />
          </div>
          <MetricsPanel refreshSignal={metricsSignal} />
        </div>
      </details>
    </main>
  );
}

// POS-19: a bordered status pill — emerald when a credential is configured (real
// output), amber in the zero-cost mock path.
function LiveBadge({
  configured,
  isLive,
}: {
  configured: Record<string, boolean> | null;
  isLive: boolean;
}) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
        isLive
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700"
      }`}
      title={
        isLive
          ? "Credential configured — real output"
          : "No credential for this provider — mock output"
      }
    >
      {configured === null ? "…" : isLive ? "● live" : "● mock"}
    </span>
  );
}

// POS-9: a simple, collapsible observability panel. Polls /api/metrics (refreshed each
// time a generation batch finishes) and shows per-request token usage, cost, latency,
// prompt-template version, and status — the production-thinking signal made visible.
type Metric = {
  id: string;
  at: string;
  platform: string;
  provider: string;
  model: string;
  mode: "live" | "mock";
  promptVersion: string;
  status: "ok" | "partial" | "error" | "rate_limited";
  inputTokens?: number;
  outputTokens?: number;
  costUsd: number | null;
  latencyMs: number;
};
type MetricsSnapshot = {
  recent: Metric[];
  summary: {
    count: number;
    totalCostUsd: number;
    avgLatencyMs: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  };
  // POS-15: privacy-safe activation aggregate — the launch North Star.
  activation: {
    completedGenerations: number;
    activatedSessions: number;
  };
};

const STATUS_STYLE: Record<Metric["status"], string> = {
  ok: "text-green-700",
  partial: "text-amber-700",
  error: "text-red-700",
  rate_limited: "text-amber-700",
};

function fmtCost(c: number | null): string {
  if (c === null) return "—";
  if (c === 0) return "$0";
  return c < 0.01 ? `$${c.toFixed(5)}` : `$${c.toFixed(4)}`;
}

function MetricsPanel({ refreshSignal }: { refreshSignal: number }) {
  const [data, setData] = useState<MetricsSnapshot | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((d: MetricsSnapshot) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshSignal]);

  const summary = data?.summary;
  const recent = data?.recent ?? [];
  const activation = data?.activation;

  return (
    <section className="rounded-lg border border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-sm font-semibold">
          Request metrics
          {summary && summary.count > 0 && (
            <span className="ml-2 font-normal text-gray-500">
              {summary.count} req · {fmtCost(summary.totalCostUsd)} · {summary.avgLatencyMs}ms avg
            </span>
          )}
        </span>
        <span className="text-xs text-gray-400">{open ? "Hide ▲" : "Show ▼"}</span>
      </button>

      {open && (
        <div className="border-t border-gray-200 px-3 py-2">
          {activation && (
            <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
              <span>
                <span className="font-semibold text-gray-900">{activation.activatedSessions}</span>{" "}
                activated session{activation.activatedSessions === 1 ? "" : "s"}
              </span>
              <span>
                <span className="font-semibold text-gray-900">
                  {activation.completedGenerations}
                </span>{" "}
                generation{activation.completedGenerations === 1 ? "" : "s"} completed
              </span>
              <span className="text-gray-400">privacy-safe · counts only, no PII</span>
            </div>
          )}
          {recent.length === 0 ? (
            <p className="py-2 text-xs text-gray-400">
              No generations yet — produce a post to see token usage, cost, and latency here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-gray-500">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Platform</th>
                    <th className="py-1 pr-3 font-medium">Model</th>
                    <th className="py-1 pr-3 font-medium">Mode</th>
                    <th className="py-1 pr-3 font-medium">Prompt ver.</th>
                    <th className="py-1 pr-3 font-medium">Tokens (in/out)</th>
                    <th className="py-1 pr-3 font-medium">Cost</th>
                    <th className="py-1 pr-3 font-medium">Latency</th>
                    <th className="py-1 pr-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {recent.map((m) => (
                    <tr key={m.id} className="border-t border-gray-100">
                      <td className="py-1 pr-3">{m.platform}</td>
                      <td className="py-1 pr-3">{m.model}</td>
                      <td className="py-1 pr-3">{m.mode}</td>
                      <td className="py-1 pr-3" title={m.promptVersion}>
                        {m.promptVersion}
                      </td>
                      <td className="py-1 pr-3">
                        {m.inputTokens ?? "—"}/{m.outputTokens ?? "—"}
                      </td>
                      <td className="py-1 pr-3">{fmtCost(m.costUsd)}</td>
                      <td className="py-1 pr-3">{m.latencyMs}ms</td>
                      <td className={`py-1 pr-3 ${STATUS_STYLE[m.status]}`}>{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PlatformCard({
  platform,
  language,
  cardId,
  request,
  onLoadingChange,
  ref,
}: {
  platform: Platform;
  language: Language;
  cardId: string;
  request: SharedRequest;
  onLoadingChange: (cardId: string, loading: boolean) => void;
  ref?: Ref<CardHandle>;
}) {
  const template = platformTemplate(platform);

  // The editable draft the user owns once this card's stream finishes.
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  // POS-9: surface a friendly, classified failure (e.g. rate limit vs. generic) and
  // flag a partial generation (stream ended without a usable body) so the UI can offer
  // a clean retry instead of a broken card.
  const [failure, setFailure] = useState<Failure | null>(null);

  const { object, submit, isLoading, stop } = useObject({
    api: "/api/generate",
    schema: GenerationModelSchema,
    // POS-15: tag each generation with the anonymous session id so the server can
    // count distinct activated sessions. Resolved at request time (client-only).
    headers: () => ({ "x-session-id": getSessionId() }),
    onError(err) {
      setFailure(classifyError(err));
    },
    onFinish({ object, error }) {
      if (object && object.body && object.body.trim()) {
        setDraft({
          title: object.title ?? "",
          body: object.body ?? "",
          hashtags: formatHashtags(object.hashtags ?? []),
        });
        setFailure(null);
      } else if (error || !object) {
        // Stream finished but produced nothing usable → partial/failed generation.
        setFailure({ kind: "partial", message: "The model returned an incomplete post." });
      }
    },
  });

  // Start (or restart) this card's stream with the freshest shared inputs plus this
  // card's own (platform × language) identity. Called both by the parent's "Generate"
  // (via the imperative handle) and this card's own "Regenerate" button — never from an
  // effect, so no cascading-render lint issues.
  const start = useCallback(() => {
    setDraft(emptyDraft);
    setFailure(null);
    submit({ ...request, platform, language });
  }, [request, platform, language, submit]);

  useImperativeHandle(ref, () => ({ start }), [start]);

  // Report streaming state up so the parent can show an aggregate "Generating…".
  // On unmount (cell deselected) clear the flag so it can't get stuck busy.
  useEffect(() => {
    onLoadingChange(cardId, isLoading);
    return () => onLoadingChange(cardId, false);
  }, [isLoading, cardId, onLoadingChange]);

  // While streaming, show the live partial object; once done, the user's draft.
  const liveTitle = isLoading ? object?.title ?? "" : draft.title;
  const liveBody = isLoading ? object?.body ?? "" : draft.body;
  const liveHashtags = isLoading
    ? formatHashtags(object?.hashtags ?? [])
    : draft.hashtags;

  // Validate the current (editable) draft against the platform's POS-4 constraints.
  const validation = useMemo(() => {
    if (isLoading || !draft.body.trim()) return null;
    return validateGeneration(
      {
        title: draft.title.trim() || undefined,
        body: draft.body,
        hashtags: parseHashtags(draft.hashtags),
      },
      platform,
    );
  }, [isLoading, draft, platform]);

  const overLimit =
    template.maxChars !== undefined && liveBody.length > template.maxChars;
  const copyText = [liveTitle.trim(), liveBody.trim(), formatCopyHashtags(liveHashtags)]
    .filter(Boolean)
    .join("\n\n");

  function onChange(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  return (
    <section className="flex flex-col overflow-hidden rounded-lg bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: PLATFORM_DOT[platform] }}
          />
          {PLATFORM_LABELS[platform]}
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-gray-500">
            {LANGUAGE_SHORT[language]}
          </span>
        </span>
        <div className="flex items-center gap-1">
          {isLoading ? (
            <button
              onClick={() => stop()}
              className="rounded px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
            >
              Stop
            </button>
          ) : (
            <>
              <button
                onClick={start}
                className="rounded px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
              >
                Regenerate
              </button>
              {liveBody.length > 0 && <CopyButton text={copyText} />}
            </>
          )}
        </div>
      </div>

      {/* POS-19: 2px indeterminate progress bar while this card streams. */}
      {isLoading && (
        <div className="h-0.5 overflow-hidden bg-gray-100">
          <div
            className="mcs-progress-bar h-full"
            style={{ background: PLATFORM_DOT[platform] }}
          />
        </div>
      )}

      <div className="space-y-3 p-3">
        {failure && !isLoading && (
          <div
            className={`rounded-md px-3 py-2 text-xs ${
              failure.kind === "rate_limit"
                ? "bg-amber-50 text-amber-800"
                : failure.kind === "partial"
                  ? "bg-amber-50 text-amber-800"
                  : "bg-red-50 text-red-700"
            }`}
          >
            <p className="font-medium">
              {failure.kind === "rate_limit"
                ? "Rate limited"
                : failure.kind === "partial"
                  ? "Incomplete generation"
                  : "Generation failed"}
            </p>
            <p>
              {failure.message}{" "}
              <button onClick={start} className="font-medium underline">
                Try again
              </button>
            </p>
          </div>
        )}

        {template.requiresTitle && (
          <Field label="Title">
            <input
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-black"
              value={liveTitle}
              disabled={isLoading}
              placeholder={isLoading ? "" : "Add a title…"}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </Field>
        )}

        <Field
          label="Body"
          hint={
            template.maxChars !== undefined ? (
              <span className={overLimit ? "text-red-600" : "text-gray-400"}>
                {liveBody.length}/{template.maxChars}
              </span>
            ) : (
              <span className="text-gray-400">{liveBody.length} chars</span>
            )
          }
        >
          <textarea
            className="h-48 w-full whitespace-pre-wrap rounded-md border border-gray-300 bg-white p-2 text-sm text-black"
            value={liveBody}
            disabled={isLoading}
            placeholder={isLoading ? "" : "Post body…"}
            onChange={(e) => onChange({ body: e.target.value })}
          />
        </Field>

        <Field
          label="Hashtags"
          hint={
            <span className="text-gray-400">
              {template.hashtags.min}–{template.hashtags.max} · comma-separated
            </span>
          }
        >
          <input
            className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-black"
            value={liveHashtags}
            disabled={isLoading}
            placeholder={isLoading ? "" : "tag1, tag2"}
            onChange={(e) => onChange({ hashtags: e.target.value })}
          />
        </Field>

        {validation && (
          <p className={`text-xs ${validation.ok ? "text-green-700" : "text-amber-700"}`}>
            {validation.ok
              ? `✓ Meets ${PLATFORM_LABELS[platform]} guidelines`
              : `⚠ ${validation.errors.join(" · ")}`}
          </p>
        )}
      </div>
    </section>
  );
}

function formatCopyHashtags(hashtags: string): string {
  return parseHashtags(hashtags).map((t) => `#${t}`).join(" ");
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {hint && <span className="text-xs">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
  );
}

// POS-19: multi-select toggle chips — the same interaction for Languages and
// Platforms. Replaces the old single-value Language dropdown.
function ChipGroup({
  label,
  options,
  isOn,
  onToggle,
}: {
  label: string;
  options: Option[];
  isOn: (value: string) => boolean;
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-widest text-gray-400">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = isOn(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "border-black bg-black text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
}) {
  return (
    <label className="block text-xs font-medium text-gray-600">
      {label}
      <select
        className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-black"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

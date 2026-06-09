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

const emptyDraft: Draft = { title: "", body: "", hashtags: "" };

// The shared inputs every per-platform card streams against. The platform itself is
// NOT here — each card fills that in from its own identity.
type SharedRequest = {
  source: string;
  language: Language;
  tone: Tone;
  provider: ProviderId;
  model: string;
};

// Imperative handle each card exposes so the parent's "Generate" can fan out to
// every selected platform at once without an effect/token dance.
type CardHandle = { start: () => void };

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
  const [language, setLanguage] = useState<Language>("en");
  const [tone, setTone] = useState<Tone>("professional");
  const [configured, setConfigured] = useState<Record<string, boolean> | null>(null);

  // Imperative handles to each mounted card, keyed by platform.
  const cardHandles = useRef(new Map<Platform, CardHandle>());
  // Per-platform streaming state, reported up by the cards (idempotent by platform).
  const [loadingMap, setLoadingMap] = useState<Partial<Record<Platform, boolean>>>({});

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
        // keep the canonical PLATFORMS order so cards don't jump around.
        : PLATFORMS.filter((x) => curr.includes(x) || x === p),
    );
  }

  const providerModels = getProvider(provider)?.models ?? [];
  const isLive = configured?.[provider] === true;
  const isBusy = selected.some((p) => loadingMap[p]);

  const request: SharedRequest = useMemo(
    () => ({ source, language, tone, provider, model }),
    [source, language, tone, provider, model],
  );

  const canGenerate = source.trim().length > 0 && selected.length > 0;

  // Fan out: kick off one independent stream per selected platform, in parallel.
  function generate() {
    if (!canGenerate) return;
    selected.forEach((p) => cardHandles.current.get(p)?.start());
  }

  const registerCard = useCallback((p: Platform, handle: CardHandle | null) => {
    if (handle) cardHandles.current.set(p, handle);
    else cardHandles.current.delete(p);
  }, []);

  const onLoadingChange = useCallback((p: Platform, loading: boolean) => {
    setLoadingMap((m) => ({ ...m, [p]: loading }));
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Multilingual Content Studio</h1>
        <p className="text-sm text-gray-500">
          Paste source text, pick your platforms, language &amp; tone — watch an
          on-brand, editable post stream in live for each platform in parallel.
        </p>
      </header>

      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
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
        <span
          className={`mb-1 rounded-full px-2 py-1 text-xs font-medium ${
            isLive ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}
          title={isLive ? "Credential configured — real output" : "No credential for this provider — mock output"}
        >
          {configured === null ? "…" : isLive ? "● live" : "● mock"}
        </span>
      </div>

      <textarea
        className="h-36 w-full rounded-lg border border-gray-300 p-3 text-sm"
        placeholder="Paste an article, transcript, or rough notes…"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Language"
          value={language}
          onChange={(v) => setLanguage(v as Language)}
          options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }))}
        />
        <Select
          label="Tone"
          value={tone}
          onChange={(v) => setTone(v as Tone)}
          options={TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }))}
        />
      </div>

      <div>
        <span className="mb-1 block text-xs font-medium text-gray-600">Platforms</span>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const on = selected.includes(p);
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => togglePlatform(p)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  on
                    ? "border-black bg-black text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={generate}
          disabled={!canGenerate}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {isBusy
            ? "Generating…"
            : `Generate ${selected.length} post${selected.length === 1 ? "" : "s"}`}
        </button>
        {selected.length === 0 && (
          <span className="text-xs text-gray-400">Select at least one platform.</span>
        )}
      </div>

      {selected.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {selected.map((p) => (
            <PlatformCard
              // Key by platform so a card keeps its own draft/stream identity.
              key={p}
              ref={(h) => registerCard(p, h)}
              platform={p}
              request={request}
              onLoadingChange={onLoadingChange}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function PlatformCard({
  platform,
  request,
  onLoadingChange,
  ref,
}: {
  platform: Platform;
  request: SharedRequest;
  onLoadingChange: (platform: Platform, loading: boolean) => void;
  ref?: Ref<CardHandle>;
}) {
  const template = platformTemplate(platform);

  // The editable draft the user owns once this card's stream finishes.
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const { object, submit, isLoading, stop, error } = useObject({
    api: "/api/generate",
    schema: GenerationModelSchema,
    onFinish({ object }) {
      if (object) {
        setDraft({
          title: object.title ?? "",
          body: object.body ?? "",
          hashtags: formatHashtags(object.hashtags ?? []),
        });
      }
    },
  });

  // Start (or restart) this card's stream with the freshest shared inputs. Called
  // both by the parent's "Generate" (via the imperative handle) and this card's own
  // "Regenerate" button — never from an effect, so no cascading-render lint issues.
  const start = useCallback(() => {
    setDraft(emptyDraft);
    submit({ ...request, platform });
  }, [request, platform, submit]);

  useImperativeHandle(ref, () => ({ start }), [start]);

  // Report streaming state up so the parent can show an aggregate "Generating…".
  // On unmount (platform deselected) clear the flag so it can't get stuck busy.
  useEffect(() => {
    onLoadingChange(platform, isLoading);
    return () => onLoadingChange(platform, false);
  }, [isLoading, platform, onLoadingChange]);

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
    <section className="flex flex-col rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-sm font-semibold">
          {PLATFORM_LABELS[platform]}
          {isLoading && <span className="ml-2 animate-pulse text-gray-400">streaming…</span>}
        </span>
        <div className="flex items-center gap-1">
          {isLoading ? (
            <button
              onClick={() => stop()}
              className="rounded px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-200"
            >
              Stop
            </button>
          ) : (
            <>
              <button
                onClick={start}
                className="rounded px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-200"
              >
                Regenerate
              </button>
              {liveBody.length > 0 && <CopyButton text={copyText} />}
            </>
          )}
        </div>
      </div>

      <div className="space-y-3 p-3">
        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            Something went wrong generating this post.{" "}
            <button onClick={start} className="font-medium underline">
              Try again
            </button>
          </p>
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
      className="rounded px-2 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-200"
    >
      {copied ? "Copied ✓" : "Copy"}
    </button>
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
        className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm text-black"
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

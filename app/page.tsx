"use client";

import { experimental_useObject as useObject } from "@ai-sdk/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  const [platform, setPlatform] = useState<Platform>("linkedin");
  const [language, setLanguage] = useState<Language>("en");
  const [tone, setTone] = useState<Tone>("professional");
  const [configured, setConfigured] = useState<Record<string, boolean> | null>(null);

  // The editable draft the user owns once streaming finishes.
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const { object, submit, isLoading, stop, error } = useObject({
    api: "/api/generate",
    schema: GenerationModelSchema,
    onFinish({ object }) {
      // Seed the editable draft from the final, validated object.
      if (object) {
        setDraft({
          title: object.title ?? "",
          body: object.body ?? "",
          hashtags: formatHashtags(object.hashtags ?? []),
        });
      }
    },
  });

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

  const providerModels = getProvider(provider)?.models ?? [];
  const isLive = configured?.[provider] === true;
  const template = platformTemplate(platform);

  // While streaming, show the live partial object; once done, the user's draft.
  const liveTitle = isLoading ? object?.title ?? "" : draft.title;
  const liveBody = isLoading ? object?.body ?? "" : draft.body;
  const liveHashtags = isLoading ? formatHashtags(object?.hashtags ?? []) : draft.hashtags;
  const hasOutput = liveBody.length > 0 || liveTitle.length > 0 || liveHashtags.length > 0;

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

  function generate() {
    if (!source.trim() || isLoading) return;
    setDraft(emptyDraft);
    submit({ source, platform, language, tone, provider, model });
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Multilingual Content Studio</h1>
        <p className="text-sm text-gray-500">
          Paste source text, pick a platform, language &amp; tone — watch an on-brand,
          editable post stream in live.
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

      <div className="grid grid-cols-3 gap-3">
        <Select
          label="Platform"
          value={platform}
          onChange={(v) => setPlatform(v as Platform)}
          options={PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))}
        />
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

      <div className="flex items-center gap-3">
        <button
          onClick={generate}
          disabled={isLoading || !source.trim()}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {isLoading ? "Generating…" : "Generate post"}
        </button>
        {isLoading && (
          <button
            onClick={() => stop()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
          >
            Stop
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Something went wrong generating the post. Please try again.
        </p>
      )}

      {(hasOutput || isLoading) && (
        <OutputCard
          platform={platform}
          template={template}
          isLoading={isLoading}
          title={liveTitle}
          body={liveBody}
          hashtags={liveHashtags}
          validation={validation}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        />
      )}
    </main>
  );
}

function OutputCard({
  platform,
  template,
  isLoading,
  title,
  body,
  hashtags,
  validation,
  onChange,
}: {
  platform: Platform;
  template: ReturnType<typeof platformTemplate>;
  isLoading: boolean;
  title: string;
  body: string;
  hashtags: string;
  validation: ReturnType<typeof validateGeneration> | null;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const overLimit = template.maxChars !== undefined && body.length > template.maxChars;
  const copyText = [title.trim(), body.trim(), formatCopyHashtags(hashtags)]
    .filter(Boolean)
    .join("\n\n");

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-sm font-semibold">
          {PLATFORM_LABELS[platform]}
          {isLoading && <span className="ml-2 animate-pulse text-gray-400">streaming…</span>}
        </span>
        {!isLoading && body.length > 0 && <CopyButton text={copyText} />}
      </div>

      <div className="space-y-3 p-3">
        {template.requiresTitle && (
          <Field label="Title">
            <input
              className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-black"
              value={title}
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
                {body.length}/{template.maxChars}
              </span>
            ) : (
              <span className="text-gray-400">{body.length} chars</span>
            )
          }
        >
          <textarea
            className="h-48 w-full whitespace-pre-wrap rounded-md border border-gray-300 bg-white p-2 text-sm text-black"
            value={body}
            disabled={isLoading}
            placeholder={isLoading ? "" : "Post body…"}
            onChange={(e) => onChange({ body: e.target.value })}
          />
        </Field>

        <Field
          label="Hashtags"
          hint={<span className="text-gray-400">{template.hashtags.min}–{template.hashtags.max} · comma-separated</span>}
        >
          <input
            className="w-full rounded-md border border-gray-300 bg-white p-2 text-sm text-black"
            value={hashtags}
            disabled={isLoading}
            placeholder={isLoading ? "" : "tag1, tag2"}
            onChange={(e) => onChange({ hashtags: e.target.value })}
          />
        </Field>

        {validation && (
          <p
            className={`text-xs ${validation.ok ? "text-green-700" : "text-amber-700"}`}
          >
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
  hint?: React.ReactNode;
  children: React.ReactNode;
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

"use client";

import { useEffect, useState } from "react";
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
  type Platform,
  type Language,
  type Tone,
} from "@/lib/prompts";

type Option = { value: string; label: string };
type PlatformState = { text: string; loading: boolean; error: string | null };

const emptyResults = (): Record<Platform, PlatformState> =>
  Object.fromEntries(
    PLATFORMS.map((p) => [p, { text: "", loading: false, error: null }]),
  ) as Record<Platform, PlatformState>;

export default function Home() {
  const [source, setSource] = useState("");
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_PROVIDER);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [language, setLanguage] = useState<Language>("en");
  const [tone, setTone] = useState<Tone>("professional");
  const [results, setResults] = useState<Record<Platform, PlatformState>>(emptyResults);
  const [configured, setConfigured] = useState<Record<string, boolean> | null>(null);

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
  const anyLoading = PLATFORMS.some((p) => results[p].loading);

  // Stream one platform into its own card.
  async function generateOne(platform: Platform) {
    setResults((prev) => ({ ...prev, [platform]: { text: "", loading: true, error: null } }));
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, platform, language, tone, provider, model }),
      });
      if (!res.ok || !res.body) {
        throw new Error((await res.text()) || "Request failed");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setResults((prev) => ({
          ...prev,
          [platform]: { ...prev[platform], text: prev[platform].text + chunk },
        }));
      }
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [platform]: { ...prev[platform], error: e instanceof Error ? e.message : "Failed" },
      }));
    } finally {
      setResults((prev) => ({ ...prev, [platform]: { ...prev[platform], loading: false } }));
    }
  }

  // Fan out: fire all platforms at once; each streams independently.
  function generateAll() {
    PLATFORMS.forEach((p) => void generateOne(p));
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Multilingual Content Studio</h1>
        <p className="text-sm text-gray-500">
          Paste source text → one click drafts LinkedIn, X &amp; 小红书 at once, streaming live.
        </p>
      </header>

      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
        <Select label="Provider" value={provider} onChange={changeProvider} options={PROVIDERS.map((p) => ({ value: p.id, label: p.label }))} />
        <Select label="Model" value={model} onChange={setModel} options={providerModels.map((m) => ({ value: m.id, label: m.label }))} />
        <span
          className={`mb-1 rounded-full px-2 py-1 text-xs font-medium ${
            isLive ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}
          title={isLive ? "API key configured — real output" : "No key for this provider — mock output"}
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

      <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
        <Select label="Language" value={language} onChange={(v) => setLanguage(v as Language)} options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }))} />
        <Select label="Tone" value={tone} onChange={(v) => setTone(v as Tone)} options={TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }))} />
      </div>

      <button
        onClick={generateAll}
        disabled={anyLoading || !source.trim()}
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {anyLoading ? "Generating…" : "Generate all platforms"}
      </button>

      <div className="grid gap-4 md:grid-cols-3">
        {PLATFORMS.map((p) => (
          <PlatformCard key={p} title={PLATFORM_LABELS[p]} state={results[p]} />
        ))}
      </div>
    </main>
  );
}

function PlatformCard({ title, state }: { title: string; state: PlatformState }) {
  const { text, loading, error } = state;
  const hasContent = text.length > 0;
  return (
    <section className="flex min-h-[12rem] flex-col rounded-lg border border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-sm font-semibold">{title}</span>
        {hasContent && !loading && <CopyButton text={text} />}
      </div>
      <div className="flex-1 whitespace-pre-wrap p-3 text-sm text-black">
        {error ? (
          <span className="text-red-600">{error}</span>
        ) : (
          <>
            {text}
            {loading && <span className="animate-pulse">▌</span>}
            {!hasContent && !loading && <span className="text-gray-400">—</span>}
          </>
        )}
      </div>
    </section>
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

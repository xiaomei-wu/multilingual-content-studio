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

export default function Home() {
  const [source, setSource] = useState("");
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_PROVIDER);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [platform, setPlatform] = useState<Platform>("linkedin");
  const [language, setLanguage] = useState<Language>("en");
  const [tone, setTone] = useState<Tone>("professional");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<Record<string, boolean> | null>(null);

  // Ask the server which providers have a key set, to show a live/mock badge.
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setConfigured(d.configured))
      .catch(() => setConfigured(null));
  }, []);

  // When provider changes, snap the model to that provider's first option.
  function changeProvider(id: string) {
    const p = getProvider(id);
    if (!p) return;
    setProvider(p.id);
    setModel(p.models[0].id);
  }

  const providerModels = getProvider(provider)?.models ?? [];
  const isLive = configured?.[provider] === true;

  async function generate() {
    setLoading(true);
    setError(null);
    setOutput("");
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
        setOutput((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Multilingual Content Studio</h1>
        <p className="text-sm text-gray-500">
          Paste source text → pick a provider, platform &amp; language → stream a draft.
        </p>
      </header>

      {/* Provider + model + live badge */}
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
        className="h-40 w-full rounded-lg border border-gray-300 p-3 text-sm"
        placeholder="Paste an article, transcript, or rough notes…"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      />

      <div className="grid grid-cols-3 gap-3">
        <Select label="Platform" value={platform} onChange={(v) => setPlatform(v as Platform)} options={PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))} />
        <Select label="Language" value={language} onChange={(v) => setLanguage(v as Language)} options={LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_LABELS[l] }))} />
        <Select label="Tone" value={tone} onChange={(v) => setTone(v as Tone)} options={TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }))} />
      </div>

      <button
        onClick={generate}
        disabled={loading || !source.trim()}
        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
      >
        {loading ? "Generating…" : "Generate"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {(output || loading) && (
        <article className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-black">
          {output}
          {loading && <span className="animate-pulse">▌</span>}
        </article>
      )}
    </main>
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

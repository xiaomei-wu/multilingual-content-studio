"use client";

import { useState } from "react";
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

export default function Home() {
  const [source, setSource] = useState("");
  const [platform, setPlatform] = useState<Platform>("linkedin");
  const [language, setLanguage] = useState<Language>("en");
  const [tone, setTone] = useState<Tone>("professional");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setOutput("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, platform, language, tone }),
      });
      if (!res.ok || !res.body) {
        throw new Error((await res.text()) || "Request failed");
      }

      // --- This loop is the heart of streaming UX ---
      // We read the response body chunk-by-chunk and append as it arrives,
      // instead of waiting for the whole thing. That's why it "types" at you.
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
          Paste source text → pick a platform → stream a ready-to-post draft.
        </p>
      </header>

      <textarea
        className="h-40 w-full rounded-lg border border-gray-300 p-3 text-sm"
        placeholder="Paste an article, transcript, or rough notes…"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      />

      <div className="grid grid-cols-3 gap-3">
        <Field label="Platform" value={platform} onChange={(v) => setPlatform(v as Platform)} options={PLATFORMS} labels={PLATFORM_LABELS} />
        <Field label="Language" value={language} onChange={(v) => setLanguage(v as Language)} options={LANGUAGES} labels={LANGUAGE_LABELS} />
        <Field label="Tone" value={tone} onChange={(v) => setTone(v as Tone)} options={TONES} labels={TONE_LABELS} />
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

function Field<T extends string>({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: T;
  onChange: (v: string) => void;
  options: readonly T[];
  labels: Record<T, string>;
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
          <option key={o} value={o}>
            {labels[o]}
          </option>
        ))}
      </select>
    </label>
  );
}

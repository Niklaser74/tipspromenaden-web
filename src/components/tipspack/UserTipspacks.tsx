/**
 * @file UserTipspacks.tsx
 * @description React-island på /tipspack som visar publika
 * användar-uppladdade tipspacks (Firestore-källa). Curated packs
 * (statisk listning från public/tipspack/) renderas av Astro vid build-
 * tid; den här islandet appenderar till listan vid runtime.
 *
 * Vi hämtar download-URL:erna lazily (via getDownloadURL) först när
 * användaren faktiskt klickar — sparar en del Firestore-läsningar och
 * snabbare initial render.
 */

import { useEffect, useState } from "react";
import {
  getPublicTipspacks,
  getDownloadUrl,
  type TipspackMeta,
} from "../../lib/tipspackLibrary";
import { Flag } from "../Flag";

type PreviewState = "loading" | "error" | { questions: { text: string }[] };

export default function UserTipspacks() {
  const [packs, setPacks] = useState<TipspackMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});

  async function togglePreview(slug: string) {
    if (expanded === slug) {
      setExpanded(null);
      return;
    }
    setExpanded(slug);
    if (previews[slug]) return;
    setPreviews((p) => ({ ...p, [slug]: "loading" }));
    try {
      const url = await getDownloadUrl(slug);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPreviews((p) => ({ ...p, [slug]: { questions: data.questions ?? [] } }));
    } catch {
      setPreviews((p) => ({ ...p, [slug]: "error" }));
    }
  }

  useEffect(() => {
    getPublicTipspacks()
      .then(setPacks)
      .catch((e: any) => setError(e?.message || "Kunde inte hämta paket"));
  }, []);

  async function handleDownload(slug: string) {
    setBusy(slug);
    try {
      const url = await getDownloadUrl(slug);
      // Open in same tab — browser triggers download for application/json
      window.location.href = url;
    } catch (e: any) {
      setError(e?.message || "Kunde inte hämta länk");
    } finally {
      setTimeout(() => setBusy(null), 1500);
    }
  }

  async function handleCopyLink(slug: string) {
    setBusy(slug);
    try {
      const url = await getDownloadUrl(slug);
      await navigator.clipboard.writeText(url);
      setBusy("copied:" + slug);
      setTimeout(() => setBusy(null), 2000);
    } catch (e: any) {
      setError(e?.message || "Kunde inte kopiera länk");
      setBusy(null);
    }
  }

  if (error) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        Kunde inte ladda inskickade paket: {error}
      </p>
    );
  }

  if (packs === null) {
    return (
      <p className="text-center text-text-warm py-6 text-sm">
        Laddar inskickade paket…
      </p>
    );
  }

  if (packs.length === 0) {
    return null; // gömma sektionen helt om inga finns
  }

  return (
    <ul className="space-y-4">
      {packs.map((p) => {
        const copied = busy === "copied:" + p.slug;
        const loading = busy === p.slug;
        const fileSizeKb = Math.round(p.fileSizeBytes / 1024);
        return (
          <li
            key={p.slug}
            className="bg-white border border-rule rounded-xl p-5 hover:border-green-dark transition"
          >
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <h2 className="font-serif text-2xl text-green-dark mb-1 flex items-center gap-2">
                  <Flag code={p.language} height={22} />
                  <span>{p.name}</span>
                </h2>
                {p.description && (
                  <p className="text-sm text-text-warm leading-relaxed mb-3">
                    {p.description}
                  </p>
                )}
                <p className="text-xs text-sage">
                  {p.questionCount} frågor
                  {" · "}
                  {p.author || p.ownerName || "Okänd"}
                  {" · "}
                  {fileSizeKb} KB
                  {" · "}
                  inskickat
                </p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <a
                  href={`tipspromenaden://tipspack/${p.slug}`}
                  className="bg-green-dark text-cream px-5 py-2 rounded-full text-sm font-semibold shadow hover:shadow-md transition text-center"
                  title="Öppna direkt i Tipspromenaden-appen (kräver appen v1.4.0+)"
                >
                  📲 Öppna i appen
                </a>
                <button
                  onClick={() => handleDownload(p.slug)}
                  disabled={loading}
                  className="border border-green-dark text-green-dark px-5 py-2 rounded-full text-sm font-semibold hover:bg-green-dark/5 transition disabled:opacity-50"
                >
                  {loading ? "Hämtar…" : "📥 Ladda ner fil"}
                </button>
                <button
                  onClick={() => handleCopyLink(p.slug)}
                  disabled={loading}
                  className="text-text-warm text-xs hover:text-green-dark"
                >
                  {copied ? "Kopierad!" : "Kopiera länk"}
                </button>
              </div>
            </div>
            <div className="mt-3">
              <button
                onClick={() => togglePreview(p.slug)}
                className="text-xs text-green-dark hover:underline"
              >
                {expanded === p.slug ? "Dölj frågor" : "Förhandsgranska frågor"}
              </button>
              {expanded === p.slug && (
                <div className="mt-2 bg-cream/50 border border-rule rounded-lg p-3">
                  {previews[p.slug] === "loading" && (
                    <p className="text-sm text-text-warm">Hämtar frågor…</p>
                  )}
                  {previews[p.slug] === "error" && (
                    <p className="text-sm text-red-700">Kunde inte ladda frågorna.</p>
                  )}
                  {typeof previews[p.slug] === "object" && (
                    <>
                      <p className="text-xs text-text-warm mb-2 italic">
                        Frågor visas utan svar för att inte spoila spelet.
                      </p>
                      <ol className="space-y-1 text-sm text-green-dark list-decimal list-inside">
                        {(previews[p.slug] as { questions: { text: string }[] }).questions.map(
                          (q, i) => (
                            <li key={i}>{q.text}</li>
                          )
                        )}
                      </ol>
                    </>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

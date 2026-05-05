/**
 * @file MyTipspacks.tsx
 * @description Användarens egna uppladdade tipspacks. Lista med toggle
 * för synlighet (publik/hemlig länk), kopiera-länk och radera.
 *
 * Visas som en sektion i WalkList eller som egen vy beroende på hur
 * App.tsx wirar in den.
 */

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  getMyTipspacks,
  deleteTipspack,
  updateTipspackMeta,
  getDownloadUrl,
  type TipspackMeta,
} from "../../lib/tipspackLibrary";
import { Flag } from "../Flag";
import { useT } from "./i18n";

interface Props {
  user: User;
  refreshKey?: number; // bump för att tvinga ny fetch
}

type PreviewState = "loading" | "error" | { questions: { text: string }[] };

export function MyTipspacks({ user, refreshKey }: Props) {
  const t = useT();
  const [packs, setPacks] = useState<TipspackMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
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
    let cancelled = false;
    setPacks(null);
    getMyTipspacks(user.uid)
      .then((list) => {
        if (!cancelled) setPacks(list);
      })
      .catch((e: any) => {
        if (!cancelled)
          setError(e?.message || t("Kunde inte hämta tipspacks", "Couldn't fetch tipspacks"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid, refreshKey]);

  async function copyDownloadLink(slug: string) {
    setBusySlug(slug);
    try {
      const url = await getDownloadUrl(slug);
      await navigator.clipboard.writeText(url);
      setBusySlug("copied:" + slug);
      setTimeout(() => setBusySlug(null), 2000);
    } catch (e: any) {
      setError(e?.message || t("Kunde inte kopiera länk", "Couldn't copy link"));
      setBusySlug(null);
    }
  }

  async function copyDeepLink(slug: string) {
    const url = `tipspromenaden://tipspack/${slug}`;
    await navigator.clipboard.writeText(url);
    setBusySlug("copied:dl:" + slug);
    setTimeout(() => setBusySlug(null), 2000);
  }

  async function togglePublic(pack: TipspackMeta) {
    setBusySlug(pack.slug);
    try {
      await updateTipspackMeta(pack.slug, { isPublic: !pack.isPublic });
      setPacks(
        (curr) =>
          curr?.map((p) =>
            p.slug === pack.slug ? { ...p, isPublic: !pack.isPublic } : p
          ) ?? null
      );
    } catch (e: any) {
      setError(
        e?.message || t("Kunde inte uppdatera synlighet", "Couldn't update visibility")
      );
    } finally {
      setBusySlug(null);
    }
  }

  async function handleDelete(pack: TipspackMeta) {
    const msg = t(
      `Radera "${pack.name}"? Filen och metadata försvinner. Detta går inte att ångra.`,
      `Delete "${pack.name}"? The file and its metadata will be gone. This can't be undone.`
    );
    if (!confirm(msg)) return;
    setBusySlug(pack.slug);
    try {
      await deleteTipspack(pack.slug);
      setPacks((curr) => curr?.filter((p) => p.slug !== pack.slug) ?? null);
    } catch (e: any) {
      setError(e?.message || t("Kunde inte radera", "Couldn't delete"));
    } finally {
      setBusySlug(null);
    }
  }

  if (error) {
    return (
      <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
        {error}
      </p>
    );
  }

  if (packs === null) {
    return <p className="text-center text-text-warm py-6">{t("Laddar…", "Loading…")}</p>;
  }

  if (packs.length === 0) {
    return (
      <p className="text-center text-text-warm py-6 text-sm">
        {t(
          "Du har inte laddat upp några tipspacks än.",
          "You haven't uploaded any tipspacks yet."
        )}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {packs.map((p) => {
        const busy = busySlug === p.slug;
        const copiedDownload = busySlug === "copied:" + p.slug;
        const copiedDeep = busySlug === "copied:dl:" + p.slug;
        return (
          <li
            key={p.slug}
            className="bg-white border border-rule rounded-xl p-4"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-serif text-lg text-green-dark flex items-center gap-2">
                <Flag code={p.language} height={16} />
                <span>{p.name}</span>
              </h3>
              <span
                className={`text-xs whitespace-nowrap px-2 py-0.5 rounded-full ${
                  p.isPublic
                    ? "bg-green-dark/10 text-green-dark"
                    : "bg-orange-100 text-orange-900"
                }`}
              >
                {p.isPublic
                  ? t("🌐 Publik", "🌐 Public")
                  : t("🔗 Hemlig länk", "🔗 Secret link")}
              </span>
            </div>
            {p.description && (
              <p className="text-sm text-text-warm mb-2 leading-relaxed">
                {p.description}
              </p>
            )}
            <p className="text-xs text-sage mb-3">
              {p.questionCount} {t("frågor", "questions")} · slug:{" "}
              <code className="text-text-warm">{p.slug}</code>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => copyDeepLink(p.slug)}
                disabled={busy}
                className="text-xs bg-green-dark text-cream px-3 py-1.5 rounded-full hover:opacity-90 disabled:opacity-50"
              >
                {copiedDeep
                  ? t("Kopierad!", "Copied!")
                  : t("📲 Kopiera app-länk", "📲 Copy app link")}
              </button>
              <button
                onClick={() => copyDownloadLink(p.slug)}
                disabled={busy}
                className="text-xs border border-green-dark text-green-dark px-3 py-1.5 rounded-full hover:bg-green-dark/5 disabled:opacity-50"
              >
                {copiedDownload
                  ? t("Kopierad!", "Copied!")
                  : t("📥 Kopiera fil-länk", "📥 Copy file link")}
              </button>
              <button
                onClick={() => togglePublic(p)}
                disabled={busy}
                className="text-xs border border-rule text-text-warm px-3 py-1.5 rounded-full hover:bg-white disabled:opacity-50"
              >
                {p.isPublic
                  ? t("Gör hemlig", "Make secret")
                  : t("Gör publik", "Make public")}
              </button>
              <button
                onClick={() => handleDelete(p)}
                disabled={busy}
                className="text-xs text-red-700 px-3 py-1.5 hover:underline disabled:opacity-50 ml-auto"
              >
                {t("Radera", "Delete")}
              </button>
            </div>
            <button
              onClick={() => togglePreview(p.slug)}
              className="mt-3 text-xs text-green-dark hover:underline"
            >
              {expanded === p.slug
                ? t("Dölj frågor", "Hide questions")
                : t("Förhandsgranska frågor", "Preview questions")}
            </button>
            {expanded === p.slug && (
              <div className="mt-2 bg-cream/50 border border-rule rounded-lg p-3">
                {previews[p.slug] === "loading" && (
                  <p className="text-sm text-text-warm">
                    {t("Hämtar frågor…", "Loading questions…")}
                  </p>
                )}
                {previews[p.slug] === "error" && (
                  <p className="text-sm text-red-700">
                    {t("Kunde inte ladda frågorna.", "Couldn't load the questions.")}
                  </p>
                )}
                {typeof previews[p.slug] === "object" && (
                  <>
                    <p className="text-xs text-text-warm mb-2 italic">
                      {t(
                        "Frågor visas utan svar för att inte spoila spelet.",
                        "Questions are shown without answers so the game isn't spoiled."
                      )}
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
          </li>
        );
      })}
    </ul>
  );
}

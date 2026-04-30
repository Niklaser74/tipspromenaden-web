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
import { flagForLanguage } from "../../lib/languages";

interface Props {
  user: User;
  refreshKey?: number; // bump för att tvinga ny fetch
}

export function MyTipspacks({ user, refreshKey }: Props) {
  const [packs, setPacks] = useState<TipspackMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPacks(null);
    getMyTipspacks(user.uid)
      .then((list) => {
        if (!cancelled) setPacks(list);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "Kunde inte hämta tipspacks");
      });
    return () => {
      cancelled = true;
    };
  }, [user.uid, refreshKey]);

  async function copyDownloadLink(slug: string) {
    setBusySlug(slug);
    try {
      const url = await getDownloadUrl(slug);
      await navigator.clipboard.writeText(url);
      setBusySlug("copied:" + slug);
      setTimeout(() => setBusySlug(null), 2000);
    } catch (e: any) {
      setError(e?.message || "Kunde inte kopiera länk");
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
      setError(e?.message || "Kunde inte uppdatera synlighet");
    } finally {
      setBusySlug(null);
    }
  }

  async function handleDelete(pack: TipspackMeta) {
    if (
      !confirm(
        `Radera "${pack.name}"? Filen och metadata försvinner. Detta går inte att ångra.`
      )
    )
      return;
    setBusySlug(pack.slug);
    try {
      await deleteTipspack(pack.slug);
      setPacks((curr) => curr?.filter((p) => p.slug !== pack.slug) ?? null);
    } catch (e: any) {
      setError(e?.message || "Kunde inte radera");
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
    return <p className="text-center text-text-warm py-6">Laddar…</p>;
  }

  if (packs.length === 0) {
    return (
      <p className="text-center text-text-warm py-6 text-sm">
        Du har inte laddat upp några tipspacks än.
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
              <h3 className="font-serif text-lg text-green-dark">
                {flagForLanguage(p.language)} {p.name}
              </h3>
              <span
                className={`text-xs whitespace-nowrap px-2 py-0.5 rounded-full ${
                  p.isPublic
                    ? "bg-green-dark/10 text-green-dark"
                    : "bg-orange-100 text-orange-900"
                }`}
              >
                {p.isPublic ? "🌐 Publik" : "🔗 Hemlig länk"}
              </span>
            </div>
            {p.description && (
              <p className="text-sm text-text-warm mb-2 leading-relaxed">
                {p.description}
              </p>
            )}
            <p className="text-xs text-sage mb-3">
              {p.questionCount} frågor · slug:{" "}
              <code className="text-text-warm">{p.slug}</code>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => copyDeepLink(p.slug)}
                disabled={busy}
                className="text-xs bg-green-dark text-cream px-3 py-1.5 rounded-full hover:opacity-90 disabled:opacity-50"
              >
                {copiedDeep ? "Kopierad!" : "📲 Kopiera app-länk"}
              </button>
              <button
                onClick={() => copyDownloadLink(p.slug)}
                disabled={busy}
                className="text-xs border border-green-dark text-green-dark px-3 py-1.5 rounded-full hover:bg-green-dark/5 disabled:opacity-50"
              >
                {copiedDownload ? "Kopierad!" : "📥 Kopiera fil-länk"}
              </button>
              <button
                onClick={() => togglePublic(p)}
                disabled={busy}
                className="text-xs border border-rule text-text-warm px-3 py-1.5 rounded-full hover:bg-white disabled:opacity-50"
              >
                {p.isPublic ? "Gör hemlig" : "Gör publik"}
              </button>
              <button
                onClick={() => handleDelete(p)}
                disabled={busy}
                className="text-xs text-red-700 px-3 py-1.5 hover:underline disabled:opacity-50 ml-auto"
              >
                Radera
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

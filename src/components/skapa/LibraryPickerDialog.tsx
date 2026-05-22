/**
 * @file LibraryPickerDialog.tsx
 * @description Modal-väljare för att importera ett frågebatteri direkt
 * från biblioteket istället för att ladda upp en .tipspack-fil manuellt.
 *
 * Visar två källor:
 *   1. **Curated** pack från `/tipspack/index.json` (statiska assets på
 *      Cloudflare, committade i web-repot).
 *   2. **Uppladdade publika pack** från Firestore `tipspacks` där
 *      `isPublic === true` — hämtas via `tipspackLibrary.getPublicTipspacks()`.
 *
 * Dedup-strategi: om curated och uploaded delar samma slug, vinner
 * curated (samma som app-biblioteket). Modererade pack (i
 * `moderation/hidden.tipspacks[]`) filtreras redan av
 * `getPublicTipspacks`.
 *
 * Vid val:
 *   - Curated → hämta `https://tipspromenaden.app/tipspack/<filename>`
 *   - Uploaded → hämta via `getDownloadUrl(slug)` (signerad Storage-URL)
 *   - Bägge passeras genom `parseTipspackText` och callas tillbaka via
 *     `onPick(battery)`.
 *
 * Felhantering: nätfel eller validation-fel visas inline i raden så
 * användaren kan välja ett annat pack utan att stänga dialogen.
 */

import { useEffect, useState } from "react";
import { Flag } from "../Flag";
import { useT } from "./i18n";
import {
  getPublicTipspacks,
  getDownloadUrl,
  type TipspackMeta,
} from "../../lib/tipspackLibrary";
import { parseTipspackText, type QuestionBattery } from "../../lib/tipspack";

interface CuratedPack {
  slug: string;
  filename: string;
  url: string;
  name: string;
  description?: string;
  author?: string;
  language?: string;
  questionCount: number;
  fileSizeBytes: number;
}

interface DisplayPack {
  source: "curated" | "uploaded";
  slug: string;
  name: string;
  description?: string;
  author?: string;
  ownerName?: string;
  language?: string;
  questionCount: number;
  fileSizeBytes: number;
  // För curated: direkt URL. För uploaded: ingen URL — vi hämtar via
  // getDownloadUrl(slug) vid select (signerade URL:er förfaller annars).
  url?: string;
}

interface Props {
  onPick: (battery: QuestionBattery) => void;
  onClose: () => void;
}

export function LibraryPickerDialog({ onPick, onClose }: Props) {
  const t = useT();
  const [packs, setPacks] = useState<DisplayPack[] | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Spårar vilket pack som just nu hämtas (för spinner på raden).
  // null = inget, slug = den raden.
  const [importingSlug, setImportingSlug] = useState<string | null>(null);
  // Per-rad-felmeddelande (network/validation) så användaren kan välja
  // ett annat pack utan att dialogen reseras.
  const [rowError, setRowError] = useState<{ slug: string; msg: string } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Curated från statisk JSON-endpoint + uploaded från Firestore.
        // Bägge i parallell. Curated har 5-sek timeout så långsamt CDN
        // inte hänger hela dialogen.
        const curatedPromise = fetch("/tipspack/index.json", {
          signal: AbortSignal.timeout(5000),
        })
          .then((r) => (r.ok ? r.json() : { packs: [] }))
          .catch(() => ({ packs: [] }));
        const [curatedRes, uploaded] = await Promise.all([
          curatedPromise as Promise<{ packs: CuratedPack[] }>,
          getPublicTipspacks().catch(() => [] as TipspackMeta[]),
        ]);
        if (cancelled) return;

        const curatedSlugs = new Set(curatedRes.packs.map((p) => p.slug));
        const merged: DisplayPack[] = [
          ...curatedRes.packs.map((p) => ({
            source: "curated" as const,
            slug: p.slug,
            name: p.name,
            description: p.description,
            author: p.author,
            language: p.language,
            questionCount: p.questionCount,
            fileSizeBytes: p.fileSizeBytes,
            url: p.url,
          })),
          ...uploaded
            .filter((u) => !curatedSlugs.has(u.slug))
            .map((u) => ({
              source: "uploaded" as const,
              slug: u.slug,
              name: u.name,
              description: u.description,
              author: u.author,
              ownerName: u.ownerName,
              language: u.language,
              questionCount: u.questionCount,
              fileSizeBytes: u.fileSizeBytes,
            })),
        ];

        // Sortera alfabetiskt på namn — curated och uploaded blandas
        // ihop så användaren letar på innehåll, inte på källa.
        merged.sort((a, b) => a.name.localeCompare(b.name, "sv"));

        setPacks(merged);
      } catch (e: any) {
        if (!cancelled) {
          setLoadingError(
            t(
              "Kunde inte ladda biblioteket. Kolla nätverket och försök igen.",
              "Could not load the library. Check your network and try again."
            )
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  async function handlePick(pack: DisplayPack) {
    setImportingSlug(pack.slug);
    setRowError(null);
    try {
      // Lös URL: curated har den direkt, uploaded kräver Storage-signering.
      const url = pack.url ?? (await getDownloadUrl(pack.slug));
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      const parsed = parseTipspackText(text);
      if (!parsed.success) {
        throw new Error(parsed.error);
      }
      onPick(parsed.battery);
    } catch (e: any) {
      setRowError({
        slug: pack.slug,
        msg: t(
          `Kunde inte importera: ${e?.message || "okänt fel"}`,
          `Could not import: ${e?.message || "unknown error"}`
        ),
      });
      setImportingSlug(null);
    }
  }

  // Filtrera på sök — namn + author + beskrivning.
  const filtered = packs
    ? packs.filter((p) => {
        if (!search.trim()) return true;
        const needle = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(needle) ||
          (p.author?.toLowerCase().includes(needle) ?? false) ||
          (p.description?.toLowerCase().includes(needle) ?? false)
        );
      })
    : null;

  return (
    <div
      // z-[2000] för konsistens med ShareDialog + ReuseRouteDialog i
      // samma flik. z-50 (initial gissning) räckte inte över Leaflet-
      // kartans pane-lager (z-index 200-700) → backdroppen stacka:de
      // över sidan men dialog-innehållet hamnade under kartan.
      className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-green-dark">
            {t("Välj från bibliotek", "Pick from library")}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition flex items-center justify-center text-gray-600"
            aria-label={t("Stäng", "Close")}
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Sök på namn eller författare…", "Search by name or author…")}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-dark/30"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loadingError && (
            <div className="p-6 text-center text-red-700 text-sm">
              {loadingError}
            </div>
          )}

          {!loadingError && packs === null && (
            <div className="p-6 text-center text-gray-500 text-sm">
              {t("Laddar bibliotek…", "Loading library…")}
            </div>
          )}

          {!loadingError && filtered && filtered.length === 0 && (
            <div className="p-6 text-center text-gray-500 text-sm">
              {search
                ? t("Inga träffar.", "No matches.")
                : t("Biblioteket är tomt.", "The library is empty.")}
            </div>
          )}

          {filtered && filtered.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {filtered.map((pack) => {
                const isImporting = importingSlug === pack.slug;
                const hasError = rowError?.slug === pack.slug;
                return (
                  <li key={`${pack.source}-${pack.slug}`}>
                    <button
                      onClick={() => handlePick(pack)}
                      disabled={importingSlug !== null}
                      className="w-full text-left px-6 py-4 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-wait"
                    >
                      <div className="flex items-start gap-3">
                        {pack.language && (
                          <Flag code={pack.language} height={18} className="mt-1 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-semibold text-text-warm">
                              {pack.name}
                            </span>
                            {pack.source === "curated" && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-green-dark/10 text-green-dark font-medium">
                                {t("Kurerad", "Curated")}
                              </span>
                            )}
                          </div>
                          {pack.description && (
                            <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
                              {pack.description}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {pack.questionCount}{" "}
                            {pack.questionCount === 1
                              ? t("fråga", "question")
                              : t("frågor", "questions")}
                            {pack.author && (
                              <>
                                {" · "}
                                {t("av", "by")} {pack.author}
                              </>
                            )}
                            {!pack.author && pack.ownerName && (
                              <>
                                {" · "}
                                {t("uppladdat av", "uploaded by")} {pack.ownerName}
                              </>
                            )}
                          </p>
                          {hasError && (
                            <p className="text-xs text-red-700 mt-1">
                              ❌ {rowError.msg}
                            </p>
                          )}
                        </div>
                        {isImporting && (
                          <span className="text-xs text-gray-500 mt-1">
                            {t("Hämtar…", "Fetching…")}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-600">
          {t(
            "Frågorna importeras utan koordinater. Placera dem på kartan eller använd \"Återanvänd rutt\".",
            "Questions are imported without coordinates. Place them on the map or use \"Reuse route\"."
          )}
        </div>
      </div>
    </div>
  );
}

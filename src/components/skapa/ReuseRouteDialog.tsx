/**
 * @file ReuseRouteDialog.tsx
 * @description Dialog för att kopiera koordinater från en befintlig walk
 * till nuvarande walk.
 *
 * Speglar mobil-appens "Återanvänd positioner"-knapp i CreateWalkScreen.
 * Visar lista över användarens andra walks (utom den nuvarande), klickar
 * man en kopieras dess koordinater till nuvarande walks frågor i ordning.
 *
 * Strategi vid kopiering:
 *   - Tomma frågeslots fylls först (frågor utan placering)
 *   - Om source har fler koordinater än vi har tomma slots: ignoreras
 *   - Om source har färre: bara så många som finns kopieras
 *
 * Det här gör inget om vi inte har tomma frågor — användaren ska först
 * importera/lägga till frågor, sen återanvända en rutt.
 */

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { getMyWalks } from "../../lib/walks";
import type { Walk, Coordinate } from "../../lib/types";
import { useT } from "./i18n";

interface Props {
  user: User;
  currentWalkId: string;
  onClose: () => void;
  onPickRoute: (coordinates: Coordinate[]) => void;
}

export function ReuseRouteDialog({
  user,
  currentWalkId,
  onClose,
  onPickRoute,
}: Props) {
  const t = useT();
  const [walks, setWalks] = useState<Walk[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyWalks(user.uid)
      .then((list) => {
        // Filtrera bort nuvarande walk + walks utan placerade frågor
        setWalks(
          list.filter(
            (w) =>
              w.id !== currentWalkId &&
              w.questions.some(
                (q) => q.coordinate.latitude !== 0 || q.coordinate.longitude !== 0
              )
          )
        );
      })
      .catch((e: any) =>
        setError(e?.message || t("Kunde inte hämta walks", "Couldn't fetch walks"))
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid, currentWalkId]);

  function handlePick(walk: Walk) {
    const coords = walk.questions
      .filter(
        (q) => q.coordinate.latitude !== 0 || q.coordinate.longitude !== 0
      )
      .sort((a, b) => a.order - b.order)
      .map((q) => ({ ...q.coordinate }));
    onPickRoute(coords);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[2000] p-4"
      onClick={onClose}
    >
      <div
        className="bg-cream rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-2xl text-green-dark">
            {t("Återanvänd rutt", "Reuse route")}
          </h2>
          <button
            onClick={onClose}
            className="text-text-warm hover:text-green-dark text-2xl leading-none"
            aria-label={t("Stäng", "Close")}
          >
            ×
          </button>
        </div>

        <p className="text-sm text-text-warm mb-4 leading-relaxed">
          {t(
            "Välj en tidigare promenad för att kopiera dess koordinater till de frågor som inte är placerade i den här promenaden ännu.",
            "Pick a previous walk to copy its coordinates onto the questions that aren't placed yet in this walk."
          )}
        </p>

        {error && (
          <p className="mb-3 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
            {error}
          </p>
        )}

        {walks === null && !error && (
          <p className="text-center text-text-warm py-8">{t("Laddar…", "Loading…")}</p>
        )}

        {walks !== null && walks.length === 0 && (
          <p className="text-center text-text-warm py-8">
            {t(
              "Inga andra promenader att kopiera ifrån.",
              "No other walks to copy from."
            )}
          </p>
        )}

        {walks !== null && walks.length > 0 && (
          <ul className="space-y-2">
            {walks.map((w) => {
              const placed = w.questions.filter(
                (q) => q.coordinate.latitude !== 0 || q.coordinate.longitude !== 0
              ).length;
              return (
                <li key={w.id}>
                  <button
                    onClick={() => handlePick(w)}
                    className="w-full text-left bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-green-dark transition"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-serif text-lg text-green-dark truncate">
                        {w.title}
                      </span>
                      <span className="text-xs text-text-warm whitespace-nowrap">
                        {placed} {t("placerade", "placed")}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

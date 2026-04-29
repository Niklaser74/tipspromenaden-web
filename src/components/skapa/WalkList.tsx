/**
 * @file WalkList.tsx
 * @description "Mina walks"-listan. Visas när användaren är inloggad
 * och inte har en specifik walk öppen.
 *
 * Hämtar alla walks ägda av nuvarande uid från Firestore. Visar dem
 * som klickbara kort som öppnar editorn (via hash-routing). Plus en
 * "Ny promenad"-knapp högst upp som genererar nytt id, sparar tom
 * walk till Firestore och navigerar till editorn.
 */

import { useEffect, useState } from "react";
import { signOut, type User } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { getMyWalks, saveWalk } from "../../lib/walks";
import { generateId, type Walk } from "../../lib/types";

interface Props {
  user: User;
  onOpenWalk: (id: string) => void;
}

export function WalkList({ user, onOpenWalk }: Props) {
  const [walks, setWalks] = useState<Walk[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyWalks(user.uid)
      .then((list) => {
        if (!cancelled) setWalks(list);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "Kunde inte hämta promenader");
      });
    return () => {
      cancelled = true;
    };
  }, [user.uid]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const id = generateId();
      const walk: Walk = {
        id,
        title: "Ny promenad",
        questions: [],
        createdBy: user.uid,
        createdAt: Date.now(),
        language: "sv",
      };
      await saveWalk(walk);
      onOpenWalk(id);
    } catch (e: any) {
      setError(e?.message || "Kunde inte skapa promenad");
      setCreating(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <header className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-serif text-3xl md:text-4xl text-green-dark">
            Mina promenader
          </h1>
          <p className="text-sm text-text-warm mt-1">
            Inloggad som {user.displayName || user.email}
          </p>
        </div>
        <button
          onClick={() => signOut(auth)}
          className="text-sm text-text-warm hover:underline"
        >
          Logga ut
        </button>
      </header>

      <button
        onClick={handleCreate}
        disabled={creating}
        className="w-full mb-8 bg-green-dark text-cream px-6 py-4 rounded-2xl font-semibold text-lg shadow-md hover:shadow-lg transition disabled:opacity-50"
      >
        {creating ? "Skapar…" : "+ Ny promenad"}
      </button>

      {error && (
        <p className="mb-6 text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {walks === null && !error && (
        <p className="text-center text-text-warm py-12">Laddar…</p>
      )}

      {walks !== null && walks.length === 0 && (
        <p className="text-center text-text-warm py-12">
          Inga promenader än. Klicka på "+ Ny promenad" ovan för att skapa
          din första.
        </p>
      )}

      {walks !== null && walks.length > 0 && (
        <ul className="space-y-3">
          {walks.map((w) => (
            <li key={w.id}>
              <button
                onClick={() => onOpenWalk(w.id)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl px-5 py-4 hover:border-green-dark transition"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h2 className="font-serif text-xl text-green-dark truncate">
                    {w.title}
                  </h2>
                  <span className="text-xs text-text-warm whitespace-nowrap">
                    {w.questions.length}{" "}
                    {w.questions.length === 1 ? "fråga" : "frågor"}
                  </span>
                </div>
                {w.description && (
                  <p className="mt-1 text-sm text-text-warm line-clamp-2">
                    {w.description}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

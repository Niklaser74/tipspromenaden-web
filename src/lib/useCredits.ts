/**
 * @file useCredits.ts
 * @description Live-saldo av AI-krediter från `billing/{uid}`.
 *
 * Dokumentet skrivs bara av Cloud Functions (köp via Stripe-webhook,
 * dragning vid generering). Saknas det har användaren aldrig köpt → 0.
 * Returnerar `null` medan första snapshotet laddas.
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export function useCredits(uid: string | null | undefined): number | null {
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    if (!uid) {
      setCredits(null);
      return;
    }
    return onSnapshot(
      doc(db, "billing", uid),
      (snap) => {
        const value = snap.data()?.credits;
        setCredits(typeof value === "number" ? value : 0);
      },
      () => {
        // Läsfel (t.ex. regler ej deployade än) ska inte krascha editorn —
        // visa 0 så att köpvägen fortfarande syns.
        setCredits(0);
      }
    );
  }, [uid]);

  return credits;
}

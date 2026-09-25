/**
 * @file useCredits.ts
 * @description Live-saldo av AI-krediter och Pro-status från `billing/{uid}`.
 *
 * Dokumentet skrivs bara av Cloud Functions (köp och fakturor via
 * Stripe-webhooken, dragning vid generering). Saknas det har användaren
 * aldrig köpt → 0.
 *
 * Saldot är köpta krediter (`credits`, försvinner aldrig) plus Pro-
 * krediter (`subscriptionCredits`, fylls på varje period och sparas
 * inte). Backenden drar Pro-krediterna först.
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

export interface ProStatus {
  status: string;
  planId: "pro_month" | "pro_year" | null;
  /** Periodens slut, sekunder sedan epoch. */
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

export interface Billing {
  /** Summan som visas: köpta + Pro-krediter. */
  credits: number;
  purchasedCredits: number;
  subscriptionCredits: number;
  /** Har användaren handlat förut → kundportalen går att öppna. */
  hasCustomer: boolean;
  pro: ProStatus | null;
}

/** Samma som backendens ACTIVE_STATUSES (functions/src/proPlan.ts). */
export function isProActive(pro: ProStatus | null): boolean {
  return !!pro && ["active", "trialing", "past_due"].includes(pro.status);
}

const EMPTY: Billing = { credits: 0, purchasedCredits: 0, subscriptionCredits: 0, hasCustomer: false, pro: null };

/** Hela kreditbilden. `null` medan första snapshotet laddas. */
export function useBilling(uid: string | null | undefined): Billing | null {
  const [billing, setBilling] = useState<Billing | null>(null);

  useEffect(() => {
    if (!uid) {
      setBilling(null);
      return;
    }
    return onSnapshot(
      doc(db, "billing", uid),
      (snap) => {
        const d = snap.data() ?? {};
        const purchased = typeof d.credits === "number" ? d.credits : 0;
        const subscription = typeof d.subscriptionCredits === "number" ? d.subscriptionCredits : 0;
        setBilling({
          credits: purchased + subscription,
          purchasedCredits: purchased,
          subscriptionCredits: subscription,
          hasCustomer: typeof d.stripeCustomerId === "string",
          pro: d.pro && typeof d.pro.status === "string" ? (d.pro as ProStatus) : null,
        });
      },
      () => {
        // Läsfel (t.ex. regler ej deployade än) ska inte krascha editorn —
        // visa 0 så att köpvägen fortfarande syns.
        setBilling(EMPTY);
      }
    );
  }, [uid]);

  return billing;
}

/** Bara saldot (köpta + Pro). `null` medan första snapshotet laddas. */
export function useCredits(uid: string | null | undefined): number | null {
  return useBilling(uid)?.credits ?? null;
}

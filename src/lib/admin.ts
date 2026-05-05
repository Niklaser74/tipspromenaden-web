/**
 * @file admin.ts
 * @description Admin-konfiguration + moderation-flaggor.
 *
 * Admin-status är hardcoded mot Firebase Auth UID. Det är medvetet
 * trubbigt — för en hobby-app utan Cloud Functions är det enklaste sättet
 * att autentisera moderator-handlingar. När/om vi går till Cloud Functions
 * kan detta flyttas till custom claims.
 *
 * **Bootstrap-flöde:** lägg till din egen UID i `ADMIN_UIDS` nedan.
 * Hitta den genom att logga in på /admin — sidan visar din UID när du
 * inte är admin än. Samma lista måste speglas i `firestore.rules` (app-
 * repot) under `isAdmin()`-funktionen, annars kan rules-skiktet stoppa
 * skrivningen även om UI:t släpper igenom.
 *
 * Moderation-flaggorna lever i ett enda Firestore-dokument
 * `moderation/hidden` med arrayer av walkId / tipspack-slug. Public-
 * listningar läser detta doc och filtrerar bort gömda items. Owner ser
 * fortfarande sina egna i "Mina"-vyer (där query går på ownerUid).
 */

import {
  doc,
  getDoc,
  setDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

/**
 * Lista över Firebase Auth UID:n som har admin-behörighet.
 * Lägg till din egen genom att logga in på /admin — sidan visar din UID
 * om du inte redan är admin. Samma lista finns i `firestore.rules`.
 */
export const ADMIN_UIDS: string[] = [
  // "DIN_UID_HÄR" — fyll i från /admin-sidan
];

export function isAdmin(user: User | null | undefined): boolean {
  return !!user && ADMIN_UIDS.includes(user.uid);
}

const MODERATION_DOC = "moderation/hidden";

export interface ModerationFlags {
  walks: Set<string>;
  tipspacks: Set<string>;
  updatedAt?: number;
  updatedBy?: string;
}

/**
 * Hämtar gömnings-flaggor från Firestore. Vid läsfel returneras tomma
 * sets — moderation är "best effort", inget hårt krav. Resultatet bör
 * cachas av anroparen om det används i en lista.
 */
export async function getModerationFlags(): Promise<ModerationFlags> {
  try {
    const snap = await getDoc(doc(db, "moderation", "hidden"));
    if (!snap.exists()) return { walks: new Set(), tipspacks: new Set() };
    const data = snap.data() as {
      walks?: string[];
      tipspacks?: string[];
      updatedAt?: number;
      updatedBy?: string;
    };
    return {
      walks: new Set(data.walks ?? []),
      tipspacks: new Set(data.tipspacks ?? []),
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy,
    };
  } catch {
    return { walks: new Set(), tipspacks: new Set() };
  }
}

/** Toggla en walk:s moderation-status. Kräver admin (Firestore-rules). */
export async function setWalkHidden(
  walkId: string,
  hidden: boolean,
  adminUid: string
): Promise<void> {
  const ref = doc(db, "moderation", "hidden");
  await setDoc(
    ref,
    {
      walks: hidden ? arrayUnion(walkId) : arrayRemove(walkId),
      updatedAt: Date.now(),
      updatedBy: adminUid,
    },
    { merge: true }
  );
}

/** Toggla en tipspack:s moderation-status. Kräver admin. */
export async function setTipspackHidden(
  slug: string,
  hidden: boolean,
  adminUid: string
): Promise<void> {
  const ref = doc(db, "moderation", "hidden");
  await setDoc(
    ref,
    {
      tipspacks: hidden ? arrayUnion(slug) : arrayRemove(slug),
      updatedAt: Date.now(),
      updatedBy: adminUid,
    },
    { merge: true }
  );
}

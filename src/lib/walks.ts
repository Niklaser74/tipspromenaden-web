/**
 * @file walks.ts
 * @description Firestore CRUD för walks från webben.
 *
 * Speglar de delar av mobil-appens `src/services/firestore.ts` som behövs
 * för skaparflödet:
 *   - getMyWalks(uid) — hämta alla walks ägda av användaren
 *   - getWalk(id) — hämta enskild walk
 *   - saveWalk(walk) — skapa eller uppdatera walk
 *   - deleteWalk(id) — radera walk
 *
 * **VIKTIGT:** `firestore.rules` validerar att (a) skaparen är inloggad
 * (icke-anonym), (b) `createdBy === auth.uid`, (c) `title` ≤ 200,
 * (d) `questions` ≤ 200, (e) `description` ≤ 2000. Bryt INTE dessa
 * gränser i koden här — då avvisas writes serverside.
 *
 * Vi gör en `stripUndefined()` innan setDoc precis som appen, eftersom
 * Firestore avvisar `undefined`-värden.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  setDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Walk } from "./types";

const WALKS = "walks";

/**
 * Rekursiv stripUndefined — Firestore avvisar `undefined`. Ta bort fält
 * vars värde är `undefined` (men behåll `null` och tomma strängar).
 */
function stripUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((v) => stripUndefined(v)) as unknown as T;
  }
  if (typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return obj;
}

/** Hämta alla walks ägda av en specifik uid. Sorterade på senaste först. */
export async function getMyWalks(uid: string): Promise<Walk[]> {
  const q = query(
    collection(db, WALKS),
    where("createdBy", "==", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Walk);
}

/** Hämta en enskild walk via id. */
export async function getWalk(id: string): Promise<Walk | null> {
  const ref = doc(db, WALKS, id);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as Walk) : null;
}

/**
 * Skapa eller uppdatera en walk. Walk:s `id` används som doc-id.
 *
 * Sätter `updatedAt` automatiskt och `createdAt` om walken är ny
 * (inferreras från om `createdAt` redan finns på input).
 */
export async function saveWalk(walk: Walk): Promise<void> {
  const ref = doc(db, WALKS, walk.id);
  const cleaned = stripUndefined({
    ...walk,
    updatedAt: Date.now(),
    createdAt: walk.createdAt || Date.now(),
  });
  await setDoc(ref, cleaned);
}

/** Radera en walk. */
export async function deleteWalk(id: string): Promise<void> {
  await deleteDoc(doc(db, WALKS, id));
}

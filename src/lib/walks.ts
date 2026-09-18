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
  setDoc,
  deleteDoc,
  updateDoc,
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

/**
 * Hämta alla walks ägda av en specifik uid. Sorterade på senaste först.
 *
 * Sorteringen sker client-side istället för via Firestore `orderBy()` för
 * att undvika att kräva en composite index (`createdBy` + `createdAt`).
 * Vid hobby-skala (få walks per användare) är payload försumbar och
 * sortering i JS trivial. Om listan växer till hundratals walks kan
 * detta bytas till en server-side query med rätt index.
 */
export async function getMyWalks(uid: string): Promise<Walk[]> {
  const q = query(collection(db, WALKS), where("createdBy", "==", uid));
  const snap = await getDocs(q);
  const walks = snap.docs.map((d) => d.data() as Walk);
  walks.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return walks;
}

/**
 * Hämtar publika walks (`public === true`) för marknadsföring/discovery
 * på publika sidor. Filtrerar bort admin-flaggade items via
 * `moderation/hidden`-doc:et. Cap:ad till 200 docs.
 */
export async function getPublicWalks(): Promise<Walk[]> {
  const [snap, flags] = await Promise.all([
    getDocs(query(collection(db, WALKS), where("public", "==", true))),
    import("./admin").then((m) => m.getModerationFlags()),
  ]);
  const walks = snap.docs
    .map((d) => d.data() as Walk)
    .filter((w) => !flags.walks.has(w.id));
  walks.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return walks.slice(0, 200);
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

/**
 * Öppna rundor för en walk: antal sessioner med status waiting/active och
 * hur många deltagare i dem som svarat men inte gått i mål. `null` när
 * inget står öppet. Speglar `getOpenRoundSummary` i appens firestore.ts.
 *
 * Används av "Blanda svarsalternativ" för att varna: den som är mitt i en
 * runda har svarat mot de gamla platserna. Sessioner och deltagare är
 * publikt läsbara enligt firestore.rules, så ingen regeländring behövs.
 */
export async function getOpenRoundSummary(
  walkId: string
): Promise<{ sessionIds: string[]; unfinished: number } | null> {
  const snap = await getDocs(
    query(
      collection(db, "sessions"),
      where("walkId", "==", walkId),
      where("status", "in", ["waiting", "active"])
    )
  );
  if (snap.empty) return null;
  const sessionIds = snap.docs.map((d) => d.id);
  const perSession = await Promise.all(
    sessionIds.map((sid) => getDocs(collection(db, "sessions", sid, "participants")))
  );
  let unfinished = 0;
  for (const ps of perSession) {
    for (const p of ps.docs) {
      const data = p.data() as { completedAt?: number; answers?: unknown[] };
      if (!data.completedAt && (data.answers?.length ?? 0) > 0) unfinished++;
    }
  }
  return { sessionIds, unfinished };
}

/**
 * Stänger rundorna — samma som appens "Avsluta rundan". Reglerna släpper
 * igenom `status: completed` från walk-ägaren. Irreversibelt.
 */
export async function closeRounds(sessionIds: string[]): Promise<void> {
  await Promise.all(
    sessionIds.map((sid) => updateDoc(doc(db, "sessions", sid), { status: "completed" }))
  );
}

/** Radera en walk. */
export async function deleteWalk(id: string): Promise<void> {
  await deleteDoc(doc(db, WALKS, id));
}

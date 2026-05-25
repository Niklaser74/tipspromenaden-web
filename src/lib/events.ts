/**
 * @file events.ts
 * @description CRUD-helpers för event-läge (branded customization).
 *
 * Ett event är en sponsorad anpassning av Tipspromenaden-appen (t.ex.
 * Scania Family Day). En event-doc i Firestore (`events/{id}`) bär
 * logo, färger, välkomsttext och valfri lista över vilka walks som ska
 * synas i biblioteket när eventet är aktivt. Användaren aktiverar via
 * deep link `tipspromenaden://event/<id>`, QR-kod eller manuell
 * kod-input i appens Settings.
 *
 * Skapas + redigeras härifrån (web /admin → Events-flik). Endast admin-
 * UID:n får skriva (firestore.rules: `events/{id}` write if isAdmin).
 *
 * Form-fältens shape måste hållas i synk med
 * `tipspromenaden-app/src/types/index.ts EventBranding`.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { db } from "./firebase";

export interface EventBranding {
  id: string;
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  welcomeText?: {
    sv?: string;
    en?: string;
  };
  walkIds?: string[];
  tipspackSlugs?: string[];
  startDate?: string;
  endDate?: string;
  hideLibrary?: boolean;
  /** ISO-timestamp (ms) — admin-spårning, ej läst av appen. */
  updatedAt?: number;
  /** UID på admin som senast skrev — debug only. */
  updatedBy?: string;
}

const EVENTS_COLLECTION = "events";

/** Slug-form: säkra URL-tecken, 1-100 tecken. Speglar isValidEventId i appen. */
export function isValidEventId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id) && id.length > 0 && id.length <= 100;
}

/** Lista alla events (oavsett start/slut). Sorteras klient-side. */
export async function listEvents(): Promise<EventBranding[]> {
  const snap = await getDocs(collection(db, EVENTS_COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EventBranding, "id">) }));
}

/** Hämta ett enskilt event. Null om ej funnet. */
export async function getEvent(id: string): Promise<EventBranding | null> {
  if (!isValidEventId(id)) return null;
  const snap = await getDoc(doc(db, EVENTS_COLLECTION, id));
  if (!snap.exists()) return null;
  return { id, ...(snap.data() as Omit<EventBranding, "id">) };
}

/**
 * Spara ett event (create eller update). Strippar undefined-fält
 * eftersom Firestore avvisar dem ("Unsupported field value: undefined").
 * Sätter updatedAt/updatedBy automatiskt.
 */
export async function saveEvent(
  event: EventBranding,
  adminUid: string
): Promise<void> {
  if (!isValidEventId(event.id)) {
    throw new Error(`Ogiltig event-kod: "${event.id}". Tillåtna tecken: a-z, A-Z, 0-9, _, -. Max 100 tecken.`);
  }
  if (!event.name || event.name.trim().length === 0) {
    throw new Error("Event-namn krävs.");
  }

  // Strippa undefined rekursivt
  const stripped: Record<string, any> = { updatedAt: Date.now(), updatedBy: adminUid };
  for (const [k, v] of Object.entries(event)) {
    if (k === "id") continue; // doc-id ligger i path:en
    if (v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      // Rensa nested undefined/tomma strängar
      const nested: Record<string, any> = {};
      for (const [nk, nv] of Object.entries(v)) {
        if (nv === undefined) continue;
        if (typeof nv === "string" && nv.trim() === "") continue;
        nested[nk] = nv;
      }
      if (Object.keys(nested).length > 0) stripped[k] = nested;
      continue;
    }
    stripped[k] = v;
  }

  await setDoc(doc(db, EVENTS_COLLECTION, event.id), stripped);
}

/** Radera ett event. */
export async function deleteEvent(id: string): Promise<void> {
  if (!isValidEventId(id)) throw new Error("Ogiltig event-kod.");
  await deleteDoc(doc(db, EVENTS_COLLECTION, id));
}

/**
 * Bygger en deep-link-URL som öppnar appen direkt i event-läge.
 * Custom-scheme bara (inte https) — `EVENT_PATH` är reserverad på
 * webben för en framtida landningssida.
 */
export function buildEventDeepLink(eventId: string): string {
  return `tipspromenaden://event/${encodeURIComponent(eventId)}`;
}

/**
 * @file downloads.ts
 * @description Service för manuellt registrerade nedladdningssiffror.
 *
 * Firestore-doc: `stats/downloads` — admin-only läs/skriv (firestore.rules).
 * Användaren går till Play Console + App Store Connect ~1×/vecka, fyller
 * i siffrorna här, och admin-dashboardens widget visar dem med "uppdaterad
 * för N dagar sen"-indikator.
 *
 * **Fält-semantik (måste matcha vad konsolerna heter — inte hitta på):**
 * - `androidInstalls`: "Totala installationer" i Play Console (cumulative)
 * - `androidActive`: "Aktiva installationer" — enheter där appen finns just nu
 * - `iosUnits`: "App Units" i App Store Connect — unika Apple-ID:n
 * - `iosDownloads`: "Total Downloads" — inkl. re-downloads och uppdateringar
 *
 * Future: byt ut detta mot Play Developer Reporting API + App Store
 * Connect API + Cloud Function som hämtar dagligen. Då kan widget:en
 * också visa graf över tid (lagrad i `stats/history/{date}`).
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

const DOC_PATH = "stats/downloads";

export interface DownloadStats {
  androidInstalls?: number;
  androidActive?: number;
  iosUnits?: number;
  iosDownloads?: number;
  notes?: string;
  /** Unix ms — sätts automatiskt vid save. */
  updatedAt?: number;
  /** UID på admin som senast skrev. */
  updatedBy?: string;
}

/** Hämtar nuvarande stats. Returnerar tomt objekt om ingen doc finns än. */
export async function getDownloadStats(): Promise<DownloadStats> {
  const snap = await getDoc(doc(db, "stats", "downloads"));
  if (!snap.exists()) return {};
  return snap.data() as DownloadStats;
}

/**
 * Sparar uppdaterade siffror. Sätter updatedAt/updatedBy automatiskt.
 * Strippar undefined/NaN-värden så Firestore inte avvisar.
 */
export async function saveDownloadStats(
  stats: DownloadStats,
  adminUid: string
): Promise<void> {
  const clean: Record<string, any> = {
    updatedAt: Date.now(),
    updatedBy: adminUid,
  };
  for (const [k, v] of Object.entries(stats)) {
    if (k === "updatedAt" || k === "updatedBy") continue;
    if (v === undefined || v === null) continue;
    if (typeof v === "number" && Number.isNaN(v)) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    clean[k] = v;
  }
  await setDoc(doc(db, "stats", "downloads"), clean, { merge: false });
}

/**
 * Format-helpers för UI:t.
 */
export function formatRelativeTime(ts: number | undefined): string {
  if (!ts) return "aldrig";
  const diffMs = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return "idag";
  if (diffMs < 2 * day) return "igår";
  const days = Math.round(diffMs / day);
  if (days < 14) return `för ${days} dagar sedan`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `för ${weeks} ${weeks === 1 ? "vecka" : "veckor"} sedan`;
  const months = Math.round(days / 30);
  return `för ${months} ${months === 1 ? "månad" : "månader"} sedan`;
}

/** Konsol-URLer. */
export const PLAY_CONSOLE_URL =
  "https://play.google.com/console/u/0/developers/app/com.tipspromenaden.app/statistics";
export const APP_STORE_CONNECT_URL =
  "https://appstoreconnect.apple.com/analytics/app";

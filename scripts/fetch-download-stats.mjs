/**
 * @file fetch-download-stats.mjs
 * @description Hämtar nedladdningssiffror från Google Play + App Store
 * Connect och skriver till Firestore-doc `stats/downloads`.
 *
 * Körs av GitHub Actions cron (.github/workflows/fetch-download-stats.yml)
 * dagligen. Kan också köras lokalt med `node scripts/fetch-download-stats.mjs`
 * om alla env-vars är satta.
 *
 * **Env-vars som krävs:**
 *
 *   GCP_SERVICE_ACCOUNT_JSON   — Google Cloud service account-key (JSON-sträng).
 *                                Behöver "Storage Object Viewer" på Play
 *                                Console-buckten (pubsite_prod_<id>).
 *
 *   PLAY_DEVELOPER_ID          — Numeriskt developer-id. Hitta i Play Console
 *                                URL:en eller Account Details. T.ex. "8839472..."
 *
 *   PLAY_PACKAGE_NAME          — "com.tipspromenaden.app".
 *
 *   ASC_KEY_ID                 — App Store Connect API Key ID (10-tecken).
 *
 *   ASC_ISSUER_ID              — Issuer ID (UUID-format).
 *
 *   ASC_PRIVATE_KEY            — Innehållet i .p8-filen (inkl. BEGIN/END-rader).
 *                                I GitHub secrets: klistra in hela texten.
 *
 *   ASC_VENDOR_NUMBER          — Vendor number från ASC (siffror).
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Firebase Admin SDK service account
 *                                   (JSON-sträng). Behöver write på
 *                                   stats/downloads.
 *
 *   LAUNCH_YYYYMM              — När appen lanserades, för att veta hur långt
 *                                tillbaka vi ska iterera ASC-månadsrapporter.
 *                                T.ex. "202605". Default "202605".
 *
 * **Felmodell:** vid fel på en plattform sätts bara den andras siffror,
 * felmeddelandet hamnar i `notes`. Scriptet exit:ar med 0 om något
 * lyckades, 1 om inget.
 */

import { Storage } from "@google-cloud/storage";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createSign } from "node:crypto";
import { gunzipSync } from "node:zlib";

// Historik: 2026-06-04 nekades GCS-bucketen (pubsite_prod_<id>) med
// "storage.objects.list denied". Behörigheten slog igenom dagen efter —
// bucketen går att läsa sedan 2026-06-05, så Plan B (Play Developer
// Reporting API) behövdes aldrig.

const {
  GCP_SERVICE_ACCOUNT_JSON,
  PLAY_DEVELOPER_ID,
  PLAY_PACKAGE_NAME = "com.tipspromenaden.app",
  ASC_KEY_ID,
  ASC_ISSUER_ID,
  ASC_PRIVATE_KEY,
  ASC_VENDOR_NUMBER,
  FIREBASE_SERVICE_ACCOUNT_JSON,
  LAUNCH_YYYYMM = "202605",
} = process.env;

if (!FIREBASE_SERVICE_ACCOUNT_JSON) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON saknas — kan inte skriva till Firestore");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────
// ANDROID — Google Play
// ─────────────────────────────────────────────────────────────────────

/**
 * Läser senaste tillgängliga installs-CSV från Play Consoles GCS-bucket
 * och returnerar cumulative install + active devices från sista raden.
 *
 * Bucket: gs://pubsite_prod_<DEV_ID>/stats/installs/
 * Filer: installs_<package>_YYYYMM_overview.csv (en per månad)
 * Format: UTF-16LE TSV (Date\tPackage Name\t...\tDaily User Installs\tTotal User Installs\tActive Devices)
 *
 * Vi hämtar den senaste filen och tar sista raden (= senaste dagen).
 */
async function fetchAndroidStats() {
  if (!GCP_SERVICE_ACCOUNT_JSON || !PLAY_DEVELOPER_ID) {
    throw new Error("GCP_SERVICE_ACCOUNT_JSON eller PLAY_DEVELOPER_ID saknas");
  }
  const credentials = JSON.parse(GCP_SERVICE_ACCOUNT_JSON);
  const storage = new Storage({ credentials });
  const bucketName = `pubsite_prod_${PLAY_DEVELOPER_ID}`;
  const prefix = `stats/installs/installs_${PLAY_PACKAGE_NAME}_`;

  // Alla månadsfiler, äldst först.
  const [files] = await storage.bucket(bucketName).getFiles({ prefix });
  const overviewFiles = files.filter((f) => f.name.endsWith("_overview.csv"));
  if (overviewFiles.length === 0) {
    throw new Error(`Hittade inga overview-CSVer i ${bucketName}/${prefix}`);
  }
  overviewFiles.sort((a, b) => a.name.localeCompare(b.name));

  // "Total User Installs" finns kvar som kolumn men Google fyller den med 0
  // sedan måttet pensionerades. Kumulativa installs = summan av
  // "Daily User Installs" över alla dagar i alla månadsfiler. Aktiva =
  // senaste dag som har ett värde i "Active Device Installs" (de sista
  // dagarna i filen kan släpa).
  let androidInstalls = 0;
  let androidActive;
  let sawDailyColumn = false;

  for (const file of overviewFiles) {
    const [buffer] = await file.download();
    // Play exporterar UTF-16LE med BOM
    const text = buffer.toString("utf16le").replace(/^﻿/, "");
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) continue;

    // Headers identifierar kolumnerna — kolumnordningen är inte garanterad
    const headers = lines[0].split(",").map((h) => h.trim());
    const dailyIdx = headers.findIndex((h) => /^daily user installs$/i.test(h));
    const activeIdx = headers.findIndex((h) =>
      /^active device installs$/i.test(h)
    );
    if (dailyIdx < 0) {
      throw new Error(
        `Hittar inte "Daily User Installs" i ${file.name}: ${headers.join(", ")}`
      );
    }
    sawDailyColumn = true;

    let monthInstalls = 0;
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(",");
      const daily = parseInt(cells[dailyIdx], 10);
      if (Number.isFinite(daily)) monthInstalls += daily;
      const active = activeIdx >= 0 ? parseInt(cells[activeIdx], 10) : NaN;
      if (Number.isFinite(active) && active > 0) androidActive = active;
    }
    androidInstalls += monthInstalls;
    console.log(
      `Android ${file.name.match(/_(\d{6})_overview/)?.[1]}: ${monthInstalls} installs (${lines.length - 1} dagar)`
    );
  }

  if (!sawDailyColumn) throw new Error("Alla overview-CSVer var tomma");

  const result = { androidInstalls };
  if (androidActive !== undefined) result.androidActive = androidActive;
  return result;
}

// ─────────────────────────────────────────────────────────────────────
// iOS — App Store Connect
// ─────────────────────────────────────────────────────────────────────

/**
 * Bygger en JWT för App Store Connect API. ES256-signering med .p8-nyckeln.
 * Token-livslängd 20 min (max enligt Apple).
 */
function buildAscJwt() {
  const header = { alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ASC_ISSUER_ID,
    iat: now,
    exp: now + 20 * 60,
    aud: "appstoreconnect-v1",
  };

  const base64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsigned = `${base64url(header)}.${base64url(payload)}`;
  const sign = createSign("SHA256");
  sign.update(unsigned);
  sign.end();
  const signature = sign
    .sign({ key: ASC_PRIVATE_KEY, dsaEncoding: "ieee-p1363" })
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${unsigned}.${signature}`;
}

/**
 * Hämtar en sales-summary-rapport och returnerar { units, downloads } för
 * Tipspromenaden. `frequency` är "MONTHLY" (reportDate "YYYY-MM") eller
 * "DAILY" (reportDate "YYYY-MM-DD").
 *
 * Returnerar `null` vid 404. Apple svarar 404 både när rapporten inte är
 * klar än och när perioden saknar försäljning — de går inte att skilja åt.
 */
async function fetchAscReport(frequency, reportDate) {
  const quiet = frequency === "DAILY";
  const yearMonth = reportDate;
  const url = new URL("https://api.appstoreconnect.apple.com/v1/salesReports");
  url.searchParams.set("filter[frequency]", frequency);
  url.searchParams.set("filter[reportType]", "SALES");
  url.searchParams.set("filter[reportSubType]", "SUMMARY");
  url.searchParams.set("filter[reportDate]", reportDate);
  url.searchParams.set("filter[vendorNumber]", ASC_VENDOR_NUMBER);

  const jwt = buildAscJwt();
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${jwt}`, Accept: "application/a-gzip" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    let msg = text.slice(0, 200);
    try {
      const err = JSON.parse(text).errors?.[0];
      if (err) msg = `${err.code} — ${err.title} ${err.detail ?? ""}`.trim();
    } catch {}
    if (/REQUIRED_AGREEMENTS/.test(msg)) {
      msg += " Logga in på appstoreconnect.apple.com → Business/Avtal och godkänn det nya avtalet.";
    }
    throw new Error(`ASC ${res.status}: ${msg}`);
  }

  const gz = Buffer.from(await res.arrayBuffer());
  const tsv = gunzipSync(gz).toString("utf8");
  const lines = tsv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    console.log(`iOS ${yearMonth}: rapporten är tom (0 rader)`);
    return { units: 0, downloads: 0 };
  }

  const headers = lines[0].split("\t");
  const unitsIdx = headers.indexOf("Units");
  const productTypeIdx = headers.indexOf("Product Type Identifier");
  const skuIdx = headers.indexOf("SKU");

  if (unitsIdx < 0 || productTypeIdx < 0) {
    throw new Error(
      `Hittar inte Units/Product Type Identifier i rapporten ${reportDate}: ${headers.join(", ")}`
    );
  }

  if (!quiet) {
    console.log(
      `iOS ${yearMonth}: ${lines.length - 1} rader, headers: ${headers.length} kolumner`
    );
  }

  // Diagnostik: lista distinkta produkttyper så vi ser om Apple bytt format
  const seenTypes = new Set();
  let units = 0;
  let downloads = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const u = parseInt(cells[unitsIdx], 10);
    if (Number.isNaN(u)) continue;
    const productType = (cells[productTypeIdx] ?? "").trim();
    seenTypes.add(productType);

    // First-time downloads: 1F (iPhone gratis), 7F (iPad gratis),
    // 1 (iPhone betald), 7 (iPad betald), 1T (universell). I praktiken
    // räknar vi allt som börjar med 1 eller 7 och inte är en uppdatering.
    // Total downloads inkluderar även uppdateringar (3, 3F).
    const isFirstTime = /^(1F?T?|7F?)$/.test(productType);
    const isAnyDownload = /^[137]F?T?$/.test(productType);

    if (isFirstTime) units += u;
    if (isAnyDownload) downloads += u;
  }
  if (!quiet) {
    console.log(
      `iOS ${yearMonth}: distinkta typer = [${[...seenTypes].join(", ")}]`
    );
  }
  return { units, downloads };
}

/**
 * Summerar dagsrapporterna för en månad, t.o.m. gårdagen (UTC). Används
 * för månader som ännu saknar månadsrapport. Dagar utan rapport (404)
 * räknas som 0 — det gäller alltid de senaste 1–2 dagarna.
 */
async function fetchAscMonthFromDaily(year, month) {
  const todayUtc = new Date().toISOString().slice(0, 10);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let units = 0;
  let downloads = 0;
  let daysWithReport = 0;
  let lastDay = null;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (date >= todayUtc) break;
    const r = await fetchAscReport("DAILY", date);
    if (!r) continue;
    units += r.units;
    downloads += r.downloads;
    daysWithReport++;
    lastDay = date;
  }
  return { units, downloads, daysWithReport, lastDay };
}

/**
 * Iterera månader från LAUNCH_YYYYMM till nu, summera units/downloads.
 * Avslutade månader läses ur månadsrapporten. Den kommer först några dagar
 * in i nästa månad, så innevarande månad (och föregående, de första dagarna
 * efter ett månadsskifte) summeras ur dagsrapporter i stället.
 */
async function fetchIosStats() {
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_PRIVATE_KEY || !ASC_VENDOR_NUMBER) {
    throw new Error("ASC-credentials saknas (KEY_ID / ISSUER_ID / PRIVATE_KEY / VENDOR_NUMBER)");
  }
  const launchYear = parseInt(LAUNCH_YYYYMM.slice(0, 4), 10);
  const launchMonth = parseInt(LAUNCH_YYYYMM.slice(4, 6), 10);
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  // Månadsindex (år*12+månad) för att avgöra vilka månader som är färska
  // nog att sakna månadsrapport.
  const currentIdx = currentYear * 12 + currentMonth;

  // Ett fel på en enda månad avbryter hela iOS-hämtningen. En delsumma
  // (eller 0 när alla månader failar) får aldrig skrivas över de riktiga
  // siffrorna i Firestore.
  let totalUnits = 0;
  let totalDownloads = 0;
  for (let y = launchYear; y <= currentYear; y++) {
    const mStart = y === launchYear ? launchMonth : 1;
    const mEnd = y === currentYear ? currentMonth : 12;
    for (let m = mStart; m <= mEnd; m++) {
      const yyyymm = `${y}${String(m).padStart(2, "0")}`;
      const isCurrent = y * 12 + m === currentIdx;
      const isRecent = currentIdx - (y * 12 + m) <= 1;

      // Innevarande månad har aldrig månadsrapport — gå direkt på dagarna.
      const monthly = isCurrent
        ? null
        : await fetchAscReport("MONTHLY", `${y}-${String(m).padStart(2, "0")}`);

      if (monthly) {
        console.log(`iOS ${yyyymm}: ${monthly.units} units, ${monthly.downloads} downloads`);
        totalUnits += monthly.units;
        totalDownloads += monthly.downloads;
      } else if (isRecent) {
        const d = await fetchAscMonthFromDaily(y, m);
        console.log(
          `iOS ${yyyymm} (dagsrapporter, ${d.daysWithReport} dagar t.o.m. ${d.lastDay ?? "—"}): ${d.units} units, ${d.downloads} downloads`
        );
        totalUnits += d.units;
        totalDownloads += d.downloads;
      } else {
        console.log(`iOS ${yyyymm}: ingen månadsrapport (404) — räknas som 0`);
      }
    }
  }
  return { iosUnits: totalUnits, iosDownloads: totalDownloads };
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────

async function main() {
  const credentials = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
  initializeApp({ credential: cert(credentials) });
  const db = getFirestore();

  const stats = {
    updatedAt: Date.now(),
    updatedBy: "auto-fetch",
  };
  const notes = [];

  try {
    const a = await fetchAndroidStats();
    Object.assign(stats, a);
    console.log(`Android: installs=${a.androidInstalls} active=${a.androidActive ?? "?"}`);
  } catch (e) {
    console.error("Android-fel:", e.message);
    notes.push(`Android: ${e.message}`);
  }

  try {
    const i = await fetchIosStats();
    Object.assign(stats, i);
    console.log(`iOS: units=${i.iosUnits} downloads=${i.iosDownloads}`);
  } catch (e) {
    console.error("iOS-fel:", e.message);
    notes.push(`iOS: ${e.message}`);
  }

  // Behåll manuella siffror om hämtningen misslyckades helt
  const onlyMeta = Object.keys(stats).every(
    (k) => k === "updatedAt" || k === "updatedBy"
  );
  if (onlyMeta) {
    console.error("Ingen plattform lyckades — avbryter utan att skriva");
    process.exit(1);
  }

  // Felnoteringen visas i admin-widgeten. Lyckas allt rensas en gammal.
  stats.notes =
    notes.length > 0
      ? `Auto-fetch ${new Date().toISOString().slice(0, 10)}: ${notes.join(" | ")}`
      : FieldValue.delete();

  await db.collection("stats").doc("downloads").set(stats, { merge: true });
  console.log("Skrivit stats/downloads:", { ...stats, notes: notes.join(" | ") || "(rensad)" });

  // Det som gick att hämta är sparat, men körningen ska ändå bli röd så
  // länge en plattform failar — annars står en gammal siffra kvar obemärkt.
  if (notes.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

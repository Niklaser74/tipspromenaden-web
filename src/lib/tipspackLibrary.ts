/**
 * @file tipspackLibrary.ts
 * @description Firestore CRUD för uppladdade tipspacks + Firebase Storage.
 *
 * Datamodell — `tipspacks/{slug}` doc:
 * ```
 * {
 *   slug: string,           // = doc-id, [a-z0-9_-]+
 *   ownerUid: string,
 *   ownerName?: string,     // user.displayName för "uppladdat av X"-rendering
 *   name: string,
 *   description?: string,
 *   author?: string,        // från .tipspack-filen, kan != ownerName
 *   language?: string,
 *   questionCount: number,
 *   fileSizeBytes: number,
 *   isPublic: boolean,      // true = visas på /tipspack-listan
 *   createdAt: number,
 *   updatedAt: number,
 * }
 * ```
 *
 * Storage-fil: `tipspack/{slug}.tipspack` (publik read).
 *
 * URL för nedladdning: `https://tipspromenaden.app/tipspack/<slug>.tipspack`
 * fungerar för **curated** (committade i git, hostas av Cloudflare). För
 * **uploaded** packs är URL:en istället en Firebase Storage download URL —
 * vi exponerar den via `getDownloadUrl()` nedan.
 *
 * Curated och uploaded packs kan ha överlappande slug. /tipspack-listan
 * deduperar med curated först.
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
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  deleteObject,
  getDownloadURL,
} from "firebase/storage";
import { db, storage } from "./firebase";

const TIPSPACKS = "tipspacks";

export interface TipspackMeta {
  slug: string;
  ownerUid: string;
  ownerName?: string;
  name: string;
  description?: string;
  author?: string;
  language?: string;
  questionCount: number;
  fileSizeBytes: number;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Storage-path för en tipspack-fil. Inget `.tipspack`-suffix i path:en
 * eftersom Storage-rules-syntaxen för att extrahera slug ur filnamn med
 * extension är klumpig (split() använder regex där `.` matchar valfritt
 * tecken). Vi sätter Content-Disposition på objektet så download-filen
 * ändå får `.tipspack`-extensionen.
 */
function storagePath(slug: string): string {
  return `tipspack/${slug}`;
}

/**
 * Hämtar publika tipspacks (för /tipspack-listan).
 * Sortering klient-side på createdAt desc — undviker att kräva composite index.
 */
export async function getPublicTipspacks(): Promise<TipspackMeta[]> {
  const [snap, flags] = await Promise.all([
    getDocs(query(collection(db, TIPSPACKS), where("isPublic", "==", true))),
    import("./admin").then((m) => m.getModerationFlags()),
  ]);
  const list = snap.docs
    .map((d) => d.data() as TipspackMeta)
    .filter((p) => !flags.tipspacks.has(p.slug));
  list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return list;
}

/** Hämtar alla tipspacks ägda av en specifik uid. */
export async function getMyTipspacks(uid: string): Promise<TipspackMeta[]> {
  const q = query(collection(db, TIPSPACKS), where("ownerUid", "==", uid));
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => d.data() as TipspackMeta);
  list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return list;
}

/** Kolla om slug redan är taget — innan upload. */
export async function tipspackExists(slug: string): Promise<boolean> {
  const ref = doc(db, TIPSPACKS, slug);
  const snap = await getDoc(ref);
  return snap.exists();
}

/**
 * Hämta download-URL för en uppladdad tipspack.
 *
 * Notera: returnerar en signerad Firebase Storage-URL, inte
 * `tipspromenaden.app/tipspack/<slug>.tipspack`. Den senare URL:en
 * fungerar bara för **curated** packs (statiska assets på Cloudflare).
 */
export async function getDownloadUrl(slug: string): Promise<string> {
  return getDownloadURL(ref(storage, storagePath(slug)));
}

/**
 * Skapa metadata-doc + ladda upp filen till Storage.
 *
 * Ordning: Firestore-doc först (för slug-uniqueness via doc-id),
 * sedan Storage-upload. Om Storage-uploaden failar raderas Firestore-doc:en
 * så vi inte lämnar orphan-metadata.
 */
export async function uploadTipspack(params: {
  slug: string;
  ownerUid: string;
  ownerName?: string;
  fileContent: string; // JSON som string
  parsedJson: {
    name: string;
    description?: string;
    author?: string;
    language?: string;
    questions: unknown[];
  };
  isPublic: boolean;
}): Promise<TipspackMeta> {
  const {
    slug,
    ownerUid,
    ownerName,
    fileContent,
    parsedJson,
    isPublic,
  } = params;

  const fileSizeBytes = new TextEncoder().encode(fileContent).length;
  const now = Date.now();

  // stripUndefined för att undvika Firestore-error på undefined-fält
  const meta: Record<string, unknown> = {
    slug,
    ownerUid,
    name: parsedJson.name,
    questionCount: parsedJson.questions.length,
    fileSizeBytes,
    isPublic,
    createdAt: now,
    updatedAt: now,
  };
  if (ownerName) meta.ownerName = ownerName;
  if (parsedJson.description) meta.description = parsedJson.description;
  if (parsedJson.author) meta.author = parsedJson.author;
  if (parsedJson.language) meta.language = parsedJson.language;

  const docRef = doc(db, TIPSPACKS, slug);
  await setDoc(docRef, meta);

  try {
    const blob = new Blob([fileContent], { type: "application/json" });
    await uploadBytes(ref(storage, storagePath(slug)), blob, {
      contentType: "application/json",
      cacheControl: "public, max-age=3600",
      // Content-Disposition så browsers sparar filen som <slug>.tipspack
      // när användaren klickar "Ladda ner fil" — Storage-objekt-namnet är
      // bara <slug> (utan extension).
      contentDisposition: `attachment; filename="${slug}.tipspack"`,
    });
  } catch (e) {
    // Rollback: ta bort Firestore-doc:en så vi inte lämnar orphan-metadata
    await deleteDoc(docRef).catch(() => {});
    throw e;
  }

  return meta as TipspackMeta;
}

/** Uppdatera metadata på existerande pack (titel, isPublic, etc.). */
export async function updateTipspackMeta(
  slug: string,
  patch: Partial<Pick<TipspackMeta, "name" | "description" | "isPublic">>
): Promise<void> {
  const docRef = doc(db, TIPSPACKS, slug);
  const snap = await getDoc(docRef);
  if (!snap.exists()) throw new Error("Pack hittades inte");
  const current = snap.data() as TipspackMeta;
  const cleaned: Record<string, unknown> = { ...current, updatedAt: Date.now() };
  if (patch.name !== undefined) cleaned.name = patch.name;
  if (patch.description !== undefined) cleaned.description = patch.description;
  if (patch.isPublic !== undefined) cleaned.isPublic = patch.isPublic;
  // Strip undefined-fält
  Object.keys(cleaned).forEach((k) => {
    if (cleaned[k] === undefined) delete cleaned[k];
  });
  await setDoc(docRef, cleaned);
}

/** Radera både metadata-doc och Storage-fil. */
export async function deleteTipspack(slug: string): Promise<void> {
  await deleteObject(ref(storage, storagePath(slug))).catch(() => {
    // Filen kan saknas (om upload aldrig lyckades) — ignorera
  });
  await deleteDoc(doc(db, TIPSPACKS, slug));
}

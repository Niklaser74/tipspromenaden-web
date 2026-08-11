/**
 * @file types.ts
 * @description Datatyper för walks och frågor.
 *
 * **Speglar `tipspromenaden-app/src/types/index.ts`** — typerna ÄR samma
 * Firestore-dokument, så fältnamn, optionalitet och datatyper måste matcha
 * exakt. Vid ändringar i appen, uppdatera den här filen i samma commit
 * (eller åtminstone samma vecka). En diff-script i CI vore en bra idé
 * längre fram.
 *
 * Vi duplicerar istället för att ha en delad package eftersom (1) appen
 * ligger i ett separat repo, (2) typerna är små och stabila, (3) det
 * sparar oss en byggsetup-monorepo som inte ger mervärde just nu.
 */

/** GPS-koordinat — latitud/longitud i decimalgrader (WGS-84). */
export interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * En enskild fråga kopplad till en geografisk kontrollpunkt.
 */
export interface Question {
  /** Unikt ID. */
  id: string;
  /** Frågetexten. */
  text: string;
  /** Svarsalternativ (oftast 3–4). */
  options: string[];
  /** 0-baserat index på det rätta svaret i `options`. */
  correctOptionIndex: number;
  /** GPS-koordinat för kontrollpunkten. */
  coordinate: Coordinate;
  /** Ordningsnummer 1, 2, 3, … */
  order: number;
  /** Valfri bild — Firebase Storage-URL. */
  imageUrl?: string;
}

/**
 * En hel tipspromenad. Sparas som dokument i Firestore-samlingen `walks`.
 */
export interface Walk {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
  /** Firebase Auth UID på skaparen. */
  createdBy: string;
  /** Unix-tidsstämpel (ms) för create. */
  createdAt: number;
  /** Unix-tidsstämpel (ms) för senaste edit. Optional för bakåtkompat. */
  updatedAt?: number;
  /** ISO 639-1 språkkod (sv, en, de, …). */
  language?: string;
  /** Eventläge — visa resultat under datumintervall. */
  event?: {
    startDate: string; // ISO 8601 (YYYY-MM-DD)
    endDate: string;
  };
  /**
   * Opt-in till app:ens publika bibliotek. Driven av "Publicera"-toggle
   * i CreateWalk (mobil + web). Default off.
   */
  public?: boolean;
  /** Stad — fritext, valfri. Visas i biblioteket, sökbar. */
  city?: string;
  /**
   * Kategori-tagg. Begränsad enum:
   * `"natur" | "stad" | "historia" | "barn" | "cykel" | "mat" | "kultur" | "annat"`
   */
  category?: string;
  /**
   * Centroid (mittpunkt) av alla frågekoordinater. Auto-beräknas vid
   * save. Driver "nära mig"-sortering i biblioteket.
   */
  centroid?: Coordinate;
  /**
   * Aktivitetstyp — styr trigger-tröskel och kartzoom i appen.
   * Default "walk" när fältet saknas. Sätts i appens CreateWalk;
   * webben redigerar inte fältet men typen måste känna till det.
   */
  activityType?: "walk" | "bike";
  /**
   * Strict-order-läge (appen): deltagaren måste besöka kontrollerna i
   * ordning. Sätts i appens CreateWalk; webben rör inte fältet.
   */
  enforceSequentialOrder?: boolean;
  /**
   * Dolda resultat-läge (event): ingen rätt/fel-feedback, poäng eller
   * topplista för deltagarna förrän arrangören redovisar i appen.
   */
  hideResultsUntilReveal?: boolean;
  /**
   * Unix-ms när arrangören tryckte "Redovisa resultat" i appen.
   * Webben skriver aldrig fältet (utom att nollställa det när
   * dolda resultat-läget slås av i editorn).
   */
  resultsRevealedAt?: number;
}

/** Tillåtna kategori-koder för publika walks. */
export const WALK_CATEGORIES = [
  "natur",
  "stad",
  "historia",
  "barn",
  "cykel",
  "mat",
  "kultur",
  "annat",
] as const;

/** Sv-label för kategori-koderna (mobile-app:en speglar samma). */
export const CATEGORY_LABELS_SV: Record<string, string> = {
  natur: "Natur",
  stad: "Stad",
  historia: "Historia",
  barn: "Barn",
  cykel: "Cykel",
  mat: "Mat",
  kultur: "Kultur",
  annat: "Annat",
};

/** En-label för kategori-koderna. */
export const CATEGORY_LABELS_EN: Record<string, string> = {
  natur: "Nature",
  stad: "City",
  historia: "History",
  barn: "Kids",
  cykel: "Cycling",
  mat: "Food",
  kultur: "Culture",
  annat: "Other",
};

/**
 * Genererar ett kort, någorlunda unikt id för Walks/Questions.
 * Format: tidsstämpel (base36) + slumpsuffix. Cirka 12 tecken.
 *
 * Speglar `qr.ts > generateId()` i appen i syfte men inte exakt
 * implementation. Räcker för icke-kritiska id:n; Firestore-doc-id:n
 * via `addDoc` används där absolut unicitet krävs.
 */
export function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 0xffffff)
    .toString(36)
    .padStart(4, "0");
  return `${ts}${rand}`;
}

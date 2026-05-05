/**
 * @file tipspack.ts
 * @description Slug-generering + fil-parsing för `.tipspack`-filer på webben.
 *
 * Validering + typer ligger i `tipspackValidator.ts` (delad med mobil-appen).
 */

import {
  validateBattery,
  MAX_FILE_SIZE_BYTES,
  type QuestionBattery,
} from "./tipspackValidator";

export type { BatteryQuestion, QuestionBattery } from "./tipspackValidator";

export type BatteryParseResult =
  | { success: true; battery: QuestionBattery }
  | { success: false; error: string };

/**
 * Genererar en slug från ett filnamn.
 *
 * Tar bort `.tipspack`-suffix, ersätter åäö med ascii-motsvarigheter,
 * lowercaser, byter ut allt utom [a-z0-9-_] mot `-`, kollapsar
 * upprepade `-`. Validerar mot Firestore-regelns mönster `^[a-z0-9_-]+$`.
 *
 * `goteborgs-hamn.tipspack` → `goteborgs-hamn`
 * `Visby Medeltid.tipspack` → `visby-medeltid`
 * `Älg & Björn.tipspack` → `alg-bjorn`
 */
export function slugFromFilename(filename: string): string {
  return filename
    .replace(/\.tipspack$/i, "")
    .replace(/\.json$/i, "")
    .normalize("NFD") // separera diakriter (ö → o + ̈)
    .replace(/[̀-ͯ]/g, "") // ta bort diakritiska tecken
    .replace(/å/gi, "a")
    .replace(/ä/gi, "a")
    .replace(/ö/gi, "o")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/**
 * Läser en File (från `<input type="file">` eller drag-and-drop) och
 * returnerar parsat batteri eller felmeddelande.
 */
export async function parseTipspackFile(file: File): Promise<BatteryParseResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      success: false,
      error: `Filen är för stor (${mb} MB). Max ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
    };
  }
  try {
    const content = await file.text();
    const data = JSON.parse(content);
    validateBattery(data);
    return { success: true, battery: data };
  } catch (e: any) {
    if (e instanceof SyntaxError) {
      return { success: false, error: "Filen är inte giltig JSON." };
    }
    return {
      success: false,
      error: e?.message || "Okänt fel vid import av frågebatteri.",
    };
  }
}

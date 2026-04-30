/**
 * @file tipspack.ts
 * @description Validator + parser för `.tipspack`-filer på webben.
 *
 * Speglar mobil-appens `src/services/questionBattery.ts`. Samma JSON-format,
 * samma valideringsregler. Vid ändringar i appen — uppdatera här samtidigt.
 *
 * Filformat:
 * ```json
 * {
 *   "format": "tipspack",
 *   "version": "1.0",
 *   "name": "Stockholms gamla stan",
 *   "description": "30 frågor om Stadsholmens historia",
 *   "author": "Tipspromenaden AB",
 *   "language": "sv",
 *   "questions": [
 *     { "text": "...", "options": ["...", "..."], "correctOptionIndex": 0 }
 *   ]
 * }
 * ```
 */

/** En fråga i batteriet — har ingen koordinat eller ordning än. */
export interface BatteryQuestion {
  text: string;
  options: string[];
  correctOptionIndex: number;
}

/** Komplett batteri (tipspack-fil) efter parsing + validering. */
export interface QuestionBattery {
  format: "tipspack";
  version: string;
  name: string;
  description?: string;
  author?: string;
  language?: string;
  questions: BatteryQuestion[];
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_QUESTIONS = 500;
const MAX_TEXT_LENGTH = 1000;

export type BatteryParseResult =
  | { success: true; battery: QuestionBattery }
  | { success: false; error: string };

/**
 * Validerar struktur + innehåll. Kastar Error vid problem.
 * Identisk i logik med appens `validateBattery()`.
 */
function validateBattery(data: any): asserts data is QuestionBattery {
  if (!data || typeof data !== "object") {
    throw new Error("Filen är inte ett giltigt JSON-objekt.");
  }
  if (data.format !== "tipspack") {
    throw new Error(
      `Fel filformat. Förväntade "tipspack" men fick "${data.format}".`
    );
  }
  if (typeof data.version !== "string") {
    throw new Error("Saknar versionsfält.");
  }
  if (typeof data.name !== "string" || !data.name.trim()) {
    throw new Error("Saknar namn på frågebatteriet.");
  }
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error("Frågebatteriet innehåller inga frågor.");
  }
  if (data.questions.length > MAX_QUESTIONS) {
    throw new Error(`Frågebatteriet har för många frågor (max ${MAX_QUESTIONS}).`);
  }
  data.questions.forEach((q: any, idx: number) => {
    const prefix = `Fråga ${idx + 1}:`;
    if (typeof q.text !== "string" || !q.text.trim()) {
      throw new Error(`${prefix} saknar frågetext.`);
    }
    if (q.text.length > MAX_TEXT_LENGTH) {
      throw new Error(`${prefix} frågetexten är för lång.`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`${prefix} måste ha minst 2 svarsalternativ.`);
    }
    if (q.options.length > 10) {
      throw new Error(`${prefix} har för många svarsalternativ (max 10).`);
    }
    if (
      q.options.some(
        (o: any) =>
          typeof o !== "string" || !o.trim() || o.length > MAX_TEXT_LENGTH
      )
    ) {
      throw new Error(`${prefix} har tomma eller för långa svarsalternativ.`);
    }
    if (
      typeof q.correctOptionIndex !== "number" ||
      q.correctOptionIndex < 0 ||
      q.correctOptionIndex >= q.options.length
    ) {
      throw new Error(`${prefix} har ogiltigt rätt-svar-index.`);
    }
  });
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

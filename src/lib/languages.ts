/**
 * @file languages.ts
 * @description Stödda språk för promenader och deras flagg-emojis.
 *
 * **Speglar `tipspromenaden-app/src/constants/languages.ts`** — håll listan
 * synkad mellan repon. Varje post matchar en ISO 639-1-kod.
 *
 * Toleranta mot vanliga "felaktiga" koder vi sett i data: "se" → "sv"
 * (folk skriver landskoden istället för språkkoden), "sv-SE" → "sv"
 * (BCP47 med region). Se `normalizeLanguageCode()`.
 */

export interface Language {
  /** ISO 639-1-kod (t.ex. "sv"). */
  code: string;
  /** Flagg-emoji för landet/regionen som primärt talar språket. */
  flag: string;
  /** Lokalt namn på språket. */
  label: string;
}

export const LANGUAGES: Language[] = [
  { code: "sv", flag: "🇸🇪", label: "Svenska" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "no", flag: "🇳🇴", label: "Norsk" },
  { code: "da", flag: "🇩🇰", label: "Dansk" },
  { code: "fi", flag: "🇫🇮", label: "Suomi" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "es", flag: "🇪🇸", label: "Español" },
];

/**
 * ISO 639-1 språkkod → ISO 3166-1 alpha-2 landskod för flaggrendering.
 * Skiljer sig för engelska (en → gb istället för us). Övriga språk har
 * samma kod för land och språk.
 */
const LANG_TO_COUNTRY: Record<string, string> = {
  sv: "se",
  en: "gb",
  de: "de",
  no: "no",
  da: "dk",
  fi: "fi",
  fr: "fr",
  es: "es",
};

/**
 * Returnerar URL till en PNG-flagga via flagcdn.com.
 * Använd det här istället för `flagForLanguage()` när det ska renderas
 * synligt — Windows har inga flag-emojis i default-fonts så `🇸🇪` blir
 * bokstäverna "SE" istället för en flagga. PNG-bilder fungerar överallt.
 */
export function flagImageUrl(code: string | undefined, height = 20): string | null {
  const normalized = normalizeLanguageCode(code);
  if (!normalized) return null;
  const country = LANG_TO_COUNTRY[normalized];
  if (!country) return null;
  return `https://flagcdn.com/h${height}/${country}.png`;
}

/**
 * Normaliserar en språkkod till en av våra stödda koder.
 * - "se" (felaktig — det är landskod för Sverige, inte språk) → "sv"
 * - "sv-SE", "en-US" (BCP47 med region) → "sv", "en"
 * - Övriga: lowercase + trimma whitespace
 */
export function normalizeLanguageCode(code: string | undefined): string {
  if (!code) return "";
  const lower = code.toLowerCase().trim();
  // Vanliga miss-skrivningar — landskod istället för språkkod
  if (lower === "se") return "sv";
  // BCP47-region: ta bara primär subtag (sv-SE → sv)
  return lower.split(/[-_]/)[0];
}

/**
 * Returnerar flagg-emoji för given språkkod, eller "" om okänd.
 * Normaliserar först ("se" → "sv" etc.).
 */
export function flagForLanguage(code: string | undefined): string {
  const normalized = normalizeLanguageCode(code);
  if (!normalized) return "";
  return LANGUAGES.find((l) => l.code === normalized)?.flag ?? "";
}

/** Returnerar lokalt språknamn ("Svenska") för given kod. */
export function labelForLanguage(code: string | undefined): string {
  const normalized = normalizeLanguageCode(code);
  if (!normalized) return "";
  return LANGUAGES.find((l) => l.code === normalized)?.label ?? "";
}

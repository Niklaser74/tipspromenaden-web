/**
 * @file locale.ts
 * @description Minimal i18n-helper för tvåspråkig sajt (svenska default,
 * engelska sekundär).
 *
 * Astro 5 har inbyggd i18n-routing men för en så liten sajt med få sidor
 * räcker en explicit `lang`-prop på Layout + handgjord slug-mapping
 * mellan språkens URL:er. Pages deklarerar sin alternate-URL själva via
 * Layout-prop:en — det är mer boilerplate men mer transparent och kräver
 * ingen Astro-magi.
 *
 * Använder slug-mappingen nedan endast som FALLBACK när en sida glömt
 * deklarera alternateUrl.
 */

export type Locale = "sv" | "en";

/** Mappning från svensk URL → engelsk URL (för fallback i language switcher). */
const URL_MAP: Record<string, string> = {
  "/": "/en/",
  "/stod": "/en/support",
  "/sa-funkar-det": "/en/how-it-works",
  "/tipspack": "/en/tipspack",
  "/tipspack/": "/en/tipspack/",
};

/** Detektera nuvarande locale från path. */
export function getLocaleFromPath(pathname: string): Locale {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "sv";
}

/**
 * Hitta alternativ-URL automatiskt om sidan inte deklarerat egen.
 * Faller tillbaka till `/en/` resp `/` om ingen mappning finns.
 */
export function getAlternateUrl(pathname: string): string {
  const locale = getLocaleFromPath(pathname);

  if (locale === "sv") {
    // Strippa query/hash (i fallet det förekommer)
    const path = pathname.split("?")[0].split("#")[0];
    return URL_MAP[path] ?? "/en/";
  }

  // sv-version = nyckel i URL_MAP där värdet är /en-pathen
  const path = pathname.split("?")[0].split("#")[0];
  for (const [sv, en] of Object.entries(URL_MAP)) {
    if (en === path) return sv;
  }
  return "/";
}

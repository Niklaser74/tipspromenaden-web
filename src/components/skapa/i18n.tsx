/**
 * @file i18n.tsx
 * @description Lättviktig tvåspråks-helper för /skapa-React-island.
 *
 * Inga JSON-bundles — strängar inlines vid call-site som
 * `t("Spara", "Save")` så översättningen håller ihop med koden. Det är
 * mer kompakt än separata sv.json/en.json och ger omedelbar context.
 *
 * Locale-state läggs i en Context som App.tsx providar baserat på prop
 * från Astro-page (sv eller en). useT()-hook returnerar t-funktionen
 * som plockar svensk eller engelsk variant.
 *
 * Skala upp till JSON-bundles om vi någonsin behöver mer än två språk
 * eller centraliserad översättningshantering — formen är ungefär densamma.
 */

import { createContext, useContext, type ReactNode } from "react";

export type Locale = "sv" | "en";

const LangContext = createContext<Locale>("sv");

interface LangProviderProps {
  lang: Locale;
  children: ReactNode;
}

export function LangProvider({ lang, children }: LangProviderProps) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/**
 * Hook som returnerar översättningsfunktionen.
 *
 * @example
 *   const t = useT();
 *   <button>{t("Spara", "Save")}</button>
 */
export function useT(): (sv: string, en: string) => string {
  const lang = useContext(LangContext);
  return (sv, en) => (lang === "en" ? en : sv);
}

/**
 * Direkt åtkomst till nuvarande locale (för fall där komponent behöver
 * t.ex. byta date-locale eller ARIA-attribut, inte bara översätta text).
 */
export function useLocale(): Locale {
  return useContext(LangContext);
}

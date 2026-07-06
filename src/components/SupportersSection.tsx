/**
 * @file SupportersSection.tsx
 * @description Publik "Tack till våra supportrar"-sektion på stödsidan
 * (/stod + /en/support). Läser samma Firestore-doc (`config/supporters`,
 * publik read) som appens tacksida och admin-fliken 💚 Supportrar —
 * ingen extra backend behövs.
 *
 * Hydreras `client:idle` så sidan renderas instant; sektionen dyker upp
 * när Firestore-fetchen är klar. Hide-by-default: finns inga namn (eller
 * failar fetchen) renderas null — vi vill aldrig visa en tom tack-lista.
 *
 * Intro-texten följer samma regler som appen: doc:ets `message` med
 * fallback en ↔ sv, annars default-texten nedan.
 */

import { useEffect, useState } from "react";
import {
  getSupportersConfig,
  type SupportersConfig,
} from "../lib/supporters";

interface Props {
  /** "sv" eller "en" — styr rubrik, intro-fallback och message-språk. */
  lang?: "sv" | "en";
}

const STRINGS = {
  sv: {
    eyebrow: "Supportrar",
    headline: "Tack till våra supportrar",
    defaultIntro:
      "Ett varmt tack till er som har bidragit — ni håller Tipspromenaden rullande.",
  },
  en: {
    eyebrow: "Supporters",
    headline: "Thanks to our supporters",
    defaultIntro:
      "A warm thank-you to everyone who has contributed — you keep Tipspromenaden going.",
  },
} as const;

export default function SupportersSection({ lang = "sv" }: Props) {
  const [config, setConfig] = useState<SupportersConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await getSupportersConfig();
        if (!cancelled) setConfig(loaded);
      } catch {
        // Fail silently — sektionen visar inget om något går fel
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!config || config.names.length === 0) return null;

  const s = STRINGS[lang];
  const intro =
    (lang === "sv"
      ? config.message?.sv || config.message?.en
      : config.message?.en || config.message?.sv) || s.defaultIntro;

  return (
    <section className="max-w-2xl mx-auto px-6 pb-16">
      <div className="bg-white border border-rule rounded-2xl p-6 sm:p-8 text-center">
        <p className="text-xs tracking-[0.2em] uppercase text-sage mb-2">
          {s.eyebrow}
        </p>
        <h2 className="font-serif font-bold text-2xl sm:text-3xl text-green-dark mb-3">
          {s.headline}
        </h2>
        <p className="text-text-warm text-base mb-6 max-w-md mx-auto">
          {intro}
        </p>
        <ul className="flex flex-wrap justify-center gap-2">
          {config.names.map((name, i) => (
            <li
              key={`${name}-${i}`}
              className="bg-cream border border-rule rounded-full px-4 py-1.5 font-serif text-green-dark text-sm sm:text-base"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

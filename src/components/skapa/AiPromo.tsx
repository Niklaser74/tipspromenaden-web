/**
 * @file AiPromo.tsx
 * @description Reklam för AI-genererade frågor på `/skapa`.
 *
 * Samma budskap som blocket "Låt AI skriva frågorna" på startsidan
 * (`src/pages/index.astro` + `en/index.astro`) — ändra texterna på båda
 * ställena. Priset och kreditkostnaden måste stämma med `CREDIT_PACKS` och
 * `creditCost()` i `src/lib/ai.ts`.
 *
 * Två varianter:
 *   - `full`    — hela blocket, på inloggningssidan (`Login.tsx`).
 *   - `compact` — en rad överst i "Mina promenader" (`WalkList.tsx`) som
 *                 går att stänga. Valet sparas i localStorage.
 */

import { useState } from "react";
import { useT } from "./i18n";

const DISMISS_KEY = "skapa:aiPromoDismissed:v1";

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function AiPromo({ variant }: { variant: "full" | "compact" }) {
  const t = useT();
  const [hidden, setHidden] = useState(() => variant === "compact" && wasDismissed());

  if (variant === "compact") {
    if (hidden) return null;
    return (
      <div className="relative bg-white border border-rule border-l-4 border-l-yellow rounded-2xl px-5 py-4 mb-8 pr-12">
        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-green mb-1">
          {t("Nytt · önskat av er", "New · requested by you")}
        </p>
        <p className="font-serif font-bold text-xl text-green-dark mb-1">
          {t("Låt AI skriva frågorna", "Let AI write the questions")}
        </p>
        <p className="text-sm leading-relaxed text-text-warm">
          {t(
            "Utgå från ett tema, en plats eller en egen text och få ett färdigt frågebatteri på under en minut. Öppna en promenad och välj ”✨ Generera med AI”. Från 49 kr för 10 krediter — en kredit räcker till upp till 15 frågor.",
            "Start from a topic, a place or your own text and get a finished question pack in under a minute. Open a walk and choose “✨ Generate with AI”. From 49 SEK for 10 credits — one credit covers up to 15 questions."
          )}
        </p>
        <button
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              // Privat läge e.d. — då göms rutan bara tills sidan laddas om.
            }
            setHidden(true);
          }}
          aria-label={t("Stäng", "Close")}
          className="absolute top-3 right-3 w-8 h-8 rounded-full text-text-warm hover:bg-cream"
        >
          ✕
        </button>
      </div>
    );
  }

  const modes = [
    {
      emoji: "💡",
      title: t("Från ett tema", "From a topic"),
      body: t(
        "”Dinosaurier för sjuåringar” eller ”Svensk musik på 80-talet”. Du väljer svårighet, målgrupp och antal frågor.",
        "“Dinosaurs for seven-year-olds” or “Pop music of the 80s”. You choose difficulty, audience and number of questions."
      ),
    },
    {
      emoji: "📍",
      title: t("Från en plats", "From a place"),
      body: t(
        "Frågor om just er ort, park eller sevärdhet. AI:n söker upp fakta om platsen på webben.",
        "Questions about your own town, park or landmark. The AI looks up facts about the place on the web."
      ),
    },
    {
      emoji: "📄",
      title: t("Från din egen text", "From your own text"),
      body: t(
        "Klistra in kursmaterial, föreningens historia eller en artikel, så bygger frågorna på den.",
        "Paste course material, your club's history or an article, and the questions are built on it."
      ),
    },
  ];

  return (
    <section className="w-full max-w-4xl mx-auto text-left">
      <div className="bg-white border border-rule rounded-3xl overflow-hidden shadow-lg shadow-green-dark/10">
        <div className="h-1.5 bg-yellow" />
        <div className="p-8 md:p-12">
          <p className="text-center mb-5">
            <span className="inline-block bg-green-dark text-cream text-xs font-semibold tracking-[0.2em] uppercase px-4 py-1.5 rounded-full">
              {t("Nytt · önskat av er", "New · requested by you")}
            </span>
          </p>
          <h2 className="font-serif text-3xl sm:text-4xl text-center mb-5">
            {t("Låt AI skriva frågorna", "Let AI write the questions")}
          </h2>
          <p className="text-lg leading-relaxed text-center max-w-2xl mx-auto mb-10">
            {t(
              "Slut på idétorka kvällen före kalaset. Beskriv vad promenaden ska handla om, så har du ett färdigt frågebatteri på under en minut — med rätt svar, förklaring och källa till varje fråga.",
              "No more blank page the night before the party. Describe what the walk should be about and you have a finished question pack in under a minute — with the right answer, an explanation and a source for every question."
            )}
          </p>

          <div className="grid md:grid-cols-3 gap-8 mb-10">
            {modes.map(({ emoji, title, body }) => (
              <div key={title} className="text-center md:text-left">
                <div className="text-3xl mb-3" aria-hidden="true">
                  {emoji}
                </div>
                <h3 className="font-serif font-bold text-xl mb-2">{title}</h3>
                <p className="text-base leading-relaxed text-text-warm">{body}</p>
              </div>
            ))}
          </div>

          <blockquote className="bg-cream rounded-2xl px-6 py-5 max-w-2xl mx-auto mb-8 border-l-4 border-yellow">
            <p className="text-base leading-relaxed">
              <strong className="font-serif text-green-dark">
                {t("En funktion ni har bett om.", "A feature you asked for.")}
              </strong>{" "}
              {t(
                "Att hitta på bra frågor är det som tar längst tid när man bygger en promenad, och önskemålet om hjälp med just det kommer från er som använder Tipspromenaden. Nu gör AI:n grovjobbet. Du granskar frågorna, väljer bort dem du inte vill ha och ändrar resten innan något sparas.",
                "Coming up with good questions is what takes the longest when you build a walk, and the request for help with exactly that comes from you who use Tipspromenaden. Now the AI does the heavy lifting. You review the questions, drop the ones you don't want and edit the rest before anything is saved."
              )}
            </p>
          </blockquote>

          <p className="text-sm text-text-warm text-center max-w-xl mx-auto leading-relaxed">
            {t(
              "Logga in här ovanför för att prova. Från 49 kr för 10 krediter — en kredit räcker till upp till 15 frågor. Frågorna kan skrivas på åtta språk. Allt annat i Tipspromenaden är gratis, precis som förut.",
              "Sign in above to try it. From 49 SEK for 10 credits — one credit covers up to 15 questions. Questions can be written in eight languages. Everything else in Tipspromenaden is free, just like before."
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

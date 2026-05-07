/**
 * @file UpcomingEventsTeaser.tsx
 * @description Visar närmaste 3 publika walks med event-datum (max 30
 *   dagar bort) på publika landningssidor. Syftet är att besökare som
 *   funderar på att ladda ner appen ska se att det faktiskt händer
 *   saker — "social proof" via realtid.
 *
 * Hydreras `client:idle` så landningssidan renderas instant; sektionen
 * dyker upp efter att Firestore-fetchen är klar (~200-500 ms vanligen).
 *
 * Hide-by-default: om inga matchande events hittas eller fetchen failar,
 * sektionen renderar `null`. Vi vill aldrig visa "inga event"-text på
 * marknadssidan.
 */

import { useEffect, useState } from "react";
import { Flag } from "./Flag";
import { getPublicWalks } from "../lib/walks";
import type { Walk } from "../lib/types";

interface Props {
  /** "sv" eller "en" — styr datum-locale + texter. */
  lang?: "sv" | "en";
  /** Hur många dagar fram vi anser "kommande" (default 30). */
  windowDays?: number;
  /** Max antal kort att visa (default 3). */
  limit?: number;
}

interface UpcomingEvent {
  walk: Walk;
  daysUntil: number;
}

const STRINGS = {
  sv: {
    eyebrow: "Kommande tipspromenader",
    headline: "Det händer saker — gå med",
    today: "Idag",
    tomorrow: "Imorgon",
    inDays: (n: number) => `Om ${n} dagar`,
    questions: (n: number) => `${n} ${n === 1 ? "fråga" : "frågor"}`,
    cta: "Ladda ner appen",
  },
  en: {
    eyebrow: "Upcoming events",
    headline: "Activity is happening — join in",
    today: "Today",
    tomorrow: "Tomorrow",
    inDays: (n: number) => `In ${n} days`,
    questions: (n: number) => `${n} ${n === 1 ? "question" : "questions"}`,
    cta: "Get the app",
  },
} as const;

export default function UpcomingEventsTeaser({
  lang = "sv",
  windowDays = 30,
  limit = 3,
}: Props) {
  const [events, setEvents] = useState<UpcomingEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const walks = await getPublicWalks();
        if (cancelled) return;

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() + windowDays);

        const matching = walks
          .filter((w) => {
            if (!w.event?.startDate) return false;
            const start = new Date(w.event.startDate).getTime();
            return start >= now.getTime() && start <= cutoff.getTime();
          })
          .map((w) => {
            const daysUntil = Math.round(
              (new Date(w.event!.startDate).getTime() - now.getTime()) /
                (1000 * 60 * 60 * 24)
            );
            return { walk: w, daysUntil };
          })
          .sort((a, b) => a.daysUntil - b.daysUntil)
          .slice(0, limit);

        setEvents(matching);
      } catch {
        // Fail silently — komponenten visar inget om något går fel
        setEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [windowDays, limit]);

  // Hide entirely tills fetchen är klar OCH om inga events hittas
  if (events === null || events.length === 0) return null;

  const s = STRINGS[lang];
  const dateLocale = lang === "sv" ? "sv-SE" : "en-GB";

  function relativeDate(daysUntil: number, iso: string): string {
    if (daysUntil === 0) return s.today;
    if (daysUntil === 1) return s.tomorrow;
    if (daysUntil < 7) {
      const weekday = new Date(iso).toLocaleDateString(dateLocale, {
        weekday: "long",
      });
      return weekday.charAt(0).toUpperCase() + weekday.slice(1);
    }
    if (daysUntil < windowDays) return s.inDays(daysUntil);
    return new Date(iso).toLocaleDateString(dateLocale, {
      day: "numeric",
      month: "long",
    });
  }

  return (
    <section className="max-w-2xl mx-auto px-6 pb-12">
      <div className="bg-white border border-rule rounded-2xl p-6 sm:p-8">
        <p className="text-xs tracking-[0.2em] uppercase text-sage mb-2 text-center">
          {s.eyebrow}
        </p>
        <h2 className="font-serif font-bold text-2xl sm:text-3xl text-green-dark mb-6 text-center">
          {s.headline}
        </h2>
        <ul className="space-y-3">
          {events.map(({ walk, daysUntil }) => (
            <li
              key={walk.id}
              className="flex items-center gap-4 border-t border-rule/60 pt-3 first:border-t-0 first:pt-0"
            >
              <div className="text-center shrink-0 w-20">
                <p className="text-xs uppercase tracking-wider text-green font-semibold">
                  {relativeDate(daysUntil, walk.event!.startDate)}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-serif text-lg text-green-dark flex items-center gap-2 flex-wrap">
                  {walk.language && <Flag code={walk.language} height={14} />}
                  {walk.activityType === "bike" ? (
                    <span aria-label="cykel">🚲</span>
                  ) : null}
                  <span className="truncate">{walk.title}</span>
                </p>
                <p className="text-xs text-text-warm">
                  {s.questions(walk.questions.length)}
                  {walk.city ? ` · 📍 ${walk.city}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * @file QuestionForm.tsx
 * @description Editor för en enskild fråga — text, alternativ, rätt svar.
 * Visas i sidopanelen när en fråga är vald.
 */

import type { Question } from "../../lib/types";
import { useT } from "./i18n";

interface Props {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  onPlaceOnMap: () => void;
  onDelete: () => void;
}

export function QuestionForm({ question, onChange, onPlaceOnMap, onDelete }: Props) {
  const t = useT();
  const isPlaced =
    question.coordinate.latitude !== 0 || question.coordinate.longitude !== 0;

  function setOption(idx: number, value: string) {
    const next = [...question.options];
    next[idx] = value;
    onChange({ options: next });
  }

  function addOption() {
    if (question.options.length >= 10) return;
    onChange({ options: [...question.options, ""] });
  }

  function removeOption(idx: number) {
    if (question.options.length <= 2) return;
    const next = question.options.filter((_, i) => i !== idx);
    let correctIdx = question.correctOptionIndex;
    if (correctIdx === idx) correctIdx = 0;
    else if (correctIdx > idx) correctIdx -= 1;
    onChange({ options: next, correctOptionIndex: correctIdx });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-serif text-lg text-green-dark">
          {t("Fråga", "Question")} {question.order}
        </h3>
        <button
          onClick={onDelete}
          title={t(
            "Ta bort hela frågan från promenaden. Kan inte ångras — autospar skriver direkt.",
            "Remove the entire question from the walk. Cannot be undone — auto-save writes immediately."
          )}
          className="text-xs text-red-700 hover:underline"
        >
          {t("Ta bort", "Remove")}
        </button>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-text-warm mb-1">
          {t("Frågetext", "Question text")}
        </label>
        <textarea
          value={question.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={2}
          maxLength={1000}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-green-dark focus:outline-none"
          placeholder={t(
            "T.ex. Vilket år grundades Stockholm?",
            "E.g. What year was Stockholm founded?"
          )}
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-text-warm mb-1">
          {t("Svarsalternativ — markera det rätta", "Answer options — mark the correct one")}
        </label>
        <ul className="space-y-2">
          {question.options.map((opt, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="radio"
                name={`correct-${question.id}`}
                checked={question.correctOptionIndex === i}
                onChange={() => onChange({ correctOptionIndex: i })}
                className="accent-green-dark"
              />
              <input
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                maxLength={1000}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-green-dark focus:outline-none"
                placeholder={`${t("Alternativ", "Option")} ${i + 1}`}
              />
              {question.options.length > 2 && (
                <button
                  onClick={() => removeOption(i)}
                  className="text-text-warm hover:text-red-700 px-2"
                  title={t("Ta bort", "Remove")}
                  aria-label={`${t("Ta bort alternativ", "Remove option")} ${i + 1}`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
        {question.options.length < 10 && (
          <button
            onClick={addOption}
            title={t(
              "Klassiska tipspromenader har 3 alternativ. Lägg till fler om du vill göra svårare frågor.",
              "Classic walks use 3 options. Add more for harder questions."
            )}
            className="mt-2 text-sm text-green font-semibold hover:underline"
          >
            {t("+ Lägg till alternativ", "+ Add option")}
          </button>
        )}
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-text-warm mb-1">
          {t("Plats", "Location")}
        </label>
        {isPlaced ? (
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-text-warm font-mono">
                {question.coordinate.latitude.toFixed(5)},{" "}
                {question.coordinate.longitude.toFixed(5)}
              </span>
              <button
                onClick={onPlaceOnMap}
                title={t(
                  "Aktivera placerings-läget igen och klicka på en ny punkt på kartan för att flytta frågan.",
                  "Re-enter placement mode and click a new spot on the map to move the question."
                )}
                className="text-sm text-green font-semibold hover:underline"
              >
                {t("Klicka om", "Click again")}
              </button>
            </div>
            <p className="text-xs text-text-warm mt-1 leading-snug">
              {t(
                "Tips: dra markören på kartan för att finjustera positionen.",
                "Tip: drag the marker on the map to fine-tune the position."
              )}
            </p>
          </div>
        ) : (
          <button
            onClick={onPlaceOnMap}
            title={t(
              "Aktivera placerings-läget. Klicka sedan på kartan där frågans kontrollpunkt ska vara — deltagaren utlöser frågan när hen kommer dit med GPS:n.",
              "Activate placement mode. Then click on the map where the question's checkpoint should be — the participant triggers the question when they arrive via GPS."
            )}
            className="w-full bg-orange-100 text-orange-900 border border-orange-300 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-orange-200 transition"
          >
            {t("📍 Placera på kartan", "📍 Place on the map")}
          </button>
        )}
      </div>
    </div>
  );
}

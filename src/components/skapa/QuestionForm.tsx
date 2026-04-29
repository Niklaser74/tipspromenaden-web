/**
 * @file QuestionForm.tsx
 * @description Editor för en enskild fråga — text, alternativ, rätt svar.
 * Visas i sidopanelen när en fråga är vald.
 */

import type { Question } from "../../lib/types";

interface Props {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  onPlaceOnMap: () => void;
  onDelete: () => void;
}

export function QuestionForm({ question, onChange, onPlaceOnMap, onDelete }: Props) {
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
          Fråga {question.order}
        </h3>
        <button
          onClick={onDelete}
          className="text-xs text-red-700 hover:underline"
        >
          Ta bort
        </button>
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-text-warm mb-1">
          Frågetext
        </label>
        <textarea
          value={question.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={2}
          maxLength={1000}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-green-dark focus:outline-none"
          placeholder="T.ex. Vilket år grundades Stockholm?"
        />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-text-warm mb-1">
          Svarsalternativ — markera det rätta
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
                placeholder={`Alternativ ${i + 1}`}
              />
              {question.options.length > 2 && (
                <button
                  onClick={() => removeOption(i)}
                  className="text-text-warm hover:text-red-700 px-2"
                  title="Ta bort"
                  aria-label={`Ta bort alternativ ${i + 1}`}
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
            className="mt-2 text-sm text-green font-semibold hover:underline"
          >
            + Lägg till alternativ
          </button>
        )}
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-text-warm mb-1">
          Plats
        </label>
        {isPlaced ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-warm font-mono">
              {question.coordinate.latitude.toFixed(5)},{" "}
              {question.coordinate.longitude.toFixed(5)}
            </span>
            <button
              onClick={onPlaceOnMap}
              className="text-sm text-green font-semibold hover:underline"
            >
              Flytta
            </button>
          </div>
        ) : (
          <button
            onClick={onPlaceOnMap}
            className="w-full bg-orange-100 text-orange-900 border border-orange-300 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-orange-200 transition"
          >
            📍 Placera på kartan
          </button>
        )}
      </div>
    </div>
  );
}

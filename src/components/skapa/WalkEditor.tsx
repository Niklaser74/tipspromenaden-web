/**
 * @file WalkEditor.tsx
 * @description Editor-vy för en specifik walk. Splitlayout: karta vänster,
 * sidopanel höger (titel, språk, frågelista).
 *
 * Centralt state är `walk`-objektet som speglar Firestore-dokumentet.
 * Alla ändringar lokala först; "Spara"-knappen committar till Firestore.
 * Vi gör ingen autosave i v1 för att undvika race conditions med mobil-
 * appen om båda är öppna samtidigt — användaren bestämmer när hen sparar.
 *
 * Karta är `<MapEditor />` (Leaflet via plain <div> + JS — inte WebView).
 * Klick på kartan i "placera-läge" sätter koordinaten på den valda
 * frågan. Markörerna är klickbara → väljer frågan i sidopanelen.
 */

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { getWalk, saveWalk, deleteWalk } from "../../lib/walks";
import {
  generateId,
  type Walk,
  type Question,
  type Coordinate,
} from "../../lib/types";
import { MapEditor } from "./MapEditor";
import { QuestionForm } from "./QuestionForm";

interface Props {
  walkId: string;
  user: User;
  onClose: () => void;
}

export function WalkEditor({ walkId, user, onClose }: Props) {
  const [walk, setWalk] = useState<Walk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [placingMode, setPlacingMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getWalk(walkId)
      .then((w) => {
        if (cancelled) return;
        if (!w) {
          setError("Promenaden hittades inte.");
        } else if (w.createdBy !== user.uid) {
          setError("Du äger inte denna promenad.");
        } else {
          setWalk(w);
        }
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || "Kunde inte hämta promenaden");
      });
    return () => {
      cancelled = true;
    };
  }, [walkId, user.uid]);

  function update(patch: Partial<Walk>) {
    setWalk((w) => (w ? { ...w, ...patch } : w));
  }

  function addQuestion() {
    if (!walk) return;
    const q: Question = {
      id: generateId(),
      text: "",
      options: ["", "", ""],
      correctOptionIndex: 0,
      coordinate: { latitude: 0, longitude: 0 },
      order: walk.questions.length + 1,
    };
    update({ questions: [...walk.questions, q] });
    setSelectedQuestionId(q.id);
    setPlacingMode(true);
  }

  function updateQuestion(qid: string, patch: Partial<Question>) {
    if (!walk) return;
    update({
      questions: walk.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)),
    });
  }

  function deleteQuestion(qid: string) {
    if (!walk) return;
    const remaining = walk.questions
      .filter((q) => q.id !== qid)
      .map((q, i) => ({ ...q, order: i + 1 }));
    update({ questions: remaining });
    if (selectedQuestionId === qid) setSelectedQuestionId(null);
  }

  function handleMapClick(coord: Coordinate) {
    if (!placingMode || !selectedQuestionId) return;
    updateQuestion(selectedQuestionId, { coordinate: coord });
    setPlacingMode(false);
  }

  async function handleSave() {
    if (!walk) return;
    setSaving(true);
    setError(null);
    try {
      await saveWalk(walk);
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message || "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!walk) return;
    if (!confirm(`Radera "${walk.title}"? Detta går inte att ångra.`)) return;
    try {
      await deleteWalk(walk.id);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Kunde inte radera");
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-red-700 mb-6">{error}</p>
        <button onClick={onClose} className="text-green font-semibold hover:underline">
          ← Tillbaka till listan
        </button>
      </div>
    );
  }

  if (!walk) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-warm">
        Laddar…
      </div>
    );
  }

  const selected = walk.questions.find((q) => q.id === selectedQuestionId) ?? null;
  const placedQuestions = walk.questions.filter(
    (q) => q.coordinate.latitude !== 0 || q.coordinate.longitude !== 0
  );

  return (
    <div className="h-screen flex flex-col">
      {/* Header-bar */}
      <header className="flex items-center justify-between gap-4 px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="text-text-warm hover:text-green-dark whitespace-nowrap"
          >
            ← Mina
          </button>
          <input
            value={walk.title}
            onChange={(e) => update({ title: e.target.value })}
            className="font-serif text-xl text-green-dark bg-transparent border-b border-transparent focus:border-green-dark focus:outline-none flex-1 min-w-0 px-1"
            placeholder="Titel"
          />
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !saving && (
            <span className="text-xs text-text-warm">
              Sparad {new Date(savedAt).toLocaleTimeString("sv-SE")}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-dark text-cream px-5 py-2 rounded-full font-semibold text-sm shadow hover:shadow-md transition disabled:opacity-50"
          >
            {saving ? "Sparar…" : "Spara"}
          </button>
        </div>
      </header>

      {/* Splitlayout */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Karta */}
        <div className="flex-1 relative min-h-[300px] md:min-h-0">
          <MapEditor
            questions={walk.questions}
            selectedQuestionId={selectedQuestionId}
            placingMode={placingMode}
            onMapClick={handleMapClick}
            onMarkerClick={(qid) => {
              setSelectedQuestionId(qid);
              setPlacingMode(false);
            }}
          />
          {placingMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-yellow-100 border border-yellow-300 rounded-full px-4 py-2 text-sm shadow z-[1000]">
              Klicka på kartan för att placera frågan
              <button
                onClick={() => setPlacingMode(false)}
                className="ml-3 text-yellow-900 hover:underline"
              >
                Avbryt
              </button>
            </div>
          )}
        </div>

        {/* Sidopanel */}
        <aside className="w-full md:w-[420px] border-t md:border-t-0 md:border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-5 border-b border-gray-100">
            <label className="block text-xs uppercase tracking-wide text-text-warm mb-2">
              Beskrivning
            </label>
            <textarea
              value={walk.description ?? ""}
              onChange={(e) => update({ description: e.target.value })}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-green-dark focus:outline-none"
              placeholder="Kort om promenaden — vad väntar deltagaren?"
            />

            <label className="block text-xs uppercase tracking-wide text-text-warm mt-4 mb-2">
              Språk
            </label>
            <select
              value={walk.language ?? "sv"}
              onChange={(e) => update({ language: e.target.value })}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-green-dark focus:outline-none"
            >
              <option value="sv">🇸🇪 Svenska</option>
              <option value="en">🇬🇧 English</option>
              <option value="de">🇩🇪 Deutsch</option>
              <option value="no">🇳🇴 Norsk</option>
              <option value="da">🇩🇰 Dansk</option>
              <option value="fi">🇫🇮 Suomi</option>
              <option value="fr">🇫🇷 Français</option>
              <option value="es">🇪🇸 Español</option>
            </select>
          </div>

          <div className="p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-serif text-lg text-green-dark">
                Frågor ({walk.questions.length})
              </h2>
              <span className="text-xs text-text-warm">
                {placedQuestions.length} placerade
              </span>
            </div>

            <ul className="space-y-2 mb-4">
              {walk.questions.map((q) => {
                const isPlaced =
                  q.coordinate.latitude !== 0 || q.coordinate.longitude !== 0;
                const isSelected = q.id === selectedQuestionId;
                return (
                  <li key={q.id}>
                    <button
                      onClick={() => {
                        setSelectedQuestionId(q.id);
                        setPlacingMode(false);
                      }}
                      className={`w-full text-left rounded-lg px-3 py-2 text-sm border transition ${
                        isSelected
                          ? "bg-green-50 border-green-dark"
                          : "bg-white border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      <span className="font-semibold mr-2">{q.order}.</span>
                      <span className="text-text-warm">
                        {q.text || "(utan text)"}
                      </span>
                      {!isPlaced && (
                        <span className="ml-2 text-orange-700 text-xs">
                          ⚠ inte placerad
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <button
              onClick={addQuestion}
              className="w-full bg-green-dark text-cream px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition"
            >
              + Lägg till fråga
            </button>
          </div>

          {selected && (
            <div className="p-5 border-t border-gray-100 bg-gray-50">
              <QuestionForm
                question={selected}
                onChange={(patch) => updateQuestion(selected.id, patch)}
                onPlaceOnMap={() => setPlacingMode(true)}
                onDelete={() => deleteQuestion(selected.id)}
              />
            </div>
          )}

          <div className="p-5 border-t border-gray-100">
            <button
              onClick={handleDelete}
              className="text-sm text-red-700 hover:underline"
            >
              Radera promenaden
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

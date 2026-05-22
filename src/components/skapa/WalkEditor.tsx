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

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { getWalk, saveWalk, deleteWalk } from "../../lib/walks";
import {
  generateId,
  WALK_CATEGORIES,
  CATEGORY_LABELS_SV,
  CATEGORY_LABELS_EN,
  type Walk,
  type Question,
  type Coordinate,
} from "../../lib/types";
import { walkCentroid } from "../../lib/walkGeo";
import { parseTipspackFile, type QuestionBattery } from "../../lib/tipspack";
import { MapEditor } from "./MapEditor";
import { QuestionForm } from "./QuestionForm";
import { ShareDialog } from "./ShareDialog";
import { ReuseRouteDialog } from "./ReuseRouteDialog";
import { LibraryPickerDialog } from "./LibraryPickerDialog";
import { Flag } from "../Flag";
import { useT, useLocale } from "./i18n";

/**
 * Språkalternativ för walks. Måste matcha appens
 * `src/constants/languages.ts` så samma flagg-emoji + autonym visas
 * på båda plattformar. Native HTML <select> kan inte rendera bilder
 * så vi bygger en custom flagg-grid istället för dropdown.
 */
const LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: "sv", label: "Svenska" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "no", label: "Norsk" },
  { code: "da", label: "Dansk" },
  { code: "fi", label: "Suomi" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
];

interface Props {
  walkId: string;
  user: User;
  onClose: () => void;
}

export function WalkEditor({ walkId, user, onClose }: Props) {
  const t = useT();
  const lang = useLocale();
  const categoryLabels = lang === "en" ? CATEGORY_LABELS_EN : CATEGORY_LABELS_SV;
  const [walk, setWalk] = useState<Walk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [placingMode, setPlacingMode] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showReuse, setShowReuse] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWalk(walkId)
      .then((w) => {
        if (cancelled) return;
        if (!w) {
          setError(t("Promenaden hittades inte.", "Walk not found."));
        } else if (w.createdBy !== user.uid) {
          setError(t("Du äger inte denna promenad.", "You don't own this walk."));
        } else {
          setWalk(w);
        }
      })
      .catch((e: any) => {
        if (!cancelled)
          setError(e?.message || t("Kunde inte hämta promenaden", "Couldn't fetch the walk"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!placingMode || !selectedQuestionId || !walk) return;
    updateQuestion(selectedQuestionId, { coordinate: coord });

    // Auto-advance: efter att vi placerat en fråga, leta upp nästa
    // obesvarade (icke-placerade) fråga i ordning och hoppa till den
    // automatiskt. Stannar i placing-mode → användaren kan snabb-
    // placera flera kontroller i följd utan att gå tillbaka till
    // listan mellan varje. Om alla är placerade exitar vi placing-
    // mode istället. Använder walk.questions UTAN den nyss-placerade
    // (lokal kopia eftersom updateQuestion är async-state).
    const placed = new Set<string>([selectedQuestionId]);
    const nextUnplaced = walk.questions
      .filter((q) => !placed.has(q.id))
      .find(
        (q) => q.coordinate.latitude === 0 && q.coordinate.longitude === 0
      );

    if (nextUnplaced) {
      setSelectedQuestionId(nextUnplaced.id);
      // placingMode förblir true → klick-på-karta funkar direkt igen
    } else {
      setPlacingMode(false);
    }
  }

  /**
   * Gemensam import-funktion — tar ett redan-parsat batteri och lägger
   * till frågorna i walken. Delas av fil-import (`handleImportFile`)
   * och bibliotek-picker (`LibraryPickerDialog`). De importerade
   * frågorna får koordinat (0, 0) — användaren placerar dem en och
   * en sen, eller använder "Återanvänd rutt" för att massimporta
   * koordinater från en tidigare walk.
   */
  function importBattery(battery: QuestionBattery) {
    if (!walk) return;
    const newQuestions: Question[] = battery.questions.map((bq, i) => ({
      id: generateId(),
      text: bq.text,
      options: [...bq.options],
      correctOptionIndex: bq.correctOptionIndex,
      coordinate: { latitude: 0, longitude: 0 },
      order: walk.questions.length + i + 1,
    }));

    // Auto-sätt språk från batteriet om walken inte har något än
    const patch: Partial<Walk> = {
      questions: [...walk.questions, ...newQuestions],
    };
    if (battery.language && !walk.language) {
      patch.language = battery.language;
    }
    update(patch);

    // UX-boost: auto-välj första importerade frågan + slå på placing-
    // mode. Användaren kan klicka direkt på kartan utan att först leta
    // i listan och hitta "Placera på kartan"-knappen i QuestionForm.
    // Kombineras med auto-advance i handleMapClick nedan → snabb-flöde
    // där användaren bara klickar genom alla 10 kontroller på kartan.
    setSelectedQuestionId(newQuestions[0].id);
    setPlacingMode(true);

    setImportMessage(
      t(
        `✅ Importerade ${newQuestions.length} frågor från "${battery.name}". Klicka på kartan för att placera fråga 1, sen fortsätter du till nästa automatiskt.`,
        `✅ Imported ${newQuestions.length} questions from "${battery.name}". Click the map to place question 1, then the next one is auto-selected.`
      )
    );
    setTimeout(() => setImportMessage(null), 12000);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!walk) return;
    const file = e.target.files?.[0];
    e.target.value = ""; // tillåt re-import av samma fil senare
    if (!file) return;

    const result = await parseTipspackFile(file);
    if (!result.success) {
      setImportMessage(`❌ ${result.error}`);
      setTimeout(() => setImportMessage(null), 6000);
      return;
    }
    importBattery(result.battery);
  }

  /**
   * Mottar koordinater från ReuseRouteDialog och fyller dem i de
   * frågor som inte är placerade än, i ordning.
   */
  function handleReuseRoute(coords: Coordinate[]) {
    if (!walk) return;
    let coordIndex = 0;
    const updated = walk.questions.map((q) => {
      const isPlaced =
        q.coordinate.latitude !== 0 || q.coordinate.longitude !== 0;
      if (isPlaced || coordIndex >= coords.length) return q;
      const c = coords[coordIndex++];
      return { ...q, coordinate: c };
    });
    update({ questions: updated });
    const filled = coordIndex;
    const remaining = coords.length - coordIndex;
    setImportMessage(
      remaining > 0
        ? t(
            `✅ Kopierade ${filled} koordinater. ${remaining} koordinater i källan oanvända (slut på tomma frågor).`,
            `✅ Copied ${filled} coordinates. ${remaining} coordinates from the source were unused (no more empty questions).`
          )
        : t(
            `✅ Kopierade ${filled} koordinater till oplacerade frågor.`,
            `✅ Copied ${filled} coordinates to unplaced questions.`
          )
    );
    setTimeout(() => setImportMessage(null), 6000);
  }

  async function handleSave() {
    if (!walk) return;
    setSaving(true);
    setError(null);
    try {
      // Centroid används av mobil-bibliotekets "nära mig"-sortering —
      // beräknas bara när walken faktiskt publiceras.
      const centroid = walk.public ? walkCentroid(walk) : null;
      const toSave = centroid ? { ...walk, centroid } : walk;
      await saveWalk(toSave);
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.message || t("Kunde inte spara", "Couldn't save"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!walk) return;
    const msg = t(
      `Radera "${walk.title}"? Detta går inte att ångra.`,
      `Delete "${walk.title}"? This can't be undone.`
    );
    if (!confirm(msg)) return;
    try {
      await deleteWalk(walk.id);
      onClose();
    } catch (e: any) {
      setError(e?.message || t("Kunde inte radera", "Couldn't delete"));
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-red-700 mb-6">{error}</p>
        <button onClick={onClose} className="text-green font-semibold hover:underline">
          {t("← Tillbaka till listan", "← Back to the list")}
        </button>
      </div>
    );
  }

  if (!walk) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-warm">
        {t("Laddar…", "Loading…")}
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
          <a
            href={lang === "en" ? "/en/" : "/"}
            className="text-text-warm hover:text-green-dark whitespace-nowrap text-sm"
            title={t("Till hemsidan", "To the home page")}
          >
            {t("← Hem", "← Home")}
          </a>
          <button
            onClick={onClose}
            className="text-text-warm hover:text-green-dark whitespace-nowrap"
          >
            {t("← Mina", "← Mine")}
          </button>
          <input
            value={walk.title}
            onChange={(e) => update({ title: e.target.value })}
            className="font-serif text-xl text-green-dark bg-transparent border-b border-transparent focus:border-green-dark focus:outline-none flex-1 min-w-0 px-1"
            placeholder={t("Titel", "Title")}
          />
        </div>
        <div className="flex items-center gap-3">
          {savedAt && !saving && (
            <span className="text-xs text-text-warm">
              {t("Sparad", "Saved")}{" "}
              {new Date(savedAt).toLocaleTimeString(lang === "en" ? "en-GB" : "sv-SE")}
            </span>
          )}
          <button
            onClick={() => setShowShare(true)}
            className="border border-green-dark text-green-dark px-4 py-2 rounded-full font-semibold text-sm hover:bg-green-dark/5 transition"
            title={t("Dela promenaden", "Share the walk")}
          >
            {t("Dela", "Share")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-dark text-cream px-5 py-2 rounded-full font-semibold text-sm shadow hover:shadow-md transition disabled:opacity-50"
          >
            {saving ? t("Sparar…", "Saving…") : t("Spara", "Save")}
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
            onMarkerDragEnd={(qid, coord) => {
              updateQuestion(qid, { coordinate: coord });
            }}
          />
          {placingMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-yellow-100 border border-yellow-300 rounded-full px-4 py-2 text-sm shadow z-[1000]">
              {t(
                "Klicka på kartan för att placera frågan",
                "Click on the map to place the question"
              )}
              <button
                onClick={() => setPlacingMode(false)}
                className="ml-3 text-yellow-900 hover:underline"
              >
                {t("Avbryt", "Cancel")}
              </button>
            </div>
          )}
        </div>

        {/* Sidopanel */}
        <aside className="w-full md:w-[420px] border-t md:border-t-0 md:border-l border-gray-200 bg-white overflow-y-auto">
          <div className="p-5 border-b border-gray-100">
            <label className="block text-xs uppercase tracking-wide text-text-warm mb-2">
              {t("Beskrivning", "Description")}
            </label>
            <textarea
              value={walk.description ?? ""}
              onChange={(e) => update({ description: e.target.value })}
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-green-dark focus:outline-none"
              placeholder={t(
                "Kort om promenaden — vad väntar deltagaren?",
                "Short description — what awaits the participant?"
              )}
            />

            <label className="block text-xs uppercase tracking-wide text-text-warm mt-4 mb-2">
              {t("Språk", "Language")}
            </label>
            {/* Custom flagg-grid istället för <select>: native HTML
                option-element kan inte rendera bilder, och Windows
                har inga emoji-fonter för regional indicator-flaggor —
                så "🇸🇪" blir bokstäverna "SE" där. PNG-bilder via
                <Flag> funkar konsekvent på alla plattformar. */}
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((lang) => {
                const active = (walk.language ?? "sv") === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => update({ language: lang.code })}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs transition ${
                      active
                        ? "bg-green-dark text-cream border-green-dark"
                        : "bg-white text-text-warm border-rule hover:border-green-dark"
                    }`}
                    title={lang.label}
                  >
                    <Flag code={lang.code} height={14} />
                    <span>{lang.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Publicera till bibliotek */}
            <label className="flex items-start gap-2 mt-5 cursor-pointer">
              <input
                type="checkbox"
                checked={!!walk.public}
                onChange={(e) => update({ public: e.target.checked })}
                className="mt-1 accent-green-dark"
              />
              <span className="text-sm">
                <strong>{t("Publicera till bibliotek", "Publish to library")}</strong>
                <br />
                <span className="text-text-warm text-xs">
                  {t(
                    "Andra användare kan hitta och spela din promenad i appens bibliotek-flik.",
                    "Other users can discover and play your walk in the app's library tab."
                  )}
                </span>
              </span>
            </label>

            {walk.public && (
              <div className="mt-3 space-y-3 bg-cream/50 border border-rule rounded-lg p-3">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-warm mb-1">
                    {t("Stad", "City")}
                  </label>
                  <input
                    value={walk.city ?? ""}
                    onChange={(e) => update({ city: e.target.value })}
                    placeholder={t("T.ex. Visby", "E.g. Visby")}
                    maxLength={100}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-green-dark focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wide text-text-warm mb-2">
                    {t("Kategori", "Category")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {WALK_CATEGORIES.map((cat) => {
                      const active = walk.category === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() =>
                            update({ category: active ? undefined : cat })
                          }
                          className={`text-xs px-3 py-1.5 rounded-full border transition ${
                            active
                              ? "bg-green-dark text-cream border-green-dark"
                              : "bg-white text-text-warm border-rule hover:border-green-dark"
                          }`}
                        >
                          {categoryLabels[cat]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-serif text-lg text-green-dark">
                {t("Frågor", "Questions")} ({walk.questions.length})
              </h2>
              <span className="text-xs text-text-warm">
                {placedQuestions.length} {t("placerade", "placed")}
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
                        {q.text || t("(utan text)", "(no text)")}
                      </span>
                      {!isPlaced && (
                        <span className="ml-2 text-orange-700 text-xs">
                          {t("⚠ inte placerad", "⚠ not placed")}
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
              {t("+ Lägg till fråga", "+ Add question")}
            </button>

            <div className="grid grid-cols-3 gap-2 mt-2">
              <button
                onClick={() => setShowLibrary(true)}
                className="bg-white border border-green-dark text-green-dark px-3 py-2 rounded-lg text-xs font-semibold hover:bg-green-dark/5 transition"
                title={t(
                  "Välj ett färdigt frågebatteri från biblioteket",
                  "Pick a ready-made question battery from the library"
                )}
              >
                {t("📚 Bibliotek", "📚 Library")}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-white border border-green-dark text-green-dark px-3 py-2 rounded-lg text-xs font-semibold hover:bg-green-dark/5 transition"
                title={t(
                  "Importera frågor från .tipspack-fil",
                  "Import questions from a .tipspack file"
                )}
              >
                {t("📥 Importera fil", "📥 Import file")}
              </button>
              <button
                onClick={() => setShowReuse(true)}
                className="bg-white border border-green-dark text-green-dark px-3 py-2 rounded-lg text-xs font-semibold hover:bg-green-dark/5 transition"
                title={t(
                  "Kopiera koordinater från en annan walk",
                  "Copy coordinates from another walk"
                )}
              >
                {t("🗺 Återanvänd rutt", "🗺 Reuse route")}
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".tipspack,.json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />

            {importMessage && (
              <p className="mt-3 text-xs leading-relaxed bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-text-warm">
                {importMessage}
              </p>
            )}
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
              {t("Radera promenaden", "Delete the walk")}
            </button>
          </div>
        </aside>
      </div>

      {showShare && (
        <ShareDialog
          walkId={walk.id}
          walkTitle={walk.title}
          onClose={() => setShowShare(false)}
        />
      )}

      {showReuse && (
        <ReuseRouteDialog
          user={user}
          currentWalkId={walk.id}
          onClose={() => setShowReuse(false)}
          onPickRoute={handleReuseRoute}
        />
      )}

      {showLibrary && (
        <LibraryPickerDialog
          onClose={() => setShowLibrary(false)}
          onPick={(battery) => {
            setShowLibrary(false);
            importBattery(battery);
          }}
        />
      )}
    </div>
  );
}

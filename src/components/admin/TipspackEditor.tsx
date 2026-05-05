/**
 * @file TipspackEditor.tsx
 * @description Modal för att skapa nytt eller redigera existerande
 *   .tipspack från admin-vyn.
 *
 * Mode `create`:
 *   - Alla fält tomma. Slug auto-genereras från namnet (kan editeras
 *     manuellt). uploadTipspack-helpern används direkt.
 *
 * Mode `edit`:
 *   - Laddar in JSON från Storage via getDownloadUrl + fetch.
 *   - Slug är låst (att flytta filen mellan slugs är en separat operation).
 *   - Save:ar Firestore-meta + Storage-fil i sekvens (Firestore först,
 *     Storage andra — samma ordning som uploadTipspack för konsekvens).
 *
 * Validering: kör validateBattery innan save så vi aldrig sparar något
 * som biblioteket sedan inte kan parsa.
 */

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { db, storage } from "../../lib/firebase";
import {
  uploadTipspack,
  getDownloadUrl,
  type TipspackMeta,
} from "../../lib/tipspackLibrary";
import {
  validateBattery,
  type QuestionBattery,
  type BatteryQuestion,
  MAX_OPTIONS,
} from "../../lib/tipspackValidator";
import { slugFromFilename } from "../../lib/tipspack";

interface Props {
  mode: "create" | "edit";
  user: User;
  /** Bara i edit-mode. */
  initialPack?: TipspackMeta;
  onClose: () => void;
  onSaved: () => void;
}

const LANG_OPTIONS = [
  { code: "sv", label: "🇸🇪 Svenska" },
  { code: "en", label: "🇬🇧 English" },
  { code: "de", label: "🇩🇪 Deutsch" },
  { code: "no", label: "🇳🇴 Norsk" },
  { code: "da", label: "🇩🇰 Dansk" },
  { code: "fi", label: "🇫🇮 Suomi" },
  { code: "fr", label: "🇫🇷 Français" },
  { code: "es", label: "🇪🇸 Español" },
];

function emptyQuestion(): BatteryQuestion {
  return { text: "", options: ["", "", ""], correctOptionIndex: 0 };
}

export default function TipspackEditor({
  mode,
  user,
  initialPack,
  onClose,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(mode === "edit");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(initialPack?.name ?? "");
  const [description, setDescription] = useState(initialPack?.description ?? "");
  const [author, setAuthor] = useState(initialPack?.author ?? "");
  const [language, setLanguage] = useState(initialPack?.language ?? "sv");
  const [isPublic, setIsPublic] = useState(initialPack?.isPublic ?? false);
  const [slug, setSlug] = useState(initialPack?.slug ?? "");
  const [slugAuto, setSlugAuto] = useState(mode === "create");
  const [questions, setQuestions] = useState<BatteryQuestion[]>([emptyQuestion()]);

  // I create-läget auto-genereras slug från namnet tills man editerar slug
  // manuellt.
  useEffect(() => {
    if (mode === "create" && slugAuto) {
      setSlug(slugFromFilename(name + ".tipspack"));
    }
  }, [name, slugAuto, mode]);

  // I edit-läget: hämta existerande JSON och fyll formuläret.
  useEffect(() => {
    if (mode !== "edit" || !initialPack) return;
    let cancelled = false;
    (async () => {
      try {
        const url = await getDownloadUrl(initialPack.slug);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setQuestions(
          Array.isArray(data.questions) && data.questions.length > 0
            ? data.questions.map((q: any) => ({
                text: q.text ?? "",
                options: Array.isArray(q.options) ? [...q.options] : ["", ""],
                correctOptionIndex: q.correctOptionIndex ?? 0,
              }))
            : [emptyQuestion()]
        );
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Kunde inte ladda paketet");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, initialPack]);

  function patchQuestion(i: number, patch: Partial<BatteryQuestion>) {
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }

  function patchOption(qi: number, oi: number, value: string) {
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === qi
          ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) }
          : q
      )
    );
  }

  function addOption(qi: number) {
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === qi && q.options.length < MAX_OPTIONS
          ? { ...q, options: [...q.options, ""] }
          : q
      )
    );
  }

  function removeOption(qi: number, oi: number) {
    setQuestions((qs) =>
      qs.map((q, idx) => {
        if (idx !== qi) return q;
        if (q.options.length <= 2) return q;
        const newOptions = q.options.filter((_, j) => j !== oi);
        // Justera correctOptionIndex om den pekade på borttaget eller efter
        let newCorrect = q.correctOptionIndex;
        if (oi === q.correctOptionIndex) newCorrect = 0;
        else if (oi < q.correctOptionIndex) newCorrect -= 1;
        return { ...q, options: newOptions, correctOptionIndex: newCorrect };
      })
    );
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, emptyQuestion()]);
  }

  function removeQuestion(i: number) {
    setQuestions((qs) => (qs.length > 1 ? qs.filter((_, idx) => idx !== i) : qs));
  }

  function moveQuestion(i: number, dir: -1 | 1) {
    setQuestions((qs) => {
      const j = i + dir;
      if (j < 0 || j >= qs.length) return qs;
      const copy = [...qs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  async function save() {
    setError(null);

    if (!name.trim()) {
      setError("Namn krävs.");
      return;
    }
    if (mode === "create" && (!slug || !/^[a-z0-9_-]+$/.test(slug))) {
      setError("Slug måste vara lowercase a-z, 0-9, - eller _.");
      return;
    }

    const battery: QuestionBattery = {
      format: "tipspack",
      version: "1.0",
      name: name.trim(),
      description: description.trim() || undefined,
      author: author.trim() || undefined,
      language: language || undefined,
      questions,
    };

    try {
      validateBattery(battery);
    } catch (e: any) {
      setError(e?.message || "Validering misslyckades");
      return;
    }

    setSaving(true);
    const fileContent = JSON.stringify(battery, null, 2);

    try {
      if (mode === "create") {
        await uploadTipspack({
          slug,
          ownerUid: user.uid,
          ownerName: user.displayName ?? undefined,
          fileContent,
          parsedJson: battery,
          isPublic,
        });
      } else if (initialPack) {
        // Update Firestore meta — bevarar createdAt, ownerUid.
        const fileSizeBytes = new TextEncoder().encode(fileContent).length;
        const meta: Record<string, unknown> = {
          ...initialPack,
          name: battery.name,
          questionCount: battery.questions.length,
          fileSizeBytes,
          isPublic,
          updatedAt: Date.now(),
        };
        if (battery.description) meta.description = battery.description;
        else delete meta.description;
        if (battery.author) meta.author = battery.author;
        else delete meta.author;
        if (battery.language) meta.language = battery.language;
        else delete meta.language;

        await setDoc(doc(db, "tipspacks", initialPack.slug), meta);
        const blob = new Blob([fileContent], { type: "application/json" });
        await uploadBytes(ref(storage, `tipspack/${initialPack.slug}`), blob, {
          contentType: "application/json",
          cacheControl: "public, max-age=3600",
          contentDisposition: `attachment; filename="${initialPack.slug}.tipspack"`,
        });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Sparning misslyckades");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[2000] p-4"
      onClick={onClose}
    >
      <div
        className="bg-cream rounded-2xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-2xl text-green-dark">
            {mode === "create" ? "➕ Skapa nytt tipspack" : `📝 Redigera ${initialPack?.slug}`}
          </h2>
          <button
            onClick={onClose}
            className="text-text-warm hover:text-green-dark text-2xl leading-none"
            aria-label="Stäng"
          >
            ×
          </button>
        </div>

        {loading ? (
          <p className="text-text-warm">Laddar paket…</p>
        ) : (
          <>
            {error && (
              <p className="mb-4 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                {error}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <Field label="Namn">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-rule bg-white"
                />
              </Field>
              <Field label="Slug">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={slug}
                    disabled={mode === "edit"}
                    onChange={(e) => {
                      setSlugAuto(false);
                      setSlug(e.target.value);
                    }}
                    className="flex-1 px-3 py-2 rounded-lg border border-rule bg-white font-mono text-sm disabled:opacity-50"
                  />
                  {mode === "create" && !slugAuto && (
                    <button
                      type="button"
                      onClick={() => setSlugAuto(true)}
                      className="text-xs text-text-warm hover:underline"
                    >
                      Auto
                    </button>
                  )}
                </div>
              </Field>
              <Field label="Författare">
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-rule bg-white"
                />
              </Field>
              <Field label="Språk">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-rule bg-white"
                >
                  {LANG_OPTIONS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Beskrivning" full>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-rule bg-white"
                />
              </Field>
              <Field label="Synlighet" full>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="accent-green-dark"
                  />
                  🌐 Publik (visas i biblioteket)
                </label>
              </Field>
            </div>

            <div className="flex items-center justify-between mb-2">
              <h3 className="font-serif text-lg text-green-dark">
                Frågor ({questions.length})
              </h3>
              <button
                onClick={addQuestion}
                className="text-xs bg-green-dark text-cream px-3 py-1 rounded-full"
              >
                + Lägg till fråga
              </button>
            </div>

            <ol className="space-y-3">
              {questions.map((q, qi) => (
                <li
                  key={qi}
                  className="bg-white border border-rule rounded-lg p-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs text-text-warm font-mono">
                      Fråga {qi + 1}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => moveQuestion(qi, -1)}
                        disabled={qi === 0}
                        className="text-xs text-text-warm disabled:opacity-30 hover:text-green-dark px-1"
                        title="Flytta upp"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveQuestion(qi, 1)}
                        disabled={qi === questions.length - 1}
                        className="text-xs text-text-warm disabled:opacity-30 hover:text-green-dark px-1"
                        title="Flytta ner"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeQuestion(qi)}
                        disabled={questions.length <= 1}
                        className="text-xs text-red-700 disabled:opacity-30 hover:underline px-1"
                      >
                        Ta bort
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={q.text}
                    onChange={(e) => patchQuestion(qi, { text: e.target.value })}
                    placeholder="Frågetext"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-rule mb-2 text-sm"
                  />
                  <div className="space-y-1">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${qi}`}
                          checked={q.correctOptionIndex === oi}
                          onChange={() =>
                            patchQuestion(qi, { correctOptionIndex: oi })
                          }
                          className="accent-green-dark"
                          title="Markera som rätt svar"
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => patchOption(qi, oi, e.target.value)}
                          placeholder={`Alternativ ${oi + 1}`}
                          className="flex-1 px-3 py-1.5 rounded border border-rule text-sm"
                        />
                        <button
                          onClick={() => removeOption(qi, oi)}
                          disabled={q.options.length <= 2}
                          className="text-xs text-red-700 disabled:opacity-30 hover:underline px-1"
                          title="Ta bort alternativ"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {q.options.length < MAX_OPTIONS && (
                      <button
                        onClick={() => addOption(qi)}
                        className="text-xs text-green-dark hover:underline mt-1"
                      >
                        + Alternativ
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={onClose}
                disabled={saving}
                className="text-text-warm px-4 py-2 hover:underline disabled:opacity-50"
              >
                Avbryt
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="bg-green-dark text-cream px-6 py-2 rounded-full font-semibold shadow disabled:opacity-50"
              >
                {saving ? "Sparar…" : mode === "create" ? "Skapa" : "Spara"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="block text-xs uppercase tracking-wide text-text-warm mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

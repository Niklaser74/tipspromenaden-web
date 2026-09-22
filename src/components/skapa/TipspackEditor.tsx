/**
 * @file TipspackEditor.tsx
 * @description Frågeeditor för tipspacks på `/skapa` — skapa ett nytt
 * frågebatteri eller redigera ett eget uppladdat, utan att handskriva JSON.
 *
 * Routas via hash: `#newpack` (nytt) och `#pack/<slug>` (redigera eget).
 *
 * Frågorna har ingen plats här — ett tipspack är bara text, alternativ och
 * facit. Placeringen görs när packet hämtas in i en promenad.
 *
 * Spara:
 *   - Nytt pack → `uploadTipspack()` med slug från namnet (eller det
 *     användaren skrivit). Därefter byts hashen till `#pack/<slug>` så att
 *     nästa spara skriver över i stället för att skapa en kopia.
 *   - Befintligt → `updateTipspack()` skriver över fil + metadata.
 * Filen kan också laddas ner som `.tipspack` utan att sparas i biblioteket.
 *
 * Ett nytt pack som inte sparats än hålls som utkast i localStorage, så att
 * en stängd flik inte kostar trettio frågors arbete. Befintliga pack får
 * bara en lämna-sidan-varning — deras sanning ligger i Storage.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  getDownloadUrl,
  getTipspackMeta,
  tipspackExists,
  updateTipspack,
  uploadTipspack,
} from "../../lib/tipspackLibrary";
import {
  parseTipspackFile,
  parseTipspackText,
  slugFromFilename,
  type QuestionBattery,
} from "../../lib/tipspack";
import {
  validateBattery,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MAX_TEXT_LENGTH,
} from "../../lib/tipspackValidator";
import { shuffleQuestionOptions } from "../../lib/shuffleOptions";
import { LANGUAGES, normalizeLanguageCode } from "../../lib/languages";
import { LibraryPickerDialog } from "./LibraryPickerDialog";
import { useT, useLocale } from "./i18n";

interface Props {
  user: User;
  /** null = nytt pack. */
  slug: string | null;
  onClose: () => void;
  /** Anropas efter första sparningen av ett nytt pack. */
  onCreated: (slug: string) => void;
}

interface EditQuestion {
  /** Lokal nyckel för React — sparas inte i filen. */
  key: string;
  text: string;
  options: string[];
  correctOptionIndex: number;
}

interface Draft {
  name: string;
  description: string;
  author: string;
  language: string;
  isPublic: boolean;
  slug: string;
  slugTouched: boolean;
  questions: EditQuestion[];
}

const LETTERS = "ABCDEFGHIJ";

function newKey(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptyQuestion(): EditQuestion {
  return { key: newKey(), text: "", options: ["", "", ""], correctOptionIndex: 0 };
}

function draftKey(uid: string): string {
  return `tipspack-editor-draft:${uid}`;
}

function readDraft(uid: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(uid));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(uid: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(draftKey(uid), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(uid));
  } catch {
    // Privat läge eller blockerad lagring — utkastet är en bekvämlighet.
  }
}

/** Vad som är fel på en fråga, för markering i listan. Tom = ok. */
function questionIssues(q: EditQuestion, t: (sv: string, en: string) => string): string[] {
  const issues: string[] = [];
  if (!q.text.trim()) issues.push(t("Frågetext saknas", "Question text is missing"));
  if (q.options.some((o) => !o.trim()))
    issues.push(t("Tomt svarsalternativ", "Empty answer option"));
  return issues;
}

export function TipspackEditor({ user, slug, onClose, onCreated }: Props) {
  const t = useT();
  const lang = useLocale();
  const isNew = slug === null;

  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => {
    const blank: Draft = {
      name: "",
      description: "",
      author: user.displayName ?? "",
      language: lang,
      isPublic: true,
      slug: "",
      slugTouched: false,
      questions: [emptyQuestion()],
    };
    return isNew ? readDraft(user.uid) ?? blank : blank;
  });
  const [restoredDraft] = useState(() => isNew && readDraft(user.uid) !== null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Ladda befintligt pack.
  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    (async () => {
      try {
        const meta = await getTipspackMeta(slug!);
        if (!meta) throw new Error(t("Packet finns inte.", "The pack doesn't exist."));
        if (meta.ownerUid !== user.uid)
          throw new Error(
            t("Du kan bara redigera dina egna tipspacks.", "You can only edit your own tipspacks.")
          );
        // no-store: Storage-objektet har max-age=3600, och vi vill se det
        // vi nyss sparade — inte en timme gammal cache.
        const res = await fetch(await getDownloadUrl(slug!), { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseTipspackText(await res.text());
        if (!parsed.success) throw new Error(parsed.error);
        if (cancelled) return;
        const b = parsed.battery;
        setDraft({
          name: b.name,
          description: b.description ?? "",
          author: b.author ?? "",
          language: normalizeLanguageCode(b.language) || lang,
          isPublic: meta.isPublic,
          slug: slug!,
          slugTouched: true,
          questions: b.questions.map((q) => ({ ...q, key: newKey() })),
        });
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setLoadError(e?.message || t("Kunde inte ladda packet.", "Couldn't load the pack."));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, user.uid]);

  // Utkast för nya pack.
  useEffect(() => {
    if (!isNew || !dirty) return;
    const id = setTimeout(() => writeDraft(user.uid, draft), 400);
    return () => clearTimeout(id);
  }, [draft, dirty, isNew, user.uid]);

  // Varna vid stängd flik med osparat (nya pack har utkastet i stället).
  useEffect(() => {
    if (!dirty || isNew) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, isNew]);

  function update(patch: Partial<Draft>) {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if (patch.name !== undefined && !d.slugTouched) next.slug = slugFromFilename(patch.name);
      return next;
    });
    setDirty(true);
    setNotice(null);
    setError(null);
  }

  function updateQuestion(idx: number, patch: Partial<EditQuestion>) {
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    }));
    setDirty(true);
    setNotice(null);
    setError(null);
  }

  function setQuestions(fn: (qs: EditQuestion[]) => EditQuestion[]) {
    setDraft((d) => ({ ...d, questions: fn(d.questions) }));
    setDirty(true);
    setNotice(null);
    setError(null);
  }

  function addQuestion() {
    if (draft.questions.length >= MAX_QUESTIONS) return;
    setQuestions((qs) => [...qs, emptyQuestion()]);
    // Fokusera nya frågans textfält när den renderats.
    setTimeout(() => {
      const areas = document.querySelectorAll<HTMLTextAreaElement>("[data-question-text]");
      areas[areas.length - 1]?.focus();
    }, 0);
  }

  function moveQuestion(idx: number, dir: -1 | 1) {
    setQuestions((qs) => {
      const to = idx + dir;
      if (to < 0 || to >= qs.length) return qs;
      const next = [...qs];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  }

  function duplicateQuestion(idx: number) {
    if (draft.questions.length >= MAX_QUESTIONS) return;
    setQuestions((qs) => {
      const next = [...qs];
      next.splice(idx + 1, 0, { ...qs[idx], options: [...qs[idx].options], key: newKey() });
      return next;
    });
  }

  function deleteQuestion(idx: number) {
    const q = draft.questions[idx];
    if ((q.text.trim() || q.options.some((o) => o.trim())) &&
      !confirm(t(`Ta bort fråga ${idx + 1}?`, `Remove question ${idx + 1}?`)))
      return;
    setQuestions((qs) => qs.filter((_, i) => i !== idx));
  }

  function setOption(qIdx: number, oIdx: number, value: string) {
    const q = draft.questions[qIdx];
    const options = [...q.options];
    options[oIdx] = value;
    updateQuestion(qIdx, { options });
  }

  function addOption(qIdx: number) {
    const q = draft.questions[qIdx];
    if (q.options.length >= MAX_OPTIONS) return;
    updateQuestion(qIdx, { options: [...q.options, ""] });
  }

  function removeOption(qIdx: number, oIdx: number) {
    const q = draft.questions[qIdx];
    if (q.options.length <= 2) return;
    let correct = q.correctOptionIndex;
    if (correct === oIdx) correct = 0;
    else if (correct > oIdx) correct -= 1;
    updateQuestion(qIdx, {
      options: q.options.filter((_, i) => i !== oIdx),
      correctOptionIndex: correct,
    });
  }

  function shuffleAll() {
    setQuestions((qs) => shuffleQuestionOptions(qs));
    setNotice(t("Svarsalternativen är omblandade.", "Answer options shuffled."));
  }

  /** Lägg till frågor från en fil eller ett bibliotekspack. */
  function appendBattery(b: QuestionBattery) {
    const room = MAX_QUESTIONS - draft.questions.length;
    const incoming = b.questions.slice(0, room).map((q) => ({
      key: newKey(),
      text: q.text,
      options: [...q.options],
      correctOptionIndex: q.correctOptionIndex,
    }));
    setDraft((d) => {
      // Ersätt en enda tom startfråga i stället för att lämna den kvar överst.
      const onlyBlank =
        d.questions.length === 1 &&
        !d.questions[0].text.trim() &&
        d.questions[0].options.every((o) => !o.trim());
      const base = onlyBlank ? [] : d.questions;
      const next = { ...d, questions: [...base, ...incoming] };
      if (!d.name.trim()) {
        next.name = b.name;
        if (!d.slugTouched) next.slug = slugFromFilename(b.name);
        if (!d.description.trim() && b.description) next.description = b.description;
        if (b.language) next.language = normalizeLanguageCode(b.language) || d.language;
      }
      return next;
    });
    setDirty(true);
    setNotice(
      t(
        `${incoming.length} frågor tillagda från "${b.name}".`,
        `${incoming.length} questions added from "${b.name}".`
      )
    );
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const result = await parseTipspackFile(file);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setError(null);
    appendBattery(result.battery);
  }

  /** Bygger + validerar filinnehållet. Kastar med läsbart fel. */
  function buildBattery(): QuestionBattery {
    const battery: QuestionBattery = {
      format: "tipspack",
      version: "1.0",
      name: draft.name.trim(),
      questions: draft.questions.map((q) => ({
        text: q.text.trim(),
        options: q.options.map((o) => o.trim()),
        correctOptionIndex: q.correctOptionIndex,
      })),
    };
    if (draft.description.trim()) battery.description = draft.description.trim();
    if (draft.author.trim()) battery.author = draft.author.trim();
    if (draft.language) battery.language = draft.language;
    validateBattery(battery);
    return battery;
  }

  function tryBuild(): QuestionBattery | null {
    try {
      const b = buildBattery();
      setError(null);
      return b;
    } catch (e: any) {
      setShowErrors(true);
      setError(e?.message || t("Packet är inte giltigt.", "The pack isn't valid."));
      return null;
    }
  }

  function handleDownload() {
    const battery = tryBuild();
    if (!battery) return;
    const blob = new Blob([JSON.stringify(battery, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.slug || slugFromFilename(battery.name) || "tipspack"}.tipspack`;
    a.click();
    // Fördröjt: Safari/Firefox kan tappa nedladdningen om URL:en dras in direkt.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function handleSave() {
    const battery = tryBuild();
    if (!battery) return;
    const fileContent = JSON.stringify(battery, null, 2);
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        let target = draft.slug || slugFromFilename(battery.name);
        if (!target || !/^[a-z0-9_-]+$/.test(target))
          throw new Error(
            t(
              "Länknamnet får bara innehålla a–z, 0–9, - och _.",
              "The link name may only contain a–z, 0–9, - and _."
            )
          );
        if (await tipspackExists(target)) {
          if (draft.slugTouched)
            throw new Error(
              t(
                `Länknamnet "${target}" är upptaget. Välj ett annat.`,
                `The link name "${target}" is taken. Pick another one.`
              )
            );
          // Autogenererat: prova -2, -3, … innan vi ger upp.
          let found: string | null = null;
          for (let n = 2; n <= 20; n++) {
            const candidate = `${target.slice(0, 95)}-${n}`;
            if (!(await tipspackExists(candidate))) {
              found = candidate;
              break;
            }
          }
          if (!found)
            throw new Error(
              t("Hittade inget ledigt länknamn. Skriv ett eget.", "No free link name found. Enter one.")
            );
          target = found;
        }
        await uploadTipspack({
          slug: target,
          ownerUid: user.uid,
          ownerName: user.displayName ?? undefined,
          fileContent,
          parsedJson: battery,
          isPublic: draft.isPublic,
        });
        writeDraft(user.uid, null);
        setDirty(false);
        onCreated(target);
      } else {
        await updateTipspack({
          slug: slug!,
          ownerName: user.displayName ?? undefined,
          fileContent,
          parsedJson: battery,
          isPublic: draft.isPublic,
        });
        setDirty(false);
        setNotice(t("Sparat.", "Saved."));
      }
    } catch (e: any) {
      setError(e?.message || t("Kunde inte spara.", "Couldn't save."));
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (
      dirty &&
      !isNew &&
      !confirm(t("Du har osparade ändringar. Lämna ändå?", "You have unsaved changes. Leave anyway?"))
    )
      return;
    // Nytt pack: utkastet ligger kvar i localStorage, inget går förlorat.
    setDirty(false);
    onClose();
  }

  function discardDraft() {
    if (!confirm(t("Släng utkastet och börja om?", "Discard the draft and start over?"))) return;
    writeDraft(user.uid, null);
    setDraft({
      name: "",
      description: "",
      author: user.displayName ?? "",
      language: lang,
      isPublic: true,
      slug: "",
      slugTouched: false,
      questions: [emptyQuestion()],
    });
    setDirty(false);
    setNotice(null);
    setError(null);
  }

  const issues = useMemo(
    () => draft.questions.map((q) => questionIssues(q, t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.questions, lang]
  );
  const problemCount = issues.filter((i) => i.length > 0).length;

  if (loading) {
    return <p className="text-center text-text-warm py-24">{t("Laddar…", "Loading…")}</p>;
  }

  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          {loadError}
        </p>
        <button onClick={onClose} className="text-sm text-green-dark hover:underline">
          ← {t("Tillbaka", "Back")}
        </button>
      </div>
    );
  }

  const inputClass =
    "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-green-dark focus:outline-none";
  const labelClass = "block text-xs uppercase tracking-wide text-text-warm mb-1";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 pb-32">
      <button
        onClick={handleClose}
        className="text-sm text-text-warm hover:text-green-dark mb-6 inline-block"
      >
        ← {t("Mina promenader", "My walks")}
      </button>

      <h1 className="font-serif text-3xl md:text-4xl text-green-dark mb-2">
        {isNew ? t("Nytt tipspack", "New tipspack") : t("Redigera tipspack", "Edit tipspack")}
      </h1>
      <p className="text-sm text-text-warm mb-8 leading-relaxed">
        {t(
          "Skriv frågorna här och spara packet i biblioteket. Sedan kan du — eller vem som helst med länken — hämta in det i en promenad och placera frågorna på kartan.",
          "Write the questions here and save the pack to the library. You — or anyone with the link — can then pull it into a walk and place the questions on the map."
        )}
      </p>

      {restoredDraft && isNew && (
        <p className="mb-6 text-sm bg-green-dark/5 border border-green-dark/20 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <span>{t("Ditt osparade utkast är återställt.", "Your unsaved draft was restored.")}</span>
          <button onClick={discardDraft} className="text-green-dark font-semibold hover:underline">
            {t("Börja om", "Start over")}
          </button>
        </p>
      )}

      {/* Om packet */}
      <section className="bg-white border border-rule rounded-2xl p-5 mb-8 space-y-4">
        <div>
          <label className={labelClass} htmlFor="pack-name">
            {t("Namn", "Name")}
          </label>
          <input
            id="pack-name"
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            maxLength={200}
            className={`${inputClass} text-base ${
              showErrors && !draft.name.trim() ? "border-red-400" : ""
            }`}
            placeholder={t("T.ex. Svenska kungar", "E.g. Famous inventors")}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="pack-desc">
            {t("Beskrivning (valfri)", "Description (optional)")}
          </label>
          <textarea
            id="pack-desc"
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
            maxLength={2000}
            rows={2}
            className={inputClass}
            placeholder={t(
              "Vad handlar frågorna om, och för vem passar de?",
              "What are the questions about, and who are they for?"
            )}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="pack-author">
              {t("Författare (valfri)", "Author (optional)")}
            </label>
            <input
              id="pack-author"
              value={draft.author}
              onChange={(e) => update({ author: e.target.value })}
              maxLength={200}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="pack-lang">
              {t("Språk", "Language")}
            </label>
            <select
              id="pack-lang"
              value={draft.language}
              onChange={(e) => update({ language: e.target.value })}
              className={inputClass}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {isNew && (
          <div>
            <label className={labelClass} htmlFor="pack-slug">
              {t("Länknamn", "Link name")}
            </label>
            <input
              id="pack-slug"
              value={draft.slug}
              onChange={(e) =>
                update({
                  slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                  slugTouched: e.target.value !== "",
                })
              }
              maxLength={100}
              className={`${inputClass} font-mono`}
              placeholder="svenska-kungar"
            />
            <p className="text-xs text-sage mt-1">
              {t(
                "Används i app-länken tipspromenaden://tipspack/… Går inte att ändra efter att packet sparats.",
                "Used in the app link tipspromenaden://tipspack/… Can't be changed once the pack is saved."
              )}
            </p>
          </div>
        )}
        <fieldset>
          <legend className={labelClass}>{t("Synlighet", "Visibility")}</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="pack-visibility"
                checked={draft.isPublic}
                onChange={() => update({ isPublic: true })}
                className="accent-green-dark"
              />
              {t("🌐 Publik — visas i biblioteket", "🌐 Public — listed in the library")}
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="pack-visibility"
                checked={!draft.isPublic}
                onChange={() => update({ isPublic: false })}
                className="accent-green-dark"
              />
              {t("🔗 Hemlig länk", "🔗 Secret link")}
            </label>
          </div>
        </fieldset>
      </section>

      {/* Verktyg */}
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <h2 className="font-serif text-2xl text-green-dark">
          {t("Frågor", "Questions")}{" "}
          <span className="text-base text-text-warm">({draft.questions.length})</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowLibrary(true)}
            className="text-xs border border-rule text-text-warm bg-white px-3 py-1.5 rounded-full hover:border-green-dark"
            title={t(
              "Lägg till frågor från ett pack i biblioteket",
              "Add questions from a pack in the library"
            )}
          >
            📚 {t("Från biblioteket", "From the library")}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs border border-rule text-text-warm bg-white px-3 py-1.5 rounded-full hover:border-green-dark"
            title={t("Lägg till frågor från en .tipspack-fil", "Add questions from a .tipspack file")}
          >
            📂 {t("Från fil", "From file")}
          </button>
          <button
            onClick={shuffleAll}
            className="text-xs border border-rule text-text-warm bg-white px-3 py-1.5 rounded-full hover:border-green-dark"
            title={t(
              "Blanda svarsalternativen så att rätt svar hamnar på olika platser. Tal och årtal sorteras stigande.",
              "Shuffle the answer options so the correct answer lands in different spots. Numbers and years are sorted ascending."
            )}
          >
            🔀 {t("Blanda svar", "Shuffle answers")}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".tipspack,.json,application/json"
          onChange={onImportFile}
          className="hidden"
        />
      </div>

      <ol className="space-y-4">
        {draft.questions.map((q, qi) => {
          const qIssues = showErrors ? issues[qi] : [];
          return (
            <li
              key={q.key}
              className={`bg-white border rounded-2xl p-4 sm:p-5 ${
                qIssues.length ? "border-red-300" : "border-rule"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-serif text-lg text-green-dark">
                  {t("Fråga", "Question")} {qi + 1}
                </span>
                <div className="flex items-center gap-1 text-text-warm">
                  <IconButton
                    label={t("Flytta upp", "Move up")}
                    disabled={qi === 0}
                    onClick={() => moveQuestion(qi, -1)}
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    label={t("Flytta ner", "Move down")}
                    disabled={qi === draft.questions.length - 1}
                    onClick={() => moveQuestion(qi, 1)}
                  >
                    ↓
                  </IconButton>
                  <IconButton
                    label={t("Duplicera", "Duplicate")}
                    onClick={() => duplicateQuestion(qi)}
                  >
                    ⧉
                  </IconButton>
                  <IconButton
                    label={t("Ta bort frågan", "Remove question")}
                    disabled={draft.questions.length === 1}
                    onClick={() => deleteQuestion(qi)}
                    danger
                  >
                    ×
                  </IconButton>
                </div>
              </div>

              <textarea
                data-question-text
                value={q.text}
                onChange={(e) => updateQuestion(qi, { text: e.target.value })}
                rows={2}
                maxLength={MAX_TEXT_LENGTH}
                aria-label={`${t("Frågetext", "Question text")} ${qi + 1}`}
                className={`${inputClass} mb-3 ${
                  showErrors && !q.text.trim() ? "border-red-400" : ""
                }`}
                placeholder={t(
                  "T.ex. Vilket år grundades Stockholm?",
                  "E.g. What year was Stockholm founded?"
                )}
              />

              <p className="text-xs text-text-warm mb-2">
                {t("Markera rätt svar", "Mark the correct answer")}
              </p>
              <ul className="space-y-2">
                {q.options.map((opt, oi) => {
                  const correct = q.correctOptionIndex === oi;
                  return (
                    <li key={oi} className="flex items-center gap-2">
                      <label
                        className={`flex items-center justify-center w-9 h-9 shrink-0 rounded-full border text-sm font-semibold cursor-pointer transition ${
                          correct
                            ? "bg-green-dark text-cream border-green-dark"
                            : "border-rule text-text-warm hover:border-green-dark"
                        }`}
                        title={t("Rätt svar", "Correct answer")}
                      >
                        <input
                          type="radio"
                          name={`correct-${q.key}`}
                          checked={correct}
                          onChange={() => updateQuestion(qi, { correctOptionIndex: oi })}
                          className="sr-only"
                        />
                        {correct ? "✓" : LETTERS[oi]}
                      </label>
                      <input
                        value={opt}
                        onChange={(e) => setOption(qi, oi, e.target.value)}
                        maxLength={MAX_TEXT_LENGTH}
                        aria-label={`${t("Alternativ", "Option")} ${LETTERS[oi]}`}
                        className={`${inputClass} ${
                          correct ? "border-green-dark/40 bg-green-dark/5" : ""
                        } ${showErrors && !opt.trim() ? "border-red-400" : ""}`}
                        placeholder={`${t("Alternativ", "Option")} ${LETTERS[oi]}`}
                      />
                      <button
                        onClick={() => removeOption(qi, oi)}
                        disabled={q.options.length <= 2}
                        className="text-text-warm hover:text-red-700 px-2 disabled:invisible"
                        aria-label={`${t("Ta bort alternativ", "Remove option")} ${LETTERS[oi]}`}
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
              {q.options.length < MAX_OPTIONS && (
                <button
                  onClick={() => addOption(qi)}
                  className="mt-2 text-sm text-green font-semibold hover:underline"
                >
                  {t("+ Alternativ", "+ Option")}
                </button>
              )}
              {qIssues.length > 0 && (
                <p className="mt-2 text-xs text-red-700">{qIssues.join(" · ")}</p>
              )}
            </li>
          );
        })}
      </ol>

      {draft.questions.length < MAX_QUESTIONS && (
        <button
          onClick={addQuestion}
          className="w-full mt-4 border-2 border-dashed border-rule text-green-dark font-semibold rounded-2xl py-4 hover:border-green-dark hover:bg-green-dark/5 transition"
        >
          {t("+ Ny fråga", "+ New question")}
        </button>
      )}

      {/* Sparfält, fast i nederkant */}
      <div className="fixed bottom-0 inset-x-0 bg-cream/95 backdrop-blur border-t border-rule z-[1000]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="w-full sm:w-auto sm:flex-1 text-sm">
            {error ? (
              <span className="text-red-700">{error}</span>
            ) : notice ? (
              <span className="text-green-dark">{notice}</span>
            ) : showErrors && problemCount > 0 ? (
              <span className="text-red-700">
                {t(`${problemCount} frågor behöver fixas`, `${problemCount} questions need fixing`)}
              </span>
            ) : (
              <span className="text-text-warm">
                {dirty
                  ? isNew
                    ? t("Utkast sparat i webbläsaren", "Draft kept in this browser")
                    : t("Osparade ändringar", "Unsaved changes")
                  : isNew
                    ? ""
                    : t("Allt sparat", "All saved")}
              </span>
            )}
          </div>
          <button
            onClick={handleDownload}
            className="flex-1 sm:flex-none text-sm border border-green-dark text-green-dark px-4 py-2 rounded-full hover:bg-green-dark/5"
            title={t(
              "Ladda ner packet som .tipspack-fil utan att spara det i biblioteket",
              "Download the pack as a .tipspack file without saving it to the library"
            )}
          >
            📥 {t("Ladda ner", "Download")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || (!isNew && !dirty)}
            className="flex-1 sm:flex-none bg-green-dark text-cream px-6 py-2 rounded-full font-semibold shadow hover:shadow-md transition disabled:opacity-50"
          >
            {saving
              ? t("Sparar…", "Saving…")
              : isNew
                ? t("Spara i biblioteket", "Save to library")
                : t("Spara", "Save")}
          </button>
        </div>
      </div>

      {showLibrary && (
        <LibraryPickerDialog
          ownerUid={user.uid}
          onPick={(b) => {
            appendBattery(b);
            setShowLibrary(false);
          }}
          onClose={() => setShowLibrary(false)}
        />
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-8 h-8 rounded-full text-base leading-none transition disabled:opacity-30 disabled:cursor-default ${
        danger ? "hover:text-red-700 hover:bg-red-50" : "hover:text-green-dark hover:bg-green-dark/5"
      }`}
    >
      {children}
    </button>
  );
}

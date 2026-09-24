/**
 * @file AiGenerateDialog.tsx
 * @description "✨ Generera med AI" — skaparen beskriver vad frågorna ska
 * handla om och får ett färdigt frågebatteri tillbaka.
 *
 * Tre steg i samma modal:
 *   1. Formulär — läge (tema / egen text / plats), antal, språk,
 *      svårighet, målgrupp. Visar kostnad och saldo.
 *   2. Genererar — spinner. Ofta 20–60 s, platsläget längre.
 *   3. Förhandsvisning — frågorna med rätt svar, förklaring och källa.
 *      Kryssrutor för att välja bort frågor innan de läggs till.
 *
 * Resultatet lämnas via `onPick(battery)` och går sedan in i samma
 * importväg som biblioteket (`importBattery` / `appendBattery`), så
 * blandning av alternativ och placering på kartan fungerar som vanligt.
 *
 * Krediten dras på servern. Vid fel återbetalas den där — UI:t behöver
 * bara visa rätt text. Samma `requestId` återanvänds vid "Försök igen"
 * efter nätverksfel så att ett svar som hann bli klart inte dras två gånger.
 */

import { useState } from "react";
import type { User } from "firebase/auth";
import {
  AI_LIMITS,
  creditCost,
  generateQuestions,
  newRequestId,
  toAiError,
  type AiAudience,
  type AiDifficulty,
  type AiError,
  type AiMode,
  type GenerateResponse,
} from "../../lib/ai";
import { LANGUAGES } from "../../lib/languages";
import type { QuestionBattery } from "../../lib/tipspack";
import { useCredits } from "../../lib/useCredits";
import { BuyCreditsDialog } from "./BuyCreditsDialog";
import { useLocale, useT } from "./i18n";

interface Props {
  user: User;
  onPick: (battery: QuestionBattery) => void;
  onClose: () => void;
  /** Förval för språk, t.ex. walkens språk. */
  defaultLanguage?: string;
  /** Förval för platsläget, t.ex. walkens stad. */
  defaultPlace?: string;
}

type Step =
  | { kind: "form" }
  | { kind: "loading" }
  | { kind: "result"; data: GenerateResponse; selected: boolean[] };

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-dark/30";
const labelClass = "block text-xs font-semibold text-text-warm mb-1";

export function AiGenerateDialog({ user, onPick, onClose, defaultLanguage, defaultPlace }: Props) {
  const t = useT();
  const locale = useLocale();
  const credits = useCredits(user.uid);

  const [mode, setMode] = useState<AiMode>("topic");
  const [prompt, setPrompt] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [place, setPlace] = useState(defaultPlace ?? "");
  const [count, setCount] = useState(10);
  const [language, setLanguage] = useState(
    LANGUAGES.some((l) => l.code === defaultLanguage) ? defaultLanguage! : locale
  );
  const [difficulty, setDifficulty] = useState<AiDifficulty>("medium");
  const [audience, setAudience] = useState<AiAudience>("mixed");

  const [step, setStep] = useState<Step>({ kind: "form" });
  const [error, setError] = useState<AiError | null>(null);
  const [requestId, setRequestId] = useState(newRequestId);
  const [showBuy, setShowBuy] = useState(false);

  const cost = creditCost(mode, count);
  const enoughCredits = credits !== null && credits >= cost;

  function formProblem(): string | null {
    if (mode === "topic" && !prompt.trim()) {
      return t("Beskriv vad frågorna ska handla om.", "Describe what the questions should be about.");
    }
    if (mode === "text" && sourceText.trim().length < AI_LIMITS.minSourceText) {
      return t(
        `Klistra in minst ${AI_LIMITS.minSourceText} tecken text.`,
        `Paste at least ${AI_LIMITS.minSourceText} characters of text.`
      );
    }
    if (mode === "place" && !place.trim()) {
      return t("Ange en plats.", "Enter a place.");
    }
    return null;
  }

  async function run(id: string) {
    setError(null);
    setStep({ kind: "loading" });
    try {
      const data = await generateQuestions({
        mode,
        prompt: prompt.trim(),
        sourceText: mode === "text" ? sourceText.trim() : undefined,
        place: mode === "place" ? { name: place.trim() } : undefined,
        count,
        language,
        difficulty,
        audience,
        requestId: id,
      });
      setStep({ kind: "result", data, selected: data.battery.questions.map(() => true) });
      // Nästa generering (t.ex. "Generera nya") ska få ett nytt id.
      setRequestId(newRequestId());
    } catch (e) {
      const err = toAiError(e);
      setError(err);
      setStep({ kind: "form" });
      // Nätverksfel/timeouts: behåll id:t så att ett svar som hann bli
      // klart på servern returneras från cachen i stället för att dras igen.
      // Övriga fel är avgjorda på servern (återbetalda) → nytt id.
      if (err.reason !== "network" && err.reason !== "unknown") setRequestId(newRequestId());
      if (err.reason === "no-credits") setShowBuy(true);
    }
  }

  function submit() {
    const problem = formProblem();
    if (problem) {
      setError({ reason: "invalid", message: problem });
      return;
    }
    if (!enoughCredits) {
      setShowBuy(true);
      return;
    }
    run(requestId);
  }

  function errorText(err: AiError): string {
    switch (err.reason) {
      case "no-credits":
        return t("Du har inte tillräckligt med AI-krediter.", "You don't have enough AI credits.");
      case "rate-limited":
        return t(
          "Du har gjort många genereringar på kort tid. Vänta några minuter och försök igen.",
          "You've made many generations in a short time. Wait a few minutes and try again."
        );
      case "in-progress":
        return t(
          "Genereringen pågår redan. Vänta en stund och försök igen.",
          "The generation is already running. Wait a moment and try again."
        );
      case "anonymous":
        return t("Logga in med ett konto för att använda AI-frågor.", "Sign in with an account to use AI questions.");
      case "generation-failed":
        // Serverns text är på svenska och säger redan att krediten är
        // återbetald — visa den som den är på svenska, generiskt på engelska.
        return t(
          err.message || "Det gick inte att skapa frågorna. Krediten har återbetalats.",
          "The questions couldn't be created. The credit has been refunded."
        );
      case "network":
        return t(
          "Anslutningen bröts eller tog för lång tid. Försök igen — du debiteras inte två gånger.",
          "The connection dropped or timed out. Try again — you won't be charged twice."
        );
      case "invalid":
        return err.message;
      default:
        return t(`Något gick fel: ${err.message}`, `Something went wrong: ${err.message}`);
    }
  }

  function applyPicked() {
    if (step.kind !== "result") return;
    const { battery } = step.data;
    const questions = battery.questions.filter((_, i) => step.selected[i]);
    if (questions.length === 0) return;
    onPick({ ...battery, questions });
  }

  const modeTabs: { id: AiMode; label: string; hint: string }[] = [
    {
      id: "topic",
      label: t("💡 Tema", "💡 Topic"),
      hint: t("Frågor om ett ämne du väljer.", "Questions about a topic you choose."),
    },
    {
      id: "text",
      label: t("📄 Egen text", "📄 Own text"),
      hint: t(
        "Klistra in en text — AI:n frågar bara om det som står i den.",
        "Paste a text — the AI only asks about what it says."
      ),
    },
    {
      id: "place",
      label: t("📍 Plats", "📍 Place"),
      hint: t(
        "AI:n söker på webben om platsen och skriver frågor om den.",
        "The AI searches the web about the place and writes questions about it."
      ),
    },
  ];

  const busy = step.kind === "loading";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4"
        onClick={busy ? undefined : onClose}
      >
        <div
          className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-dialog-title"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <h2 id="ai-dialog-title" className="text-xl font-bold text-green-dark">
              {t("✨ Generera frågor med AI", "✨ Generate questions with AI")}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-warm whitespace-nowrap">
                {credits === null ? "…" : credits} {t("krediter", "credits")}
              </span>
              <button
                onClick={onClose}
                disabled={busy}
                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition flex items-center justify-center text-gray-600 disabled:opacity-40"
                aria-label={t("Stäng", "Close")}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step.kind === "form" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2" role="tablist">
                  {modeTabs.map((m) => (
                    <button
                      key={m.id}
                      role="tab"
                      aria-selected={mode === m.id}
                      onClick={() => setMode(m.id)}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                        mode === m.id
                          ? "bg-green-dark text-cream border-green-dark"
                          : "bg-white text-green-dark border-green-dark/30 hover:border-green-dark"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-warm">{modeTabs.find((m) => m.id === mode)!.hint}</p>

                {mode === "topic" && (
                  <div>
                    <label className={labelClass} htmlFor="ai-topic">
                      {t("Ämne", "Topic")}
                    </label>
                    <textarea
                      id="ai-topic"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value.slice(0, AI_LIMITS.maxPrompt))}
                      rows={3}
                      placeholder={t(
                        "T.ex. \"Svenska kungar under 1600-talet\" eller \"Djur i den svenska skogen\"",
                        "E.g. \"Famous inventors\" or \"Animals of the Nordic forest\""
                      )}
                      className={inputClass}
                    />
                  </div>
                )}

                {mode === "text" && (
                  <>
                    <div>
                      <label className={labelClass} htmlFor="ai-source">
                        {t("Text att göra frågor av", "Text to make questions from")}{" "}
                        <span className="font-normal">
                          ({sourceText.length.toLocaleString()} / {AI_LIMITS.maxSourceText.toLocaleString()})
                        </span>
                      </label>
                      <textarea
                        id="ai-source"
                        value={sourceText}
                        onChange={(e) => setSourceText(e.target.value.slice(0, AI_LIMITS.maxSourceText))}
                        rows={8}
                        placeholder={t(
                          "Klistra in t.ex. föreningens historia, en informationsskylt eller brudparets berättelse.",
                          "Paste e.g. your club's history, an information sign or the couple's story."
                        )}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="ai-wishes">
                        {t("Önskemål (valfritt)", "Wishes (optional)")}
                      </label>
                      <input
                        id="ai-wishes"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value.slice(0, AI_LIMITS.maxPrompt))}
                        placeholder={t("T.ex. \"fokusera på årtal\"", "E.g. \"focus on years\"")}
                        className={inputClass}
                      />
                    </div>
                  </>
                )}

                {mode === "place" && (
                  <>
                    <div>
                      <label className={labelClass} htmlFor="ai-place">
                        {t("Plats", "Place")}
                      </label>
                      <input
                        id="ai-place"
                        value={place}
                        onChange={(e) => setPlace(e.target.value.slice(0, AI_LIMITS.maxPlace))}
                        placeholder={t("T.ex. \"Hammardammen, Östersund\"", "E.g. \"Hyde Park, London\"")}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor="ai-wishes">
                        {t("Önskemål (valfritt)", "Wishes (optional)")}
                      </label>
                      <input
                        id="ai-wishes"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value.slice(0, AI_LIMITS.maxPrompt))}
                        placeholder={t("T.ex. \"mest natur och djur\"", "E.g. \"mostly nature and wildlife\"")}
                        className={inputClass}
                      />
                    </div>
                  </>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className={labelClass} htmlFor="ai-count">
                      {t("Antal frågor", "Questions")}
                    </label>
                    <input
                      id="ai-count"
                      type="number"
                      min={AI_LIMITS.minCount}
                      max={AI_LIMITS.maxCount}
                      value={count}
                      onChange={(e) =>
                        setCount(
                          Math.min(AI_LIMITS.maxCount, Math.max(AI_LIMITS.minCount, Math.round(Number(e.target.value) || 0)))
                        )
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="ai-lang">
                      {t("Språk", "Language")}
                    </label>
                    <select id="ai-lang" value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
                      {LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.flag} {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="ai-diff">
                      {t("Svårighet", "Difficulty")}
                    </label>
                    <select
                      id="ai-diff"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as AiDifficulty)}
                      className={inputClass}
                    >
                      <option value="easy">{t("Lätt", "Easy")}</option>
                      <option value="medium">{t("Medel", "Medium")}</option>
                      <option value="hard">{t("Svår", "Hard")}</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="ai-aud">
                      {t("Målgrupp", "Audience")}
                    </label>
                    <select
                      id="ai-aud"
                      value={audience}
                      onChange={(e) => setAudience(e.target.value as AiAudience)}
                      className={inputClass}
                    >
                      <option value="mixed">{t("Blandat/familj", "Mixed/family")}</option>
                      <option value="adults">{t("Vuxna", "Adults")}</option>
                      <option value="kids">{t("Barn 8–12", "Kids 8–12")}</option>
                    </select>
                  </div>
                </div>

                {error && (
                  <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm" role="alert">
                    {errorText(error)}
                  </p>
                )}
              </div>
            )}

            {step.kind === "loading" && (
              <div className="py-16 flex flex-col items-center text-center gap-4" aria-live="polite">
                <div className="w-10 h-10 border-4 border-green-dark/20 border-t-green-dark rounded-full animate-spin" />
                <p className="font-semibold text-green-dark">{t("AI:n skriver dina frågor…", "The AI is writing your questions…")}</p>
                <p className="text-sm text-text-warm max-w-sm">
                  {mode === "place"
                    ? t(
                        "Söker fakta om platsen på webben först. Det kan ta upp till ett par minuter.",
                        "Searching the web for facts about the place first. This can take a couple of minutes."
                      )
                    : t("Det tar oftast 20–60 sekunder.", "This usually takes 20–60 seconds.")}
                </p>
              </div>
            )}

            {step.kind === "result" && (
              <div className="space-y-4">
                <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {t(
                    "⚠️ AI-genererat — kontrollera fakta innan du använder frågorna. Bocka ur frågor du inte vill ha; du kan redigera resten efteråt.",
                    "⚠️ AI-generated — check the facts before using the questions. Untick any you don't want; you can edit the rest afterwards."
                  )}
                </div>
                <div>
                  <h3 className="font-serif text-lg text-green-dark">{step.data.battery.name}</h3>
                  {step.data.battery.description && (
                    <p className="text-sm text-text-warm">{step.data.battery.description}</p>
                  )}
                </div>
                <ol className="space-y-3">
                  {step.data.battery.questions.map((q, i) => {
                    const note = step.data.notes[i];
                    const checked = step.selected[i];
                    return (
                      <li
                        key={i}
                        className={`border rounded-xl p-3 transition ${
                          checked ? "border-green-dark/30 bg-white" : "border-gray-200 bg-gray-50 opacity-60"
                        }`}
                      >
                        <label className="flex gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setStep({
                                ...step,
                                selected: step.selected.map((s, j) => (j === i ? !s : s)),
                              })
                            }
                            className="mt-1 accent-green-dark"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm">
                              {i + 1}. {q.text}
                            </p>
                            <ul className="mt-1 text-sm space-y-0.5">
                              {q.options.map((o, j) => (
                                <li
                                  key={j}
                                  className={j === q.correctOptionIndex ? "text-green-dark font-semibold" : "text-text-warm"}
                                >
                                  {j === q.correctOptionIndex ? "✓ " : "· "}
                                  {o}
                                </li>
                              ))}
                            </ul>
                            {note?.explanation && <p className="mt-1 text-xs text-text-warm italic">{note.explanation}</p>}
                            {note?.sourceUrl && (
                              <a
                                href={note.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-block text-xs text-green-dark underline break-all"
                              >
                                {t("Källa", "Source")}: {note.sourceUrl}
                              </a>
                            )}
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            {step.kind === "form" && (
              <>
                <span className="text-xs text-text-warm">
                  {t(`Kostar ${cost} ${cost === 1 ? "kredit" : "krediter"}`, `Costs ${cost} ${cost === 1 ? "credit" : "credits"}`)}
                  {credits !== null && ` · ${t("du har", "you have")} ${credits}`}
                </span>
                {credits !== null && !enoughCredits ? (
                  <button
                    onClick={() => setShowBuy(true)}
                    className="bg-green-dark text-cream px-6 py-2 rounded-full font-semibold shadow hover:shadow-md transition"
                  >
                    {t("Köp krediter", "Buy credits")}
                  </button>
                ) : (
                  <button
                    onClick={submit}
                    disabled={credits === null}
                    className="bg-green-dark text-cream px-6 py-2 rounded-full font-semibold shadow hover:shadow-md transition disabled:opacity-50"
                  >
                    {error?.reason === "network" ? t("Försök igen", "Try again") : t("✨ Generera", "✨ Generate")}
                  </button>
                )}
              </>
            )}
            {step.kind === "loading" && <span className="text-xs text-text-warm">{t("Stäng inte fönstret.", "Don't close this window.")}</span>}
            {step.kind === "result" && (
              <>
                <button onClick={() => setStep({ kind: "form" })} className="text-text-warm px-4 py-2 hover:underline text-sm">
                  {t("← Ändra och generera nya", "← Change and generate new")}
                </button>
                <button
                  onClick={applyPicked}
                  disabled={!step.selected.some(Boolean)}
                  className="bg-green-dark text-cream px-6 py-2 rounded-full font-semibold shadow hover:shadow-md transition disabled:opacity-50"
                >
                  {t(
                    `Använd ${step.selected.filter(Boolean).length} frågor`,
                    `Use ${step.selected.filter(Boolean).length} questions`
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Utanför backdroppen ovan — annars bubblar klick på köpdialogens
          backdrop vidare och stänger även AI-dialogen. */}
      {showBuy && (
        <BuyCreditsDialog
          onClose={() => setShowBuy(false)}
          reason={t(
            `Den här genereringen kostar ${cost} ${cost === 1 ? "kredit" : "krediter"}.`,
            `This generation costs ${cost} ${cost === 1 ? "credit" : "credits"}.`
          )}
        />
      )}
    </>
  );
}

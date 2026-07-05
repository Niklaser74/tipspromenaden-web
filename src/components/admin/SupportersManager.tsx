/**
 * @file SupportersManager.tsx
 * @description Admin-flik för att redigera appens tacksida
 * (Inställningar → "Tack till våra supportrar" → SupportersScreen).
 *
 * Formuläret speglar Firestore-doc:et `config/supporters`:
 *   - Textarea med ett namn per rad → splitta, trimma, filtrera tomma → names.
 *   - Två valfria fält för intro-text (sv/en) — lämnas de tomma används
 *     appens default-text (message utelämnas ur doc:et).
 *   - Spara skriver HELA doc:et (ersätt, inte merge) med updatedAt.
 *
 * Vid load för-ifylls formuläret med nuvarande innehåll via getDoc.
 * CLI-alternativet är app-repots scripts/set-supporters.mjs.
 */

import { useEffect, useMemo, useState } from "react";
import {
  getSupportersConfig,
  saveSupportersConfig,
  SUPPORTER_NAME_MAX_LENGTH,
} from "../../lib/supporters";
import { HelpIcon } from "../HelpIcon";

/** Textarea-innehåll → namnlista: ett namn per rad, trimmat, tomma rader bort. */
function parseNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export default function SupportersManager() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [namesText, setNamesText] = useState("");
  const [messageSv, setMessageSv] = useState("");
  const [messageEn, setMessageEn] = useState("");
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await getSupportersConfig();
        if (cancelled) return;
        if (config) {
          setNamesText(config.names.join("\n"));
          setMessageSv(config.message?.sv ?? "");
          setMessageEn(config.message?.en ?? "");
          setUpdatedAt(config.updatedAt);
        }
        setLoaded(true);
      } catch (e: any) {
        if (!cancelled) {
          setLoadError(e?.message || "Kunde inte hämta supporter-listan");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const names = useMemo(() => parseNames(namesText), [namesText]);
  const tooLong = useMemo(
    () => names.filter((n) => n.length > SUPPORTER_NAME_MAX_LENGTH),
    [names]
  );

  async function handleSave() {
    if (
      names.length === 0 &&
      !confirm(
        "Namnlistan är tom — tacksidan i appen blir tom. Spara ändå?"
      )
    ) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSavedAt(null);
    try {
      const ts = await saveSupportersConfig(names, {
        sv: messageSv,
        en: messageEn,
      });
      setUpdatedAt(ts);
      setSavedAt(ts);
    } catch (e: any) {
      setSaveError(e?.message || "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {loadError}
      </p>
    );
  }

  if (!loaded) {
    return <p className="text-text-warm">Hämtar supporter-listan…</p>;
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h2 className="font-serif text-xl text-green-dark">Supportrar</h2>
        <p className="text-sm text-text-warm mt-1">
          Namnen visas på appens tacksida (Inställningar → "Tack till våra
          supportrar") i den ordning de står här. Hela listan skrivs om vid
          spara — borttagna rader försvinner ur appen.
        </p>
        {updatedAt && (
          <p className="text-xs text-sage mt-1">
            Senast uppdaterad{" "}
            {new Date(updatedAt).toLocaleString("sv-SE")}
          </p>
        )}
      </div>

      <div className="bg-white border border-rule rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-green-dark mb-1">
            Namn — ett per rad
            <HelpIcon
              text="Radordningen blir visningsordningen i appen. Tomma rader ignoreras och varje namn trimmas. Håll namnen under 100 tecken."
              side="bottom"
            />
          </label>
          <textarea
            value={namesText}
            onChange={(e) => setNamesText(e.target.value)}
            rows={12}
            placeholder={"Anna Andersson\nBertil B\nCilla C"}
            className="w-full px-4 py-2 rounded-lg border border-rule bg-white font-mono text-sm"
          />
          <p className="text-xs text-text-warm mt-1">
            {names.length === 1 ? "1 namn" : `${names.length} namn`} i listan
          </p>
          {tooLong.length > 0 && (
            <p className="text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded px-3 py-2 mt-2">
              ⚠️ {tooLong.length === 1 ? "Ett namn är" : `${tooLong.length} namn är`}{" "}
              längre än {SUPPORTER_NAME_MAX_LENGTH} tecken och kortas av i
              appen: {tooLong.map((n) => `"${n.slice(0, 30)}…"`).join(", ")}
            </p>
          )}
        </div>

        <div>
          <p className="text-sm font-semibold text-green-dark mb-1">
            Egen intro-text (valfri)
            <HelpIcon
              text="Ersätter appens default-intro på tacksidan. Lämna båda fälten tomma för att använda default-texten. Fylls bara ett språk i fallbackar appen till det."
              side="bottom"
            />
          </p>
          <div className="space-y-2">
            <label className="block">
              <span className="text-xs text-text-warm">Svenska</span>
              <input
                value={messageSv}
                onChange={(e) => setMessageSv(e.target.value)}
                placeholder="Lämna tomt för appens default-text"
                className="w-full px-4 py-2 rounded-lg border border-rule bg-white text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-text-warm">Engelska</span>
              <input
                value={messageEn}
                onChange={(e) => setMessageEn(e.target.value)}
                placeholder="Leave empty for the app's default text"
                className="w-full px-4 py-2 rounded-lg border border-rule bg-white text-sm"
              />
            </label>
          </div>
        </div>

        {saveError && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {saveError}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            title="Skriver hela config/supporters-doc:et till Firestore. Appen läser listan direkt vid nästa besök på tacksidan."
            className="bg-green-dark text-cream px-6 py-2 rounded-full font-semibold shadow hover:shadow-md disabled:opacity-50"
          >
            {saving ? "Sparar…" : "Spara"}
          </button>
          {savedAt && !saving && (
            <span className="text-sm text-green-dark">
              ✓ Sparat {new Date(savedAt).toLocaleTimeString("sv-SE")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

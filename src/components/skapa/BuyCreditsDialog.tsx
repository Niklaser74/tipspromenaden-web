/**
 * @file BuyCreditsDialog.tsx
 * @description Köp AI-krediter via Stripe Checkout.
 *
 * Skapar en Checkout Session via callable `createCheckoutSession` och
 * skickar användaren till Stripes betalsida. Efter betalning kommer man
 * tillbaka till `/skapa?kop=ok` (App.tsx visar en banner) och saldot
 * uppdateras av sig självt när webhooken har skrivit `billing/{uid}`.
 */

import { useState } from "react";
import { CREDIT_PACKS, startCheckout, toAiError, type CreditPackInfo } from "../../lib/ai";
import { useLocale, useT } from "./i18n";

interface Props {
  onClose: () => void;
  /** Visas överst, t.ex. när användaren fick slut mitt i en generering. */
  reason?: string;
}

export function BuyCreditsDialog({ onClose, reason }: Props) {
  const t = useT();
  const lang = useLocale();
  const [busy, setBusy] = useState<CreditPackInfo["id"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(pack: CreditPackInfo) {
    setBusy(pack.id);
    setError(null);
    try {
      const url = await startCheckout(pack.id);
      window.location.href = url;
    } catch (e) {
      const err = toAiError(e);
      setError(
        err.reason === "anonymous"
          ? t("Logga in med ett konto för att köpa krediter.", "Sign in with an account to buy credits.")
          : t(
              `Kunde inte starta betalningen: ${err.message}`,
              `Could not start the payment: ${err.message}`
            )
      );
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[2100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="buy-credits-title"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 id="buy-credits-title" className="text-xl font-bold text-green-dark">
            {t("✨ Köp AI-krediter", "✨ Buy AI credits")}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition flex items-center justify-center text-gray-600"
            aria-label={t("Stäng", "Close")}
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-4">
          {reason && (
            <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {reason}
            </p>
          )}
          <p className="text-sm text-text-warm">
            {t(
              "En kredit räcker till en generering med upp till 15 frågor om ett tema eller från egen text. Platsbaserade frågor (med webbsökning) och fler än 15 frågor kostar en kredit extra.",
              "One credit covers one generation of up to 15 questions on a topic or from your own text. Place-based questions (with web search) and more than 15 questions cost one extra credit."
            )}
          </p>

          <div className="grid grid-cols-2 gap-3">
            {CREDIT_PACKS.map((pack) => (
              <button
                key={pack.id}
                onClick={() => buy(pack)}
                disabled={busy !== null}
                className="border-2 border-green-dark/20 hover:border-green-dark rounded-xl p-4 text-left transition disabled:opacity-50"
              >
                <div className="text-2xl font-bold text-green-dark">{pack.credits}</div>
                <div className="text-sm text-text-warm">{t("krediter", "credits")}</div>
                <div className="mt-2 font-semibold">
                  {pack.priceSek} kr
                  <span className="text-xs text-text-warm font-normal">
                    {" "}
                    · {(pack.priceSek / pack.credits).toLocaleString(lang === "en" ? "en-GB" : "sv-SE", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    {t("kr/st", "SEK each")}
                  </span>
                </div>
                <div className="mt-3 text-xs font-semibold text-green-dark">
                  {busy === pack.id ? t("Öppnar betalning…", "Opening payment…") : t("Köp →", "Buy →")}
                </div>
              </button>
            ))}
          </div>

          {error && (
            <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">{error}</p>
          )}

          <p className="text-xs text-text-warm">
            {t(
              "Betalning sker via Stripe (kort eller Swish). Krediterna är digitalt innehåll som levereras direkt — när du betalar godkänner du att ångerrätten upphör. ",
              "Payment is handled by Stripe (card or Swish). Credits are digital content delivered immediately — by paying you agree that the right of withdrawal ends. "
            )}
            <a href="/villkor" target="_blank" rel="noopener noreferrer" className="underline">
              {t("Villkor", "Terms")}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

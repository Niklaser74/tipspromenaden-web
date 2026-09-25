/**
 * @file BuyCreditsDialog.tsx
 * @description Köp AI-krediter via Stripe Checkout.
 *
 * Skapar en Checkout Session via callable `createCheckoutSession` och
 * skickar användaren till Stripes betalsida. Efter betalning kommer man
 * tillbaka till `/skapa?kop=ok` (App.tsx visar en banner) och saldot
 * uppdateras av sig självt när webhooken har skrivit `billing/{uid}`.
 *
 * Här finns också Pro-prenumerationen (`createProCheckout`), faktura för
 * de större paketen (InvoiceForm) och en länk till Stripes kundportal
 * för kvitton, kort och uppsägning (`createPortalSession`).
 */

import { useState } from "react";
import {
  CREDIT_PACKS,
  PRO_PLANS,
  openCustomerPortal,
  startCheckout,
  startProCheckout,
  toAiError,
  type CreditPackInfo,
  type ProPlanInfo,
} from "../../lib/ai";
import { auth } from "../../lib/firebase";
import { isProActive, useBilling } from "../../lib/useCredits";
import { InvoiceForm } from "./InvoiceForm";
import { useLocale, useT } from "./i18n";

interface Props {
  onClose: () => void;
  /** Visas överst, t.ex. när användaren fick slut mitt i en generering. */
  reason?: string;
}

export function BuyCreditsDialog({ onClose, reason }: Props) {
  const t = useT();
  const lang = useLocale();
  const billing = useBilling(auth.currentUser?.uid);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invoicePack, setInvoicePack] = useState<CreditPackInfo | null>(null);
  const locale = lang === "en" ? "en-GB" : "sv-SE";

  /** Hämtar en Stripe-URL och skickar dit användaren. */
  async function go(key: string, getUrl: () => Promise<string>) {
    setBusy(key);
    setError(null);
    try {
      window.location.href = await getUrl();
    } catch (e) {
      const err = toAiError(e);
      setError(
        err.reason === "anonymous"
          ? t("Logga in med ett konto för att köpa krediter.", "Sign in with an account to buy credits.")
          : err.reason === "already-subscribed"
            ? t("Du har redan Pro — hantera den under Kvitton och prenumeration.", "You already have Pro — manage it under Receipts and subscription.")
            : t(
                `Kunde inte starta betalningen: ${err.message}`,
                `Could not start the payment: ${err.message}`
              )
      );
      setBusy(null);
    }
  }

  const buy = (pack: CreditPackInfo) => go(pack.id, () => startCheckout(pack.id));
  const subscribe = (plan: ProPlanInfo) => go(plan.id, () => startProCheckout(plan.id));
  const portal = () => go("portal", openCustomerPortal);

  const pro = billing?.pro ?? null;
  const proActive = isProActive(pro);
  const periodEnd = pro?.currentPeriodEnd ? new Date(pro.currentPeriodEnd * 1000).toLocaleDateString(locale) : null;

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
          {invoicePack ? (
            <InvoiceForm pack={invoicePack} onBack={() => setInvoicePack(null)} />
          ) : (
            <>
              <p className="text-sm text-text-warm">
                {t(
                  "En kredit räcker till en generering med upp till 15 frågor om ett tema eller från egen text. Platsbaserade frågor (med webbsökning) och fler än 15 frågor kostar en kredit extra.",
                  "One credit covers one generation of up to 15 questions on a topic or from your own text. Place-based questions (with web search) and more than 15 questions cost one extra credit."
                )}
              </p>

              <section className="rounded-xl bg-green-dark/5 border border-green-dark/20 p-4 space-y-3">
                <h3 className="font-bold text-green-dark">⭐ Pro</h3>
                {proActive ? (
                  <p className="text-sm text-text-warm">
                    {pro?.cancelAtPeriodEnd
                      ? t(
                          `Du har Pro till ${periodEnd ?? "periodens slut"}. ${billing?.subscriptionCredits ?? 0} Pro-krediter kvar.`,
                          `You have Pro until ${periodEnd ?? "the end of the period"}. ${billing?.subscriptionCredits ?? 0} Pro credits left.`
                        )
                      : t(
                          `Du har Pro. ${billing?.subscriptionCredits ?? 0} Pro-krediter kvar${periodEnd ? `, fylls på ${periodEnd}` : ""}.`,
                          `You have Pro. ${billing?.subscriptionCredits ?? 0} Pro credits left${periodEnd ? `, refilled on ${periodEnd}` : ""}.`
                        )}
                    {pro?.status === "past_due" &&
                      t(
                        " Senaste betalningen gick inte igenom — uppdatera kortet i kundportalen.",
                        " The latest payment failed — update your card in the customer portal."
                      )}
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-text-warm">
                      {t(
                        "20 nya krediter varje månad. Oanvända Pro-krediter sparas inte till nästa månad; köpta krediter finns kvar. Säg upp när du vill.",
                        "20 new credits every month. Unused Pro credits don't carry over; purchased credits stay. Cancel any time."
                      )}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {PRO_PLANS.map((plan) => (
                        <button
                          key={plan.id}
                          onClick={() => subscribe(plan)}
                          disabled={busy !== null}
                          className="border-2 border-green-dark/20 hover:border-green-dark bg-white rounded-xl p-3 text-left transition disabled:opacity-50"
                        >
                          <div className="font-bold text-green-dark">
                            {plan.id === "pro_month" ? t("Månad", "Monthly") : t("År", "Yearly")}
                          </div>
                          <div className="text-sm">
                            {plan.priceSek} kr/{plan.id === "pro_month" ? t("mån", "mo") : t("år", "yr")}
                          </div>
                          <div className="text-xs text-text-warm">
                            {plan.creditsPerPeriod} {t("krediter", "credits")}
                            {plan.id === "pro_year" && t(" · 2 månader gratis", " · 2 months free")}
                          </div>
                          <div className="mt-2 text-xs font-semibold text-green-dark">
                            {busy === plan.id ? t("Öppnar…", "Opening…") : t("Teckna →", "Subscribe →")}
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>

              <div className="grid grid-cols-2 gap-3">
                {CREDIT_PACKS.map((pack) => (
                  <div
                    key={pack.id}
                    className="border-2 border-green-dark/20 hover:border-green-dark rounded-xl transition flex flex-col"
                  >
                    <button
                      onClick={() => buy(pack)}
                      disabled={busy !== null}
                      className="p-4 text-left disabled:opacity-50 flex-1"
                    >
                      <div className="text-2xl font-bold text-green-dark">{pack.credits}</div>
                      <div className="text-sm text-text-warm">{t("krediter", "credits")}</div>
                      <div className="mt-2 font-semibold">
                        {pack.priceSek} kr
                        <span className="text-xs text-text-warm font-normal">
                          {" "}
                          · {(pack.priceSek / pack.credits).toLocaleString(locale, {
                            maximumFractionDigits: 2,
                          })}{" "}
                          {t("kr/st", "SEK each")}
                        </span>
                      </div>
                      <div className="mt-3 text-xs font-semibold text-green-dark">
                        {busy === pack.id ? t("Öppnar betalning…", "Opening payment…") : t("Köp →", "Buy →")}
                      </div>
                    </button>
                    {pack.invoice && (
                      <button
                        onClick={() => setInvoicePack(pack)}
                        disabled={busy !== null}
                        className="border-t border-green-dark/10 px-4 py-2 text-xs text-left text-text-warm hover:text-green-dark disabled:opacity-50"
                      >
                        🧾 {t("Faktura till skola/förening", "Invoice for school/association")}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

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
            {billing?.hasCustomer && (
              <>
                {" · "}
                <button onClick={portal} disabled={busy !== null} className="underline disabled:opacity-50">
                  {busy === "portal"
                    ? t("Öppnar…", "Opening…")
                    : t("Kvitton och prenumeration", "Receipts and subscription")}
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

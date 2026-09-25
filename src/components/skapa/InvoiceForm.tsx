/**
 * @file InvoiceForm.tsx
 * @description Beställ ett kreditpaket på faktura (skolor/föreningar).
 *
 * Visas inne i BuyCreditsDialog. Anropar callable `createInvoice`, som
 * mejlar fakturan till organisationens e-post. Krediterna läggs till av
 * webhooken först när fakturan är betald — det säger vi tydligt, så att
 * ingen tror att något gick fel när saldot inte ändras direkt.
 *
 * Organisationsnummer och momsnummer kontrolleras på servern (Luhn m.m.);
 * här görs bara det som behövs för ett vettigt formulär.
 */

import { useState, type FormEvent } from "react";
import {
  newRequestId,
  requestInvoice,
  toAiError,
  type CreditPackInfo,
  type InvoiceOrganization,
  type InvoiceResponse,
} from "../../lib/ai";
import { useLocale, useT } from "./i18n";

interface Props {
  pack: CreditPackInfo;
  onBack: () => void;
}

const EMPTY: InvoiceOrganization = {
  name: "",
  orgNumber: "",
  vatNumber: "",
  email: "",
  reference: "",
  address: { line1: "", line2: "", postalCode: "", city: "", country: "SE" },
};

export function InvoiceForm({ pack, onBack }: Props) {
  const t = useT();
  const lang = useLocale();
  const [org, setOrg] = useState<InvoiceOrganization>(EMPTY);
  // Ett id per formulär: dubbelklick eller retry efter nätverksfel ger
  // samma faktura, inte två.
  const [requestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<InvoiceResponse | null>(null);

  function field<K extends keyof InvoiceOrganization>(key: K, value: InvoiceOrganization[K]) {
    setOrg((o) => ({ ...o, [key]: value }));
  }
  function address(key: keyof InvoiceOrganization["address"], value: string) {
    setOrg((o) => ({ ...o, address: { ...o.address, [key]: value } }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSent(await requestInvoice(pack.id, org, requestId));
    } catch (err) {
      const ae = toAiError(err);
      setError(
        ae.reason === "too-many-open-invoices"
          ? t(
              "Du har redan tre obetalda fakturor. Betala dem eller hör av dig till oss innan du beställer fler.",
              "You already have three unpaid invoices. Pay them or contact us before ordering more."
            )
          : ae.reason === "anonymous"
            ? t("Logga in med ett konto för att beställa.", "Sign in with an account to order.")
            : ae.message
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    const due = sent.dueDate
      ? new Date(sent.dueDate * 1000).toLocaleDateString(lang === "en" ? "en-GB" : "sv-SE")
      : null;
    return (
      <div className="space-y-3 text-sm">
        <p className="text-green-dark font-semibold text-base">
          {t("Fakturan är skickad 📨", "The invoice has been sent 📨")}
        </p>
        <p className="text-text-warm">
          {t(
            `Faktura ${sent.number ?? ""} på ${pack.credits} krediter har mejlats till ${org.email}${due ? `, förfaller ${due}` : ""}. Krediterna läggs till på ditt konto när fakturan är betald.`,
            `Invoice ${sent.number ?? ""} for ${pack.credits} credits has been emailed to ${org.email}${due ? `, due ${due}` : ""}. The credits are added to your account once the invoice is paid.`
          )}
        </p>
        {sent.hostedInvoiceUrl && (
          <a
            href={sent.hostedInvoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-green-dark text-cream px-4 py-2 rounded-lg font-semibold"
          >
            {t("Visa fakturan / betala med kort", "View invoice / pay by card")}
          </a>
        )}
      </div>
    );
  }

  const input = "w-full border border-rule rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-dark";
  const label = "block text-xs font-semibold text-text-warm mb-1";

  return (
    <form onSubmit={submit} className="space-y-3">
      <button type="button" onClick={onBack} className="text-sm text-text-warm hover:underline">
        ← {t("Tillbaka", "Back")}
      </button>
      <p className="text-sm text-text-warm">
        {t(
          `Faktura på ${pack.credits} krediter (${pack.priceSek} kr inkl. moms), 30 dagar netto. Krediterna läggs till när fakturan är betald.`,
          `Invoice for ${pack.credits} credits (SEK ${pack.priceSek} incl. VAT), 30 days net. The credits are added once the invoice is paid.`
        )}
      </p>

      <div>
        <label className={label} htmlFor="inv-name">{t("Skola / förening", "School / association")}</label>
        <input id="inv-name" className={input} required minLength={2} maxLength={120}
          value={org.name} onChange={(e) => field("name", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="inv-org">{t("Organisationsnummer", "Organisation number")}</label>
          <input id="inv-org" className={input} placeholder="NNNNNN-NNNN" maxLength={20}
            value={org.orgNumber} onChange={(e) => field("orgNumber", e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="inv-vat">{t("Momsnummer (valfritt)", "VAT number (optional)")}</label>
          <input id="inv-vat" className={input} placeholder="SE…01" maxLength={20}
            value={org.vatNumber} onChange={(e) => field("vatNumber", e.target.value)} />
        </div>
      </div>
      <div>
        <label className={label} htmlFor="inv-email">{t("E-post för fakturan", "Invoice email")}</label>
        <input id="inv-email" type="email" className={input} required maxLength={200}
          placeholder={t("t.ex. ekonomi@kommun.se", "e.g. accounts@school.org")}
          value={org.email} onChange={(e) => field("email", e.target.value)} />
      </div>
      <div>
        <label className={label} htmlFor="inv-ref">{t("Er referens (valfritt)", "Your reference (optional)")}</label>
        <input id="inv-ref" className={input} maxLength={100}
          placeholder={t("Namn, kostnadsställe eller referensnummer", "Name, cost centre or PO number")}
          value={org.reference} onChange={(e) => field("reference", e.target.value)} />
      </div>
      <div>
        <label className={label} htmlFor="inv-line1">{t("Fakturaadress", "Billing address")}</label>
        <input id="inv-line1" className={input} required minLength={2} maxLength={200}
          value={org.address.line1} onChange={(e) => address("line1", e.target.value)} />
        <input className={`${input} mt-2`} maxLength={200} aria-label={t("Adressrad 2", "Address line 2")}
          placeholder={t("Adressrad 2 (valfritt)", "Address line 2 (optional)")}
          value={org.address.line2} onChange={(e) => address("line2", e.target.value)} />
      </div>
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <div>
          <label className={label} htmlFor="inv-zip">{t("Postnummer", "Postcode")}</label>
          <input id="inv-zip" className={input} required maxLength={20}
            value={org.address.postalCode} onChange={(e) => address("postalCode", e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor="inv-city">{t("Ort", "City")}</label>
          <input id="inv-city" className={input} required maxLength={100}
            value={org.address.city} onChange={(e) => address("city", e.target.value)} />
        </div>
      </div>

      {error && (
        <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">{error}</p>
      )}

      <button type="submit" disabled={busy}
        className="w-full bg-green-dark text-cream rounded-lg py-2.5 font-semibold disabled:opacity-50">
        {busy ? t("Skickar fakturan…", "Sending invoice…") : t("Skicka faktura", "Send invoice")}
      </button>
    </form>
  );
}

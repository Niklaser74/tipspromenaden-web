/**
 * @file FlyerDialog.tsx
 * @description Admin-modal för att skapa A5-flygblad till en walk.
 *
 * Speglar Friluft Folio-designen från `tipspromenaden-app/docs/marketing/`-
 * mappen (specifikt Hammardammen-mallen) — cream bakgrund, Lora-serifs,
 * Instrument Sans eyebrow med letter-spacing, två-stegs-QR-layout (bli
 * testare → starta promenaden) i vita kort.
 *
 * QR-koderna genereras klient-side via qrcode-paketet med felkorrigering
 * H så marginalerna runt blir snygga.
 *
 * Print-flödet: admin klickar "Skriv ut / Spara som PDF" → window.print() →
 * browserns print-dialog. Utskriften är ALLTID 2-up: CSS @page sätter A4
 * landscape och TVÅ identiska A5-flygblad renderas sida vid sida
 * (148mm + 148mm ≈ 297mm) så ett A4-ark ger två flygblad att klippa isär.
 * Print-kopiorna renderas via en React-portal direkt till document.body
 * (utanför astro-island och modal-overlayn) så att @media print kan dölja
 * allt UTOM dem. Tidigare versioner förlitade sig på en `#root`-selektor
 * som inte finns i ett Astro/client:only-bygge — då följde hela sidan med
 * i utskriften. Resultatet är pixel-perfekt — browserns PDF-engine ger
 * bättre kvalitet än vad en JS-genererad PDF skulle ge.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import type { Walk } from "../../lib/types";

// Smart-redirect-sida: Android → Google Play, iPhone → /stod.
// Encodes som EN QR-kod oavsett OS — sidan client-side detekterar och
// skickar vidare. Se /src/pages/get-app.astro för logiken.
const GET_APP_URL = "https://tipspromenaden.app/get-app";

interface Props {
  walk: Walk;
  onClose: () => void;
}

type Lang = "sv" | "en";

interface Strings {
  eyebrow: string;
  subhead: string;
  intro: string;
  spec: (count: number) => string;
  step1Label: string;
  step1Title: string;
  step1Caption: string;
  step2Label: string;
  step2Title: string;
  step2Caption: string;
  bottomNote: string;
  printButton: string;
  closeButton: string;
  langLabel: string;
}

const STRINGS: Record<Lang, Strings> = {
  sv: {
    eyebrow: "TIPSPROMENADEN",
    subhead: "En quizpromenad du går utomhus.",
    intro:
      "Skanna QR-koden, gå till kontrollpunkterna och svara på " +
      "frågorna. Familjeturen blir plötsligt en lagom-tävling.",
    spec: (n) => `${n} KONTROLLER  ·  GRATIS`,
    step1Label: "STEG 1",
    step1Title: "Få appen",
    step1Caption:
      "Android: öppnar Google Play. iPhone: öppnar stödsidan — iOS-versionen är på gång.",
    step2Label: "STEG 2",
    step2Title: "Starta promenaden",
    step2Caption:
      "Skanna när du har fått appen installerad — promenaden öppnas direkt.",
    bottomNote:
      "Gratis på Google Play. iPhone-versionen är på gång — stötta gärna så vi kan släppa den.",
    printButton: "🖨 Skriv ut / Spara som PDF",
    closeButton: "Stäng",
    langLabel: "Språk",
  },
  en: {
    eyebrow: "TIPSPROMENADEN",
    subhead: "An outdoor quiz walk.",
    intro:
      "Scan the QR code, walk to the checkpoints and answer the " +
      "questions. The family outing turns into a friendly competition.",
    spec: (n) => `${n} CHECKPOINTS  ·  FREE`,
    step1Label: "STEP 1",
    step1Title: "Get the app",
    step1Caption:
      "Android: opens Google Play. iPhone: opens the support page — iOS version on the way.",
    step2Label: "STEP 2",
    step2Title: "Start the walk",
    step2Caption:
      "Scan once you have the app installed — the walk opens directly.",
    bottomNote:
      "Free on Google Play. The iPhone version is on the way — support us to help release it.",
    printButton: "🖨 Print / Save as PDF",
    closeButton: "Close",
    langLabel: "Language",
  },
};

export function FlyerDialog({ walk, onClose }: Props) {
  const [lang, setLang] = useState<Lang>(walk.language === "en" ? "en" : "sv");
  const [walkQr, setWalkQr] = useState<string>("");
  const [testersQr, setTestersQr] = useState<string>("");

  // Generera båda QR-koder vid mount. Walk-id:t är stabilt så vi behöver
  // bara köra en gång; testers-URL:en ändras aldrig.
  useEffect(() => {
    const walkUrl = `https://tipspromenaden.app/walk/${walk.id}`;
    const opts = {
      errorCorrectionLevel: "H" as const,
      margin: 1,
      width: 600,
      color: { dark: "#1B3D2B", light: "#F5F0E8" },
    };
    QRCode.toDataURL(walkUrl, opts).then(setWalkQr).catch(() => setWalkQr(""));
    QRCode.toDataURL(GET_APP_URL, opts)
      .then(setTestersQr)
      .catch(() => setTestersQr(""));
  }, [walk.id]);

  const t = STRINGS[lang];

  return (
    <>
      {/* Print-CSS: ALLTID 2-up — A4 landscape, två A5-flygblad sida vid
          sida. Dölj ALLT direkt under <body> utom print-portalen
          (.flyer-print-root) — strukturoberoende, funkar oavsett om sidan
          hydreras i astro-island, #root e.d. @page kan inte uttryckas via
          Tailwind:s print:-modifiers. */}
      <style>{`
        @page {
          size: A4 landscape;
          margin: 0;
        }
        .flyer-print-root { display: none; }
        @media print {
          body { background: #F5F0E8 !important; }
          body > *:not(.flyer-print-root) { display: none !important; }
          .flyer-print-root {
            display: flex !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 297mm !important;
            height: 210mm !important;
          }
          .flyer-print-root .flyer-print {
            flex: 0 0 148mm !important;
            width: 148mm !important;
            height: 210mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          /* Tunn streckad klipplinje i sömmen mellan de två flygbladen. */
          .flyer-print-root::after {
            content: "" !important;
            position: absolute !important;
            top: 0 !important;
            bottom: 0 !important;
            left: 148mm !important;
            width: 0 !important;
            border-left: 0.3mm dashed #B7AE9C !important;
            pointer-events: none !important;
          }
        }
      `}</style>

      <div
        className="fixed inset-0 bg-black/40 flex items-start justify-center z-[2000] p-4 overflow-y-auto no-print"
        onClick={onClose}
      >
        <div
          className="bg-cream rounded-2xl shadow-2xl max-w-3xl w-full my-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Controls bar */}
          <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-rule flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase tracking-wide text-sage">
                {t.langLabel}:
              </span>
              <div className="flex border border-rule rounded-full overflow-hidden text-xs font-semibold">
                <button
                  onClick={() => setLang("sv")}
                  className={`px-3 py-1.5 ${
                    lang === "sv"
                      ? "bg-green-dark text-cream"
                      : "text-text-warm hover:bg-white"
                  }`}
                >
                  SV
                </button>
                <button
                  onClick={() => setLang("en")}
                  className={`px-3 py-1.5 ${
                    lang === "en"
                      ? "bg-green-dark text-cream"
                      : "text-text-warm hover:bg-white"
                  }`}
                >
                  EN
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => window.print()}
                className="bg-green-dark text-cream px-4 py-2 rounded-full text-sm font-semibold hover:opacity-90"
              >
                {t.printButton}
              </button>
              <button
                onClick={onClose}
                className="text-text-warm hover:text-green-dark text-sm"
              >
                {t.closeButton}
              </button>
            </div>
          </div>

          {/* Preview-container — låter flygbladet vara A5-stort, scroll vid
              behov. På desktop syns hela det. På mobil blir det scroll, men
              admin-jobbet görs primärt på laptop. */}
          <div className="p-6 bg-rule/20 flex justify-center">
            <Flyer walk={walk} t={t} walkQr={walkQr} testersQr={testersQr} />
          </div>

          <div className="px-5 py-3 border-t border-rule text-xs text-sage">
            <p>
              {t === STRINGS.sv ? (
                <>
                  Tips: utskriften blir alltid <strong>2-up</strong> — två
                  identiska flygblad sida vid sida på ett{" "}
                  <strong>A4 liggande</strong> ark att klippa isär. I
                  print-dialogen, välj <strong>Spara som PDF</strong> som mål
                  för att ladda ner, eller skicka direkt till skrivare.
                  Marginaler ska vara <strong>None</strong> och scaling{" "}
                  <strong>100%</strong>.
                </>
              ) : (
                <>
                  Tip: the print is always <strong>2-up</strong> — two
                  identical flyers side by side on one{" "}
                  <strong>A4 landscape</strong> sheet to cut apart. In the
                  print dialog, choose <strong>Save as PDF</strong> to
                  download, or send directly to a printer. Margins should be{" "}
                  <strong>None</strong> and scaling <strong>100%</strong>.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Print-kopior: TVÅ identiska flygblad (2-up) renderas direkt till
          document.body via portal så de hamnar utanför astro-island +
          modal-overlayn. Dolda på skärm (.flyer-print-root { display:none }),
          syns bara i @media print sida vid sida på ett A4-ark. */}
      {createPortal(
        <div className="flyer-print-root">
          <Flyer walk={walk} t={t} walkQr={walkQr} testersQr={testersQr} />
          <Flyer walk={walk} t={t} walkQr={walkQr} testersQr={testersQr} />
        </div>,
        document.body,
      )}
    </>
  );
}

function Flyer({
  walk,
  t,
  walkQr,
  testersQr,
}: {
  walk: Walk;
  t: Strings;
  walkQr: string;
  testersQr: string;
}) {
  return (
    <div
      className="flyer-print bg-cream shadow-xl"
      style={{
        width: "148mm",
        height: "210mm",
        padding: "9mm 14mm",
        fontFamily: "'Instrument Sans', system-ui, sans-serif",
        color: "#2C3E2D",
        position: "relative",
      }}
    >
      {/* Eyebrow */}
      <p
        className="text-center"
        style={{
          fontSize: "7pt",
          fontWeight: 700,
          color: "#8A9A8D",
          letterSpacing: "0.18em",
          marginBottom: "6pt",
        }}
      >
        {t.eyebrow}
      </p>

      {/* Hairline */}
      <div
        className="mx-auto"
        style={{
          width: "28pt",
          height: "0.7pt",
          background: "#1B6B35",
          marginBottom: "10pt",
        }}
      />

      {/* App icon */}
      <img
        src="/icon.png"
        alt=""
        style={{
          width: "44pt",
          height: "44pt",
          display: "block",
          margin: "0 auto 12pt",
          borderRadius: "8pt",
        }}
      />

      {/* Headline = walk-title */}
      <h1
        style={{
          fontFamily: "'Lora', Georgia, serif",
          fontWeight: 700,
          fontSize: "26pt",
          color: "#1B3D2B",
          textAlign: "center",
          lineHeight: 1.05,
          margin: "0 0 8pt",
          wordBreak: "break-word",
        }}
      >
        {walk.title}
      </h1>

      {/* Subhead */}
      <p
        style={{
          fontFamily: "'Lora', Georgia, serif",
          fontStyle: "italic",
          fontSize: "13pt",
          color: "#1B6B35",
          textAlign: "center",
          margin: "0 0 14pt",
        }}
      >
        {t.subhead}
      </p>

      {/* Intro */}
      <p
        style={{
          fontSize: "10pt",
          textAlign: "center",
          lineHeight: 1.45,
          margin: "0 0 12pt",
        }}
      >
        {t.intro}
      </p>

      {/* Spec line */}
      <p
        className="text-center"
        style={{
          fontSize: "8pt",
          fontWeight: 700,
          color: "#8A9A8D",
          letterSpacing: "0.18em",
          marginBottom: "16pt",
        }}
      >
        {t.spec(walk.questions.length)}
      </p>

      {/* Två-stegs-QR */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10pt",
          marginBottom: "14pt",
        }}
      >
        <Step
          label={t.step1Label}
          title={t.step1Title}
          qr={testersQr}
          caption={t.step1Caption}
        />
        <Step
          label={t.step2Label}
          title={t.step2Title}
          qr={walkQr}
          caption={t.step2Caption}
        />
      </div>

      {/* Bottom note */}
      <p
        style={{
          fontFamily: "'Lora', Georgia, serif",
          fontStyle: "italic",
          fontSize: "8.5pt",
          color: "#8A9A8D",
          textAlign: "center",
          lineHeight: 1.4,
          padding: "0 4pt",
          margin: 0,
        }}
      >
        {t.bottomNote}
      </p>

      {/* Footer — absolute positioned at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: "9mm",
          left: "14mm",
          right: "14mm",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontFamily: "'Lora', Georgia, serif",
            fontStyle: "italic",
            fontSize: "9pt",
            color: "#8A9A8D",
            margin: "0 0 4pt",
          }}
        >
          — Niklas Eriksson
        </p>
        <p
          style={{
            fontSize: "9pt",
            fontWeight: 700,
            color: "#1B6B35",
            margin: 0,
          }}
        >
          tipspromenaden.app
        </p>
      </div>
    </div>
  );
}

function Step({
  label,
  title,
  qr,
  caption,
}: {
  label: string;
  title: string;
  qr: string;
  caption: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <p
        style={{
          fontSize: "7.5pt",
          fontWeight: 700,
          color: "#1B6B35",
          letterSpacing: "0.18em",
          margin: "0 0 4pt",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "'Lora', Georgia, serif",
          fontWeight: 700,
          fontSize: "13pt",
          color: "#1B3D2B",
          margin: "0 0 10pt",
        }}
      >
        {title}
      </p>
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "8pt",
          padding: "6pt",
          display: "inline-block",
          marginBottom: "8pt",
        }}
      >
        {qr ? (
          <img
            src={qr}
            alt=""
            style={{ width: "96pt", height: "96pt", display: "block" }}
          />
        ) : (
          <div
            style={{
              width: "96pt",
              height: "96pt",
              background: "#F5F0E8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "8pt",
              color: "#8A9A8D",
            }}
          >
            …
          </div>
        )}
      </div>
      <p
        style={{
          fontSize: "8pt",
          color: "#2C3E2D",
          lineHeight: 1.35,
          margin: 0,
          padding: "0 2pt",
        }}
      >
        {caption}
      </p>
    </div>
  );
}

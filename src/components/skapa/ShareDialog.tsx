/**
 * @file ShareDialog.tsx
 * @description Dela-dialog med URL, QR-kod och native share-API.
 *
 * Genererar samma typ av delningslänk som mobil-appens shareWalk.ts:
 * `https://tipspromenaden.app/walk/<id>`. Den länken (efter v1.3.0)
 * öppnar appen direkt via Android App Links, eller faller tillbaka på
 * web-redirect → Play Store.
 *
 * QR-koden genereras lokalt via `qrcode`-paketet som canvas → data-URL.
 * Inget nätverksanrop, ingen externt beroende.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  walkId: string;
  walkTitle: string;
  onClose: () => void;
}

const WEB_HOST = "tipspromenaden.app";

function buildWalkLink(walkId: string): string {
  return `https://${WEB_HOST}/walk/${encodeURIComponent(walkId)}`;
}

export function ShareDialog({ walkId, walkTitle, onClose }: Props) {
  const link = buildWalkLink(walkId);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  // Generera QR-kod när dialogen öppnas
  useEffect(() => {
    QRCode.toDataURL(link, {
      errorCorrectionLevel: "M",
      width: 480,
      margin: 2,
      color: { dark: "#1B3D2B", light: "#F5F0E8" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [link]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function handleNativeShare() {
    try {
      await navigator.share({
        title: walkTitle,
        text: `Kolla in min tipspromenad: ${walkTitle} 🌳`,
        url: link,
      });
    } catch {
      // användaren avbröt eller inte stött — tyst
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[2000] p-4"
      onClick={onClose}
    >
      <div
        className="bg-cream rounded-2xl shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-2xl text-green-dark">Dela promenaden</h2>
          <button
            onClick={onClose}
            className="text-text-warm hover:text-green-dark text-2xl leading-none"
            aria-label="Stäng"
          >
            ×
          </button>
        </div>

        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="QR-kod till promenaden"
            className="w-full max-w-[320px] mx-auto rounded-xl mb-5"
          />
        ) : (
          <div className="aspect-square max-w-[320px] mx-auto rounded-xl bg-white/40 mb-5 flex items-center justify-center text-text-warm">
            Genererar QR…
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-text-warm mb-1">
              Länk
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white font-mono"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={handleCopy}
                className="bg-green-dark text-cream px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 whitespace-nowrap"
              >
                {copied ? "Kopierad!" : "Kopiera"}
              </button>
            </div>
          </div>

          {canNativeShare && (
            <button
              onClick={handleNativeShare}
              className="w-full bg-green text-cream px-4 py-3 rounded-lg font-semibold hover:opacity-90"
            >
              📤 Dela via systemmeny
            </button>
          )}

          <p className="text-xs text-text-warm leading-relaxed">
            Skicka länken via Messenger, SMS eller mejl. Mottagare med appen
            installerad öppnar promenaden direkt — andra hamnar på en sida som
            föreslår att ladda ner appen från Play Store.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * @file UploadTipspackDialog.tsx
 * @description Modal för att ladda upp en .tipspack-fil till
 * Firebase Storage + skapa metadata-doc i Firestore.
 *
 * Flöde:
 *   1. Användaren väljer fil (eller drar in)
 *   2. Vi parsar + validerar via parseTipspackFile()
 *   3. Slug genereras automatiskt från filnamnet
 *   4. Visa förhandsgranskning + synlighetsval
 *   5. Vid Spara: skriv Firestore-doc → ladda upp till Storage
 *   6. Stäng dialogen + kalla onUploaded() så listan kan refresha
 *
 * Synlighet är binär: 🌐 Publik (visas i /tipspack-listan) eller
 * 🔗 Hemlig länk (inte i listan, men URL fungerar). Filen är ALLTID
 * publikt nedladdningsbar — "hemlig" är obscurity, inte auth.
 */

import { useRef, useState } from "react";
import type { User } from "firebase/auth";
import { parseTipspackFile, slugFromFilename } from "../../lib/tipspack";
import {
  uploadTipspack,
  tipspackExists,
  type TipspackMeta,
} from "../../lib/tipspackLibrary";
import { Flag } from "../Flag";
import { useT, useLocale } from "./i18n";

interface Props {
  user: User;
  onClose: () => void;
  onUploaded: (meta: TipspackMeta) => void;
}

interface Preview {
  fileContent: string;
  filename: string;
  parsed: {
    name: string;
    description?: string;
    author?: string;
    language?: string;
    questions: { text: string }[];
  };
  slug: string;
  slugWasTaken: boolean;
}

export function UploadTipspackDialog({ user, onClose, onUploaded }: Props) {
  const t = useT();
  const lang = useLocale();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    const result = await parseTipspackFile(file);
    if (!result.success) {
      setError(result.error);
      return;
    }

    const initialSlug = slugFromFilename(file.name);
    if (!initialSlug) {
      setError(
        t(
          "Kunde inte generera ett slug från filnamnet. Döp om filen.",
          "Couldn't generate a slug from the filename. Rename the file."
        )
      );
      return;
    }

    const taken = await tipspackExists(initialSlug);
    const fileContent = await file.text();

    setPreview({
      fileContent,
      filename: file.name,
      parsed: result.battery,
      slug: initialSlug,
      slugWasTaken: taken,
    });
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  async function handleUpload() {
    if (!preview) return;
    setUploading(true);
    setError(null);
    try {
      const meta = await uploadTipspack({
        slug: preview.slug,
        ownerUid: user.uid,
        ownerName: user.displayName ?? undefined,
        fileContent: preview.fileContent,
        parsedJson: preview.parsed,
        isPublic,
      });
      onUploaded(meta);
      onClose();
    } catch (e: any) {
      setError(e?.message || t("Upload misslyckades", "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-[2000] p-4"
      onClick={onClose}
    >
      <div
        className="bg-cream rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-2xl text-green-dark">
            {t("Ladda upp tipspack", "Upload tipspack")}
          </h2>
          <button
            onClick={onClose}
            className="text-text-warm hover:text-green-dark text-2xl leading-none"
            aria-label={t("Stäng", "Close")}
          >
            ×
          </button>
        </div>

        {error && (
          <p className="mb-4 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
            {error}
          </p>
        )}

        {!preview ? (
          <>
            <p className="text-sm text-text-warm leading-relaxed mb-4">
              {t(
                "Välj en .tipspack-fil från disk eller drag-och-släpp den nedan. Filen valideras innan uppladdning.",
                "Pick a .tipspack file from disk or drag-and-drop it below. The file is validated before upload."
              )}
            </p>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${
                isDragging
                  ? "border-green-dark bg-green-dark/5"
                  : "border-rule hover:border-green-dark"
              }`}
            >
              <p className="text-3xl mb-2">📁</p>
              <p className="text-text-warm">
                {t(
                  "Klicka för att välja eller släpp filen här",
                  "Click to pick a file, or drop one here"
                )}
              </p>
              <p className="text-xs text-sage mt-1">{t("Max 5 MB", "Max 5 MB")}</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".tipspack,.json,application/json"
              onChange={onFileInput}
              className="hidden"
            />
          </>
        ) : (
          <>
            <div className="bg-white border border-rule rounded-xl p-4 mb-4">
              <p className="text-xs uppercase tracking-wide text-text-warm mb-2">
                {t("Förhandsgranskning", "Preview")}
              </p>
              <h3 className="font-serif text-xl text-green-dark mb-1 flex items-center gap-2">
                <Flag code={preview.parsed.language} height={18} />
                <span>{preview.parsed.name}</span>
              </h3>
              {preview.parsed.description && (
                <p className="text-sm text-text-warm mb-2 leading-relaxed">
                  {preview.parsed.description}
                </p>
              )}
              <p className="text-xs text-sage">
                {preview.parsed.questions.length} {t("frågor", "questions")}
                {preview.parsed.author && ` · ${preview.parsed.author}`}
                {" · slug: "}
                <code className="text-text-warm">{preview.slug}</code>
              </p>
              {preview.slugWasTaken && (
                <p className="mt-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-1.5">
                  {t(
                    `⚠️ Slug:en ${preview.slug} finns redan. Om du inte är ägaren kommer uppladdningen avvisas. Döp om filen och ladda upp på nytt om så är fallet.`,
                    `⚠️ The slug ${preview.slug} already exists. If you're not the owner the upload will be rejected. Rename the file and try again in that case.`
                  )}
                </p>
              )}
            </div>

            <fieldset className="mb-4">
              <legend className="text-xs uppercase tracking-wide text-text-warm mb-2">
                {t("Synlighet", "Visibility")}
              </legend>
              <label className="flex items-start gap-3 mb-2 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  checked={isPublic}
                  onChange={() => setIsPublic(true)}
                  className="mt-1 accent-green-dark"
                />
                <span className="text-sm">
                  <strong>{t("🌐 Publik", "🌐 Public")}</strong>
                  <br />
                  <span className="text-text-warm">
                    {t(
                      `Visas i biblioteket på ${lang === "en" ? "/en/tipspack" : "/tipspack"}. Vem som helst kan upptäcka och använda paketet.`,
                      `Listed in the library at ${lang === "en" ? "/en/tipspack" : "/tipspack"}. Anyone can discover and use the pack.`
                    )}
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  checked={!isPublic}
                  onChange={() => setIsPublic(false)}
                  className="mt-1 accent-green-dark"
                />
                <span className="text-sm">
                  <strong>{t("🔗 Hemlig länk", "🔗 Secret link")}</strong>
                  <br />
                  <span className="text-text-warm">
                    {t(
                      "Inte synlig i listan, men URL:en fungerar för alla med länken. Bra för familj/vän-grupper.",
                      "Not listed, but the URL works for anyone with the link. Good for family/friend groups."
                    )}
                  </span>
                </span>
              </label>
            </fieldset>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPreview(null)}
                className="text-text-warm px-4 py-2 hover:underline"
                disabled={uploading}
              >
                {t("Välj annan fil", "Pick another file")}
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="bg-green-dark text-cream px-6 py-2 rounded-full font-semibold shadow hover:shadow-md transition disabled:opacity-50"
              >
                {uploading
                  ? t("Laddar upp…", "Uploading…")
                  : t("Ladda upp", "Upload")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

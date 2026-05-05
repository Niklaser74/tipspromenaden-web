/**
 * @file BatchUploadDropZone.tsx
 * @description Drop-area + multi-file-picker för att ladda upp många
 *   .tipspack-filer i en svep från admin-vyn.
 *
 * Per fil:
 *   1. parseTipspackFile (validering + parse)
 *   2. Slug genereras från filnamnet
 *   3. tipspackExists()-check — om existerande tipspack finns:
 *      - Ägd av oss: hoppa över (vi vill inte överskriva andras)
 *      - Ny slug: gå vidare
 *   4. uploadTipspack — defaultar `isPublic: false` (admin sätter
 *      synlighet via Mina paket-kortets toggle efteråt)
 *   5. Status-rad uppdateras: väntar → uppladdar → klar | fel | hoppat
 *
 * Sequential upload (inte parallel) — Firestore har queue-limits per
 * write, och vi vill inte att en buggig fil tar ner hela batchen.
 */

import { useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  parseTipspackFile,
  slugFromFilename,
} from "../../lib/tipspack";
import {
  uploadTipspack,
  tipspackExists,
} from "../../lib/tipspackLibrary";

type FileStatus =
  | { kind: "pending" }
  | { kind: "uploading" }
  | { kind: "done"; slug: string }
  | { kind: "skipped"; reason: string }
  | { kind: "error"; message: string };

interface FileEntry {
  file: File;
  status: FileStatus;
}

interface Props {
  user: User;
  onUploaded: () => void;
}

export default function BatchUploadDropZone({ user, onUploaded }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [makePublic, setMakePublic] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list).filter((f) =>
      f.name.toLowerCase().endsWith(".tipspack") ||
      f.name.toLowerCase().endsWith(".json")
    );
    if (arr.length === 0) return;
    setFiles((prev) => [
      ...prev,
      ...arr.map((file) => ({ file, status: { kind: "pending" } as FileStatus })),
    ]);
  }

  async function processAll() {
    if (busy) return;
    setBusy(true);
    // Snapshotta filerna efter pending — men behåll redan-klara orörda.
    const snapshot = [...files];
    for (let i = 0; i < snapshot.length; i++) {
      if (snapshot[i].status.kind !== "pending") continue;
      await processOne(i);
    }
    setBusy(false);
    onUploaded();
  }

  async function processOne(index: number) {
    setFileStatus(index, { kind: "uploading" });
    const entry = files[index] ?? (await snapshotEntry(index));
    if (!entry) return;

    const file = entry.file;
    try {
      const parsed = await parseTipspackFile(file);
      if (!parsed.success) {
        setFileStatus(index, { kind: "error", message: parsed.error });
        return;
      }
      const slug = slugFromFilename(file.name);
      if (!slug || slug.length < 1) {
        setFileStatus(index, {
          kind: "error",
          message: "Filnamnet ger ingen giltig slug.",
        });
        return;
      }
      if (await tipspackExists(slug)) {
        setFileStatus(index, {
          kind: "skipped",
          reason: `Slug "${slug}" finns redan. Döp om filen om du vill ladda upp en kopia.`,
        });
        return;
      }
      const fileContent = await file.text();
      await uploadTipspack({
        slug,
        ownerUid: user.uid,
        ownerName: user.displayName ?? undefined,
        fileContent,
        parsedJson: parsed.battery,
        isPublic: makePublic,
      });
      setFileStatus(index, { kind: "done", slug });
    } catch (e: any) {
      setFileStatus(index, {
        kind: "error",
        message: e?.message || "Okänt fel",
      });
    }
  }

  // Helper för att läsa state asynkront (setFiles är queued).
  async function snapshotEntry(index: number): Promise<FileEntry | null> {
    return new Promise((resolve) => {
      setFiles((curr) => {
        resolve(curr[index] ?? null);
        return curr;
      });
    });
  }

  function setFileStatus(index: number, status: FileStatus) {
    setFiles((curr) =>
      curr.map((f, i) => (i === index ? { ...f, status } : f))
    );
  }

  function clearDone() {
    setFiles((curr) => curr.filter((f) => f.status.kind === "pending"));
  }

  return (
    <div className="bg-white border border-rule rounded-xl p-4 mb-4">
      <h3 className="font-serif text-lg text-green-dark mb-2">
        📥 Batch-uppladdning
      </h3>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition ${
          dragOver
            ? "border-green-dark bg-green-dark/5"
            : "border-rule hover:border-green-dark"
        }`}
      >
        <p className="text-2xl mb-1">📁</p>
        <p className="text-sm text-text-warm">
          Släpp .tipspack-filer här eller klicka för att välja
        </p>
        <p className="text-xs text-sage mt-1">
          Max 5 MB per fil. Slug auto-genereras från filnamn.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".tipspack,.json,application/json"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
          className="hidden"
        />
      </div>

      <label className="flex items-center gap-2 mt-3 text-sm text-text-warm cursor-pointer">
        <input
          type="checkbox"
          checked={makePublic}
          onChange={(e) => setMakePublic(e.target.checked)}
          className="accent-green-dark"
        />
        Sätt synlighet till <strong>publik</strong> direkt
        <span className="text-xs text-sage">
          (annars hemlig länk — kan togglas senare)
        </span>
      </label>

      {files.length > 0 && (
        <>
          <div className="flex gap-2 mt-4">
            <button
              onClick={processAll}
              disabled={busy || files.every((f) => f.status.kind !== "pending")}
              className="bg-green-dark text-cream px-4 py-1.5 rounded-full text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Laddar upp…" : `Ladda upp ${files.filter((f) => f.status.kind === "pending").length} st`}
            </button>
            <button
              onClick={clearDone}
              disabled={busy}
              className="text-xs text-text-warm hover:underline disabled:opacity-50"
            >
              Rensa klara/skippade
            </button>
          </div>
          <ul className="mt-3 space-y-1.5">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 text-sm border-b border-rule/60 last:border-0 pb-1.5"
              >
                <span className="font-mono text-xs text-text-warm truncate">
                  {f.file.name}
                </span>
                <StatusPill status={f.status} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: FileStatus }) {
  const map = {
    pending: { label: "Väntar", cls: "bg-sage/20 text-text-warm" },
    uploading: { label: "Laddar upp…", cls: "bg-green-dark/10 text-green-dark" },
    done: { label: "✓ Klar", cls: "bg-green-dark/15 text-green-dark" },
    skipped: { label: "Hoppad", cls: "bg-orange-100 text-orange-900" },
    error: { label: "Fel", cls: "bg-red-100 text-red-900" },
  } as const;
  const m = map[status.kind];
  const tooltip =
    status.kind === "skipped"
      ? status.reason
      : status.kind === "error"
      ? status.message
      : status.kind === "done"
      ? `Slug: ${status.slug}`
      : "";
  return (
    <span
      title={tooltip}
      className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

/**
 * @file EventsManager.tsx
 * @description Admin-flik för att skapa/redigera/radera events (sponsorade
 * branded customizations av appen) och generera QR-koder som öppnar appen
 * direkt i event-läge.
 *
 * Använder `lib/events.ts` för Firestore-I/O. Renderar:
 *   - Lista över befintliga events med stats (walks-filter, datumintervall)
 *   - Skapa-nytt-formulär (modal)
 *   - Redigera-formulär (samma modal, för-fyllt)
 *   - Per-event-knapp för att visa QR-kod (genereras klient-side med qrcode)
 *
 * QR-koden innehåller `tipspromenaden://event/<id>` → ScanQRScreen i appen
 * känner igen den och routar till OpenEventScreen → aktiverar event-läge.
 */

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import type { User } from "firebase/auth";
import {
  buildEventDeepLink,
  deleteEvent,
  EVENT_LOGO_MAX_SIZE,
  isValidEventId,
  listEvents,
  saveEvent,
  uploadEventLogo,
  type EventBranding,
} from "../../lib/events";
import type { Walk } from "../../lib/types";

interface Props {
  user: User;
  walks: Walk[];
}

export default function EventsManager({ user, walks }: Props) {
  const [events, setEvents] = useState<EventBranding[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<
    | { mode: "create" }
    | { mode: "edit"; event: EventBranding }
    | null
  >(null);
  const [qrFor, setQrFor] = useState<EventBranding | null>(null);

  async function refresh() {
    try {
      const list = await listEvents();
      // Sortera: senast uppdaterade först, sen alfabetiskt
      list.sort((a, b) => {
        if (a.updatedAt && b.updatedAt) return b.updatedAt - a.updatedAt;
        if (a.updatedAt) return -1;
        if (b.updatedAt) return 1;
        return a.name.localeCompare(b.name);
      });
      setEvents(list);
    } catch (e: any) {
      setError(e?.message || "Kunde inte hämta events");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Radera "${name}"? Det går inte att ångra.`)) return;
    try {
      await deleteEvent(id);
      await refresh();
    } catch (e: any) {
      alert("Kunde inte radera: " + (e?.message || ""));
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-serif text-xl text-green-dark">Events</h2>
        <button
          onClick={() => setEditor({ mode: "create" })}
          className="bg-green-dark text-cream px-4 py-1.5 rounded-full text-sm font-semibold shadow"
        >
          ➕ Nytt event
        </button>
      </div>

      <p className="text-sm text-text-warm mb-4 max-w-2xl">
        Events anpassar appen med eget namn, logo, färger och valfri lista
        över vilka walks som ska synas i biblioteket. Deltagarna aktiverar
        via QR-kod (genereras under varje event nedan) eller manuell
        kod-input i Inställningar → Event-läge.
      </p>

      {error && (
        <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {events === null && <p className="text-text-warm">Hämtar events…</p>}

      {events && events.length === 0 && (
        <div className="bg-white border border-rule rounded-xl p-6 text-sm text-text-warm">
          Inga events än. Klicka "➕ Nytt event" för att skapa det första.
        </div>
      )}

      {events && events.length > 0 && (
        <ul className="space-y-3">
          {events.map((ev) => (
            <EventRow
              key={ev.id}
              event={ev}
              walks={walks}
              onEdit={() => setEditor({ mode: "edit", event: ev })}
              onDelete={() => handleDelete(ev.id, ev.name)}
              onShowQR={() => setQrFor(ev)}
            />
          ))}
        </ul>
      )}

      {editor && (
        <EventEditor
          mode={editor.mode}
          initial={editor.mode === "edit" ? editor.event : undefined}
          walks={walks}
          user={user}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await refresh();
          }}
        />
      )}

      {qrFor && <QRDialog event={qrFor} onClose={() => setQrFor(null)} />}
    </>
  );
}

function EventRow(props: {
  event: EventBranding;
  walks: Walk[];
  onEdit: () => void;
  onDelete: () => void;
  onShowQR: () => void;
}) {
  const { event, walks, onEdit, onDelete, onShowQR } = props;
  const walkCount = event.walkIds?.length ?? 0;
  const matchedWalks = event.walkIds
    ? walks.filter((w) => event.walkIds!.includes(w.id))
    : [];

  return (
    <li className="bg-white border border-rule rounded-xl p-4">
      <div className="flex items-start gap-3">
        {event.logoUrl ? (
          <img
            src={event.logoUrl}
            alt=""
            className="w-12 h-12 rounded object-contain bg-cream"
          />
        ) : (
          <div
            className="w-12 h-12 rounded flex items-center justify-center text-xl"
            style={{ background: event.primaryColor || "#1B6B35", color: "#F5F0E8" }}
          >
            🏁
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-green-dark">{event.name}</h3>
            <code className="text-xs bg-cream px-2 py-0.5 rounded text-text-warm">
              {event.id}
            </code>
          </div>
          <div className="text-xs text-text-warm mt-1 space-x-3">
            {walkCount > 0 ? (
              <span>📍 {walkCount} walks</span>
            ) : (
              <span className="italic">Visar alla walks</span>
            )}
            {event.startDate && <span>📅 {event.startDate}</span>}
            {event.endDate && <span>→ {event.endDate}</span>}
            {event.primaryColor && (
              <span className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-3 h-3 rounded-full border border-rule"
                  style={{ background: event.primaryColor }}
                />
                {event.primaryColor}
              </span>
            )}
          </div>
          {matchedWalks.length > 0 && matchedWalks.length <= 3 && (
            <p className="text-xs text-text-warm mt-1 truncate">
              {matchedWalks.map((w) => w.title).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onShowQR}
            className="text-xs bg-green-dark text-cream px-3 py-1 rounded-full font-semibold"
          >
            📱 QR
          </button>
          <button
            onClick={onEdit}
            className="text-xs bg-white border border-rule text-text-warm px-3 py-1 rounded-full hover:border-green-dark"
          >
            Redigera
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-red-700 hover:underline"
          >
            Radera
          </button>
        </div>
      </div>
    </li>
  );
}

function EventEditor(props: {
  mode: "create" | "edit";
  initial?: EventBranding;
  walks: Walk[];
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { mode, initial, walks, user, onClose, onSaved } = props;

  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? "");
  const [primaryColor, setPrimaryColor] = useState(initial?.primaryColor ?? "#1B6B35");
  const [accentColor, setAccentColor] = useState(initial?.accentColor ?? "#C8362D");
  const [secondaryColor, setSecondaryColor] = useState(initial?.secondaryColor ?? "");
  const [welcomeSv, setWelcomeSv] = useState(initial?.welcomeText?.sv ?? "");
  const [welcomeEn, setWelcomeEn] = useState(initial?.welcomeText?.en ?? "");
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [walkIds, setWalkIds] = useState<Set<string>>(
    new Set(initial?.walkIds ?? [])
  );
  const [walkSearch, setWalkSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleLogoUpload(file: File) {
    // Verifiera event-id innan upload — Storage-path kräver det.
    if (!isValidEventId(id)) {
      setFormError(
        "Ange en giltig event-kod ovan innan du laddar upp en logo (Storage-path:en kräver den)."
      );
      return;
    }
    setFormError(null);
    setUploading(true);
    try {
      const url = await uploadEventLogo(id, file);
      setLogoUrl(url);
    } catch (e: any) {
      setFormError(e?.message || "Kunde inte ladda upp logo");
    } finally {
      setUploading(false);
    }
  }

  const filteredWalks = useMemo(() => {
    const term = walkSearch.trim().toLowerCase();
    if (!term) return walks;
    return walks.filter(
      (w) =>
        w.title.toLowerCase().includes(term) ||
        w.id.toLowerCase().includes(term) ||
        (w.city?.toLowerCase().includes(term) ?? false)
    );
  }, [walks, walkSearch]);

  function toggleWalk(walkId: string) {
    const next = new Set(walkIds);
    if (next.has(walkId)) next.delete(walkId);
    else next.add(walkId);
    setWalkIds(next);
  }

  async function handleSave() {
    setFormError(null);
    if (!isValidEventId(id)) {
      setFormError("Ogiltig event-kod. Använd a-z, A-Z, 0-9, _, - (max 100 tecken).");
      return;
    }
    if (!name.trim()) {
      setFormError("Event-namn krävs.");
      return;
    }
    setSaving(true);
    try {
      await saveEvent(
        {
          id,
          name: name.trim(),
          logoUrl: logoUrl.trim() || undefined,
          primaryColor: primaryColor || undefined,
          accentColor: accentColor || undefined,
          secondaryColor: secondaryColor || undefined,
          welcomeText:
            welcomeSv.trim() || welcomeEn.trim()
              ? {
                  sv: welcomeSv.trim() || undefined,
                  en: welcomeEn.trim() || undefined,
                }
              : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          walkIds: walkIds.size > 0 ? [...walkIds] : undefined,
        },
        user.uid
      );
      onSaved();
    } catch (e: any) {
      setFormError(e?.message || "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 my-8 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-2xl text-green-dark mb-4">
          {mode === "create" ? "Nytt event" : `Redigera ${initial?.name}`}
        </h2>

        {formError && (
          <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-sm">
            {formError}
          </p>
        )}

        <div className="space-y-4">
          {/* Event-kod (id) */}
          <Field
            label="Event-kod (id)"
            hint="Används i QR-koden och som identifierare. Endast a-z, A-Z, 0-9, _, -. Kan inte ändras efter skapande."
          >
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value.toLowerCase())}
              placeholder="eventkod"
              disabled={mode === "edit"}
              className="w-full border border-rule rounded px-3 py-2 font-mono text-sm disabled:bg-cream disabled:text-text-warm"
            />
          </Field>

          <Field label="Visningsnamn" hint="Visas i hero på startskärmen och i banner.">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Event"
              className="w-full border border-rule rounded px-3 py-2"
            />
          </Field>

          <Field
            label="Logo"
            hint={`Ladda upp en bild (PNG/JPG/SVG/WebP, max ${Math.round(EVENT_LOGO_MAX_SIZE / 1024)} KB) eller klistra in en publik URL. Rekommenderat ~96 px hög.`}
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="bg-white border border-rule text-text-warm px-3 py-1.5 rounded-full text-sm font-semibold cursor-pointer hover:border-green-dark">
                  {uploading ? "Laddar upp…" : "📤 Välj fil…"}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleLogoUpload(f);
                      // Tillåt samma fil väljas igen (t.ex. efter fel)
                      e.target.value = "";
                    }}
                  />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl("")}
                    className="text-xs text-red-700 hover:underline"
                  >
                    Ta bort logo
                  </button>
                )}
              </div>
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="…eller https://example.com/logo.png"
                className="w-full border border-rule rounded px-3 py-2 text-sm"
              />
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="förhandsgranskning"
                  className="h-16 object-contain bg-cream rounded p-2 border border-rule self-start"
                />
              )}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Primärfärg" hint="Header, hero, banner.">
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-12 border border-rule rounded"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="flex-1 border border-rule rounded px-3 py-2 font-mono text-sm"
                />
              </div>
            </Field>
            <Field label="Accentfärg" hint="Pin på kartan.">
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-10 w-12 border border-rule rounded"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="flex-1 border border-rule rounded px-3 py-2 font-mono text-sm"
                />
              </div>
            </Field>
          </div>

          <Field
            label="Sekundärfärg (valfri)"
            hint='"Skapa promenad"-kortet och andra supporterande ytor. Lämna tom så används primärfärgen där också.'
          >
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={secondaryColor || "#1B6B35"}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-10 w-12 border border-rule rounded"
              />
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                placeholder="ex. #2D7A3A — lämna tom för att återanvända primär"
                className="flex-1 border border-rule rounded px-3 py-2 font-mono text-sm"
              />
              {secondaryColor && (
                <button
                  type="button"
                  onClick={() => setSecondaryColor("")}
                  className="text-xs text-red-700 hover:underline shrink-0"
                >
                  Rensa
                </button>
              )}
            </div>
          </Field>

          <Field label="Välkomsttext (svenska)" hint="Visas när användaren aktiverat event:et.">
            <textarea
              value={welcomeSv}
              onChange={(e) => setWelcomeSv(e.target.value)}
              rows={2}
              placeholder="Välkommen till vårt event!"
              className="w-full border border-rule rounded px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Välkomsttext (engelska)" hint="Visas för engelska användare.">
            <textarea
              value={welcomeEn}
              onChange={(e) => setWelcomeEn(e.target.value)}
              rows={2}
              placeholder="Welcome to our event!"
              className="w-full border border-rule rounded px-3 py-2 text-sm"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Startdatum" hint="ISO-format (YYYY-MM-DD)">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-rule rounded px-3 py-2 text-sm"
              />
            </Field>
            <Field
              label="Slutdatum"
              hint="Efter detta auto-avslutar appen event-läget."
            >
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-rule rounded px-3 py-2 text-sm"
              />
            </Field>
          </div>

          <Field
            label={`Walks i biblioteket (${walkIds.size} valda)`}
            hint="Lämna tomt för att visa alla publika walks i biblioteket. Annars filtreras Upptäck-fliken till bara dessa."
          >
            <input
              type="search"
              value={walkSearch}
              onChange={(e) => setWalkSearch(e.target.value)}
              placeholder="Sök walks…"
              className="w-full border border-rule rounded px-3 py-2 text-sm mb-2"
            />
            <div className="max-h-48 overflow-y-auto border border-rule rounded">
              {filteredWalks.slice(0, 100).map((w) => (
                <label
                  key={w.id}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-cream cursor-pointer border-b border-rule/40 last:border-b-0"
                >
                  <input
                    type="checkbox"
                    checked={walkIds.has(w.id)}
                    onChange={() => toggleWalk(w.id)}
                  />
                  <span className="text-sm flex-1 truncate">{w.title}</span>
                  {w.city && (
                    <span className="text-xs text-text-warm">{w.city}</span>
                  )}
                </label>
              ))}
              {filteredWalks.length === 0 && (
                <p className="text-xs text-text-warm p-3">Inga walks matchar.</p>
              )}
              {filteredWalks.length > 100 && (
                <p className="text-xs text-text-warm p-2 border-t border-rule">
                  Visar 100 av {filteredWalks.length}. Sök för att filtrera.
                </p>
              )}
            </div>
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-text-warm hover:underline"
          >
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-dark text-cream px-6 py-2 rounded-full font-semibold shadow disabled:opacity-50"
          >
            {saving ? "Sparar…" : "Spara"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field(props: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-green-dark mb-1">
        {props.label}
      </label>
      {props.hint && (
        <p className="text-xs text-text-warm mb-1">{props.hint}</p>
      )}
      {props.children}
    </div>
  );
}

function QRDialog(props: { event: EventBranding; onClose: () => void }) {
  const { event, onClose } = props;
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const deepLink = buildEventDeepLink(event.id);

  useEffect(() => {
    QRCode.toDataURL(deepLink, {
      width: 640,
      margin: 2,
      color: { dark: "#1B3D2B", light: "#F5F0E8" },
      errorCorrectionLevel: "M",
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [deepLink]);

  function handleDownload() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `event-${event.id}.png`;
    a.click();
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(deepLink).catch(() => {});
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-xl text-green-dark mb-2">
          QR-kod för {event.name}
        </h2>
        <p className="text-sm text-text-warm mb-4">
          Skriv ut, skicka eller projicera. När någon skannar den med
          Tipspromenaden-appen aktiveras event-läget direkt.
        </p>

        {dataUrl ? (
          <img
            src={dataUrl}
            alt={`QR-kod för ${event.id}`}
            className="w-full h-auto border border-rule rounded-lg bg-cream"
          />
        ) : (
          <div className="aspect-square bg-cream rounded-lg flex items-center justify-center text-text-warm text-sm">
            Genererar QR-kod…
          </div>
        )}

        <div className="mt-3 bg-cream rounded p-2 text-xs font-mono break-all text-text-warm select-all">
          {deepLink}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleDownload}
            disabled={!dataUrl}
            className="flex-1 bg-green-dark text-cream px-4 py-2 rounded-full text-sm font-semibold shadow disabled:opacity-50"
          >
            ⬇️ Ladda ner PNG
          </button>
          <button
            onClick={handleCopyLink}
            className="flex-1 bg-white border border-rule text-text-warm px-4 py-2 rounded-full text-sm font-semibold hover:border-green-dark"
          >
            📋 Kopiera länk
          </button>
        </div>

        <button
          onClick={onClose}
          className="block mx-auto mt-3 text-xs text-text-warm hover:underline"
        >
          Stäng
        </button>
      </div>
    </div>
  );
}

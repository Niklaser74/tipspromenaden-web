/**
 * @file DownloadsWidget.tsx
 * @description Visar manuellt registrerade nedladdningssiffror från
 * Play Console + App Store Connect, plus en redigera-modal.
 *
 * Mountas i admin-dashboardens Översikt-flik. Hela widget:en är inert
 * tills någon klickat "Uppdatera siffror" och fyllt i — då sparas
 * Firestore-doc:en `stats/downloads`.
 */

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  APP_STORE_CONNECT_URL,
  PLAY_CONSOLE_URL,
  formatRelativeTime,
  getDownloadStats,
  saveDownloadStats,
  type DownloadStats,
} from "../../lib/downloads";
import { HelpIcon } from "../HelpIcon";

interface Props {
  user: User;
}

export default function DownloadsWidget({ user }: Props) {
  const [stats, setStats] = useState<DownloadStats | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const data = await getDownloadStats();
      setStats(data);
    } catch (e: any) {
      setError(e?.message || "Kunde inte hämta nedladdningssiffror");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (stats === null) {
    return (
      <div className="bg-white border border-rule rounded-xl p-4 mb-6 text-sm text-text-warm">
        Laddar nedladdningssiffror…
      </div>
    );
  }

  const hasData =
    stats.androidInstalls !== undefined ||
    stats.androidActive !== undefined ||
    stats.iosUnits !== undefined ||
    stats.iosDownloads !== undefined;

  return (
    <>
      <div className="bg-white border border-rule rounded-xl p-5 mb-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-serif text-lg text-green-dark">
              📲 Nedladdningar
              <HelpIcon
                text="Manuellt registrerade siffror — uppdaterar dig själv 1×/vecka från Play Console + App Store Connect. Auto-fetch via API:erna kommer senare."
              />
            </h2>
            {stats.updatedAt && (
              <p className="text-xs text-sage mt-0.5">
                {stats.updatedBy === "auto-fetch" ? "🤖 Auto" : "✍️ Manuell"}{" "}
                · senast uppdaterad {formatRelativeTime(stats.updatedAt)}
              </p>
            )}
          </div>
          <button
            onClick={() => setEditing(true)}
            title="Öppna formulär för att fylla i nya siffror från Play Console + App Store Connect."
            className="text-xs bg-green-dark text-cream px-4 py-1.5 rounded-full font-semibold shadow whitespace-nowrap"
          >
            ✏️ Uppdatera siffror
          </button>
        </div>

        {!hasData ? (
          <div className="bg-cream/60 border border-rule rounded-lg p-4 text-sm text-text-warm">
            <p className="mb-2">
              Inga siffror ifyllda än. Hämta dem från konsolerna och klicka{" "}
              <em>Uppdatera siffror</em>.
            </p>
            <div className="flex gap-3 mt-3">
              <a
                href={PLAY_CONSOLE_URL}
                target="_blank"
                rel="noopener"
                title="Öppna Play Console-statistiken i ny flik."
                className="text-xs text-green-dark hover:underline"
              >
                🔗 Play Console
              </a>
              <a
                href={APP_STORE_CONNECT_URL}
                target="_blank"
                rel="noopener"
                title="Öppna App Store Connect Analytics i ny flik."
                className="text-xs text-green-dark hover:underline"
              >
                🔗 App Store Connect
              </a>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              icon="🤖"
              label="Android"
              consoleLink={PLAY_CONSOLE_URL}
              consoleLabel="Play Console →"
              primary={{
                value: stats.androidInstalls,
                label: "Totala installationer",
                help: "Kumulativt antal lyckade installs. Räknar samma användare flera gånger om hen ominstallerar.",
              }}
              secondary={{
                value: stats.androidActive,
                label: "Aktiva installationer",
                help: "Enheter där appen finns just nu. Visar tillväxt netto efter avinstallationer.",
              }}
            />
            <StatCard
              icon=""
              label="iOS"
              consoleLink={APP_STORE_CONNECT_URL}
              consoleLabel="App Store Connect →"
              primary={{
                value: stats.iosUnits,
                label: "App-enheter",
                help: 'Unika Apple-ID:n som laddat ner — Apple kallar det "App Units". Mest jämförbart med Androids "aktiva".'
              }}
              secondary={{
                value: stats.iosDownloads,
                label: "Totala nedladdningar",
                help: "Inkluderar re-downloads, automatiska uppdateringar och installation på extra enheter.",
              }}
            />
          </div>
        )}

        {stats.notes && (
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-text-warm">
            <strong>Notering:</strong> {stats.notes}
          </div>
        )}
      </div>

      {editing && (
        <EditModal
          initial={stats}
          user={user}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function StatCard(props: {
  icon: string;
  label: string;
  consoleLink: string;
  consoleLabel: string;
  primary: { value?: number; label: string; help: string };
  secondary: { value?: number; label: string; help: string };
}) {
  return (
    <div className="bg-cream/40 border border-rule rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-green-dark text-sm">
          {props.icon}  {props.label}
        </h3>
        <a
          href={props.consoleLink}
          target="_blank"
          rel="noopener"
          className="text-[10px] text-text-warm hover:underline"
        >
          {props.consoleLabel}
        </a>
      </div>
      <div className="space-y-2">
        <Metric {...props.primary} large />
        <Metric {...props.secondary} />
      </div>
    </div>
  );
}

function Metric(props: {
  value?: number;
  label: string;
  help: string;
  large?: boolean;
}) {
  return (
    <div>
      <p
        className={`font-mono font-bold text-green-dark ${
          props.large ? "text-2xl" : "text-base"
        }`}
      >
        {props.value !== undefined ? props.value.toLocaleString("sv-SE") : "—"}
      </p>
      <p className="text-[11px] text-text-warm leading-tight">
        {props.label}
        <HelpIcon text={props.help} />
      </p>
    </div>
  );
}

function EditModal(props: {
  initial: DownloadStats;
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { initial, user, onClose, onSaved } = props;

  const [androidInstalls, setAndroidInstalls] = useState(
    initial.androidInstalls?.toString() ?? ""
  );
  const [androidActive, setAndroidActive] = useState(
    initial.androidActive?.toString() ?? ""
  );
  const [iosUnits, setIosUnits] = useState(initial.iosUnits?.toString() ?? "");
  const [iosDownloads, setIosDownloads] = useState(
    initial.iosDownloads?.toString() ?? ""
  );
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function parseNumber(s: string): number | undefined {
    const trimmed = s.trim().replace(/\s/g, "");
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }

  async function handleSave() {
    setFormError(null);
    setSaving(true);
    try {
      await saveDownloadStats(
        {
          androidInstalls: parseNumber(androidInstalls),
          androidActive: parseNumber(androidActive),
          iosUnits: parseNumber(iosUnits),
          iosDownloads: parseNumber(iosDownloads),
          notes: notes.trim() || undefined,
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
        className="bg-white rounded-xl shadow-2xl max-w-xl w-full mx-4 my-8 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-serif text-2xl text-green-dark mb-2">
          Uppdatera nedladdningssiffror
        </h2>
        <p className="text-sm text-text-warm mb-4">
          Öppna konsolerna, kopiera siffrorna, klistra in här. Tomt fält
          betyder "vet inte" och visas som — i widget:en.
        </p>

        {formError && (
          <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-sm">
            {formError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-cream/50 rounded-lg p-3">
            <h3 className="text-sm font-semibold text-green-dark mb-2 flex items-center gap-1">
              🤖 Android
              <a
                href={PLAY_CONSOLE_URL}
                target="_blank"
                rel="noopener"
                className="text-[10px] text-text-warm hover:underline ml-auto"
              >
                Öppna →
              </a>
            </h3>
            <NumField
              label="Totala installationer"
              value={androidInstalls}
              onChange={setAndroidInstalls}
              help='Kumulativt — kallas "Lifetime installs" eller "Totala installationer" i Play Console-statistiken.'
            />
            <NumField
              label="Aktiva installationer"
              value={androidActive}
              onChange={setAndroidActive}
              help='Visas som "Aktiva enheter med appen". Räknar netto efter avinstallationer.'
            />
          </div>

          <div className="bg-cream/50 rounded-lg p-3">
            <h3 className="text-sm font-semibold text-green-dark mb-2 flex items-center gap-1">
               iOS
              <a
                href={APP_STORE_CONNECT_URL}
                target="_blank"
                rel="noopener"
                className="text-[10px] text-text-warm hover:underline ml-auto"
              >
                Öppna →
              </a>
            </h3>
            <NumField
              label="App-enheter"
              value={iosUnits}
              onChange={setIosUnits}
              help='Apple kallar det "App Units" — unika Apple-ID:n. Filtrera tidsperiod till "All time" för totalsiffran.'
            />
            <NumField
              label="Totala nedladdningar"
              value={iosDownloads}
              onChange={setIosDownloads}
              help='"Total Downloads" — inkluderar re-downloads, uppdateringar, extra enheter.'
            />
          </div>
        </div>

        <label className="block text-sm font-semibold text-green-dark mb-1">
          Notering (valfritt)
          <HelpIcon text="Lägg in en kort kommentar — t.ex. om en stor traffic-spike eller om siffror inte hunnit uppdateras." />
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="t.ex. Topp 10 i 'Hälsa & träning' under första veckan"
          className="w-full border border-rule rounded px-3 py-2 text-sm"
        />

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={saving}
            title="Stäng utan att spara."
            className="px-4 py-2 text-sm text-text-warm hover:underline"
          >
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            title="Spara siffrorna till Firestore-doc:en stats/downloads."
            className="bg-green-dark text-cream px-6 py-2 rounded-full font-semibold shadow disabled:opacity-50"
          >
            {saving ? "Sparar…" : "Spara"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NumField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help: string;
}) {
  return (
    <div className="mb-2">
      <label className="block text-[11px] text-text-warm leading-tight">
        {props.label}
        <HelpIcon text={props.help} />
      </label>
      <input
        type="text"
        inputMode="numeric"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder="0"
        className="w-full border border-rule rounded px-2 py-1 font-mono text-sm bg-white"
      />
    </div>
  );
}

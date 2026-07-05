/**
 * @file AdminDashboard.tsx
 * @description Moderationsdashboard på /admin.
 *
 * Login-gated via Firebase Auth + ADMIN_UIDS-listan i lib/admin.ts.
 * Icke-admin får se sin UID så de kan kopiera till listan om det är
 * deras egna sida.
 *
 * Dashboard-flikar:
 *   - Översikt: aggregerade counts + topp-walks efter sessions
 *   - Walks: alla publika walks, expanderbara med frågor + facit, flag-knapp
 *   - Tipspacks: alla tipspacks (curated + uppladdade), expanderbara, flag-knapp
 *   - Sessioner: senaste sessioner per walk
 *
 * Klient-side aggregering — funkar bra på hobby-skala. Vid hundratals
 * walks och tusentals sessioner blir det dyrt; flytta till Cloud Function
 * om det blir aktuellt.
 */

import { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { auth, googleProvider, db } from "../../lib/firebase";
import {
  ADMIN_UIDS,
  isAdmin,
  getModerationFlags,
  setWalkHidden,
  setTipspackHidden,
  type ModerationFlags,
} from "../../lib/admin";
import {
  getAllTipspacks,
  getDownloadUrl,
  type TipspackMeta,
} from "../../lib/tipspackLibrary";
import { getCuratedTipspacks } from "../../lib/curatedTipspacks";
import {
  getAllFeedback,
  aggregateByWalk,
  overallStats,
  type FeedbackAggregate,
  type FeedbackOverall,
} from "../../lib/feedback";
import type { Walk } from "../../lib/types";
import { Flag } from "../Flag";
import WalkMiniMap from "./WalkMiniMap";
import BatchUploadDropZone from "./BatchUploadDropZone";
import TipspackEditor from "./TipspackEditor";
import { FlyerDialog } from "./FlyerDialog";
import EventsManager from "./EventsManager";
import SupportersManager from "./SupportersManager";
import DownloadsWidget from "./DownloadsWidget";

type Tab =
  | "overview"
  | "walks"
  | "tipspacks"
  | "events"
  | "supporters"
  | "sessions";

interface CuratedPack {
  slug: string;
  name: string;
  description?: string;
  author?: string;
  language?: string;
  questionCount: number;
  fileSizeBytes: number;
}

interface SessionDoc {
  id: string;
  walkId: string;
  status: "waiting" | "active" | "completed";
  createdAt?: number;
}

export default function AdminDashboard() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) {
    return <p className="text-text-warm">Laddar…</p>;
  }

  if (user === null) {
    return (
      <div className="bg-white border border-rule rounded-xl p-8 max-w-md">
        <h2 className="font-serif text-xl text-green-dark mb-3">
          Logga in för att fortsätta
        </h2>
        <p className="text-sm text-text-warm mb-4">
          Admin-sidan är låst till specifika Firebase Auth-UID. Logga in
          med Google så ser du om du är med på listan.
        </p>
        {signInError && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
            {signInError}
          </p>
        )}
        <button
          onClick={async () => {
            setSigningIn(true);
            setSignInError(null);
            try {
              await signInWithPopup(auth, googleProvider);
            } catch (e: any) {
              setSignInError(e?.message || "Kunde inte logga in");
            } finally {
              setSigningIn(false);
            }
          }}
          disabled={signingIn}
          title="Öppna Google-popup för att logga in med ditt Firebase Auth-konto. Krävs för att verifiera om din UID är på admin-listan."
          className="bg-green-dark text-cream px-6 py-2 rounded-full font-semibold shadow hover:shadow-md disabled:opacity-50"
        >
          {signingIn ? "Loggar in…" : "Logga in med Google"}
        </button>
      </div>
    );
  }

  if (!isAdmin(user)) {
    return (
      <div className="bg-white border border-rule rounded-xl p-8 max-w-2xl">
        <h2 className="font-serif text-xl text-green-dark mb-3">
          Inte admin
        </h2>
        <p className="text-sm text-text-warm mb-3">
          Din UID är inte i admin-listan. Om du är ägaren av Tipspromenaden,
          kopiera UID:n nedan och lägg in i:
        </p>
        <ul className="text-xs text-text-warm mb-3 space-y-1 list-disc list-inside">
          <li>
            <code>tipspromenaden-web/src/lib/admin.ts</code>
            {" "}— <code>ADMIN_UIDS</code>
          </li>
          <li>
            <code>tipspromenaden-app/firestore.rules</code>
            {" "}— <code>isAdmin()</code>-funktionen
          </li>
        </ul>
        <pre className="bg-cream border border-rule rounded p-3 text-xs font-mono break-all select-all">
          {user.uid}
        </pre>
        <button
          onClick={() => signOut(auth)}
          className="mt-4 text-xs text-text-warm hover:underline"
        >
          Logga ut
        </button>
      </div>
    );
  }

  return <AdminContent user={user} />;
}

function AdminContent({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [walks, setWalks] = useState<Walk[] | null>(null);
  const [packs, setPacks] = useState<TipspackMeta[] | null>(null);
  const [curated, setCurated] = useState<CuratedPack[] | null>(null);
  const [sessions, setSessions] = useState<SessionDoc[] | null>(null);
  // Feedback-aggregat per walk + global summary. Hämtas via samma
  // initial-fetch som walks/sessions/packs. Map för O(1) lookup vid
  // rendering av per-walk-badge.
  const [feedbackByWalk, setFeedbackByWalk] = useState<
    Map<string, FeedbackAggregate>
  >(new Map());
  const [feedbackOverall, setFeedbackOverall] = useState<FeedbackOverall>({
    total: 0,
    up: 0,
    down: 0,
    walksWithFeedback: 0,
    positiveRate: 0,
  });
  const [flags, setFlags] = useState<ModerationFlags>({
    walks: new Set(),
    tipspacks: new Set(),
  });
  const [error, setError] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<
    | { mode: "create" }
    | { mode: "edit"; pack: TipspackMeta }
    | null
  >(null);

  async function refreshPacks() {
    const fresh = await getAllTipspacks();
    setPacks(fresh);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [allWalksSnap, packsList, sessionsSnap, flagsLoaded, feedback] =
          await Promise.all([
            // Hämta ALLA walks (inte bara public). Admin-rättigheter behövs
            // inte för read i Firestore-rules, så denna går igenom.
            getDocs(collection(db, "walks")),
            getAllTipspacks(),
            getDocs(collection(db, "sessions")),
            getModerationFlags(),
            getAllFeedback(),
          ]);
        if (cancelled) return;
        setWalks(allWalksSnap.docs.map((d) => d.data() as Walk));
        setPacks(packsList);
        setSessions(
          sessionsSnap.docs.map((d) => d.data() as SessionDoc)
        );
        setFlags(flagsLoaded);
        setFeedbackByWalk(aggregateByWalk(feedback));
        setFeedbackOverall(overallStats(feedback));
        // Curated kan inte fetchas runtime (build-tid only). Men /tipspack/index.json
        // serverar listan så vi använder den.
        try {
          const res = await fetch("/tipspack/index.json");
          if (res.ok) {
            const data = await res.json();
            setCurated(Array.isArray(data?.packs) ? data.packs : []);
          } else {
            setCurated([]);
          }
        } catch {
          setCurated([]);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Kunde inte ladda data");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
        {error}
      </p>
    );
  }

  if (!walks || !packs || !sessions) {
    return <p className="text-text-warm">Hämtar admin-data…</p>;
  }

  const sessionsByWalk = new Map<string, number>();
  const lastSessionByWalk = new Map<string, number>();
  sessions.forEach((s) => {
    sessionsByWalk.set(s.walkId, (sessionsByWalk.get(s.walkId) ?? 0) + 1);
    if (s.createdAt) {
      const prev = lastSessionByWalk.get(s.walkId) ?? 0;
      if (s.createdAt > prev) lastSessionByWalk.set(s.walkId, s.createdAt);
    }
  });

  const walksByMostUsed = [...walks]
    .map((w) => ({ walk: w, count: sessionsByWalk.get(w.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  const publicWalkCount = walks.filter((w) => (w as any).public === true).length;
  const completedSessions = sessions.filter((s) => s.status === "completed").length;

  async function toggleWalkHidden(walkId: string) {
    const isHidden = flags.walks.has(walkId);
    try {
      await setWalkHidden(walkId, !isHidden, user.uid);
      const next = new Set(flags.walks);
      if (isHidden) next.delete(walkId);
      else next.add(walkId);
      setFlags({ ...flags, walks: next });
    } catch (e: any) {
      alert("Kunde inte växla flagga: " + (e?.message || ""));
    }
  }

  async function toggleTipspackHidden(slug: string) {
    const isHidden = flags.tipspacks.has(slug);
    try {
      await setTipspackHidden(slug, !isHidden, user.uid);
      const next = new Set(flags.tipspacks);
      if (isHidden) next.delete(slug);
      else next.add(slug);
      setFlags({ ...flags, tipspacks: next });
    } catch (e: any) {
      alert("Kunde inte växla flagga: " + (e?.message || ""));
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2 flex-wrap">
          {(["overview", "walks", "tipspacks", "events", "supporters", "sessions"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              title={tabTooltip(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${
                tab === t
                  ? "bg-green-dark text-cream"
                  : "bg-white border border-rule text-text-warm hover:border-green-dark"
              }`}
            >
              {tabLabel(t)}
            </button>
          ))}
        </div>
        <button
          onClick={() => signOut(auth)}
          title="Logga ut från Firebase Auth. Din session avslutas och admin-sidan kräver login igen vid nästa besök."
          className="text-xs text-text-warm hover:underline"
        >
          Logga ut ({user.email})
        </button>
      </div>

      {tab === "overview" && <DownloadsWidget user={user} />}

      {tab === "overview" && (
        <Overview
          totalWalks={walks.length}
          publicWalks={publicWalkCount}
          totalSessions={sessions.length}
          completedSessions={completedSessions}
          totalPacks={packs.length + (curated?.length ?? 0)}
          curatedCount={curated?.length ?? 0}
          uploadedCount={packs.length}
          mostUsed={walksByMostUsed.slice(0, 10)}
          feedback={feedbackOverall}
          feedbackByWalk={feedbackByWalk}
          walks={walks}
        />
      )}

      {tab === "walks" && (
        <WalksList
          walks={walks}
          sessionsByWalk={sessionsByWalk}
          lastSessionByWalk={lastSessionByWalk}
          feedbackByWalk={feedbackByWalk}
          flags={flags}
          onToggleHidden={toggleWalkHidden}
        />
      )}

      {tab === "tipspacks" && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-xl text-green-dark">Tipspacks</h2>
            <button
              onClick={() => setEditorState({ mode: "create" })}
              title="Skapa ett nytt tipspack från grunden via formuläret (titel, beskrivning, frågor en-och-en). Alternativet är att ladda upp en .tipspack-fil via drop-zonen nedan."
              className="bg-green-dark text-cream px-4 py-1.5 rounded-full text-sm font-semibold shadow"
            >
              ➕ Skapa nytt
            </button>
          </div>
          <BatchUploadDropZone user={user} onUploaded={refreshPacks} />
          <TipspacksList
            uploaded={packs}
            curated={curated ?? []}
            flags={flags}
            currentUid={user.uid}
            onToggleHidden={toggleTipspackHidden}
            onEdit={(pack) => setEditorState({ mode: "edit", pack })}
          />
          {editorState && (
            <TipspackEditor
              mode={editorState.mode}
              user={user}
              initialPack={
                editorState.mode === "edit" ? editorState.pack : undefined
              }
              onClose={() => setEditorState(null)}
              onSaved={refreshPacks}
            />
          )}
        </>
      )}

      {tab === "events" && <EventsManager user={user} walks={walks} />}

      {tab === "supporters" && <SupportersManager />}

      {tab === "sessions" && (
        <SessionsList sessions={sessions} walks={walks} />
      )}
    </>
  );
}

/** ISO-datum (YYYY-MM-DD) i sv-SE från ms-timestamp. Tom sträng om saknas. */
function fmtDate(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("sv-SE");
}

function tabLabel(t: Tab): string {
  switch (t) {
    case "overview":
      return "📊 Översikt";
    case "walks":
      return "🚶 Walks";
    case "tipspacks":
      return "📚 Tipspacks";
    case "events":
      return "🏁 Events";
    case "supporters":
      return "💚 Supportrar";
    case "sessions":
      return "🎯 Sessioner";
  }
}

function tabTooltip(t: Tab): string {
  switch (t) {
    case "overview":
      return "Aggregerade KPIs: antal walks, sessioner, paket, deltagar-feedback. Topp-walks efter användning.";
    case "walks":
      return "Alla skapade walks (publika och privata). Expandera för att se frågor + facit. 🚩 göm från publika listor.";
    case "tipspacks":
      return "Användar-uppladdade och curated frågebatterier. Skapa nya, ladda upp i batch, göm olämpliga.";
    case "events":
      return "Branded customization för sponsor-event (Scania m.fl.). Egen logo, färger och valfri walk-filter. Generera QR-kod direkt här.";
    case "supporters":
      return "Namnlistan på appens tacksida (Inställningar → Tack till våra supportrar). Ett namn per rad + valfri egen intro-text.";
    case "sessions":
      return "Lista över de senaste sessionerna per walk — vem som spelat när och hur mycket de hann.";
  }
}

function Overview(props: {
  totalWalks: number;
  publicWalks: number;
  totalSessions: number;
  completedSessions: number;
  totalPacks: number;
  curatedCount: number;
  uploadedCount: number;
  mostUsed: { walk: Walk; count: number }[];
  feedback: FeedbackOverall;
  feedbackByWalk: Map<string, FeedbackAggregate>;
  walks: Walk[];
}) {
  // Topp 5 walks med mest tumme-ner: sortera per (down / total) desc,
  // bara walks med ≥3 ratings (mindre statistiskt brus). Hjälper
  // admin pinpointa problem-walks som behöver kärlek.
  const walksByDownRate = props.walks
    .map((w) => {
      const agg = props.feedbackByWalk.get(w.id);
      if (!agg || agg.total < 3) return null;
      return { walk: w, agg, downRate: agg.down / agg.total };
    })
    .filter((x): x is { walk: Walk; agg: FeedbackAggregate; downRate: number } => x !== null)
    .filter((x) => x.downRate > 0)
    .sort((a, b) => b.downRate - a.downRate)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Walks (totalt)" value={props.totalWalks} hint={`${props.publicWalks} publika`} />
        <Stat label="Sessioner" value={props.totalSessions} hint={`${props.completedSessions} avslutade`} />
        <Stat
          label="Tipspacks"
          value={props.totalPacks}
          hint={`${props.curatedCount} curated · ${props.uploadedCount} upload`}
        />
        <Stat
          label="Avslutningsgrad"
          value={
            props.totalSessions === 0
              ? "—"
              : Math.round((props.completedSessions / props.totalSessions) * 100) + "%"
          }
          hint="completed / total"
        />
      </section>

      {/* Feedback-sektion: total volym + positivitets-andel + topp 5
          problem-walks. Bara synlig om vi har minst en feedback-rad
          så tomma admin-vyer inte visar tom statistik. */}
      {props.feedback.total > 0 && (
        <section className="bg-white border border-rule rounded-xl p-5 space-y-4">
          <h2 className="font-serif text-xl text-green-dark">
            Användarfeedback
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label="Total feedback"
              value={props.feedback.total}
              hint={`${props.feedback.walksWithFeedback} walks fått omdömen`}
            />
            <Stat
              label="👍 Tumme upp"
              value={props.feedback.up}
              hint={
                props.feedback.total > 0
                  ? Math.round(props.feedback.positiveRate * 100) + "% positivt"
                  : ""
              }
            />
            <Stat
              label="👎 Tumme ner"
              value={props.feedback.down}
              hint=""
            />
            <Stat
              label="Positivitetsindex"
              value={
                props.feedback.total > 0
                  ? Math.round(props.feedback.positiveRate * 100) + "%"
                  : "—"
              }
              hint="up / (up + down)"
            />
          </div>

          {walksByDownRate.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-text-warm uppercase tracking-wide mb-2">
                Behöver kärlek
              </h3>
              <ol className="space-y-2 text-sm">
                {walksByDownRate.map(({ walk, agg, downRate }) => (
                  <li
                    key={walk.id}
                    className="flex items-center justify-between border-b border-rule/60 last:border-0 pb-2 last:pb-0"
                  >
                    <span className="text-text-warm truncate flex-1 pr-3">
                      {walk.title || "(utan titel)"}
                    </span>
                    <span className="text-xs text-text-warm font-mono whitespace-nowrap">
                      👍 {agg.up} · 👎 {agg.down} ·{" "}
                      <strong className="text-red-700">
                        {Math.round(downRate * 100)}% ner
                      </strong>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-text-warm mt-3 italic">
                Sorterat på % tumme-ner. Bara walks med ≥3 omdömen
                visas för att undvika statistiskt brus.
              </p>
            </div>
          )}
        </section>
      )}

      <section className="bg-white border border-rule rounded-xl p-5">
        <h2 className="font-serif text-xl text-green-dark mb-3">
          Topp 10 walks efter sessioner
        </h2>
        {props.mostUsed.filter((m) => m.count > 0).length === 0 ? (
          <p className="text-sm text-text-warm">Inga sessioner ännu.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {props.mostUsed
              .filter((m) => m.count > 0)
              .map(({ walk, count }, i) => (
                <li
                  key={walk.id}
                  className="flex items-center justify-between border-b border-rule/60 last:border-0 pb-2 last:pb-0"
                >
                  <span className="text-green-dark">
                    <span className="font-mono text-xs text-text-warm mr-2">
                      #{i + 1}
                    </span>
                    {walk.title}
                    {(walk as any).public ? "" : " 🔒"}
                  </span>
                  <span className="text-text-warm tabular-nums">
                    {count} sessioner
                  </span>
                </li>
              ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="bg-white border border-rule rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-text-warm">{label}</p>
      <p className="font-serif text-3xl text-green-dark mt-1">{value}</p>
      {hint && <p className="text-xs text-sage mt-1">{hint}</p>}
    </div>
  );
}

function WalksList({
  walks,
  sessionsByWalk,
  lastSessionByWalk,
  feedbackByWalk,
  flags,
  onToggleHidden,
}: {
  walks: Walk[];
  sessionsByWalk: Map<string, number>;
  lastSessionByWalk: Map<string, number>;
  feedbackByWalk: Map<string, FeedbackAggregate>;
  flags: ModerationFlags;
  onToggleHidden: (walkId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [flyerWalk, setFlyerWalk] = useState<Walk | null>(null);
  const filtered = walks.filter(
    (w) =>
      w.title.toLowerCase().includes(search.toLowerCase()) ||
      (w.description ?? "").toLowerCase().includes(search.toLowerCase())
  );
  filtered.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  return (
    <div className="space-y-3">
      <input
        placeholder="Sök walk-titel eller beskrivning"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2 rounded-lg border border-rule bg-white"
      />
      <p className="text-xs text-text-warm">
        {filtered.length} av {walks.length} walks
      </p>
      <ul className="space-y-2">
        {filtered.map((w) => {
          const isExpanded = expanded === w.id;
          const isHidden = flags.walks.has(w.id);
          const count = sessionsByWalk.get(w.id) ?? 0;
          const lastSession = lastSessionByWalk.get(w.id);
          const fb = feedbackByWalk.get(w.id);
          return (
            <li
              key={w.id}
              className={`bg-white border rounded-xl p-4 ${
                isHidden ? "border-red-300 bg-red-50/50" : "border-rule"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-serif text-lg text-green-dark flex items-center gap-2">
                    {w.language && <Flag code={w.language} height={14} />}
                    <span>{w.title}</span>
                    {isHidden && (
                      <span className="text-xs bg-red-200 text-red-900 px-2 py-0.5 rounded-full">
                        🚩 Gömd
                      </span>
                    )}
                    {!(w as any).public && (
                      <span className="text-xs bg-sage/20 text-text-warm px-2 py-0.5 rounded-full">
                        🔒 Privat
                      </span>
                    )}
                  </p>
                  {w.description && (
                    <p className="text-sm text-text-warm mt-1 line-clamp-2">
                      {w.description}
                    </p>
                  )}
                  <p className="text-xs text-sage mt-1">
                    {w.questions.length} kontroller · {count} sessioner ·{" "}
                    {(w as any).city || "okänd stad"}
                    {fb && fb.total > 0 && (
                      <>
                        {" · "}
                        <span className="font-semibold text-text-warm">
                          👍 {fb.up} 👎 {fb.down}
                        </span>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-sage mt-0.5">
                    Skapad {fmtDate(w.createdAt)}
                    {lastSession ? ` · senast utförd ${fmtDate(lastSession)}` : ""}
                    {" · "}
                    <code className="text-text-warm">{w.id.slice(0, 12)}…</code>
                  </p>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => setExpanded(isExpanded ? null : w.id)}
                    title={
                      isExpanded
                        ? "Stäng inspektera-vyn."
                        : "Visa kart-thumbnail, frågor med facit, feedback-uppdelning och delningsbara länkar för denna walk."
                    }
                    className="text-xs border border-green-dark text-green-dark px-3 py-1 rounded-full hover:bg-green-dark/5"
                  >
                    {isExpanded ? "Dölj" : "Inspektera"}
                  </button>
                  <button
                    onClick={() => setFlyerWalk(w)}
                    className="text-xs border border-green-dark text-green-dark px-3 py-1 rounded-full hover:bg-green-dark/5"
                    title="Generera ett printbart A5-flygblad med walk-info + QR-kod att sätta upp på platsen."
                  >
                    📄 Flygblad
                  </button>
                  <button
                    onClick={() => onToggleHidden(w.id)}
                    title={
                      isHidden
                        ? "Visa walken igen i publika listor (bibliotek på app + webb)."
                        : "Göm walken från publika listor. Den är fortfarande spelbar via direktlänk — bara listning blockeras."
                    }
                    className={`text-xs px-3 py-1 rounded-full ${
                      isHidden
                        ? "bg-green-dark text-cream"
                        : "border border-red-700 text-red-700 hover:bg-red-50"
                    }`}
                  >
                    {isHidden ? "Återställ" : "🚩 Göm"}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="mt-3 bg-cream/50 border border-rule rounded-lg p-3 space-y-3">
                  <WalkMiniMap
                    points={w.questions.map((q) => q.coordinate)}
                  />

                  {/* Feedback-breakdown — visas bara om walken har
                      omdömen. Tre kategori-staplar visar vad som
                      faktiskt fick tumme ner (vid övergripande 👎). */}
                  {fb && fb.total > 0 && (
                    <div className="bg-white border border-rule rounded-lg p-3">
                      <p className="text-sm font-semibold text-green-dark mb-2">
                        Feedback ({fb.total}{" "}
                        {fb.total === 1 ? "omdöme" : "omdömen"})
                      </p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-text-warm">Övergripande:</span>{" "}
                          <span className="font-semibold">
                            👍 {fb.up} 👎 {fb.down}
                          </span>
                        </div>
                        <div>
                          <span className="text-text-warm">Positivitet:</span>{" "}
                          <span className="font-semibold">
                            {Math.round((fb.up / fb.total) * 100)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-text-warm">Frågorna:</span>{" "}
                          <span className="font-semibold">
                            👍 {fb.details.questions.up} 👎{" "}
                            {fb.details.questions.down}
                          </span>
                        </div>
                        <div>
                          <span className="text-text-warm">Kontroller:</span>{" "}
                          <span className="font-semibold">
                            👍 {fb.details.points.up} 👎{" "}
                            {fb.details.points.down}
                          </span>
                        </div>
                        <div>
                          <span className="text-text-warm">Gränssnitt:</span>{" "}
                          <span className="font-semibold">
                            👍 {fb.details.ui.up} 👎 {fb.details.ui.down}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-sage mt-2 italic">
                        Kategori-omdömen sätts bara när deltagaren gav
                        tumme ner övergripande och valde att specificera.
                      </p>
                    </div>
                  )}

                  <ol className="space-y-3 text-sm">
                    {w.questions.map((q, i) => (
                      <li key={q.id} className="border-b border-rule/60 last:border-0 pb-2 last:pb-0">
                        <p className="font-semibold text-green-dark">
                          {i + 1}. {q.text}
                        </p>
                        <ul className="mt-1 space-y-0.5 ml-4">
                          {q.options.map((o, oi) => (
                            <li
                              key={oi}
                              className={
                                oi === q.correctOptionIndex
                                  ? "text-green-dark font-semibold"
                                  : "text-text-warm"
                              }
                            >
                              {oi === q.correctOptionIndex ? "✓ " : "·  "}
                              {o}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {flyerWalk && (
        <FlyerDialog walk={flyerWalk} onClose={() => setFlyerWalk(null)} />
      )}
    </div>
  );
}

function TipspacksList({
  uploaded,
  curated,
  flags,
  currentUid,
  onToggleHidden,
  onEdit,
}: {
  uploaded: TipspackMeta[];
  curated: CuratedPack[];
  flags: ModerationFlags;
  currentUid: string;
  onToggleHidden: (slug: string) => void;
  onEdit: (pack: TipspackMeta) => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [content, setContent] = useState<Record<string, any>>({});

  type Combined = {
    slug: string;
    name: string;
    description?: string;
    author?: string;
    language?: string;
    questionCount: number;
    source: "curated" | "uploaded";
    isPublic?: boolean;
    ownerName?: string;
    ownerUid?: string;
    createdAt?: number;
    updatedAt?: number;
    /** Original-pack:n så vi kan skicka in den till editor:n. */
    raw?: TipspackMeta;
  };

  const combined: Combined[] = [
    ...curated.map((c) => ({ ...c, source: "curated" as const })),
    ...uploaded.map((u) => ({
      ...u,
      source: "uploaded" as const,
      raw: u,
    })),
  ];

  const filtered = combined.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.slug.toLowerCase().includes(search.toLowerCase())
  );

  async function expand(p: Combined) {
    if (expanded === p.slug) {
      setExpanded(null);
      return;
    }
    setExpanded(p.slug);
    if (content[p.slug]) return;
    setContent((c) => ({ ...c, [p.slug]: "loading" }));
    try {
      let url: string;
      if (p.source === "curated") {
        url = `/tipspack/${p.slug}.tipspack`;
      } else {
        url = await getDownloadUrl(p.slug);
      }
      const res = await fetch(url);
      const data = await res.json();
      setContent((c) => ({ ...c, [p.slug]: data }));
    } catch (e: any) {
      setContent((c) => ({ ...c, [p.slug]: { error: e?.message || "fel" } }));
    }
  }

  return (
    <div className="space-y-3">
      <input
        placeholder="Sök tipspack-namn eller slug"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2 rounded-lg border border-rule bg-white"
      />
      <p className="text-xs text-text-warm">
        {filtered.length} av {combined.length} tipspacks ({curated.length} curated, {uploaded.length} upload)
      </p>
      <ul className="space-y-2">
        {filtered.map((p) => {
          const isExpanded = expanded === p.slug;
          const isHidden = flags.tipspacks.has(p.slug);
          const data = content[p.slug];
          return (
            <li
              key={p.slug + p.source}
              className={`bg-white border rounded-xl p-4 ${
                isHidden ? "border-red-300 bg-red-50/50" : "border-rule"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-serif text-lg text-green-dark flex items-center gap-2 flex-wrap">
                    {p.language && <Flag code={p.language} height={14} />}
                    <span>{p.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        p.source === "curated"
                          ? "bg-green-dark/10 text-green-dark"
                          : "bg-sage/20 text-text-warm"
                      }`}
                    >
                      {p.source === "curated" ? "📚 Curated" : "📤 Upload"}
                    </span>
                    {isHidden && (
                      <span className="text-xs bg-red-200 text-red-900 px-2 py-0.5 rounded-full">
                        🚩 Gömd
                      </span>
                    )}
                    {p.source === "uploaded" && p.isPublic === false && (
                      <span className="text-xs bg-orange-100 text-orange-900 px-2 py-0.5 rounded-full">
                        🔗 Hemlig
                      </span>
                    )}
                  </p>
                  {p.description && (
                    <p className="text-sm text-text-warm mt-1 line-clamp-2">
                      {p.description}
                    </p>
                  )}
                  <p className="text-xs text-sage mt-1">
                    {p.questionCount} frågor · {p.author || p.ownerName || "okänd"} ·{" "}
                    <code className="text-text-warm">{p.slug}</code>
                  </p>
                  {p.source === "uploaded" && (
                    <p className="text-xs text-sage mt-0.5">
                      Uppladdad {fmtDate(p.createdAt)}
                      {p.updatedAt && p.updatedAt !== p.createdAt
                        ? ` · ändrad ${fmtDate(p.updatedAt)}`
                        : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => expand(p)}
                    title={
                      isExpanded
                        ? "Stäng inspektera-vyn."
                        : "Ladda hela JSON-filen och visa frågor + svarsalternativ (med facit markerat)."
                    }
                    className="text-xs border border-green-dark text-green-dark px-3 py-1 rounded-full hover:bg-green-dark/5"
                  >
                    {isExpanded ? "Dölj" : "Inspektera"}
                  </button>
                  {p.source === "uploaded" &&
                    p.ownerUid === currentUid &&
                    p.raw && (
                      <button
                        onClick={() => onEdit(p.raw!)}
                        title="Öppna redigerings-modalen. Du kan ändra metadata och växla mellan publik/hemlig länk."
                        className="text-xs border border-green-dark text-green-dark px-3 py-1 rounded-full hover:bg-green-dark/5"
                      >
                        📝 Redigera
                      </button>
                    )}
                  <button
                    onClick={() => onToggleHidden(p.slug)}
                    title={
                      isHidden
                        ? "Visa paketet igen i biblioteket."
                        : "Göm paketet från Biblioteks-listan i appen. Direktlänk fungerar fortfarande."
                    }
                    className={`text-xs px-3 py-1 rounded-full ${
                      isHidden
                        ? "bg-green-dark text-cream"
                        : "border border-red-700 text-red-700 hover:bg-red-50"
                    }`}
                  >
                    {isHidden ? "Återställ" : "🚩 Göm"}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="mt-3 bg-cream/50 border border-rule rounded-lg p-3">
                  {data === "loading" && (
                    <p className="text-sm text-text-warm">Hämtar…</p>
                  )}
                  {data && data.error && (
                    <p className="text-sm text-red-700">Fel: {data.error}</p>
                  )}
                  {data && Array.isArray(data.questions) && (
                    <ol className="space-y-3 text-sm">
                      {data.questions.map((q: any, i: number) => (
                        <li key={i} className="border-b border-rule/60 last:border-0 pb-2 last:pb-0">
                          <p className="font-semibold text-green-dark">
                            {i + 1}. {q.text}
                          </p>
                          <ul className="mt-1 space-y-0.5 ml-4">
                            {q.options.map((o: string, oi: number) => (
                              <li
                                key={oi}
                                className={
                                  oi === q.correctOptionIndex
                                    ? "text-green-dark font-semibold"
                                    : "text-text-warm"
                                }
                              >
                                {oi === q.correctOptionIndex ? "✓ " : "·  "}
                                {o}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SessionsList({
  sessions,
  walks,
}: {
  sessions: SessionDoc[];
  walks: Walk[];
}) {
  const walkById = new Map(walks.map((w) => [w.id, w]));
  const recent = [...sessions]
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 50);

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-warm">
        Visar de 50 senaste sessionerna ({sessions.length} totalt).
      </p>
      <ul className="space-y-2">
        {recent.map((s) => {
          const walk = walkById.get(s.walkId);
          return (
            <li
              key={s.id}
              className="bg-white border border-rule rounded-xl px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-serif text-green-dark truncate">
                  {walk ? walk.title : <em className="text-text-warm">{`Saknad walk (${s.walkId.slice(0, 12)}…)`}</em>}
                </p>
                <p className="text-xs text-sage">
                  {s.status} ·{" "}
                  {s.createdAt
                    ? new Date(s.createdAt).toLocaleString("sv-SE")
                    : "okänd tid"}
                </p>
              </div>
              <code className="text-xs text-text-warm">{s.id.slice(0, 8)}</code>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * @file App.tsx
 * @description Root-komponent för webb-skaparen (`/skapa`).
 *
 * Förenklat tre-läges flöde med URL-hash som "router":
 *   1. Inte inloggad        → <Login />
 *   2. Inloggad, ingen walk → <WalkList />
 *   3. Inloggad, walk vald  → <WalkEditor walkId={...} />
 *   4. Tipspack-editorn     → <TipspackEditor /> (#newpack, #pack/<slug>)
 *
 * Hash-routing är medvetet val — hela appen är client-side och vi vill
 * undvika att sätta upp Astro SSR-routing eller en tung router-bibliotek
 * som react-router. Funkar bra för MVP. Bytas senare om vi behöver
 * djupare URLs.
 */

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { Login } from "./Login";
import { WalkList } from "./WalkList";
import { WalkEditor } from "./WalkEditor";
import { TipspackEditor } from "./TipspackEditor";
import { LangProvider, useT, type Locale } from "./i18n";

interface AppProps {
  /** Språk för UI:t. Default sv. Sätts från Astro-page baserat på path. */
  lang?: Locale;
}

export default function App({ lang = "sv" }: AppProps) {
  return (
    <LangProvider lang={lang}>
      <AppInner />
    </LangProvider>
  );
}

function AppInner() {
  const t = useT();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [activeWalkId, setActiveWalkId] = useState<string | null>(null);
  // undefined = ingen pack-editor, null = nytt pack, sträng = slug.
  const [activePack, setActivePack] = useState<string | null | undefined>(undefined);

  // Lyssna på auth-state. `undefined` = väntar, `null` = utloggad,
  // User = inloggad. Vi behöver tristate eftersom vi vill visa en
  // spinner tills vi vet, inte direkt rendera Login.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  // Retur från Stripe Checkout: ?kop=ok|avbrutet (kreditpaket) eller
  // ?pro=ok|avbrutet (Pro-prenumeration). Visa en
  // banner och städa bort parametrarna så att en omladdning inte visar
  // den igen. Krediterna läggs till av webhooken — saldot uppdateras
  // live via useCredits, oftast inom några sekunder.
  const [purchase, setPurchase] = useState<"ok" | "pro" | "cancelled" | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const kop = url.searchParams.get("kop");
    const pro = url.searchParams.get("pro");
    const result = kop ?? pro;
    if (result !== "ok" && result !== "avbrutet") return;
    setPurchase(result === "avbrutet" ? "cancelled" : pro ? "pro" : "ok");
    url.searchParams.delete("kop");
    url.searchParams.delete("pro");
    url.searchParams.delete("session_id");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);

  // Hash-routing: #walk/<id>, #newpack, #pack/<slug> eller tom för listan.
  useEffect(() => {
    const readHash = () => {
      const hash = window.location.hash;
      const m = hash.match(/^#walk\/(.+)$/);
      setActiveWalkId(m ? decodeURIComponent(m[1]) : null);
      const pm = hash.match(/^#pack\/(.+)$/);
      setActivePack(
        hash === "#newpack" ? null : pm ? decodeURIComponent(pm[1]) : undefined
      );
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  function openWalk(id: string) {
    window.location.hash = `walk/${encodeURIComponent(id)}`;
  }

  function closeWalk() {
    window.location.hash = "";
  }

  const banner = purchase && (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[2200] max-w-md w-[calc(100%-2rem)] rounded-xl shadow-lg px-4 py-3 text-sm flex items-start gap-3 ${
        purchase === "cancelled" ? "bg-white text-text-warm border border-rule" : "bg-green-dark text-cream"
      }`}
      role="status"
    >
      <span className="flex-1">
        {purchase === "pro"
          ? t(
              "Välkommen till Pro! ⭐ Dina månadskrediter dyker upp i saldot om en liten stund.",
              "Welcome to Pro! ⭐ Your monthly credits will show up in your balance shortly."
            )
          : purchase === "ok"
          ? t(
              "Tack för köpet! ✨ Krediterna dyker upp i ditt saldo om en liten stund.",
              "Thanks for your purchase! ✨ The credits will show up in your balance shortly."
            )
          : t("Köpet avbröts — inget har dragits.", "Purchase cancelled — you have not been charged.")}
      </span>
      <button onClick={() => setPurchase(null)} aria-label={t("Stäng", "Close")} className="opacity-80 hover:opacity-100">
        ✕
      </button>
    </div>
  );

  let content;
  if (user === undefined) {
    content = (
      <div className="min-h-screen flex items-center justify-center text-text-warm">
        <p>{t("Laddar…", "Loading…")}</p>
      </div>
    );
  } else if (user === null) {
    content = <Login />;
  } else if (activePack !== undefined) {
    content = (
      <TipspackEditor
        // key: remount när ett nytt pack sparats och hashen byts till dess slug.
        key={activePack ?? "new"}
        user={user}
        slug={activePack}
        onClose={closeWalk}
        onCreated={(slug) => {
          window.location.hash = `pack/${encodeURIComponent(slug)}`;
        }}
      />
    );
  } else if (activeWalkId) {
    content = <WalkEditor walkId={activeWalkId} user={user} onClose={closeWalk} />;
  } else {
    content = <WalkList user={user} onOpenWalk={openWalk} />;
  }

  return (
    <>
      {content}
      {banner}
    </>
  );
}

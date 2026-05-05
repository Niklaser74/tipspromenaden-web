/**
 * @file App.tsx
 * @description Root-komponent för webb-skaparen (`/skapa`).
 *
 * Förenklat tre-läges flöde med URL-hash som "router":
 *   1. Inte inloggad        → <Login />
 *   2. Inloggad, ingen walk → <WalkList />
 *   3. Inloggad, walk vald  → <WalkEditor walkId={...} />
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

  // Lyssna på auth-state. `undefined` = väntar, `null` = utloggad,
  // User = inloggad. Vi behöver tristate eftersom vi vill visa en
  // spinner tills vi vet, inte direkt rendera Login.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return unsub;
  }, []);

  // Hash-baserad walk-id i URL: #walk/<id> eller tom för listan.
  useEffect(() => {
    const readHash = () => {
      const m = window.location.hash.match(/^#walk\/(.+)$/);
      setActiveWalkId(m ? decodeURIComponent(m[1]) : null);
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

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-warm">
        <p>{t("Laddar…", "Loading…")}</p>
      </div>
    );
  }

  if (user === null) {
    return <Login />;
  }

  if (activeWalkId) {
    return (
      <WalkEditor
        walkId={activeWalkId}
        user={user}
        onClose={closeWalk}
      />
    );
  }

  return <WalkList user={user} onOpenWalk={openWalk} />;
}

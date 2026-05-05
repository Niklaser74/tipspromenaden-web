/**
 * @file Login.tsx
 * @description Login-vy för webb-skaparen.
 *
 * Bara Google Sign-In via popup. Ingen anonym auth här eftersom
 * `firestore.rules` kräver icke-anonym auth för att skapa walks ändå
 * (och syftet med /skapa är just att skapa walks).
 *
 * Same Firebase-projekt som mobil-appen → samma Google-konto kommer ge
 * samma uid på båda klienterna. En walk skapad på webben dyker upp på
 * mobilen och vice versa.
 */

import { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../../lib/firebase";
import { useT, useLocale } from "./i18n";

export function Login() {
  const t = useT();
  const lang = useLocale();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged i App.tsx fångar upp resultatet
    } catch (e: any) {
      // popup-stängd-av-användare och liknande är inte fel värt att visa
      if (e?.code !== "auth/popup-closed-by-user") {
        setError(e?.message || t("Inloggning misslyckades", "Sign-in failed"));
      }
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <img
        src="/icon.png"
        alt=""
        width="96"
        height="96"
        className="w-24 h-24 rounded-2xl mb-8"
      />
      <h1 className="font-serif text-4xl md:text-5xl text-green-dark mb-4">
        {t("Skapa en tipspromenad", "Create a quiz walk")}
      </h1>
      <p className="text-lg max-w-md mb-10 leading-relaxed text-text-warm">
        {t(
          "Logga in med Google för att börja bygga din egen promenad. Frågorna och kontrollerna synkas direkt med Tipspromenaden-appen — du kan starta den du skapat här direkt på telefonen.",
          "Sign in with Google to start building your own walk. Questions and checkpoints sync directly with the Tipspromenaden app — you can start the walk you created here right on your phone."
        )}
      </p>

      <button
        onClick={handleSignIn}
        disabled={signingIn}
        className="bg-green-dark text-cream px-8 py-3 rounded-full font-semibold text-lg shadow-md hover:shadow-lg transition disabled:opacity-50"
      >
        {signingIn
          ? t("Loggar in…", "Signing in…")
          : t("Logga in med Google", "Sign in with Google")}
      </button>

      {error && (
        <p className="mt-6 text-red-700 text-sm max-w-md">{error}</p>
      )}

      <a
        href={lang === "en" ? "/en/" : "/"}
        className="mt-12 text-green font-semibold hover:underline"
      >
        ← Tipspromenaden.app
      </a>
    </div>
  );
}

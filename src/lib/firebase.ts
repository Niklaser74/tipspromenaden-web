/**
 * @file firebase.ts
 * @description Firebase-init för webb-skaparen (`/skapa`).
 *
 * Använder samma Firebase-projekt (`tipspromenaden-491207`) som mobil-appen
 * — alltså samma walks/sessions/users-collection. Web-app-ID:t är samma
 * som registrerats i mobil-appens konfig (`appId` slutar på `:web:...`).
 * Det fungerar eftersom Firebase tillåter en web-app-config att användas
 * från flera klienter.
 *
 * Auth-persistens på web defaultar till browser local storage, så ingen
 * extra setup behövs (jämfört med React Native som krävde
 * `getReactNativePersistence`).
 */

import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

// Samma config som i mobil-appens src/config/firebase.ts. Inga hemligheter
// — apiKey är publik och kan committas (Firebase säkerhet vilar på
// firestore.rules + Auth, inte denna nyckel).
const firebaseConfig = {
  apiKey: "AIzaSyAbXpylv6YBCeoEo_dpbcZDwMJjweJM7e4",
  authDomain: "tipspromenaden-491207.firebaseapp.com",
  projectId: "tipspromenaden-491207",
  storageBucket: "tipspromenaden-491207.firebasestorage.app",
  messagingSenderId: "851934058818",
  appId: "1:851934058818:web:80445e3367abf097f610db",
};

// `getApps().length` skydd mot dubbel-init under Vite HMR i dev.
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// ─── Firebase App Check ─────────────────────────────────────────────
// Verifierar att requests till Firestore/Storage kommer från denna
// faktiska webbsida — inte från en bot eller någon som extraherat
// apiKey:n. Vi kör App Check i **monitor mode** initialt: backend
// rejectar inget än, men loggar vilka requests som har giltig token vs
// inte. När även mobilappens native-trafik täcks (Stage 2 — kräver
// `@react-native-firebase/app-check` + ny EAS-build) flippar vi till
// enforce.
//
// Provider: reCAPTCHA Enterprise. Site key skapad i Google Cloud
// Console under Fraud Defense → Keys för domänerna `tipspromenaden.app`
// + `localhost` (för lokal dev).
//
// Site key:n är publik (embeds i klient-HTML) — det är bara secret-
// key:n som måste skyddas, och den används inte här.
//
// SSR: Astro renderar den här filen även server-side. `initializeAppCheck`
// kraschar om `window` saknas → vi guard:ar med typeof window.
if (typeof window !== "undefined") {
  // Debug-token för lokal utveckling. När `?appCheckDebug=1` finns i
  // URL:n sätts globala flaggan som tvingar SDK:n att printa en
  // debug-token i konsolen vid första laddning. Token:en registreras
  // sedan manuellt i Firebase Console → App Check → Apps → Manage
  // debug tokens. Funkar bara i dev-byggen — produktionsdomänen ska
  // alltid använda riktig reCAPTCHA-token.
  if (
    import.meta.env.DEV ||
    new URLSearchParams(window.location.search).has("appCheckDebug")
  ) {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(
        "6LdVJdgsAAAAAFPCQ43sBlF2SW7pGkVGs8NeluXl"
      ),
      // Auto-refresh så token byts ut innan den löper ut (default
      // TTL 1 h). Annars hade requests börjat misslyckas mitt i en
      // session efter 1 h.
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // Får inte skugga övrig Firebase-init — App Check är ett
    // skydds-lager, om det failar (t.ex. reCAPTCHA-script blockas
    // av adblock) ska sidan ändå funka i monitor mode.
    console.warn("App Check init failed (non-fatal):", e);
  }
}

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export default app;

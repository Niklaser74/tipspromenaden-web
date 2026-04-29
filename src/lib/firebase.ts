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

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export default app;

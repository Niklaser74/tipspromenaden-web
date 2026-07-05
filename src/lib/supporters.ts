/**
 * @file supporters.ts
 * @description Läs/skriv av Firestore-doc:et `config/supporters` som driver
 * appens tacksida (Inställningar → "Tack till våra supportrar").
 *
 * Doc-format (se app-repots docs/web-admin-supporters.md):
 *   - `names`   — hela listan skrivs varje gång (ersätt, inte append).
 *   - `message` — valfri intro-text { sv, en } som ersätter appens default.
 *     Utelämnas helt om båda språken är tomma; appen fallbackar en ↔ sv.
 *   - `updatedAt` — Date.now() vid skrivning.
 *
 * Skrivningen sker med setDoc UTAN merge så att borttagna fält (t.ex. en
 * rensad message) inte spökar kvar i doc:et. Firestore-rules: publik read,
 * write kräver admin-UID (samma mönster som config/appUpdate).
 */

import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface SupportersMessage {
  sv?: string;
  en?: string;
}

export interface SupportersConfig {
  names: string[];
  message?: SupportersMessage;
  updatedAt?: number;
}

/**
 * Appen trimmar och cappar varje namn till 100 tecken klient-side.
 * Formuläret varnar vid längre namn så listan hålls kort redan här.
 */
export const SUPPORTER_NAME_MAX_LENGTH = 100;

const supportersRef = () => doc(db, "config", "supporters");

/** Hämtar nuvarande supporter-config, eller null om doc:et inte finns. */
export async function getSupportersConfig(): Promise<SupportersConfig | null> {
  const snap = await getDoc(supportersRef());
  if (!snap.exists()) return null;
  const data = snap.data() as {
    names?: unknown;
    message?: { sv?: unknown; en?: unknown };
    updatedAt?: number;
  };
  return {
    names: Array.isArray(data.names)
      ? data.names.filter((n): n is string => typeof n === "string")
      : [],
    message:
      typeof data.message?.sv === "string" || typeof data.message?.en === "string"
        ? {
            ...(typeof data.message?.sv === "string"
              ? { sv: data.message.sv }
              : {}),
            ...(typeof data.message?.en === "string"
              ? { en: data.message.en }
              : {}),
          }
        : undefined,
    updatedAt: data.updatedAt,
  };
}

/**
 * Skriver hela `config/supporters`-doc:et. Tomma message-fält utelämnas;
 * är båda tomma skrivs inget `message` alls (appen visar sin default-intro).
 * Kräver admin (Firestore-rules).
 */
export async function saveSupportersConfig(
  names: string[],
  message: SupportersMessage
): Promise<number> {
  const sv = message.sv?.trim();
  const en = message.en?.trim();
  const updatedAt = Date.now();
  const payload: SupportersConfig = {
    names: names.map((n) => n.trim()).filter((n) => n.length > 0),
    ...(sv || en
      ? { message: { ...(sv ? { sv } : {}), ...(en ? { en } : {}) } }
      : {}),
    updatedAt,
  };
  await setDoc(supportersRef(), payload);
  return updatedAt;
}

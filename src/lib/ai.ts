/**
 * @file ai.ts
 * @description Klient för AI-genererade frågor och kreditköp.
 *
 * Tunna omslag kring två callable Cloud Functions i app-repot
 * (`tipspromenaden/functions/`):
 *   - `generateQuestions` → ett färdigt tipspack + förklaring/källa per fråga
 *   - `createCheckoutSession` → Stripe Checkout-URL för ett kreditpaket
 *
 * Kontraktet och felkoderna står i `tipspromenaden/docs/ai-questions-backend.md`.
 * Typerna här speglar backendens — ändra båda om kontraktet ändras.
 */

import { httpsCallable, FunctionsError } from "firebase/functions";
import { functions } from "./firebase";
import type { QuestionBattery } from "./tipspack";

export type AiMode = "topic" | "text" | "place";
export type AiDifficulty = "easy" | "medium" | "hard";
export type AiAudience = "kids" | "adults" | "mixed";

export interface GenerateRequest {
  mode: AiMode;
  prompt: string;
  sourceText?: string;
  place?: { name: string; lat?: number; lng?: number };
  count: number;
  language: string;
  difficulty: AiDifficulty;
  audience: AiAudience;
  requestId: string;
}

export interface QuestionNote {
  explanation: string;
  sourceUrl: string;
}

export interface GenerateResponse {
  battery: QuestionBattery;
  /** Parallell med `battery.questions`. */
  notes: QuestionNote[];
  creditsLeft: number;
  cost: number;
}

/** Samma gränser som backendens `request.ts`. */
export const AI_LIMITS = {
  minCount: 5,
  maxCount: 30,
  maxPrompt: 500,
  minSourceText: 200,
  maxSourceText: 20_000,
  maxPlace: 200,
};

/**
 * Kreditkostnad — kopia av `creditCost()` i backendens `request.ts`.
 * Används bara för att visa priset innan anropet; servern drar det riktiga.
 */
export function creditCost(mode: AiMode, count: number): number {
  return (mode === "place" ? 2 : 1) + (count > 15 ? 1 : 0);
}

export interface CreditPackInfo {
  id: "pack10" | "pack30";
  credits: number;
  /** Visningspris i SEK inkl. moms — det riktiga priset sätts i Stripe. */
  priceSek: number;
}

export const CREDIT_PACKS: CreditPackInfo[] = [
  { id: "pack10", credits: 10, priceSek: 49 },
  { id: "pack30", credits: 30, priceSek: 119 },
];

// Generering tar ofta 20–60 s (platsläget längre) — backendens timeout är 300 s.
const generateCallable = httpsCallable<GenerateRequest, GenerateResponse>(
  functions,
  "generateQuestions",
  { timeout: 300_000 }
);
const checkoutCallable = httpsCallable<{ packId: string }, { url: string }>(
  functions,
  "createCheckoutSession"
);

export async function generateQuestions(req: GenerateRequest): Promise<GenerateResponse> {
  const res = await generateCallable(req);
  return res.data;
}

/** Skapar en Checkout Session och returnerar URL:en att skicka användaren till. */
export async function startCheckout(packId: CreditPackInfo["id"]): Promise<string> {
  const res = await checkoutCallable({ packId });
  return res.data.url;
}

export type AiErrorReason =
  | "no-credits"
  | "rate-limited"
  | "in-progress"
  | "anonymous"
  | "generation-failed"
  | "invalid"
  | "network"
  | "unknown";

export interface AiError {
  reason: AiErrorReason;
  /** Serverns meddelande (svenska) — visas som detalj när det finns. */
  message: string;
}

/** Översätter ett fel från en callable till en `reason` som UI:t kan visa. */
export function toAiError(e: unknown): AiError {
  if (e instanceof FunctionsError) {
    const details = e.details as { reason?: string } | undefined;
    const known: AiErrorReason[] = [
      "no-credits",
      "rate-limited",
      "in-progress",
      "anonymous",
      "generation-failed",
    ];
    if (details?.reason && (known as string[]).includes(details.reason)) {
      return { reason: details.reason as AiErrorReason, message: e.message };
    }
    if (e.code === "functions/invalid-argument") return { reason: "invalid", message: e.message };
    if (e.code === "functions/unavailable" || e.code === "functions/deadline-exceeded") {
      return { reason: "network", message: e.message };
    }
    return { reason: "unknown", message: e.message };
  }
  return { reason: "unknown", message: e instanceof Error ? e.message : String(e) };
}

/** Nytt id per genereringsförsök — samma id vid retry ger inget dubbeldrag. */
export function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * @file ai.ts
 * @description Klient för AI-genererade frågor och kreditköp.
 *
 * Tunna omslag kring callable Cloud Functions i app-repot
 * (`tipspromenaden/functions/`):
 *   - `generateQuestions` → ett färdigt tipspack + förklaring/källa per fråga
 *   - `createCheckoutSession` → Stripe Checkout-URL för ett kreditpaket
 *   - `createInvoice` → faktura till skola/förening (större paket)
 *   - `createProCheckout` → Checkout för Pro-prenumerationen
 *   - `createPortalSession` → Stripes kundportal
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
  id: "pack10" | "pack30" | "pack100" | "pack300";
  credits: number;
  /** Visningspris i SEK inkl. moms — det riktiga priset sätts i Stripe. */
  priceSek: number;
  /** Går att få på faktura (skolor/föreningar). */
  invoice: boolean;
}

export const CREDIT_PACKS: CreditPackInfo[] = [
  { id: "pack10", credits: 10, priceSek: 49, invoice: false },
  { id: "pack30", credits: 30, priceSek: 119, invoice: false },
  { id: "pack100", credits: 100, priceSek: 349, invoice: true },
  { id: "pack300", credits: 300, priceSek: 899, invoice: true },
];

export interface ProPlanInfo {
  id: "pro_month" | "pro_year";
  /** Visningspris i SEK inkl. moms per period. */
  priceSek: number;
  creditsPerPeriod: number;
}

/** Samma som PRO_CREDITS_PER_MONTH i functions/src/config.ts. */
export const PRO_PLANS: ProPlanInfo[] = [
  { id: "pro_month", priceSek: 79, creditsPerPeriod: 20 },
  { id: "pro_year", priceSek: 790, creditsPerPeriod: 240 },
];

export interface InvoiceOrganization {
  name: string;
  orgNumber: string;
  vatNumber: string;
  email: string;
  reference: string;
  address: { line1: string; line2: string; postalCode: string; city: string; country: string };
}

export interface InvoiceResponse {
  invoiceId: string;
  number: string | null;
  hostedInvoiceUrl: string | null;
  amountDue: number;
  currency: string;
  dueDate: number | null;
}

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

const invoiceCallable = httpsCallable<
  { packId: string; requestId: string; organization: InvoiceOrganization },
  InvoiceResponse
>(functions, "createInvoice");
const proCheckoutCallable = httpsCallable<{ plan: ProPlanInfo["id"] }, { url: string }>(
  functions,
  "createProCheckout"
);
const portalCallable = httpsCallable<void, { url: string }>(functions, "createPortalSession");

export async function generateQuestions(req: GenerateRequest): Promise<GenerateResponse> {
  const res = await generateCallable(req);
  return res.data;
}

/** Skapar en Checkout Session och returnerar URL:en att skicka användaren till. */
export async function startCheckout(packId: CreditPackInfo["id"]): Promise<string> {
  const res = await checkoutCallable({ packId });
  return res.data.url;
}

/** Skickar en faktura till organisationen. Samma requestId vid retry → samma faktura. */
export async function requestInvoice(
  packId: CreditPackInfo["id"],
  organization: InvoiceOrganization,
  requestId: string
): Promise<InvoiceResponse> {
  const res = await invoiceCallable({ packId, organization, requestId });
  return res.data;
}

/** Checkout för Pro — returnerar URL:en att skicka användaren till. */
export async function startProCheckout(plan: ProPlanInfo["id"]): Promise<string> {
  const res = await proCheckoutCallable({ plan });
  return res.data.url;
}

/** Stripes kundportal: kort, plan, uppsägning, kvitton. */
export async function openCustomerPortal(): Promise<string> {
  const res = await portalCallable();
  return res.data.url;
}

export type AiErrorReason =
  | "no-credits"
  | "rate-limited"
  | "in-progress"
  | "anonymous"
  | "generation-failed"
  | "already-subscribed"
  | "too-many-open-invoices"
  | "no-customer"
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
      "already-subscribed",
      "too-many-open-invoices",
      "no-customer",
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

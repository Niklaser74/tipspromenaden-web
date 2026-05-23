/**
 * @file feedback.ts
 * @description Klient-side helpers för walkFeedback-kollektionen.
 *
 * Datamodell — `walkFeedback/{id}`-dokument:
 * ```
 * {
 *   id: string;
 *   walkId: string;
 *   sessionId: string;
 *   userId: string;
 *   overall: "up" | "down";
 *   details?: {
 *     questions: "up" | "down" | null;
 *     points: "up" | "down" | null;
 *     ui: "up" | "down" | null;
 *   };
 *   createdAt: number;
 * }
 * ```
 *
 * Firestore-rules: bara walk-ägaren ELLER admin (kollat via isAdmin()
 * i rules) får läsa. Vem som helst inloggad (inkl. anonym) får skapa.
 * Skrivvägen ligger i mobil-appen (`src/services/firestore.ts
 * submitWalkFeedback`); webben är read-only.
 *
 * Aggregering körs klient-side eftersom volymen är liten (max några
 * tusen feedback-docs totalt på hobbyskala). Om det växer förbi det:
 * cacha aggregat i `walks/{id}.feedbackSummary` via Cloud Function.
 */

import { collection, getDocs } from "firebase/firestore";
import { db } from "./firebase";

export type Thumb = "up" | "down";
export type CategoryRating = Thumb | null;

export interface WalkFeedbackDoc {
  id: string;
  walkId: string;
  sessionId: string;
  userId: string;
  overall: Thumb;
  details?: {
    questions: CategoryRating;
    points: CategoryRating;
    ui: CategoryRating;
  };
  createdAt: number;
}

/** Per-walk-aggregat efter att alla feedback-docs hopsamlats. */
export interface FeedbackAggregate {
  walkId: string;
  total: number;
  up: number;
  down: number;
  details: {
    questions: { up: number; down: number };
    points: { up: number; down: number };
    ui: { up: number; down: number };
  };
}

/** Global aggregat över alla walks (för Overview-statistik). */
export interface FeedbackOverall {
  total: number;
  up: number;
  down: number;
  walksWithFeedback: number;
  positiveRate: number; // 0..1, total > 0 ? up/total : 0
}

/**
 * Hämta alla feedback-dokument. Kräver att skribenten antingen är
 * walk-ägare för respektive walk ELLER admin. Vid permission-denied
 * (icke-admin på webben) returneras tom array — UI:t visar då
 * "ingen feedback".
 */
export async function getAllFeedback(): Promise<WalkFeedbackDoc[]> {
  try {
    const snap = await getDocs(collection(db, "walkFeedback"));
    return snap.docs.map((d) => d.data() as WalkFeedbackDoc);
  } catch (e) {
    console.warn("getAllFeedback misslyckades:", (e as Error).message);
    return [];
  }
}

/** Bygg upp en Map<walkId, aggregat> från en feedback-lista. */
export function aggregateByWalk(
  feedback: WalkFeedbackDoc[]
): Map<string, FeedbackAggregate> {
  const map = new Map<string, FeedbackAggregate>();
  for (const f of feedback) {
    let agg = map.get(f.walkId);
    if (!agg) {
      agg = {
        walkId: f.walkId,
        total: 0,
        up: 0,
        down: 0,
        details: {
          questions: { up: 0, down: 0 },
          points: { up: 0, down: 0 },
          ui: { up: 0, down: 0 },
        },
      };
      map.set(f.walkId, agg);
    }
    agg.total += 1;
    if (f.overall === "up") agg.up += 1;
    else agg.down += 1;

    if (f.details) {
      for (const k of ["questions", "points", "ui"] as const) {
        const rating = f.details[k];
        if (rating === "up") agg.details[k].up += 1;
        else if (rating === "down") agg.details[k].down += 1;
      }
    }
  }
  return map;
}

/** Övergripande aggregat — total + procent positivt. */
export function overallStats(feedback: WalkFeedbackDoc[]): FeedbackOverall {
  const aggMap = aggregateByWalk(feedback);
  let up = 0;
  let down = 0;
  for (const a of aggMap.values()) {
    up += a.up;
    down += a.down;
  }
  const total = up + down;
  return {
    total,
    up,
    down,
    walksWithFeedback: aggMap.size,
    positiveRate: total > 0 ? up / total : 0,
  };
}

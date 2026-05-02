/**
 * @file walkGeo.ts
 * @description Geografiska hjälpfunktioner för walks. Speglar
 * `tipspromenaden-app/src/utils/walkGeo.ts` så samma centroid-logik
 * körs på båda klienterna — viktigt eftersom walks editas i båda och
 * "nära mig"-sortering förlitar sig på samma definition av centroid.
 */

import type { Walk, Coordinate } from "./types";

/**
 * Räknar ut centrum-koordinaten för en promenad genom att ta medelvärdet
 * av alla frågors koordinater.
 *
 * Hoppar över koordinater som är `(0, 0)` — appen använder dem som
 * sentinel för "ej placerad" och de skulle annars dra centroid mot
 * Atlanten för halvfärdiga walks.
 *
 * Returnerar null om walken saknar giltiga placerade koordinater.
 */
export function walkCentroid(walk: Walk): Coordinate | null {
  const coords = (walk.questions || [])
    .map((q) => q.coordinate)
    .filter(
      (c): c is Coordinate =>
        !!c &&
        Number.isFinite(c.latitude) &&
        Number.isFinite(c.longitude) &&
        !(c.latitude === 0 && c.longitude === 0)
    );
  if (coords.length === 0) return null;
  const sum = coords.reduce(
    (acc, c) => ({
      latitude: acc.latitude + c.latitude,
      longitude: acc.longitude + c.longitude,
    }),
    { latitude: 0, longitude: 0 }
  );
  return {
    latitude: sum.latitude / coords.length,
    longitude: sum.longitude / coords.length,
  };
}

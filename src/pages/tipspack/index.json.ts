/**
 * @file index.json.ts
 * @description Statisk JSON-endpoint som listar alla curated `.tipspack`-paket
 * + metadata. Genereras vid Astro-build och serveras som
 * `https://tipspromenaden.app/tipspack/index.json`.
 *
 * Konsumeras av mobilappens LibraryScreen som mergar curated-listan med
 * Firestore-uppladdade pack i ett gemensamt bibliotek.
 */

import type { APIRoute } from "astro";
import { getCuratedTipspacks } from "../../lib/curatedTipspacks";

export const prerender = true;

export const GET: APIRoute = () => {
  const packs = getCuratedTipspacks().map((p) => ({
    slug: p.slug,
    filename: p.filename,
    url: `https://tipspromenaden.app/tipspack/${p.filename}`,
    name: p.name,
    description: p.description,
    author: p.author,
    language: p.language,
    questionCount: p.questionCount,
    fileSizeBytes: p.fileSizeBytes,
  }));

  return new Response(JSON.stringify({ packs }, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};

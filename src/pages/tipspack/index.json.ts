/**
 * @file index.json.ts
 * @description Statisk JSON-endpoint som listar alla curated `.tipspack`-paket
 * + deras metadata. Genereras vid Astro-build, serveras som statisk fil från
 * `https://tipspromenaden.app/tipspack/index.json`.
 *
 * Konsumeras av:
 *   - Mobilappens LibraryScreen (visar curated + Firestore-uppladdade
 *     tipspacks i ett gemensamt bibliotek)
 *   - Eventuellt framtida widgets / integrationer som vill veta vilka
 *     curated paket som finns
 *
 * Datat speglar det som /tipspack-sidan genererar — samma fält, samma
 * källa (public/tipspack/-mappen).
 */

import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";

export const prerender = true;

export interface CuratedTipspackMeta {
  slug: string;
  filename: string;
  url: string; // absolut URL för nedladdning
  name: string;
  description: string;
  author: string;
  language: string;
  questionCount: number;
  fileSizeBytes: number;
}

export const GET: APIRoute = () => {
  const dir = path.join(process.cwd(), "public", "tipspack");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".tipspack"))
    .sort();

  const packs: CuratedTipspackMeta[] = files.map((filename) => {
    const filePath = path.join(dir, filename);
    const content = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(content);
    const stats = fs.statSync(filePath);
    return {
      slug: filename.replace(/\.tipspack$/, ""),
      filename,
      url: `https://tipspromenaden.app/tipspack/${filename}`,
      name: json.name,
      description: json.description || "",
      author: json.author || "Okänd",
      language: json.language || "sv",
      questionCount: Array.isArray(json.questions) ? json.questions.length : 0,
      fileSizeBytes: stats.size,
    };
  });

  return new Response(JSON.stringify({ packs }, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};

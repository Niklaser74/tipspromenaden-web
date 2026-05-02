/**
 * @file curatedTipspacks.ts
 * @description Läser metadata från curated `.tipspack`-filerna i
 * `public/tipspack/`. Konsumeras av både `/tipspack/index.astro` (visar
 * listan på sajten) och `/tipspack/index.json.ts` (REST-endpoint för
 * mobilappens bibliotek).
 *
 * Båda kallar denna vid Astro-build-tid (Astro prerender) så fs-läsning
 * är OK — sker inte per HTTP-request.
 */

import fs from "node:fs";
import path from "node:path";

export interface CuratedTipspackMeta {
  /** Filnamn utan `.tipspack`-suffix (= URL-slug). */
  slug: string;
  /** Komplett filnamn med suffix. */
  filename: string;
  /** Filstorlek i bytes. */
  fileSizeBytes: number;
  /** Från JSON-fältet `name`. */
  name: string;
  /** Från JSON-fältet `description` (default tom). */
  description: string;
  /** Från JSON-fältet `author` (default "Okänd"). */
  author: string;
  /** Från JSON-fältet `language` (default "sv"). */
  language: string;
  /** Längd på `questions`-arrayen. */
  questionCount: number;
}

/**
 * Läser och parsar alla curated tipspack-filer. Sorterad alfabetiskt
 * på filnamn för stabil ordning.
 */
export function getCuratedTipspacks(): CuratedTipspackMeta[] {
  const dir = path.join(process.cwd(), "public", "tipspack");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".tipspack"))
    .sort();

  return files.map((filename) => {
    const filePath = path.join(dir, filename);
    const content = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(content);
    const stats = fs.statSync(filePath);
    return {
      slug: filename.replace(/\.tipspack$/, ""),
      filename,
      fileSizeBytes: stats.size,
      name: json.name,
      description: json.description || "",
      author: json.author || "Okänd",
      language: json.language || "sv",
      questionCount: Array.isArray(json.questions) ? json.questions.length : 0,
    };
  });
}

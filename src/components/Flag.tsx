/**
 * @file Flag.tsx
 * @description Renderar en flagga som riktig bild istället för emoji.
 *
 * Bakgrund: emojis för flaggor (`🇸🇪`) är "regional indicator"-par —
 * t.ex. SE = U+1F1F8 + U+1F1EA. Dessa renderas som flaggor på iOS, macOS,
 * Android, Linux med emoji-fonts — men på Windows finns inga flag-glyfer i
 * default-fonts (Microsoft har medvetet utelämnat dem av geopolitiska
 * skäl), så de renderas som bokstäverna "SE", "GB", etc. Det ser fult ut.
 *
 * Lösning: använd PNG-flaggor från flagcdn.com — fri tjänst, snabbt edge-
 * cachad, ~1 KB per bild, konsekvent rendering på alla plattformar.
 *
 * Komponenten fungerar både i React-island och Astro-server-render-läge
 * eftersom det bara är en `<img>`-tagg.
 */

import { flagImageUrl, normalizeLanguageCode } from "../lib/languages";

interface Props {
  /** ISO 639-1-kod, t.ex. "sv". */
  code: string | undefined;
  /** Bildens höjd i pixlar. Default 20. */
  height?: number;
  /** Extra className för container. */
  className?: string;
}

export function Flag({ code, height = 20, className = "" }: Props) {
  const url = flagImageUrl(code);
  if (!url) return null;
  const normalized = normalizeLanguageCode(code);
  // Width-ratio: flaggor är typiskt 4:3 (sv) till 2:1 (no/dk) — flagcdn
  // levererar bilder med korrekt ratio men vi kan beräkna grovt så
  // layouten inte hoppar innan bilden laddats.
  const aspectRatio: Record<string, number> = {
    sv: 1.6, // 8:5
    en: 2,
    de: 1.667, // 5:3
    no: 1.375, // 22:16
    da: 1.31,
    fi: 1.636,
    fr: 1.5, // 3:2
    es: 1.5,
  };
  const ratio = aspectRatio[normalized] || 1.5;
  const width = Math.round(height * ratio);
  // Vi laddar alltid h40 från CDN (för retina-skärpa) och skalar visuellt
  // via height/width-attribut + style.
  return (
    <img
      src={url}
      alt={normalized || ""}
      width={width}
      height={height}
      className={`inline-block align-text-bottom rounded-sm ${className}`}
      style={{ width: `${width}px`, height: `${height}px`, objectFit: "cover" }}
      loading="lazy"
    />
  );
}

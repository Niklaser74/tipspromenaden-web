/**
 * @file HelpIcon.tsx
 * @description Liten "?"-ikon med popover-hjälptext.
 *
 * Två triggers:
 *   - Hover (mouse-enter/leave) — för desktop-användare
 *   - Klick — för touch-enheter där hover inte finns
 *
 * Designval: subtil grå cirkel ~14px, popovern är en absolut-positionerad
 * tooltip ovanför ikonen med pil. Använd i form-labels när hint-texten är
 * lite för lång att alltid visa, eller i tab-headers + nyckel-knappar.
 *
 * @example
 *   <label>
 *     Event-kod
 *     <HelpIcon text="Används i QR-koden och som dokument-id." />
 *   </label>
 */

import { useEffect, useRef, useState } from "react";

interface Props {
  /** Hjälptexten som visas. Håll under ~200 tecken. */
  text: string;
  /**
   * Vart popovern öppnas. "top" (default) lägger den ovanför ikonen,
   * "bottom" under. Använd "bottom" om ikonen är nära toppen av sidan.
   */
  side?: "top" | "bottom";
}

export function HelpIcon({ text, side = "top" }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Stäng popovern när användaren klickar utanför (touch-läge).
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block ml-1 align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rule/40 hover:bg-rule/60 text-text-warm text-[10px] font-bold cursor-help leading-none"
        aria-label="Hjälp"
        aria-expanded={open}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute z-50 ${
            side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          } left-1/2 -translate-x-1/2 w-64 bg-green-dark text-cream text-xs leading-relaxed rounded-lg shadow-xl px-3 py-2 pointer-events-none`}
        >
          {text}
        </span>
      )}
    </span>
  );
}

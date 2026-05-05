/**
 * @file WalkMiniMap.tsx
 * @description Liten Leaflet-karta för admin-vyns inspektera-walk.
 *
 * Visar ett område runt walkens kontrollpunkter så att man får en
 * känsla för var den ligger geografiskt. Cap:ar zoom så att vi alltid
 * ser minst ~5 km även för walks där alla kontroller ligger nära
 * varandra.
 */

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Coordinate } from "../../lib/types";

interface Props {
  points: Coordinate[];
  /** Tilesource. Default OSM standard. */
  tileUrl?: string;
}

/**
 * Maxzoom så att en walk med alla kontroller inom 100 m ändå visar ett
 * större område. Zoom 13 ≈ 5 km bred vy på en 250 px-karta — räcker för
 * att placera walken geografiskt utan att gränsa ut grannskapen.
 */
const MAX_ZOOM = 13;

export default function WalkMiniMap({
  points,
  tileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    if (!containerRef.current || points.length === 0) return;

    const map = L.map(containerRef.current, {
      zoomControl: interactive,
      attributionControl: true,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
    });
    mapRef.current = map;

    L.tileLayer(tileUrl, {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const bounds = L.latLngBounds(
      points.map((p) => [p.latitude, p.longitude] as [number, number])
    );
    map.fitBounds(bounds, { padding: [16, 16], maxZoom: MAX_ZOOM });

    points.forEach((p, i) => {
      L.circleMarker([p.latitude, p.longitude], {
        radius: 5,
        color: "#1B6B35",
        fillColor: "#2D7A3A",
        fillOpacity: 0.9,
        weight: 2,
      })
        .addTo(map)
        .bindTooltip(String(i + 1), { permanent: false });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Återskapa kartan när interactive-läget byts — Leaflets handler-toggles
    // är pjåkiga att uppdatera in-flight, det är säkrare att rebuild:a.
  }, [points, tileUrl, interactive]);

  if (points.length === 0) {
    return (
      <p className="text-xs text-text-warm italic">
        Inga koordinater att visa.
      </p>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="rounded-lg border border-rule overflow-hidden"
        style={{ width: "100%", height: interactive ? 360 : 200 }}
      />
      <button
        onClick={() => setInteractive((v) => !v)}
        className="absolute top-2 right-2 z-[1000] bg-white/95 border border-rule px-3 py-1 rounded-full text-xs font-semibold text-green-dark shadow hover:shadow-md"
      >
        {interactive ? "Lås karta" : "🔍 Granska"}
      </button>
    </div>
  );
}

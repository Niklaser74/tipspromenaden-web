/**
 * @file MapEditor.tsx
 * @description Leaflet-karta för walk-editorn.
 *
 * Vi hanterar Leaflet manuellt (utan react-leaflet) eftersom appen är
 * liten nog att inte dra in en wrapper-bibliotek, och Leaflet:s imperativa
 * API är okej att fila in i en useEffect.
 *
 * Funktioner:
 *   - Klick på kartan i `placingMode` → onMapClick(coord)
 *   - Markörer per fråga, klickbar → onMarkerClick(qid)
 *   - Visar nummer på markörerna
 *   - Linje (polyline) som binder ihop frågorna i ordning
 *   - Default-vy om inga frågor: hela Sverige
 *
 * Leaflet-CSS importeras högst upp i filen — det räcker med en gång
 * per app-bundle.
 */

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Coordinate, Question } from "../../lib/types";

interface Props {
  questions: Question[];
  selectedQuestionId: string | null;
  placingMode: boolean;
  onMapClick: (coord: Coordinate) => void;
  onMarkerClick: (qid: string) => void;
  /** Anropas när användaren dragit en markör till ny position. */
  onMarkerDragEnd: (qid: string, coord: Coordinate) => void;
}

export function MapEditor({
  questions,
  selectedQuestionId,
  placingMode,
  onMapClick,
  onMarkerClick,
  onMarkerDragEnd,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const polylineRef = useRef<L.Polyline | null>(null);

  // Init kartan en gång
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [62.0, 15.0], // grov mitt-Sverige
      zoom: 5,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap-bidragsgivare",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Klick-handler — uppdateras varje render eftersom callbacks kan ändra
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: L.LeafletMouseEvent) => {
      onMapClick({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [onMapClick]);

  // Cursor-style i placing-mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const container = map.getContainer();
    container.style.cursor = placingMode ? "crosshair" : "";
  }, [placingMode]);

  // Markörer + polyline — uppdateras varje gång frågor ändras
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Rensa gamla markörer
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

    const placed = questions.filter(
      (q) => q.coordinate.latitude !== 0 || q.coordinate.longitude !== 0
    );

    placed.forEach((q) => {
      const isSelected = q.id === selectedQuestionId;
      const icon = L.divIcon({
        className: "tp-marker",
        html: `<div style="
          background: ${isSelected ? "#1a5c2e" : "#2d7a45"};
          color: #fff8e7;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-family: 'Instrument Sans', sans-serif;
          border: ${isSelected ? "3px solid #fff8e7" : "2px solid #fff8e7"};
          box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        ">${q.order}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker(
        [q.coordinate.latitude, q.coordinate.longitude],
        { icon, draggable: true, autoPan: true }
      ).addTo(map);
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onMarkerClick(q.id);
      });
      marker.on("dragstart", () => {
        // Klicka in frågan i sidopanelen så användaren ser vilken hen drar.
        onMarkerClick(q.id);
      });
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onMarkerDragEnd(q.id, { latitude: pos.lat, longitude: pos.lng });
      });
      markersRef.current.set(q.id, marker);
    });

    // Polyline mellan frågorna i ordning
    polylineRef.current?.remove();
    if (placed.length >= 2) {
      const sorted = [...placed].sort((a, b) => a.order - b.order);
      polylineRef.current = L.polyline(
        sorted.map((q) => [q.coordinate.latitude, q.coordinate.longitude]),
        { color: "#2d7a45", weight: 3, opacity: 0.6, dashArray: "8 6" }
      ).addTo(map);
    }

    // Auto-fit första gången vi har frågor
    if (placed.length > 0 && map.getZoom() <= 6) {
      const bounds = L.latLngBounds(
        placed.map((q) => [q.coordinate.latitude, q.coordinate.longitude])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [questions, selectedQuestionId, onMarkerClick]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

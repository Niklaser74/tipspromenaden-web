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

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.gridlayer.googlemutant";
import type { Coordinate, Question } from "../../lib/types";

/** Maps JavaScript API key — restricted to tipspromenaden.app + localhost
 *  i Google Cloud Console. Säker att committa eftersom domänlås gör att
 *  ingen annan kan använda nyckeln. */
const GOOGLE_MAPS_API_KEY = "AIzaSyDdi3vZt9H4y97FzmazSciP6CYebQV3cN0";

// Singleton-loader så vi inte kallar Google's script flera gånger om
// MapEditor remount:as.
//
// Vi injicerar Maps API-scripten direkt istället för att använda
// @googlemaps/js-api-loader — v2 av paketet tog bort Loader-klassen
// och dess nya importLibrary("maps") populerar inte window.google.maps
// på det sätt som leaflet.gridlayer.googlemutant räknar med. Direkt
// scriptinjection är hur Google själva rekommenderar och ger oss
// ett komplett window.google.maps-namespace direkt.
let googleMapsPromise: Promise<void> | null = null;
function loadGoogleMaps(): Promise<void> {
  if (
    typeof window !== "undefined" &&
    (window as any).google?.maps?.Map
  ) {
    return Promise.resolve();
  }
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&v=weekly&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (e) => {
      googleMapsPromise = null; // tillåt retry
      reject(e);
    };
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

/**
 * Karttyp — speglar appens `MapType` (services/storage.ts) så samma
 * tre val finns på båda plattformar:
 * - standard: OpenStreetMap (visar stigar bra)
 * - hybrid:   Esri World Imagery + reference-overlay (satellit + etiketter)
 * - terrain:  OpenTopoMap (topografi + stigar + höjdkurvor)
 */
type MapType = "standard" | "hybrid" | "terrain";
const MAP_TYPE_STORAGE_KEY = "tp.mapType";
const CYCLE_ORDER: MapType[] = ["standard", "hybrid", "terrain"];
const LABEL: Record<MapType, string> = {
  standard: "🗺 Karta",
  hybrid: "🛰 Hybrid",
  terrain: "⛰ Terräng",
};

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
  // Tile-lager (bas + ev. overlay) refas så vi kan ta bort dem vid byte
  // av karttyp. Hybrid har en ref-overlay (etiketter) ovanpå satelliten.
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const overlayLayerRef = useRef<L.TileLayer | null>(null);

  // Persisterad mellan sessions så användaren inte behöver byta varje gång.
  const [mapType, setMapType] = useState<MapType>(() => {
    if (typeof window === "undefined") return "standard";
    const saved = window.localStorage.getItem(MAP_TYPE_STORAGE_KEY);
    return CYCLE_ORDER.includes(saved as MapType)
      ? (saved as MapType)
      : "standard";
  });

  function applyMapType(map: L.Map, type: MapType) {
    if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
      baseLayerRef.current = null;
    }
    if (overlayLayerRef.current) {
      map.removeLayer(overlayLayerRef.current);
      overlayLayerRef.current = null;
    }

    if (type === "hybrid") {
      baseLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles &copy; Esri", maxZoom: 19 }
      ).addTo(map);
      overlayLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19 }
      ).addTo(map);
    } else if (type === "terrain") {
      baseLayerRef.current = L.tileLayer(
        "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
        {
          attribution: "Map: &copy; OpenTopoMap (CC-BY-SA)",
          maxZoom: 17,
        }
      ).addTo(map);
    } else {
      // Standard = Google Maps via leaflet.gridlayer.googlemutant. Vi
      // använder Googles roadmap-stil för att matcha mobil-appen
      // ("Karta"-vyn där). Loader:n är async så vi sätter en temporär
      // OSM-layer omedelbart och swappar till Google när det är klart —
      // användaren ser aldrig en blank karta.
      const placeholder = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { attribution: "Loading…", maxZoom: 19 }
      ).addTo(map);
      baseLayerRef.current = placeholder;

      loadGoogleMaps()
        .then(() => {
          // Race-skydd: användaren kan ha tryckt på toggle:n innan
          // Google laddat. Acceptera bara byte om vi fortfarande är
          // på "standard" och placeholder fortfarande är aktiv layer.
          if (baseLayerRef.current !== placeholder) return;
          map.removeLayer(placeholder);
          // @ts-ignore — googleMutant lägger till sig som L.gridLayer.googleMutant
          const gm = L.gridLayer.googleMutant({ type: "roadmap" });
          gm.addTo(map);
          baseLayerRef.current = gm as unknown as L.TileLayer;
        })
        .catch((err) => {
          console.warn(
            "Google Maps kunde inte laddas, kör vidare med OSM:",
            err
          );
          // Lämna placeholder OSM-layer kvar — bättre än blank karta.
        });
    }
  }

  function cycleMapType() {
    setMapType((curr) => {
      const idx = CYCLE_ORDER.indexOf(curr);
      const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
      try {
        window.localStorage.setItem(MAP_TYPE_STORAGE_KEY, next);
      } catch {
        // Quota / private mode — strunta i, fungerar för session ändå
      }
      return next;
    });
  }

  // Init kartan en gång
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [62.0, 15.0], // grov mitt-Sverige
      zoom: 5,
      zoomControl: true,
    });

    applyMapType(map, mapType);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      baseLayerRef.current = null;
      overlayLayerRef.current = null;
    };
    // mapType läses bara vid mount — efterföljande byten hanteras av nästa effekt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Byt tile-lager när mapType ändras (utan att forsa om hela kartan)
  useEffect(() => {
    if (!mapRef.current) return;
    applyMapType(mapRef.current, mapType);
  }, [mapType]);

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

  // Två syskon-element, båda absolute mot samma föräldercontainer
  // (WalkEditor:s "relative"-div). Att INTE wrappa kart-divet i en
  // till-div är viktigt — Leaflet behöver kart-divet som direkt-barn
  // till en sized container för att mäta dimensioner korrekt vid mount.
  // Wrapper bröt blank-rendering tidigare.
  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      <button
        type="button"
        onClick={cycleMapType}
        className="absolute top-3 right-3 z-[1000] bg-white/95 hover:bg-white border border-rule rounded-full px-3 py-1.5 text-sm font-semibold text-green-dark shadow-md cursor-pointer"
        title="Byt karttyp"
      >
        {LABEL[mapType]}
      </button>
    </>
  );
}

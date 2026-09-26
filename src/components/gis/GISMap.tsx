"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, LocateFixed, Minus, Plus, Satellite } from "lucide-react";
import type { StyleSpecification } from "maplibre-gl";
import type { GeoBounds, GeoPoint } from "@/types";
import { cn } from "@/lib/utils";
import "maplibre-gl/dist/maplibre-gl.css";

interface GISMapProps {
  center: GeoPoint;
  boundary?: GeoBounds;
  projectName: string;
  locationLabel: string;
  className?: string;
  heightClass?: string;
}

type MapStyle = "map" | "satellite";

function buildStyle(mode: MapStyle): StyleSpecification {
  if (mode === "satellite") {
    return {
      version: 8,
      sources: {
        sat: {
          type: "raster",
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "Tiles © Esri",
        },
      },
      layers: [{ id: "sat", type: "raster", source: "sat" }],
    };
  }

  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

function isValidCoord(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function GISMap({
  center,
  boundary,
  projectName,
  locationLabel,
  className,
  heightClass = "h-[420px] md:h-[560px]",
}: GISMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const [style, setStyle] = useState<MapStyle>("satellite");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  const lat = isValidCoord(center.lat, center.lng) ? center.lat : -1.2864;
  const lng = isValidCoord(center.lat, center.lng) ? center.lng : 36.8172;

  // Init / re-init when basemap style changes
  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    async function init() {
      if (!containerRef.current) return;
      try {
        const maplibregl = (await import("maplibre-gl")).default;

        if (cancelled || !containerRef.current) return;

        markerRef.current?.remove();
        markerRef.current = null;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        setReady(false);
        setError(false);

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: buildStyle(style),
          center: [lng, lat],
          zoom: 13.2,
          attributionControl: false,
        });

        map.addControl(
          new maplibregl.AttributionControl({ compact: true }),
          "bottom-left"
        );
        map.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "bottom-right"
        );

        map.on("error", () => {
          if (!cancelled) setError(true);
        });

        map.on("load", () => {
          if (cancelled) return;

          const marker = new maplibregl.Marker({ color: "#e5b12a" })
            .setLngLat([lng, lat])
            .setPopup(
              new maplibregl.Popup({ offset: 16 }).setHTML(
                `<strong style="color:#111">${escapeHtml(projectName)}</strong><br/><span style="color:#555">${escapeHtml(locationLabel)}</span>`
              )
            )
            .addTo(map);

          markerRef.current = marker;

          if (boundary) {
            map.addSource("project-boundary", {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: boundary,
              },
            });
            map.addLayer({
              id: "project-boundary-fill",
              type: "fill",
              source: "project-boundary",
              paint: {
                "fill-color": "#e5b12a",
                "fill-opacity": 0.12,
              },
            });
            map.addLayer({
              id: "project-boundary-line",
              type: "line",
              source: "project-boundary",
              paint: {
                "line-color": "#e5b12a",
                "line-width": 2,
              },
            });
          }

          map.resize();
          setReady(true);
        });

        mapRef.current = map;

        if (containerRef.current && typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => map.resize());
          resizeObserver.observe(containerRef.current);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    init();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Style + boundary geometry drive full remount; pin moves via effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, boundary, projectName, locationLabel]);

  // Keep pin + camera locked to the exact project coordinates
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !ready) return;
    if (!isValidCoord(center.lat, center.lng)) return;

    marker.setLngLat([center.lng, center.lat]);
    map.jumpTo({ center: [center.lng, center.lat] });
  }, [center.lat, center.lng, ready]);

  const zoomBy = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.zoomTo(map.getZoom() + delta, { duration: 280 });
  };

  const recenter = () => {
    mapRef.current?.flyTo({
      center: [lng, lat],
      zoom: 13.2,
      duration: 800,
    });
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-map-land",
        heightClass,
        className
      )}
    >
      <div ref={containerRef} className="maplibre-container absolute inset-0" />

      {(error || !ready) && (
        <div className="pointer-events-none absolute inset-0 bg-grid-subtle">
          <MockMapFallback center={{ lat, lng }} />
        </div>
      )}

      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[220px] rounded-md border border-border bg-bg/85 p-3 backdrop-blur-md">
        <p className="meta-label text-success">Live project location</p>
        <p className="mt-2 text-small font-medium text-ink">{projectName}</p>
        <p className="mt-1 text-caption text-ink-muted">{locationLabel}</p>
        <p className="mt-2 font-mono text-[10px] text-ink-subtle">
          {lat.toFixed(4)}°, {lng.toFixed(4)}°
        </p>
      </div>

      <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
        <div className="flex overflow-hidden rounded-md border border-border bg-bg/85 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setStyle("map")}
            className={cn(
              "flex h-9 items-center gap-1.5 px-3 text-caption transition-colors",
              style === "map" ? "bg-surface text-ink" : "text-ink-muted hover:text-ink"
            )}
            aria-pressed={style === "map"}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden />
            Map
          </button>
          <button
            type="button"
            onClick={() => setStyle("satellite")}
            className={cn(
              "flex h-9 items-center gap-1.5 px-3 text-caption transition-colors",
              style === "satellite"
                ? "bg-surface text-ink"
                : "text-ink-muted hover:text-ink"
            )}
            aria-pressed={style === "satellite"}
          >
            <Satellite className="h-3.5 w-3.5" aria-hidden />
            Satellite
          </button>
        </div>

        <div className="flex flex-col overflow-hidden rounded-md border border-border bg-bg/85 backdrop-blur-md">
          <button
            type="button"
            onClick={() => zoomBy(1)}
            className="flex h-9 w-9 items-center justify-center text-ink-muted hover:text-ink"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => zoomBy(-1)}
            className="flex h-9 w-9 items-center justify-center border-t border-border text-ink-muted hover:text-ink"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={recenter}
            className="flex h-9 w-9 items-center justify-center border-t border-border text-ink-muted hover:text-ink"
            aria-label="Recenter on project"
          >
            <LocateFixed className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function MockMapFallback({ center }: { center: GeoPoint }) {
  return (
    <div className="absolute inset-0 bg-[#14201c]">
      <svg className="h-full w-full opacity-40" aria-hidden>
        <defs>
          <pattern id="roads" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M0 40 H80 M40 0 V80" stroke="#3a4a44" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#roads)" />
        <circle cx="50%" cy="48%" r="90" fill="#1e3a34" opacity="0.5" />
      </svg>
      <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute inset-0 animate-pulse-soft rounded-full bg-accent/40" />
        <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-accent" />
      </div>
      <p className="absolute bottom-4 left-4 font-mono text-[10px] text-ink-subtle">
        Preview · {center.lat.toFixed(3)}, {center.lng.toFixed(3)}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import type { GeoPoint } from "@/types";
import { cn } from "@/lib/utils";
import "maplibre-gl/dist/maplibre-gl.css";

interface CoordinatePickerMapProps {
  center: GeoPoint;
  onChange: (point: GeoPoint) => void;
  label?: string;
  className?: string;
  heightClass?: string;
}

function isValidCoord(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Compact interactive map for setting project pin coordinates */
export function CoordinatePickerMap({
  center,
  onChange,
  label = "Project location",
  className,
  heightClass = "h-56",
}: CoordinatePickerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const markerRef = useRef<import("maplibre-gl").Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  onChangeRef.current = onChange;

  const valid = isValidCoord(center.lat, center.lng);
  const display = valid ? center : { lat: -1.2864, lng: 36.8172 };

  // Init map once
  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    async function init() {
      if (!containerRef.current) return;
      try {
        const maplibregl = (await import("maplibre-gl")).default;
        if (cancelled || !containerRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: {
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
          },
          center: [display.lng, display.lat],
          zoom: 14,
          attributionControl: false,
        });

        map.addControl(
          new maplibregl.AttributionControl({ compact: true }),
          "bottom-left"
        );

        const marker = new maplibregl.Marker({
          color: "#e5b12a",
          draggable: true,
        })
          .setLngLat([display.lng, display.lat])
          .addTo(map);

        marker.on("dragend", () => {
          const { lng, lat } = marker.getLngLat();
          onChangeRef.current({
            lat: Number(lat.toFixed(6)),
            lng: Number(lng.toFixed(6)),
          });
        });

        map.on("click", (e) => {
          const { lng, lat } = e.lngLat;
          const point = {
            lat: Number(lat.toFixed(6)),
            lng: Number(lng.toFixed(6)),
          };
          marker.setLngLat([point.lng, point.lat]);
          onChangeRef.current(point);
        });

        map.on("load", () => {
          if (cancelled) return;
          map.resize();
          setReady(true);
        });

        map.on("error", () => {
          if (!cancelled) setError(true);
        });

        mapRef.current = map;
        markerRef.current = marker;

        if (containerRef.current && typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            map.resize();
          });
          resizeObserver.observe(containerRef.current);
        }

        // Drawer animation — resize after layout settles
        requestAnimationFrame(() => map.resize());
        setTimeout(() => map.resize(), 320);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once when mounted
  }, []);

  // Sync pin + camera when lat/lng inputs change
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !ready) return;
    if (!isValidCoord(center.lat, center.lng)) return;

    const current = marker.getLngLat();
    const moved =
      Math.abs(current.lat - center.lat) > 0.000001 ||
      Math.abs(current.lng - center.lng) > 0.000001;

    if (!moved) return;

    marker.setLngLat([center.lng, center.lat]);
    map.flyTo({
      center: [center.lng, center.lat],
      zoom: Math.max(map.getZoom(), 13),
      duration: 500,
      essential: true,
    });
  }, [center.lat, center.lng, ready]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map || !valid) return;
    map.flyTo({
      center: [center.lng, center.lat],
      zoom: 14,
      duration: 600,
    });
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="meta-label flex items-center gap-1.5 text-accent">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          Live pin preview
        </p>
        <button
          type="button"
          onClick={recenter}
          disabled={!valid}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-caption text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:opacity-40"
        >
          <LocateFixed className="h-3.5 w-3.5" aria-hidden />
          Recenter
        </button>
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-md border border-border bg-map-land",
          heightClass
        )}
      >
        <div ref={containerRef} className="maplibre-container absolute inset-0" />

        {(!ready || error) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#14201c]">
            <div className="text-center">
              <span className="mx-auto mb-2 block h-3 w-3 rounded-full border-2 border-bg bg-accent" />
              <p className="text-caption text-ink-subtle">
                {error ? "Map unavailable — pin still saved from coordinates" : "Loading map…"}
              </p>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg/80 to-transparent px-3 pb-3 pt-8">
          <p className="text-caption font-medium text-ink">{label}</p>
          <p className="mt-0.5 font-mono text-[10px] text-ink-subtle">
            {valid
              ? `${center.lat.toFixed(6)}°, ${center.lng.toFixed(6)}°`
              : "Enter valid latitude & longitude"}
          </p>
        </div>
      </div>

      <p className="text-caption text-ink-subtle">
        Click the map or drag the gold pin to set the exact location. Coordinates
        update automatically.
      </p>
    </div>
  );
}

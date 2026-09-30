// src/components/stats/GeoLocationMap.tsx
// 3D streaming globe rendered with MapLibre GL on free OpenFreeMap vector tiles (no API key).

import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type LngLatLike } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StreamingLocation } from "@/types/tautulli";

interface GeoLocationMapProps {
  locations: StreamingLocation[];
}

const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
const SOURCE_ID = "streaming-locations";
const SPIN_DEGREES_PER_SECOND = 6;
// On slow connections the style and first tiles can take a while; after this we show a retry option
const LOAD_TIMEOUT_MS = 20000;

type MapStatus = "loading" | "ready" | "failed" | "lost";

const getFlagEmoji = (countryCode: string): string => {
  if (!countryCode || countryCode.length !== 2) return "";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

// Reads a theme color variable ("173 80% 50%") and converts it to hex for MapLibre
const cssHsl = (varName: string, fallback: string) => {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    const match = raw.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
    if (!match) return fallback;
    const [h, s, l] = [Number(match[1]), Number(match[2]) / 100, Number(match[3]) / 100];
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const channel = (n: number) =>
      Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))))
        .toString(16)
        .padStart(2, "0");
    return `#${channel(0)}${channel(8)}${channel(4)}`;
  } catch {
    return fallback;
  }
};

const hasWebGL = () => {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
};

const toGeoJSON = (locations: StreamingLocation[]): GeoJSON.FeatureCollection<GeoJSON.Point> => ({
  type: "FeatureCollection",
  features: locations.map((loc, index) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [loc.lon, loc.lat] },
    properties: { index, sessionCount: loc.sessionCount },
  })),
});

// Popup content is built with DOM nodes (textContent) so location and user names are never parsed as HTML
const buildPopup = (loc: StreamingLocation): HTMLElement => {
  const root = document.createElement("div");
  root.className = "pwft-map-popup-body";

  const place = document.createElement("div");
  place.className = "pwft-map-popup-title";
  place.textContent = loc.city !== "Unknown" ? loc.city : loc.region || loc.country;
  root.appendChild(place);

  if (loc.city !== "Unknown" && loc.country !== loc.city) {
    const country = document.createElement("div");
    country.className = "pwft-map-popup-muted";
    country.textContent = `${loc.country} ${getFlagEmoji(loc.countryCode)}`;
    root.appendChild(country);
  }

  const dates = Array.from(new Set(loc.sessionDates || []));
  const streams = document.createElement("button");
  streams.type = "button";
  streams.className = "pwft-map-popup-toggle";
  streams.textContent = `${loc.sessionCount} stream${loc.sessionCount !== 1 ? "s" : ""}${dates.length > 0 ? " ▾" : ""}`;
  streams.disabled = dates.length === 0;
  root.appendChild(streams);

  if (dates.length > 0) {
    const list = document.createElement("div");
    list.className = "pwft-map-popup-dates";
    list.hidden = true;
    dates.slice(0, 10).forEach((d) => {
      const row = document.createElement("div");
      row.textContent = d;
      list.appendChild(row);
    });
    if (dates.length > 10) {
      const more = document.createElement("div");
      more.className = "pwft-map-popup-more";
      more.textContent = `+ ${dates.length - 10} more sessions`;
      list.appendChild(more);
    }
    streams.addEventListener("click", () => {
      list.hidden = !list.hidden;
    });
    root.appendChild(list);
  }
  return root;
};

const GeoLocationMap = ({ locations }: GeoLocationMapProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const locationsRef = useRef(locations);
  const spinRef = useRef<{ active: boolean }>({ active: false });
  const [ready, setReady] = useState(false);
  const [unsupported] = useState(() => !hasWebGL());
  const [status, setStatus] = useState<MapStatus>("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  locationsRef.current = locations;

  // Initialize the map (again when the user retries)
  useEffect(() => {
    if (!containerRef.current || mapRef.current || unsupported) return;

    setStatus("loading");
    setErrorText(null);
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [0, 20],
        zoom: 1.2,
        scrollZoom: false,
        attributionControl: { compact: true },
      });
    } catch (error) {
      setErrorText((error as Error).message);
      setStatus("failed");
      return;
    }
    mapRef.current = map;

    // Keep the last error so a failed load can say why
    let loaded = false;
    let lastError: string | null = null;
    map.on("error", (e) => {
      lastError = e.error?.message || "Unknown error";
    });
    const loadTimeout = window.setTimeout(() => {
      if (loaded) return;
      setErrorText(lastError);
      setStatus("failed");
    }, LOAD_TIMEOUT_MS);

    // Mobile browsers can drop WebGL contexts (e.g. when switching apps); MapLibre redraws when it's restored
    map.on("webglcontextlost", () => setStatus("lost"));
    map.on("webglcontextrestored", () => setStatus(loaded ? "ready" : "loading"));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("style.load", () => {
      map.setProjection({ type: "globe" });
    });

    map.on("load", () => {
      const cyan = cssHsl("--cyan", "#1ad1bd");
      const purple = cssHsl("--purple", "#9c2ee6");
      map.addSource(SOURCE_ID, { type: "geojson", data: toGeoJSON([]) });
      map.addLayer({
        id: "streaming-locations-glow",
        type: "circle",
        source: SOURCE_ID,
        paint: { "circle-radius": ["+", 14, ["*", 20, ["get", "weight"]]], "circle-color": cyan, "circle-opacity": 0.15, "circle-blur": 1 },
      });
      map.addLayer({
        id: "streaming-locations",
        type: "circle",
        source: SOURCE_ID,
        paint: {
          // Same sizing as before: 8px + up to 17px for the busiest location
          "circle-radius": ["+", 8, ["*", 17, ["get", "weight"]]],
          "circle-color": cyan,
          "circle-opacity": 0.7,
          "circle-stroke-color": purple,
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0.9,
        },
      });

      map.on("click", "streaming-locations", (e) => {
        const feature = e.features?.[0];
        const loc = feature ? locationsRef.current[Number(feature.properties?.index)] : undefined;
        if (!loc) return;
        new maplibregl.Popup({ maxWidth: "250px", className: "pwft-map-popup" })
          .setLngLat([loc.lon, loc.lat])
          .setDOMContent(buildPopup(loc))
          .addTo(map);
      });
      map.on("mouseenter", "streaming-locations", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "streaming-locations", () => (map.getCanvas().style.cursor = ""));
      loaded = true;
      window.clearTimeout(loadTimeout);
      setReady(true);
      setStatus("ready");
    });

    // Gentle auto-rotation until the user interacts with the globe
    const spin = spinRef.current;
    const stopSpin = () => {
      spin.active = false;
    };
    map.on("mousedown", stopSpin);
    map.on("touchstart", stopSpin);
    map.on("wheel", stopSpin);
    map.on("moveend", () => {
      if (!spin.active || map.getZoom() > 3) return;
      const center = map.getCenter();
      map.easeTo({ center: [center.lng - SPIN_DEGREES_PER_SECOND, center.lat], duration: 1000, easing: (n) => n });
    });

    return () => {
      window.clearTimeout(loadTimeout);
      spin.active = false;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [unsupported, attempt]);

  // Update markers + camera when locations change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const maxSessions = Math.max(...locations.map((l) => l.sessionCount), 1);
    const data = toGeoJSON(locations);
    data.features.forEach((f) => {
      f.properties!.weight = (f.properties!.sessionCount as number) / maxSessions;
    });
    (map.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData(data);

    if (locations.length === 1) {
      map.jumpTo({ center: [locations[0].lon, locations[0].lat] as LngLatLike, zoom: 4 });
    } else if (locations.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      locations.forEach((l) => bounds.extend([l.lon, l.lat]));
      map.fitBounds(bounds, { padding: 50, maxZoom: 6, animate: false });
    }

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion && map.getZoom() <= 3) {
      spinRef.current.active = true;
      map.fire("moveend");
    }
  }, [locations, ready]);

  if (unsupported) {
    return (
      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
        The streaming globe needs WebGL, which isn't available in this browser.
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="pwft-globe h-full w-full" aria-label="Streaming locations globe" />
      {status !== "ready" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
          {status === "loading" ? (
            <>
              <Loader2 className="w-8 h-8 text-cyan animate-spin" />
              <span>Loading globe…</span>
            </>
          ) : (
            <>
              <span>{status === "lost" ? "The globe was paused by your browser." : "The globe couldn't be loaded."}</span>
              {status === "failed" && errorText && <span className="text-xs opacity-70 max-w-xs break-words">{errorText}</span>}
              <Button variant="outline" size="sm" onClick={() => setAttempt((a) => a + 1)}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload globe
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default GeoLocationMap;

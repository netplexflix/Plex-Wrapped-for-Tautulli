// src/lib/geolocation.ts
// Pure geolocation helpers shared by the server (IP extraction) and the web app (map/insights).
// IP lookups themselves happen server-side (server/geo.ts).

import { WatchHistory, StreamingLocation } from "@/types/tautulli";

// Normalize IP address
export const normalizeIp = (raw: string): string => {
  let ip = raw.split(",")[0].trim();
  if (!ip) return "";

  if (ip.startsWith("[") && ip.endsWith("]")) {
    ip = ip.slice(1, -1);
  }

  ip = ip.split("%")[0];

  if (ip.toLowerCase().startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  const ipv4PortMatch = ip.match(/^([0-9]{1,3}(?:\.[0-9]{1,3}){3}):\d+$/);
  if (ipv4PortMatch) ip = ipv4PortMatch[1];

  return ip;
};

// Check if IP is public
export const isPublicIp = (ip: string): boolean => {
  const ipv4 = ip.match(/^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    const c = Number(ipv4[3]);
    const d = Number(ipv4[4]);
    if ([a, b, c, d].some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;

    if (a === 127) return false;
    if (a === 10) return false;
    if (a === 192 && b === 168) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 0) return false;

    return true;
  }

  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return false;
  if (lower.startsWith("fe80:")) return false;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return false;

  const looksLikeIpv6 = lower.includes(":");
  return looksLikeIpv6;
};

export type IpSessionData = Map<string, { count: number; users: Set<string>; dates: string[] }>;

// Extract unique IPs with their session counts, user info, and dates from watch history.
// Session labels are "<date> — <user>" when includeNames is set, otherwise just "<date>".
export const extractUniqueIPs = (
  history: WatchHistory[],
  options: { timeZone?: string; includeNames?: boolean } = {}
): IpSessionData => {
  const { timeZone, includeNames = true } = options;
  const ipData: IpSessionData = new Map();

  const formatSessionDate = (timestamp: number): string => {
    const epochSeconds = timestamp > 10_000_000_000 ? Math.floor(timestamp / 1000) : timestamp;
    const date = new Date(epochSeconds * 1000);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone,
    });
  };

  history.forEach((h) => {
    const rawIp = h.ip_address;
    const ip = rawIp ? normalizeIp(rawIp) : "";
    if (!ip || !isPublicIp(ip)) return;

    const existing = ipData.get(ip);
    const userName = h.friendly_name || h.user || "Unknown";
    const date = formatSessionDate(h.started || h.date);
    const sessionLabel = includeNames ? `${date} — ${userName}` : date;

    if (existing) {
      existing.count += 1;
      existing.users.add(userName);
      existing.dates.push(sessionLabel);
    } else {
      ipData.set(ip, { count: 1, users: new Set([userName]), dates: [sessionLabel] });
    }
  });

  return ipData;
};

// Calculate optimal map bounds based on locations
export const calculateMapBounds = (locations: StreamingLocation[]): {
  centerLat: number;
  centerLon: number;
  zoom: number;
} => {
  if (locations.length === 0) {
    return { centerLat: 20, centerLon: 0, zoom: 1 };
  }

  if (locations.length === 1) {
    return { centerLat: locations[0].lat, centerLon: locations[0].lon, zoom: 4 };
  }

  const lats = locations.map(l => l.lat);
  const lons = locations.map(l => l.lon);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;

  const latSpan = maxLat - minLat;
  const lonSpan = maxLon - minLon;
  const maxSpan = Math.max(latSpan, lonSpan);

  let zoom: number;
  if (maxSpan < 2) zoom = 6;
  else if (maxSpan < 5) zoom = 5;
  else if (maxSpan < 15) zoom = 4;
  else if (maxSpan < 40) zoom = 3;
  else if (maxSpan < 80) zoom = 2;
  else zoom = 1;

  return { centerLat, centerLon, zoom };
};

// Generate fun text based on streaming locations
export const generateLocationInsight = (locations: Pick<StreamingLocation, "city" | "country" | "sessionCount">[]): string => {
  if (locations.length === 0) {
    return "Looks like you're streaming from a secret location! 🕵️";
  }

  const countries = [...new Set(locations.map(l => l.country))];
  const cities = [...new Set(locations.map(l => l.city).filter(c => c !== 'Unknown'))];
  const totalSessions = locations.reduce((sum, l) => sum + l.sessionCount, 0);

  const sortedByCount = [...locations].sort((a, b) => b.sessionCount - a.sessionCount);
  const topLocation = sortedByCount[0];

  if (countries.length === 1) {
    if (cities.length === 1) {
      return `Home sweet home! All ${totalSessions} streams from ${cities[0]}, ${countries[0]}`;
    }
    return `A true ${countries[0]} explorer! Streamed from ${cities.length} different cities`;
  }

  if (countries.length === 2) {
    return `Living the dual-timezone life! Streams from ${countries.join(' and ')}`;
  }

  if (countries.length >= 5) {
    return `World traveler alert! Streamed from ${countries.length} different countries`;
  }

  if (countries.length >= 3) {
    return `International viewer! Streams from ${countries.join(', ')}`;
  }

  return `Your streaming HQ: ${topLocation.city}, ${topLocation.country}`;
};

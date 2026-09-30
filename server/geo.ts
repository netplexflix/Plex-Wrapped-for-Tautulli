// Server-side IP geolocation with a persistent cache (/data/geolocation-cache.json)

import { dataPath, readJson, writeJsonAtomic } from "./storage";
import { extractUniqueIPs } from "@/lib/geolocation";
import type { StreamingLocation, WatchHistory } from "@/types/tautulli";

const FILE = dataPath("geolocation-cache.json");

// Parses a JSON response from an external API (shape validated at the call site)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readBody = (response: Response): Promise<any> => response.json();
const FAILED_RETRY_MS = 7 * 24 * 3600 * 1000;

interface GeoEntry {
  city: string;
  region: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  cachedAt: number;
  failed?: boolean;
}

let entries: Record<string, GeoEntry> = {};

export const loadGeoCache = async () => {
  const file = await readJson<{ locations?: Record<string, GeoEntry> }>(FILE, {});
  entries = file.locations ?? {};
  console.log(`[Geo] Loaded ${Object.keys(entries).length} cached IP locations`);
};

const persist = () => writeJsonAtomic(FILE, { version: 1, lastUpdated: Date.now(), locations: entries });

export const clearGeoCache = async () => {
  entries = {};
  await persist();
};

export const getGeoCount = () => Object.keys(entries).length;

const isFresh = (entry: GeoEntry | undefined) => Boolean(entry) && (!entry!.failed || Date.now() - entry!.cachedAt < FAILED_RETRY_MS);

const toNumber = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const store = (ip: string, f: { city?: string; region?: string; country?: string; countryCode?: string; lat: number | null; lon: number | null }) => {
  if (f.lat == null || f.lon == null) return false;
  entries[ip] = {
    city: f.city || "Unknown",
    region: f.region || "",
    country: f.country || "Unknown",
    countryCode: f.countryCode || "",
    lat: f.lat,
    lon: f.lon,
    cachedAt: Date.now(),
  };
  return true;
};

const markFailed = (ip: string) => {
  entries[ip] = { city: "", region: "", country: "", countryCode: "", lat: 0, lon: 0, cachedAt: Date.now(), failed: true };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ip-api.com batch endpoint: 100 IPs per request, 15 requests per minute (free, non-commercial).
// Plain HTTP is fine here because this runs server-side.
const lookupBatch = async (batch: string[]): Promise<string[]> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("http://ip-api.com/batch?fields=status,message,country,countryCode,region,regionName,city,lat,lon,query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(20_000),
      });
      const remaining = Number(response.headers.get("x-rl"));
      const ttl = Number(response.headers.get("x-ttl")) || 60;
      if (response.status === 429) {
        await sleep((ttl + 1) * 1000);
        continue;
      }
      if (!response.ok) return batch;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const results: any[] = await readBody(response);
      const unresolved: string[] = [];
      results.forEach((r, i) => {
        const ip = batch[i];
        if (r?.status === "success") {
          store(ip, { city: r.city, region: r.regionName || r.region, country: r.country, countryCode: r.countryCode, lat: toNumber(r.lat), lon: toNumber(r.lon) });
        } else if (r?.message && /private|reserved|invalid/i.test(r.message)) {
          markFailed(ip);
        } else {
          unresolved.push(ip);
        }
      });
      if (remaining === 0) await sleep((ttl + 1) * 1000);
      return unresolved;
    } catch (error) {
      console.warn("[Geo] ip-api batch failed:", (error as Error).message);
      return batch;
    }
  }
  return batch;
};

// Fallback providers, one IP at a time
const lookupSingle = async (ip: string): Promise<boolean> => {
  try {
    const r1 = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(10_000) });
    if (r1.ok) {
      const d = await readBody(r1);
      if (d?.success && store(ip, { city: d.city, region: d.region, country: d.country, countryCode: d.country_code, lat: toNumber(d.latitude), lon: toNumber(d.longitude) })) {
        return true;
      }
    }
  } catch {
    // try next provider
  }
  try {
    const r2 = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, { signal: AbortSignal.timeout(10_000) });
    if (r2.ok) {
      const d = await readBody(r2);
      if (!d?.error && store(ip, { city: d.city, region: d.region, country: d.country_name, countryCode: d.country_code, lat: toNumber(d.latitude), lon: toNumber(d.longitude) })) {
        return true;
      }
    }
  } catch {
    // give up
  }
  return false;
};

// Lookups are serialized so concurrent reports never query the same IPs twice
let queue: Promise<unknown> = Promise.resolve();

export const lookupIps = (ips: Iterable<string>, onProgress?: (done: number, total: number) => void): Promise<void> => {
  const list = [...new Set(ips)];
  // Nothing to look up: don't wait behind a running warm-up
  if (list.every((ip) => isFresh(entries[ip]))) return Promise.resolve();
  const run = async () => {
    const pending = list.filter((ip) => !isFresh(entries[ip]));
    if (pending.length === 0) return;

    let done = 0;
    const unresolved: string[] = [];
    for (let i = 0; i < pending.length; i += 100) {
      const batch = pending.slice(i, i + 100);
      unresolved.push(...(await lookupBatch(batch)));
      done += batch.length;
      onProgress?.(done, pending.length);
      if (i + 100 < pending.length) await sleep(4100);
    }

    for (const ip of unresolved) {
      if (!(await lookupSingle(ip))) markFailed(ip);
      await sleep(250);
    }
    await persist();
  };
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
};

/** Streaming locations for a set of history rows. Raw IPs never leave the server. */
export const buildLocations = async (
  history: WatchHistory[],
  options: { timeZone: string; includeNames: boolean }
): Promise<{ locations: StreamingLocation[]; totalIPs: number }> => {
  const ipData = extractUniqueIPs(history, options);
  await lookupIps(ipData.keys());

  const locations: StreamingLocation[] = [];
  let i = 0;
  for (const [ip, data] of ipData) {
    const entry = entries[ip];
    if (!entry || entry.failed) continue;
    locations.push({
      ip: `loc-${i++}`,
      city: entry.city,
      region: entry.region,
      country: entry.country,
      countryCode: entry.countryCode,
      lat: entry.lat,
      lon: entry.lon,
      sessionCount: data.count,
      sessionDates: data.dates,
    });
  }
  return { locations, totalIPs: ipData.size };
};

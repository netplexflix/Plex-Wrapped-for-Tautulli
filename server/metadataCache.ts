// Per-item metadata cache (runtime, genres, cast) in /data/metadata-cache.json

import { dataPath, readJson, writeJsonAtomic } from "./storage";
import { tautulliCall, TautulliError } from "./tautulli";
import { runtimeSecondsFromDuration, type CreditsLookupResult } from "@/lib/stats";

const FILE = dataPath("metadata-cache.json");
const CACHE_VERSION = 2;
// Titles Plex no longer has are retried after 30 days; titles Tautulli returned an error
// for after a day. Network failures/timeouts are only remembered in memory, for 6 hours.
const MISSING_RETRY_MS = 30 * 24 * 3600 * 1000;
const ERROR_RETRY_MS = 24 * 3600 * 1000;
const NETWORK_RETRY_MS = 6 * 3600 * 1000;

export interface MetadataEntry {
  v?: number;
  duration: number; // milliseconds, as returned by Tautulli
  title?: string;
  mediaType?: string;
  genres?: string[];
  actors?: string[];
  directors?: string[];
  missing?: boolean; // item no longer exists in Plex (or Tautulli returned an error for it)
  error?: boolean; // Tautulli returned an error: retried sooner
  cachedAt: number;
}

let entries: Record<string, MetadataEntry> = {};
const networkFailures = new Map<number, number>();
let version = 0;

/** Changes whenever new metadata is cached (reports built without it can then be refreshed) */
export const getMetadataVersion = () => version;
let dirty = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const loadMetadataCache = async () => {
  const file = await readJson<{ metadata?: Record<string, MetadataEntry> }>(FILE, {});
  entries = file.metadata ?? {};
  console.log(`[Metadata] Loaded ${Object.keys(entries).length} cached entries`);
};

const persist = async () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  dirty = 0;
  await writeJsonAtomic(FILE, { version: CACHE_VERSION, lastUpdated: Date.now(), metadata: entries });
};

const markDirty = () => {
  dirty++;
  if (dirty >= 500) {
    persist().catch((e) => console.error("[Metadata] Save failed:", e));
  } else if (!saveTimer) {
    saveTimer = setTimeout(() => persist().catch((e) => console.error("[Metadata] Save failed:", e)), 5000);
  }
};

export const clearMetadataCache = async () => {
  entries = {};
  await persist();
};

export const getMetadataCount = () => Object.keys(entries).length;

// Entries from older versions (or cached with duration 0 by the old genre lookup) are refetched
const isComplete = (entry: MetadataEntry | undefined) => {
  if (!entry || entry.v !== CACHE_VERSION) return false;
  if (entry.missing) return Date.now() - entry.cachedAt < (entry.error ? ERROR_RETRY_MS : MISSING_RETRY_MS);
  return true;
};

const failedRecently = (key: number) => {
  const at = networkFailures.get(key);
  if (at === undefined) return false;
  if (Date.now() - at < NETWORK_RETRY_MS) return true;
  networkFailures.delete(key);
  return false;
};

/** Keys that still need fetching (not cached, and not failed recently) */
export const missingMetadataKeys = (ratingKeys: Iterable<number>): number[] =>
  [...new Set(ratingKeys)].filter((key) => key > 0 && !isComplete(entries[key]) && !failedRecently(key));

/** True if any of the keys has no usable cache entry yet */
export const hasUnresolvedMetadata = (ratingKeys: Iterable<number>) => {
  for (const key of ratingKeys) if (key > 0 && !isComplete(entries[key])) return true;
  return false;
};

export const getCredits = (ratingKey: number): CreditsLookupResult | null => {
  const entry = entries[ratingKey];
  if (!entry || entry.missing) return null;
  return { genres: entry.genres ?? [], actors: entry.actors ?? [], directors: entry.directors ?? [] };
};

export const getRuntimeSeconds = (ratingKey: number): number | null => {
  const entry = entries[ratingKey];
  if (!entry || entry.missing) return null;
  return runtimeSecondsFromDuration(entry.duration);
};

const tagNames = (list: unknown, limit: number): string[] =>
  (Array.isArray(list) ? list : [])
    .slice(0, limit)
    .map((a) => (typeof a === "string" ? a : (a as { tag?: string })?.tag || ""))
    .filter(Boolean);

const fetchOne = async (ratingKey: number) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = await tautulliCall<any>("get_metadata", { rating_key: ratingKey }, { timeoutMs: 30_000 });
    if (!meta || (!meta.rating_key && !meta.title)) {
      entries[ratingKey] = { v: CACHE_VERSION, duration: 0, missing: true, cachedAt: Date.now() };
    } else {
      const duration = typeof meta.duration === "string" ? parseFloat(meta.duration) : Number(meta.duration);
      entries[ratingKey] = {
        v: CACHE_VERSION,
        duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
        title: meta.title,
        mediaType: meta.media_type,
        genres: tagNames(meta.genres, 20),
        actors: tagNames(meta.actors, 3),
        directors: tagNames(meta.directors, 2),
        cachedAt: Date.now(),
      };
      version++;
    }
    networkFailures.delete(ratingKey);
    markDirty();
  } catch (error) {
    if (error instanceof TautulliError && error.kind === "response") {
      // Tautulli answered with an error (e.g. the item is gone from Plex): remember it for a day
      entries[ratingKey] = { v: CACHE_VERSION, duration: 0, missing: true, error: true, cachedAt: Date.now() };
      markDirty();
    } else {
      networkFailures.set(ratingKey, Date.now());
      console.warn(`[Metadata] Failed to fetch ${ratingKey}:`, (error as Error).message);
    }
  }
};

// All metadata requests (nightly warm-up and live reports) share one concurrency limit,
// and a title that is already being fetched is never requested twice.
const MAX_CONCURRENT_REQUESTS = 8;
let activeRequests = 0;
const waiting: (() => void)[] = [];
const inflight = new Map<number, Promise<void>>();

const acquireSlot = (): Promise<void> => {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
};

const releaseSlot = () => {
  const next = waiting.shift();
  if (next) next(); // hand the slot straight to the next waiter
  else activeRequests--;
};

const fetchShared = (ratingKey: number): Promise<void> => {
  let promise = inflight.get(ratingKey);
  if (!promise) {
    promise = (async () => {
      await acquireSlot();
      try {
        await fetchOne(ratingKey);
      } finally {
        releaseSlot();
      }
    })().finally(() => inflight.delete(ratingKey));
    inflight.set(ratingKey, promise);
  }
  return promise;
};

/** Fetches metadata for every key that isn't cached yet */
export const ensureMetadata = async (
  ratingKeys: Iterable<number>,
  options: { onProgress?: (done: number, total: number) => void } = {}
) => {
  const missing = missingMetadataKeys(ratingKeys);
  if (missing.length === 0) return;

  // A bounded number of workers per caller keeps a large warm-up from queueing
  // thousands of requests ahead of a report someone is waiting for
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < missing.length) {
      const key = missing[next++];
      if (!isComplete(entries[key]) && !failedRecently(key)) await fetchShared(key);
      done++;
      if (done % 25 === 0 || done === missing.length) options.onProgress?.(done, missing.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_REQUESTS, missing.length) }, worker));
  await persist();
};

// A single background fetch for large backlogs (e.g. right after enabling normalization),
// so reports never have to wait for thousands of titles
let background: Promise<void> | null = null;
const backgroundQueue = new Set<number>();

export const ensureMetadataInBackground = (ratingKeys: Iterable<number>) => {
  for (const key of ratingKeys) backgroundQueue.add(key);
  if (background) return;
  background = (async () => {
    while (backgroundQueue.size > 0) {
      const batch = [...backgroundQueue];
      backgroundQueue.clear();
      await ensureMetadata(batch);
    }
  })()
    .catch((error) => console.error("[Metadata] Background fetch failed:", error))
    .finally(() => {
      background = null;
    });
};

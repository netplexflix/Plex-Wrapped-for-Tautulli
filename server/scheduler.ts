// Cache pipeline (sync → metadata → geolocation → prewarm) and the nightly schedule

import { getDefaultYear, getEventSeconds, getPeriodRange, wallTimeToEpoch, zonedParts } from "@/lib/stats";
import { extractUniqueIPs } from "@/lib/geolocation";
import type { CacheState, CacheStatus } from "@/types/api";
import { getSettings, isTautulliConfigured } from "./config";
import {
  getOldestEvent,
  getRowCount,
  getRowsFor,
  getSyncTimes,
  getUsers,
  hasHistory,
  syncHistory,
} from "./historyStore";
import { ensureMetadata, getMetadataCount } from "./metadataCache";
import { getGeoCount, lookupIps } from "./geo";
import { buildReport, invalidateReportsFor, SERVER_TZ } from "./report";

const REFRESH_AFTER_MS = 60 * 60 * 1000;
// Nightly syncs are incremental; once a week the whole history is re-read to pick up
// rows that were deleted or edited in Tautulli
const FULL_SYNC_EVERY_MS = 7 * 24 * 3600 * 1000;

let state: CacheState = "idle";
let phase = "";
let progress: CacheStatus["progress"] = null;
let lastError: string | null = null;
let pipeline: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let nextRun: number | null = null;

const setState = (next: CacheState, nextPhase = "", nextProgress: CacheStatus["progress"] = null) => {
  state = next;
  phase = nextPhase;
  progress = nextProgress;
};

export const isPipelineRunning = () => pipeline !== null;

export const getCacheStatus = (): CacheStatus => {
  const { lastFullSync, lastIncrementalSync } = getSyncTimes();
  const oldest = getOldestEvent();
  return {
    state,
    phase,
    progress,
    rows: getRowCount(),
    users: getUsers().length,
    oldestYear: oldest ? zonedParts(oldest, SERVER_TZ).year : null,
    lastFullSync,
    lastIncrementalSync,
    lastError,
    nextRun,
    metadataEntries: getMetadataCount(),
    geolocationEntries: getGeoCount(),
  };
};

// Rows are newest-first, so recent titles (the reports people look at) are cached first.
// Movies and shows (genres, cast, movie runtimes) come before episode runtimes,
// which are only needed for normalization.
const warmMetadata = async () => {
  const normalize = getSettings().normalizeTautulliAnomalies;
  const titleKeys = new Set<number>();
  const episodeKeys = new Set<number>();
  for (const h of getRowsFor(null)) {
    if (h.media_type === "movie") titleKeys.add(h.rating_key);
    else if (h.media_type === "episode") {
      if (h.grandparent_rating_key) titleKeys.add(h.grandparent_rating_key);
      if (normalize) episodeKeys.add(h.rating_key);
    }
  }
  setState("metadata", "Caching metadata");
  await ensureMetadata(titleKeys, {
    onProgress: (done, total) => setState("metadata", "Caching metadata", { done, total }),
  });
  if (episodeKeys.size > 0) {
    setState("metadata", "Caching episode runtimes");
    await ensureMetadata(episodeKeys, {
      onProgress: (done, total) => setState("metadata", "Caching episode runtimes", { done, total }),
    });
  }
};

const warmGeolocation = async () => {
  if (!getSettings().enableGeolocation) return;
  const ips = extractUniqueIPs(getRowsFor(null), { timeZone: SERVER_TZ }).keys();
  setState("geolocation", "Locating streaming IPs");
  await lookupIps(ips, (done, total) => setState("geolocation", "Locating streaming IPs", { done, total }));
};

// Prepares every period (each year, past 12 months, all time) for everyone and for each
// user, in the server timezone, so reports load instantly. Reports that are already
// cached are skipped, so after a sync only the ones affected by new history are rebuilt.
const prewarmReports = async () => {
  const oldest = getOldestEvent();
  if (!oldest) return;
  const tz = SERVER_TZ;
  const firstYear = zonedParts(oldest, tz).year;
  const currentYear = zonedParts(Date.now() / 1000, tz).year;
  const defaultYear = String(getDefaultYear(tz, getSettings().currentYearFrom));

  const years: string[] = [];
  for (let y = currentYear; y >= firstYear; y--) years.push(String(y));
  // The default year first, then the other quick picks, then older years
  const periods = [defaultYear, "rolling", "alltime", ...years.filter((y) => y !== defaultYear)];

  const targets: { userId: number | null; period: string }[] = [];
  for (const period of periods) {
    const { start, end } = getPeriodRange(period, tz);
    const userIds = new Set<number>();
    for (const h of getRowsFor(null)) {
      const t = getEventSeconds(h);
      if (t >= start && t <= end) userIds.add(h.user_id);
    }
    if (userIds.size === 0) continue;
    targets.push({ userId: null, period });
    for (const userId of userIds) targets.push({ userId, period });
  }

  const started = Date.now();
  let done = 0;
  for (const { userId, period } of targets) {
    if (done % 10 === 0) setState("prewarm", "Preparing reports", { done, total: targets.length });
    await buildReport(userId, period, tz);
    done++;
    // Let pending web requests through between reports
    await new Promise((resolve) => setImmediate(resolve));
  }
  console.log(`[Cache] ${targets.length} reports ready (${periods.length} periods, ${((Date.now() - started) / 1000).toFixed(1)}s)`);
};

/**
 * Runs the cache pipeline. Only one runs at a time; calling it while one is
 * running returns the running pipeline.
 */
export const runPipeline = (kind: "full" | "incremental", options: { prewarm?: boolean } = {}): Promise<void> => {
  if (!isTautulliConfigured()) return Promise.resolve();
  if (pipeline) return pipeline;

  pipeline = (async () => {
    const started = Date.now();
    try {
      const label = kind === "full" || !hasHistory() ? "Syncing full history" : "Syncing new history";
      setState("syncing", label);
      const { changedRows } = await syncHistory(kind, (rows) => setState("syncing", label, { done: rows, total: 0 }));
      invalidateReportsFor(changedRows);
      await warmMetadata();
      await warmGeolocation();
      if (options.prewarm !== false) await prewarmReports();
      lastError = null;
      console.log(`[Cache] ${kind} pipeline finished in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (error) {
      lastError = (error as Error).message;
      console.error(`[Cache] ${kind} pipeline failed:`, lastError);
    } finally {
      setState("idle");
      pipeline = null;
    }
  })();
  return pipeline;
};

/** Triggers a background incremental sync when the cache is more than an hour old */
export const maybeRefresh = () => {
  if (pipeline || !hasHistory()) return;
  const { lastIncrementalSync } = getSyncTimes();
  if (lastIncrementalSync && Date.now() - lastIncrementalSync > REFRESH_AFTER_MS) {
    runPipeline("incremental");
  }
};

// ============ Nightly schedule ============

const computeNextRun = (): number => {
  const [hour, minute] = getSettings().nightlySyncTime.split(":").map(Number);
  const nowSec = Date.now() / 1000;
  const today = zonedParts(nowSec, SERVER_TZ);
  let run = wallTimeToEpoch(today.year, today.month, today.day, hour, minute, 0, SERVER_TZ);
  if (run <= nowSec + 5) run = wallTimeToEpoch(today.year, today.month, today.day + 1, hour, minute, 0, SERVER_TZ);
  return run * 1000;
};

export const scheduleNightly = () => {
  if (timer) clearTimeout(timer);
  nextRun = computeNextRun();
  timer = setTimeout(() => {
    timer = null;
    const { lastFullSync } = getSyncTimes();
    // An hour of slack so a weekly full sync doesn't slip to the next night
    const fullDue = !lastFullSync || Date.now() - lastFullSync > FULL_SYNC_EVERY_MS - 3600 * 1000;
    console.log(`[Cache] Starting nightly ${fullDue ? "full (weekly)" : "incremental"} sync`);
    runPipeline(fullDue ? "full" : "incremental").finally(scheduleNightly);
  }, Math.max(1000, nextRun - Date.now()));
  console.log(`[Cache] Next nightly sync: ${new Date(nextRun).toISOString()} (${getSettings().nightlySyncTime} ${SERVER_TZ})`);
};

export const startScheduler = () => {
  scheduleNightly();
  if (isTautulliConfigured()) {
    runPipeline(hasHistory() ? "incremental" : "full");
  }
};

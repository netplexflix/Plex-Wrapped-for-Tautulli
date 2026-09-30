// Builds wrapped reports from the local history cache

import {
  aggregateMetadataStats,
  calculateWrappedStats,
  getEventSeconds,
  getPeriodRange,
  isValidTimeZone,
  normalizeHistory,
  selectMetadataTargets,
  totalWatchSeconds,
  zonedParts,
} from "@/lib/stats";
import type { LeaderboardEntry, LocationsResponse, ReportResponse, ReportUser } from "@/types/api";
import type { WatchHistory } from "@/types/tautulli";
import { getSettings } from "./config";
import { getOldestEvent, getRowsFor, getUsers } from "./historyStore";
import {
  ensureMetadata,
  ensureMetadataInBackground,
  getCredits,
  getMetadataVersion,
  getRuntimeSeconds,
  hasUnresolvedMetadata,
  missingMetadataKeys,
} from "./metadataCache";
import { buildLocations } from "./geo";

export const SERVER_TZ = (() => {
  if (isValidTimeZone(process.env.TZ)) return process.env.TZ;
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidTimeZone(resolved) ? resolved : "UTC";
})();

export const resolveTimeZone = (tz: unknown): string => (isValidTimeZone(tz) ? tz : SERVER_TZ);

// A report never waits for more than this many uncached titles; larger backlogs are
// fetched in the background and the report is refreshed once they are in
const MAX_BLOCKING_FETCH = 200;

// Finished reports are kept as ready-to-send JSON. Every year for every user is
// prepared after each sync, so this holds a few thousand entries on big servers.
const MEMO_SIZE = 5000;

interface MemoEntry {
  json: string;
  userId: number | null;
  period: string;
  /** Built while some metadata was still missing; rebuilt once more metadata arrives */
  partial: boolean;
  metadataVersion: number;
}

const memo = new Map<string, MemoEntry>();
const inflight = new Map<string, Promise<MemoEntry>>();
let memoGeneration = 0;

export const clearReportMemo = () => {
  memo.clear();
  memoGeneration++;
};

/**
 * Drops the cached reports that the given history rows (new, edited or deleted) affect:
 * the rows' years, the past 12 months and all time, for those users and for everyone.
 */
export const invalidateReportsFor = (changedRows: WatchHistory[]) => {
  if (changedRows.length === 0) return;
  const users = new Set<number>();
  const years = new Set<string>();
  for (const row of changedRows) {
    users.add(row.user_id);
    const t = getEventSeconds(row);
    // Cover every timezone: the row can fall in a neighbouring year somewhere in the world
    years.add(String(new Date((t - 14 * 3600) * 1000).getUTCFullYear()));
    years.add(String(new Date((t + 14 * 3600) * 1000).getUTCFullYear()));
  }
  let dropped = 0;
  for (const [key, entry] of memo) {
    const periodAffected = entry.period === "rolling" || entry.period === "alltime" || years.has(entry.period);
    if (periodAffected && (entry.userId === null || users.has(entry.userId))) {
      memo.delete(key);
      dropped++;
    }
  }
  memoGeneration++;
  if (dropped) console.log(`[Reports] ${dropped} cached report(s) refreshed after history changes`);
};

const rowsInPeriod = (userId: number | null, period: string, tz: string): WatchHistory[] => {
  const { start, end } = getPeriodRange(period, tz);
  return getRowsFor(userId).filter((h) => {
    const t = getEventSeconds(h);
    return t > 0 && t >= start && t <= end;
  });
};

const reportUser = (userId: number, rows: WatchHistory[]): ReportUser => {
  const known = getUsers().find((u) => u.user_id === userId);
  if (known) {
    return { user_id: userId, username: known.username, friendly_name: known.friendly_name, thumb: known.thumb };
  }
  const row = rows[0];
  return { user_id: userId, username: row?.user || "", friendly_name: row?.friendly_name || "", thumb: "" };
};

const buildLeaderboard = (rows: WatchHistory[]): LeaderboardEntry[] => {
  const perUser = new Map<number, { rows: WatchHistory[]; friendlyName: string; username: string }>();
  for (const h of rows) {
    let entry = perUser.get(h.user_id);
    if (!entry) {
      entry = { rows: [], friendlyName: h.friendly_name || h.user || "Unknown", username: h.user || "unknown" };
      perUser.set(h.user_id, entry);
    }
    entry.rows.push(h);
  }
  return [...perUser.entries()].map(([userId, e]) => ({
    userId,
    username: e.username,
    friendlyName: e.friendlyName,
    totalWatchTime: totalWatchSeconds(e.rows),
  }));
};

// Fetches missing metadata, but only waits when the backlog is small
const ensureWithLimit = async (keys: Iterable<number>) => {
  const missing = missingMetadataKeys(keys);
  if (missing.length === 0) return;
  if (missing.length <= MAX_BLOCKING_FETCH) await ensureMetadata(missing);
  else ensureMetadataInBackground(missing);
};

const compute = async (userId: number | null, period: string, tz: string): Promise<MemoEntry> => {
  const settings = getSettings();
  let rows = rowsInPeriod(userId, period, tz);
  let partial = false;

  if (settings.normalizeTautulliAnomalies) {
    const runtimeKeys = new Set(rows.map((h) => h.rating_key));
    await ensureWithLimit(runtimeKeys);
    partial = hasUnresolvedMetadata(runtimeKeys);
    rows = normalizeHistory(rows, getRuntimeSeconds).history;
  }

  const stats = calculateWrappedStats(rows, tz);
  const { movieEntries, showEntries } = selectMetadataTargets(rows);
  const creditKeys = [...movieEntries, ...showEntries].map(([key]) => key);
  await ensureWithLimit(creditKeys);
  partial = partial || hasUnresolvedMetadata(creditKeys);
  Object.assign(stats, aggregateMetadataStats(rows, getCredits));

  const oldest = getOldestEvent();
  const report: ReportResponse = {
    stats,
    user: userId === null ? null : reportUser(userId, rows),
    leaderboard: userId === null && settings.showLeaderboard ? buildLeaderboard(rows) : [],
    oldestYear: oldest ? zonedParts(oldest, tz).year : null,
    generatedAt: Date.now(),
  };
  return { json: JSON.stringify(report), userId, period, partial, metadataVersion: getMetadataVersion() };
};

// Only settings that change the numbers are part of the cache key (not the title, logo, ...)
const reportSettingsKey = () => {
  const s = getSettings();
  return `${s.normalizeTautulliAnomalies ? "n" : ""}${s.showLeaderboard ? "l" : ""}`;
};

/** Returns the report as JSON, from cache when possible */
export const buildReport = async (userId: number | null, period: string, tz: string): Promise<string> => {
  // Past 12 months and all time end "today", so they also depend on the date
  let dayKey = "";
  if (period === "rolling" || period === "alltime") {
    const today = zonedParts(Date.now() / 1000, tz);
    dayKey = `${today.year}-${today.month}-${today.day}`;
  }
  const key = [userId ?? "all", period, tz, reportSettingsKey(), dayKey].join("|");

  const hit = memo.get(key);
  if (hit && !(hit.partial && hit.metadataVersion !== getMetadataVersion())) {
    memo.delete(key);
    memo.set(key, hit); // most recently used
    return hit.json;
  }

  let running = inflight.get(key);
  if (!running) {
    const generation = memoGeneration;
    running = compute(userId, period, tz)
      .then((entry) => {
        // Don't cache a result that history changes made stale while it was being built
        if (generation === memoGeneration) {
          memo.set(key, entry);
          if (memo.size > MEMO_SIZE) memo.delete(memo.keys().next().value!);
        }
        return entry;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, running);
  }
  return (await running).json;
};

export const buildReportLocations = (userId: number | null, period: string, tz: string, includeNames: boolean): Promise<LocationsResponse> =>
  buildLocations(rowsInPeriod(userId, period, tz), { timeZone: tz, includeNames });

// Builds wrapped reports from the local history cache

import {
  aggregateMetadataStats,
  calculateWrappedStats,
  formatLongDate,
  getEventSeconds,
  getPeriodRange,
  getSessionSeconds,
  isValidTimeZone,
  isVideoContent,
  normalizeHistory,
  selectMetadataTargets,
  summarizeHistory,
  totalWatchSeconds,
  wallTimeToEpoch,
  watchByYearOf,
  zonedParts,
} from "@/lib/stats";
import type {
  LeaderboardEntry,
  LocationsResponse,
  PreviousPeriod,
  ReportHistory,
  ReportResponse,
  ReportUser,
  ViewerRank,
} from "@/types/api";
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

// A ranking is only shown when at least this many people watched something in the period
const MIN_RANK_VIEWERS = 3;

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

const rowsInRange = (userId: number | null, start: number, end: number): WatchHistory[] =>
  getRowsFor(userId).filter((h) => {
    const t = getEventSeconds(h);
    return t > 0 && t >= start && t <= end;
  });

const rowsInPeriod = (userId: number | null, period: string, tz: string): WatchHistory[] => {
  const { start, end } = getPeriodRange(period, tz);
  return rowsInRange(userId, start, end);
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

// History rows in a time range, with duration anomalies capped when normalization is on.
// `partial` is true while some of the runtimes that needs are still being fetched.
const loadRows = async (userId: number | null, start: number, end: number) => {
  const rows = rowsInRange(userId, start, end);
  if (!getSettings().normalizeTautulliAnomalies) return { rows, partial: false };
  const runtimeKeys = new Set(rows.map((h) => h.rating_key));
  await ensureWithLimit(runtimeKeys);
  return { rows: normalizeHistory(rows, getRuntimeSeconds).history, partial: hasUnresolvedMetadata(runtimeKeys) };
};

const compute = async (userId: number | null, period: string, tz: string): Promise<MemoEntry> => {
  const settings = getSettings();
  const { start, end } = getPeriodRange(period, tz);
  const loaded = await loadRows(userId, start, end);
  const rows = loaded.rows;
  let partial = loaded.partial;

  const stats = calculateWrappedStats(rows, tz, { rankByViewers: userId === null });
  const { movieEntries, showEntries } = selectMetadataTargets(rows);
  const creditKeys = [...movieEntries, ...showEntries].map(([key]) => key);
  await ensureWithLimit(creditKeys);
  partial = partial || hasUnresolvedMetadata(creditKeys);
  Object.assign(stats, aggregateMetadataStats(rows, getCredits));

  const oldest = getOldestEvent();
  // Ranking and history are added by buildReport (see buildExtras)
  const report: Omit<ReportResponse, "rank" | "history"> = {
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

const todayKey = (tz: string) => {
  const today = zonedParts(Date.now() / 1000, tz);
  return `${today.year}-${today.month}-${today.day}`;
};

// Past 12 months and all time end "today", so they also depend on the date
const periodDayKey = (period: string, tz: string) => (period === "rolling" || period === "alltime" ? todayKey(tz) : "");

/** The report for one user (or everyone) and period, from cache when possible */
const buildPeriodReport = async (userId: number | null, period: string, tz: string): Promise<string> => {
  const key = [userId ?? "all", period, tz, reportSettingsKey(), periodDayKey(period, tz)].join("|");

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

// ============ Ranking and history ============
// Both look beyond the report's own rows (other viewers, other years). Keeping them out of
// the period reports means a sync only rebuilds the reports whose own rows changed; these
// are cheap to rebuild, so their caches are simply dropped when history or metadata change.

const extrasMemo = new Map<string, string>();
const watchTimeTables = new Map<string, Map<number, number>>();
const timelines = new Map<string, Pick<ReportHistory, "yearly" | "firstSession">>();
let extrasStamp = "";

const refreshExtrasCaches = () => {
  const stamp = `${memoGeneration}:${getMetadataVersion()}`;
  if (stamp === extrasStamp) return;
  extrasMemo.clear();
  watchTimeTables.clear();
  timelines.clear();
  extrasStamp = stamp;
};

// Watch time per user in a period (only users who watched something)
const watchTimeByUser = async (period: string, tz: string) => {
  const key = [period, tz, periodDayKey(period, tz)].join("|");
  let table = watchTimeTables.get(key);
  if (!table) {
    const { start, end } = getPeriodRange(period, tz);
    const { rows } = await loadRows(null, start, end);
    table = new Map();
    for (const h of rows) {
      if (isVideoContent(h.media_type)) table.set(h.user_id, (table.get(h.user_id) ?? 0) + getSessionSeconds(h));
    }
    watchTimeTables.set(key, table);
  }
  return table;
};

const buildRank = async (userId: number, period: string, tz: string): Promise<ViewerRank | null> => {
  const table = await watchTimeByUser(period, tz);
  const own = table.get(userId) ?? 0;
  const times = [...table.values()].filter((t) => t > 0);
  if (own <= 0 || times.length < MIN_RANK_VIEWERS) return null;
  const percentile = Math.floor((100 * times.filter((t) => t < own).length) / (times.length - 1));
  // Only viewers in the top half are told where they stand
  if (percentile < 50) return null;
  return { percentile, position: 1 + times.filter((t) => t > own).length, viewers: times.length };
};

// Hours per year and the first recorded session, over the whole history
const buildTimeline = async (userId: number | null, tz: string) => {
  const key = `${userId ?? "all"}|${tz}`;
  let timeline = timelines.get(key);
  if (!timeline) {
    const { start, end } = getPeriodRange("alltime", tz);
    const { rows } = await loadRows(userId, start, end);
    let first: WatchHistory | null = null;
    for (const h of rows) {
      if (isVideoContent(h.media_type) && (!first || getEventSeconds(h) < getEventSeconds(first))) first = h;
    }
    const firstParts = first ? zonedParts(getEventSeconds(first), tz) : null;
    timeline = {
      yearly: watchByYearOf(rows, tz),
      firstSession:
        first && firstParts
          ? { title: first.full_title || first.title, date: formatLongDate(firstParts), year: firstParts.year }
          : null,
    };
    timelines.set(key, timeline);
  }
  return timeline;
};

// The same stretch of time one year earlier. A period that is still running (the current
// year) is compared up to today's date, not against a whole year.
const buildPrevious = async (userId: number | null, period: string, tz: string): Promise<PreviousPeriod | null> => {
  const { start, end } = getPeriodRange(period, tz);
  const shownEnd = Math.min(end, Math.floor(Date.now() / 1000));
  const yearEarlier = (epoch: number, endOfDay: boolean) => {
    const p = zonedParts(epoch, tz);
    return endOfDay
      ? wallTimeToEpoch(p.year - 1, p.month, p.day, 23, 59, 59, tz)
      : wallTimeToEpoch(p.year - 1, p.month, p.day, 0, 0, 0, tz);
  };
  const prevStart = yearEarlier(start, false);
  // The past 12 months run up to today, so the 12 months before end right where they start
  const prevEnd = period === "rolling" ? start - 1 : yearEarlier(shownEnd, true);

  const { rows } = await loadRows(userId, prevStart, prevEnd);
  const summary = summarizeHistory(rows);
  if (summary.watchTime <= 0) return null;

  const yearToDate = period !== "rolling" && shownEnd < end;
  return {
    ...summary,
    kind: period === "rolling" ? "rolling" : yearToDate ? "yearToDate" : "year",
    year: zonedParts(prevStart, tz).year,
    until: yearToDate ? formatLongDate(zonedParts(prevEnd, tz)) : null,
  };
};

/** The "rank" and "history" fields of a report, as JSON object members */
const buildExtras = async (userId: number | null, period: string, tz: string): Promise<string> => {
  refreshExtrasCaches();
  const showRank = userId !== null && getSettings().showViewerRank;
  // The current year is compared with last year up to today's date, so this changes daily
  const key = [userId ?? "all", period, tz, showRank ? "r" : "", todayKey(tz)].join("|");
  let json = extrasMemo.get(key);
  if (json === undefined) {
    const [rank, history] = await Promise.all([
      showRank ? buildRank(userId, period, tz) : null,
      period === "alltime"
        ? null
        : Promise.all([buildTimeline(userId, tz), buildPrevious(userId, period, tz)]).then(
            ([timeline, previous]): ReportHistory => ({ ...timeline, previous })
          ),
    ]);
    json = `"rank":${JSON.stringify(rank)},"history":${JSON.stringify(history)}`;
    extrasMemo.set(key, json);
    if (extrasMemo.size > MEMO_SIZE) extrasMemo.delete(extrasMemo.keys().next().value!);
  }
  return json;
};

/** Returns the report as JSON, from cache when possible */
export const buildReport = async (userId: number | null, period: string, tz: string): Promise<string> => {
  const [report, extras] = await Promise.all([buildPeriodReport(userId, period, tz), buildExtras(userId, period, tz)]);
  // The period report is a JSON object: add the extras as its last members
  return `${report.slice(0, -1)},${extras}}`;
};

export const buildReportLocations = (userId: number | null, period: string, tz: string, includeNames: boolean): Promise<LocationsResponse> =>
  buildLocations(rowsInPeriod(userId, period, tz), { timeZone: tz, includeNames });

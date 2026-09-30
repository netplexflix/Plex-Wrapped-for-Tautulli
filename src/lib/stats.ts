// src/lib/stats.ts
// Pure (network-free) stats logic shared by the server and the web app.
// All calendar maths takes an explicit IANA timezone so the server can build
// reports in the viewer's timezone regardless of its own.

import { format as formatDate } from "date-fns";
import type { WatchHistory, WrappedStats } from "@/types/tautulli";
import { defaultReportYear } from "@/lib/adminStorage";

// ============ Timezone helpers ============

export interface ZonedParts {
  year: number;
  month: number; // 0-11
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const dayOffsetCache = new Map<string, Map<number, number | null>>();

const getFormatter = (tz: string): Intl.DateTimeFormat => {
  let fmt = formatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatterCache.set(tz, fmt);
  }
  return fmt;
};

export const isValidTimeZone = (tz: unknown): tz is string => {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    getFormatter(tz);
    return true;
  } catch {
    return false;
  }
};

// UTC offset (in seconds) of `tz` at the given instant
const rawOffsetSeconds = (epochSec: number, tz: string): number => {
  const parts = getFormatter(tz).formatToParts(new Date(epochSec * 1000));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round(asUtc / 1000 - epochSec);
};

// Offsets are cached per UTC day; days containing a DST transition fall back to
// a 15-minute resolution lookup (all real-world transitions align to 15 minutes).
const offsetSeconds = (epochSec: number, tz: string): number => {
  let cache = dayOffsetCache.get(tz);
  if (!cache) {
    cache = new Map();
    dayOffsetCache.set(tz, cache);
  }
  const day = Math.floor(epochSec / 86400);
  let entry = cache.get(day);
  if (entry === undefined) {
    const startOffset = rawOffsetSeconds(day * 86400, tz);
    const endOffset = rawOffsetSeconds((day + 1) * 86400, tz);
    entry = startOffset === endOffset ? startOffset : null;
    cache.set(day, entry);
  }
  if (entry !== null) return entry;
  return rawOffsetSeconds(Math.floor(epochSec / 900) * 900, tz);
};

export const zonedParts = (epochSec: number, tz: string): ZonedParts => {
  const local = new Date((epochSec + offsetSeconds(epochSec, tz)) * 1000);
  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth(),
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    weekday: local.getUTCDay(),
  };
};

// Converts a wall-clock time in `tz` to epoch seconds (month is 0-based, overflow allowed)
export const wallTimeToEpoch = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  tz: string
): number => {
  const guess = Date.UTC(year, month, day, hour, minute, second) / 1000;
  const first = guess - offsetSeconds(guess, tz);
  return guess - offsetSeconds(first, tz);
};

// A local Date carrying the calendar date of `parts` (for date-only formatting)
const calendarDate = (p: ZonedParts) => new Date(p.year, p.month, p.day, 12);

export const formatLongDate = (p: ZonedParts) => formatDate(calendarDate(p), "MMMM do yyyy");

// ============ Periods ============

export const isValidPeriod = (period: unknown): period is string =>
  typeof period === "string" && (period === "alltime" || period === "rolling" || /^\d{4}$/.test(period));

/** Inclusive [start, end] epoch-second range for a report period, in `tz` */
export const getPeriodRange = (period: string, tz: string, nowSec = Date.now() / 1000) => {
  const today = zonedParts(nowSec, tz);
  const startOfDay = (y: number, m: number, d: number) => wallTimeToEpoch(y, m, d, 0, 0, 0, tz);
  const endOfDay = (y: number, m: number, d: number) => wallTimeToEpoch(y, m, d, 23, 59, 59, tz);

  if (period === "alltime") {
    return { start: startOfDay(2000, 0, 1), end: endOfDay(today.year, today.month, today.day) };
  }
  if (period === "rolling") {
    const s = new Date(Date.UTC(today.year - 1, today.month, today.day));
    return {
      start: startOfDay(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()),
      end: endOfDay(today.year, today.month, today.day),
    };
  }
  const year = Number(period);
  return { start: startOfDay(year, 0, 1), end: endOfDay(year, 11, 31) };
};

// Previous year until the admin's "current year from" date (default December 1st), then the current year
export const getDefaultYear = (tz: string, currentYearFrom: string, nowSec = Date.now() / 1000): number => {
  const now = zonedParts(nowSec, tz);
  return defaultReportYear(now.year, now.month, now.day, currentYearFrom);
};

// ============ History row helpers ============

export const isVideoContent = (mediaType: string): boolean => mediaType === "movie" || mediaType === "episode";

export const normalizeEpochSeconds = (value?: number) => {
  if (!value || !Number.isFinite(value)) return 0;
  return value > 10_000_000_000 ? Math.floor(value / 1000) : value;
};

// Duration values from Tautulli history are in SECONDS. Only convert if it looks like
// milliseconds (> 10 million = > 115 days in seconds).
export const normalizeDurationSeconds = (value?: number) => {
  if (!value || !Number.isFinite(value)) return 0;
  if (value > 10_000_000) {
    return Math.round(value / 1000);
  }
  return value;
};

export const getEventSeconds = (h: WatchHistory) => {
  const started = normalizeEpochSeconds(h.started);
  const date = normalizeEpochSeconds(h.date);
  return started > 0 ? started : date;
};

export const getSessionSeconds = (h: WatchHistory) => {
  // Try play_duration first (this is what Tautulli uses for "Watch Time")
  const playDuration = normalizeDurationSeconds(h.play_duration);
  if (playDuration > 0) {
    return playDuration;
  }

  // Fallback to wall-clock time
  const started = normalizeEpochSeconds(h.started);
  const stopped = normalizeEpochSeconds(h.stopped);
  if (started > 0 && stopped > started) {
    return stopped - started;
  }

  // Last resort: duration field
  const duration = normalizeDurationSeconds(h.duration);
  if (duration > 0) {
    return duration;
  }

  return 0;
};

export const parseNumber = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return 0;
    if (/^\d+$/.test(s)) return Number(s);
    const ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
};

/** Parses a raw Tautulli get_history row into numeric fields */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const parseHistoryRow = (item: any): WatchHistory => ({
  ...item,
  reference_id: parseNumber(item.reference_id),
  row_id: parseNumber(item.row_id),
  id: parseNumber(item.id),
  date: parseNumber(item.date),
  started: parseNumber(item.started),
  stopped: parseNumber(item.stopped),
  duration: parseNumber(item.duration),
  play_duration: parseNumber(item.play_duration),
  paused_counter: parseNumber(item.paused_counter),
  user_id: parseNumber(item.user_id),
  rating_key: parseNumber(item.rating_key),
  parent_rating_key: parseNumber(item.parent_rating_key),
  grandparent_rating_key: parseNumber(item.grandparent_rating_key),
  group_count: parseNumber(item.group_count),
  percent_complete: parseNumber(item.percent_complete),
  live: parseNumber(item.live),
  relayed: parseNumber(item.relayed),
  secure: parseNumber(item.secure),
  watched_status: parseNumber(item.watched_status),
  media_index: parseNumber(item.media_index),
  parent_media_index: parseNumber(item.parent_media_index),
  year: parseNumber(item.year),
});

export const getHistoryKey = (h: WatchHistory) => {
  const uid = Number(h.user_id) || 0;
  const rowId = Number(h.row_id);
  if (Number.isFinite(rowId) && rowId > 0) return `row:${uid}:${rowId}`;
  const refId = Number(h.reference_id);
  if (Number.isFinite(refId) && refId > 0) return `ref:${uid}:${refId}`;
  const id = Number(h.id);
  if (Number.isFinite(id) && id > 0) return `id:${uid}:${id}`;
  return `fallback:${h.user_id}:${h.started}:${h.date}:${h.rating_key}:${h.stopped}:${h.duration}`;
};

/** Total watch time (seconds) for a set of history rows */
export const totalWatchSeconds = (history: WatchHistory[]) =>
  history.reduce((sum, h) => (isVideoContent(h.media_type) ? sum + getSessionSeconds(h) : sum), 0);

// ============ Anomaly normalization ============

/** Converts a Tautulli metadata duration (normally milliseconds) to seconds */
export const runtimeSecondsFromDuration = (raw: unknown): number | null => {
  const duration = typeof raw === "string" ? parseFloat(raw) : raw;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) return null;
  // Tautulli metadata duration is typically in milliseconds
  if (duration > 100000) return Math.floor(duration / 1000);
  if (duration > 1000) return Math.floor(duration);
  return Math.floor(duration * 60);
};

/**
 * Caps session durations that exceed 1.5x the item's runtime (sessions Tautulli
 * failed to close). Returns new row objects for corrected rows; input is not mutated.
 */
export const normalizeHistory = (
  history: WatchHistory[],
  runtimeLookup: (ratingKey: number) => number | null
): { history: WatchHistory[]; corrected: number } => {
  let corrected = 0;
  const result = history.map((original) => {
    const runtime = runtimeLookup(original.rating_key);
    if (!runtime || runtime <= 0) return original;

    const h = { ...original };
    let wasCorrected = false;

    if (h.duration && h.duration > runtime * 1.5) {
      h.duration = runtime;
      wasCorrected = true;
    }

    if (h.play_duration && h.play_duration > runtime * 1.5) {
      h.play_duration = runtime;
      wasCorrected = true;
    }

    // Wall clock time (stopped - started)
    const started = normalizeEpochSeconds(h.started);
    const stopped = normalizeEpochSeconds(h.stopped);
    if (started > 0 && stopped > started && stopped - started > runtime * 1.5) {
      h.stopped = started + runtime;
      wasCorrected = true;
    }

    if (!wasCorrected) return original;
    corrected++;
    return h;
  });
  return { history: result, corrected };
};

// ============ Wrapped stats ============

const emptyStats = (): WrappedStats => ({
  totalWatchTime: 0,
  totalMovies: 0,
  totalShows: 0,
  totalEpisodes: 0,
  topMovie: null,
  topShow: null,
  topMovies: [],
  topShows: [],
  watchByDay: [],
  watchByHour: [],
  watchByMonth: [],
  watchByYear: [],
  longestBinge: null,
  lateNightSessions: 0,
  weekendPercentage: 0,
  mostActiveDay: null,
  uniqueTitles: 0,
  avgDailyWatchTime: 0,
  avgSessionLength: 0,
  mostBingedDay: null,
  earlyBirdSessions: 0,
  platforms: [],
  firstWatch: null,
  lastWatch: null,
  longestStreak: 0,
  totalSessions: 0,
  peakHour: 0,
  morningWatchTime: 0,
  afternoonWatchTime: 0,
  eveningWatchTime: 0,
  nightWatchTime: 0,
  topGenres: [],
  topActors: [],
  topDirectors: [],
  contentDecades: [],
  mostRewatched: null,
  topMoviesByUsers: [],
  topShowsByUsers: [],
  peakConcurrentStreams: null,
});

export const calculateWrappedStats = (history: WatchHistory[], tz: string): WrappedStats => {
  // Filter to only video content (movies and TV episodes)
  const videoHistory = history.filter((h) => isVideoContent(h.media_type));

  if (!videoHistory.length) {
    return emptyStats();
  }

  const partsCache = new Map<number, ZonedParts>();
  const partsOf = (h: WatchHistory) => {
    const t = getEventSeconds(h);
    let p = partsCache.get(t);
    if (!p) {
      p = zonedParts(t, tz);
      partsCache.set(t, p);
    }
    return p;
  };

  const totalWatchTime = videoHistory.reduce((sum, item) => sum + getSessionSeconds(item), 0);

  const movies = videoHistory.filter((h) => h.media_type === "movie");
  const episodes = videoHistory.filter((h) => h.media_type === "episode");

  const uniqueMovies = new Set(movies.map((m) => m.rating_key));
  const uniqueShows = new Set(episodes.map((e) => e.grandparent_rating_key));
  const uniqueTitles = new Set(videoHistory.map((h) => h.rating_key));

  // Top movies by watch time
  const movieCounts: Record<string, { count: number; time: number; year: number; thumb: string; users: Set<number> }> = {};
  movies.forEach((m) => {
    const key = m.full_title || m.title;
    if (!movieCounts[key]) {
      movieCounts[key] = { count: 0, time: 0, year: m.year, thumb: m.thumb, users: new Set() };
    }
    movieCounts[key].count++;
    movieCounts[key].time += getSessionSeconds(m);
    movieCounts[key].users.add(m.user_id);
  });

  const sortedMovies = Object.entries(movieCounts).sort((a, b) => b[1].time - a[1].time);
  const topMovieEntry = sortedMovies[0];
  const topMovie = topMovieEntry
    ? {
        title: topMovieEntry[0],
        year: topMovieEntry[1].year,
        watchCount: topMovieEntry[1].count,
        totalTime: topMovieEntry[1].time,
        thumb: topMovieEntry[1].thumb,
        userCount: topMovieEntry[1].users.size,
      }
    : null;

  const topMovies = sortedMovies.slice(0, 5).map(([title, data]) => ({
    title,
    year: data.year,
    watchCount: data.count,
    totalTime: data.time,
    thumb: data.thumb,
  }));

  // Top shows by watch time
  const showCounts: Record<string, { count: number; time: number; episodes: Set<number>; thumb: string; users: Set<number> }> = {};
  episodes.forEach((e) => {
    const key = e.grandparent_title || e.title;
    if (!showCounts[key]) {
      showCounts[key] = { count: 0, time: 0, episodes: new Set(), thumb: e.thumb, users: new Set() };
    }
    showCounts[key].count++;
    showCounts[key].time += getSessionSeconds(e);
    showCounts[key].episodes.add(e.rating_key);
    showCounts[key].users.add(e.user_id);
  });

  const sortedShows = Object.entries(showCounts).sort((a, b) => b[1].time - a[1].time);
  const topShowEntry = sortedShows[0];
  const topShow = topShowEntry
    ? {
        title: topShowEntry[0],
        watchCount: topShowEntry[1].count,
        totalTime: topShowEntry[1].time,
        episodeCount: topShowEntry[1].episodes.size,
        thumb: topShowEntry[1].thumb,
        userCount: topShowEntry[1].users.size,
      }
    : null;

  const topShows = sortedShows.slice(0, 5).map(([title, data]) => ({
    title,
    watchCount: data.count,
    totalTime: data.time,
    episodeCount: data.episodes.size,
    thumb: data.thumb,
  }));

  // Watch by day of week - starting with Monday
  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const dayStats: Record<string, number> = {};
  dayNames.forEach((day) => {
    dayStats[day] = 0;
  });

  // Map JavaScript day (0=Sunday) to our day names
  const jsDayToName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  videoHistory.forEach((h) => {
    dayStats[jsDayToName[partsOf(h).weekday]] += getSessionSeconds(h);
  });

  const watchByDay = dayNames.map((day) => ({
    day,
    hours: Math.round((dayStats[day] / 3600) * 10) / 10,
  }));

  // Watch by hour
  const hourStats: Record<number, number> = {};
  for (let i = 0; i < 24; i++) {
    hourStats[i] = 0;
  }

  videoHistory.forEach((h) => {
    hourStats[partsOf(h).hour] += getSessionSeconds(h);
  });

  const watchByHour = Object.entries(hourStats).map(([hour, seconds]) => ({
    hour: parseInt(hour),
    minutes: Math.round(seconds / 60),
  }));

  // Watch by month
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthStats: Record<string, number> = {};
  monthNames.forEach((m) => {
    monthStats[m] = 0;
  });

  videoHistory.forEach((h) => {
    monthStats[monthNames[partsOf(h).month]] += getSessionSeconds(h);
  });

  const watchByMonth = monthNames.map((month) => ({
    month,
    hours: Math.round((monthStats[month] / 3600) * 100) / 100,
  }));

  // Watch by year
  const yearStats: Record<number, number> = {};
  videoHistory.forEach((h) => {
    const year = partsOf(h).year;
    if (!yearStats[year]) yearStats[year] = 0;
    yearStats[year] += getSessionSeconds(h);
  });

  const watchByYear = Object.entries(yearStats)
    .map(([year, seconds]) => ({
      year: parseInt(year),
      hours: Math.round((seconds / 3600) * 100) / 100,
    }))
    .sort((a, b) => a.year - b.year);

  // Late night sessions (after midnight, before 5am)
  const lateNightSessions = videoHistory.filter((h) => {
    const hour = partsOf(h).hour;
    return hour >= 0 && hour < 5;
  }).length;

  // Early bird sessions (5am - 8am)
  const earlyBirdSessions = videoHistory.filter((h) => {
    const hour = partsOf(h).hour;
    return hour >= 5 && hour < 8;
  }).length;

  // Weekend percentage
  const weekendHistory = videoHistory.filter((h) => {
    const day = partsOf(h).weekday;
    return day === 0 || day === 6;
  });
  const weekendPercentage = Math.round((weekendHistory.length / videoHistory.length) * 100);

  // Find longest single session
  const sessionsWithDuration = videoHistory
    .map((h) => ({
      item: h,
      duration: getSessionSeconds(h),
    }))
    .filter((s) => s.duration > 0);

  const sortedByDuration = sessionsWithDuration.sort((a, b) => b.duration - a.duration);
  const longestSession = sortedByDuration[0];
  const longestBinge = longestSession
    ? {
        title: longestSession.item.full_title || longestSession.item.title,
        duration: longestSession.duration,
        date: formatLongDate(partsOf(longestSession.item)),
      }
    : null;

  // Most active day
  const mostActiveDay = [...watchByDay].sort((a, b) => b.hours - a.hours)[0];

  // Daily watch time for average calculation
  const dailyWatchTime: Record<string, number> = {};
  videoHistory.forEach((h) => {
    const dateKey = calendarDate(partsOf(h)).toDateString();
    dailyWatchTime[dateKey] = (dailyWatchTime[dateKey] || 0) + getSessionSeconds(h);
  });
  const daysWatched = Object.keys(dailyWatchTime).length;
  const avgDailyWatchTime = daysWatched > 0 ? totalWatchTime / daysWatched : 0;

  // Most binged day
  const mostBingedDayEntry = Object.entries(dailyWatchTime).sort((a, b) => b[1] - a[1])[0];
  const mostBingedDay = mostBingedDayEntry
    ? {
        date: mostBingedDayEntry[0],
        duration: mostBingedDayEntry[1],
      }
    : null;

  // Platform stats
  const platformCounts: Record<string, number> = {};
  videoHistory.forEach((h) => {
    const platform = h.platform || "Unknown";
    platformCounts[platform] = (platformCounts[platform] || 0) + 1;
  });
  const platforms = Object.entries(platformCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count, percentage: Math.round((count / videoHistory.length) * 100) }));

  // First and last watch
  const sortedByDate = [...videoHistory].sort((a, b) => getEventSeconds(a) - getEventSeconds(b));
  const firstWatchItem = sortedByDate[0];
  const lastWatchItem = sortedByDate[sortedByDate.length - 1];

  const firstWatch = firstWatchItem
    ? {
        title: firstWatchItem.full_title || firstWatchItem.title,
        date: formatLongDate(partsOf(firstWatchItem)),
      }
    : null;

  const lastWatch = lastWatchItem
    ? {
        title: lastWatchItem.full_title || lastWatchItem.title,
        date: formatLongDate(partsOf(lastWatchItem)),
      }
    : null;

  // Longest streak (consecutive calendar days)
  const watchDays = [
    ...new Set(
      videoHistory.map((h) => {
        const p = partsOf(h);
        return Date.UTC(p.year, p.month, p.day) / 86400000;
      })
    ),
  ].sort((a, b) => a - b);

  let currentStreak = 1;
  let longestStreak = watchDays.length > 0 ? 1 : 0;

  for (let i = 1; i < watchDays.length; i++) {
    if (watchDays[i] - watchDays[i - 1] === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  // Average session length
  const avgSessionLength = videoHistory.length > 0 ? totalWatchTime / videoHistory.length : 0;

  // Peak hour
  const peakHourEntry = Object.entries(hourStats).sort((a, b) => b[1] - a[1])[0];
  const peakHour = peakHourEntry ? parseInt(peakHourEntry[0]) : 0;

  // Watch time by time of day
  let morningWatchTime = 0;
  let afternoonWatchTime = 0;
  let eveningWatchTime = 0;
  let nightWatchTime = 0;

  Object.entries(hourStats).forEach(([hourStr, seconds]) => {
    const hour = parseInt(hourStr);
    if (hour >= 5 && hour < 12) {
      morningWatchTime += seconds;
    } else if (hour >= 12 && hour < 18) {
      afternoonWatchTime += seconds;
    } else if (hour >= 18 && hour < 22) {
      eveningWatchTime += seconds;
    } else {
      nightWatchTime += seconds;
    }
  });

  // Content decades
  const decadeCounts: Record<string, { count: number; time: number }> = {};
  videoHistory.forEach((h) => {
    if (h.year) {
      const decade = `${Math.floor(h.year / 10) * 10}s`;
      if (!decadeCounts[decade]) {
        decadeCounts[decade] = { count: 0, time: 0 };
      }
      decadeCounts[decade].count++;
      decadeCounts[decade].time += getSessionSeconds(h);
    }
  });
  const contentDecades = Object.entries(decadeCounts)
    .sort((a, b) => b[1].time - a[1].time)
    .slice(0, 5)
    .map(([decade, data]) => ({ decade, count: data.count, watchTime: data.time }));

  // Most rewatched
  const titlePlayCounts: Record<string, number> = {};
  videoHistory.forEach((h) => {
    const title = h.grandparent_title || h.full_title || h.title;
    titlePlayCounts[title] = (titlePlayCounts[title] || 0) + 1;
  });
  const mostRewatchedEntry = Object.entries(titlePlayCounts)
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])[0];
  const mostRewatched = mostRewatchedEntry ? { title: mostRewatchedEntry[0], rewatchCount: mostRewatchedEntry[1] } : null;

  // Top movies by users
  const movieUserCounts: Record<string, { users: Set<number>; time: number }> = {};
  movies.forEach((m) => {
    const title = m.full_title || m.title;
    if (!movieUserCounts[title]) {
      movieUserCounts[title] = { users: new Set(), time: 0 };
    }
    movieUserCounts[title].users.add(m.user_id);
    movieUserCounts[title].time += getSessionSeconds(m);
  });
  const topMoviesByUsers = Object.entries(movieUserCounts)
    .filter(([, data]) => data.users.size > 1)
    .sort((a, b) => b[1].users.size - a[1].users.size)
    .slice(0, 5)
    .map(([title, data]) => ({ title, userCount: data.users.size, totalTime: data.time }));

  // Top shows by users
  const showUserCounts: Record<string, { users: Set<number>; time: number }> = {};
  episodes.forEach((e) => {
    const title = e.grandparent_title || e.title;
    if (!showUserCounts[title]) {
      showUserCounts[title] = { users: new Set(), time: 0 };
    }
    showUserCounts[title].users.add(e.user_id);
    showUserCounts[title].time += getSessionSeconds(e);
  });
  const topShowsByUsers = Object.entries(showUserCounts)
    .filter(([, data]) => data.users.size > 1)
    .sort((a, b) => b[1].users.size - a[1].users.size)
    .slice(0, 5)
    .map(([title, data]) => ({ title, userCount: data.users.size, totalTime: data.time }));

  // Peak concurrent streams
  let peakConcurrentStreams: WrappedStats["peakConcurrentStreams"] = null;

  const getConcurrencyWindow = (h: WatchHistory) => {
    const started = normalizeEpochSeconds(h.started);
    const stopped = normalizeEpochSeconds(h.stopped);
    const duration = normalizeDurationSeconds(h.duration);

    const start =
      started > 0 ? started : stopped > 0 && duration > 0 ? Math.max(1, stopped - duration) : normalizeEpochSeconds(h.date);

    const rawEnd = stopped > start ? stopped : start + duration;
    const end = rawEnd > start ? rawEnd : 0;

    return start > 0 && end > start ? { start, end } : null;
  };

  const sessionsForConcurrency = videoHistory
    .map(getConcurrencyWindow)
    .filter((s): s is { start: number; end: number } => Boolean(s));

  if (sessionsForConcurrency.length > 0) {
    const events: { time: number; delta: number }[] = [];
    sessionsForConcurrency.forEach((s) => {
      events.push({ time: s.start, delta: 1 });
      events.push({ time: s.end, delta: -1 });
    });

    events.sort((a, b) => a.time - b.time || b.delta - a.delta);

    let currentConcurrent = 0;
    let maxConcurrent = 0;
    let maxTime = 0;

    for (const event of events) {
      currentConcurrent += event.delta;
      if (currentConcurrent > maxConcurrent) {
        maxConcurrent = currentConcurrent;
        maxTime = event.time;
      }
    }

    if (maxConcurrent > 1) {
      const p = zonedParts(maxTime, tz);
      peakConcurrentStreams = {
        count: maxConcurrent,
        date: formatLongDate(p),
        time: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
        timestamp: maxTime,
      };
    }
  }

  return {
    totalWatchTime,
    totalMovies: uniqueMovies.size,
    totalShows: uniqueShows.size,
    totalEpisodes: episodes.length,
    topMovie,
    topShow,
    topMovies,
    topShows,
    watchByDay,
    watchByHour,
    watchByMonth,
    watchByYear,
    longestBinge,
    lateNightSessions,
    weekendPercentage,
    mostActiveDay,
    uniqueTitles: uniqueTitles.size,
    avgDailyWatchTime,
    avgSessionLength,
    mostBingedDay,
    earlyBirdSessions,
    platforms,
    firstWatch,
    lastWatch,
    longestStreak,
    totalSessions: videoHistory.length,
    peakHour,
    morningWatchTime,
    afternoonWatchTime,
    eveningWatchTime,
    nightWatchTime,
    topGenres: [],
    topActors: [],
    topDirectors: [],
    contentDecades,
    mostRewatched,
    topMoviesByUsers,
    topShowsByUsers,
    peakConcurrentStreams,
  };
};

// ============ Genre / actor / director stats ============

export interface CreditsLookupResult {
  genres?: string[];
  actors?: string[];
  directors?: string[];
}

type Agg = Map<number, { watchTime: number; users: Set<number> }>;

// The most-watched movies (by rating key) and shows (by grandparent rating key)
// whose metadata feeds the genre/actor/director stats
export const selectMetadataTargets = (history: WatchHistory[]) => {
  const videoHistory = history.filter((h) => isVideoContent(h.media_type));
  const movieAgg: Agg = new Map();
  const showAgg: Agg = new Map();

  const addToAgg = (map: Agg, key: number, userId: number, duration: number) => {
    const existing = map.get(key);
    if (existing) {
      existing.watchTime += duration;
      existing.users.add(userId);
    } else {
      map.set(key, { watchTime: duration, users: new Set([userId]) });
    }
  };

  videoHistory.forEach((h) => {
    let duration = normalizeDurationSeconds(h.play_duration);

    if (!duration || duration <= 0) {
      const started = normalizeEpochSeconds(h.started);
      const stopped = normalizeEpochSeconds(h.stopped);
      const diff = started > 0 && stopped > started ? stopped - started : 0;
      duration = diff > 0 ? diff : normalizeDurationSeconds(h.duration);
    }

    const userId = Number.isFinite(Number(h.user_id)) ? Number(h.user_id) : 0;

    if (h.media_type === "movie" && h.rating_key) {
      addToAgg(movieAgg, h.rating_key, userId, duration);
    } else if (h.media_type === "episode" && h.grandparent_rating_key) {
      addToAgg(showAgg, h.grandparent_rating_key, userId, duration);
    }
  });

  const movieEntries = [...movieAgg.entries()].sort((a, b) => b[1].watchTime - a[1].watchTime).slice(0, 120);
  const showEntries = [...showAgg.entries()].sort((a, b) => b[1].watchTime - a[1].watchTime).slice(0, 80);
  return { movieEntries, showEntries };
};

export const aggregateMetadataStats = (
  history: WatchHistory[],
  lookup: (ratingKey: number) => CreditsLookupResult | null
): Pick<WrappedStats, "topGenres" | "topActors" | "topDirectors"> => {
  const { movieEntries, showEntries } = selectMetadataTargets(history);

  const genreCounts: Record<string, { titles: Set<number>; watchTime: number }> = {};
  const actorCounts: Record<string, { score: number; users: Set<number>; titles: Set<number>; watchTime: number }> = {};
  const directorCounts: Record<string, { score: number; users: Set<number>; titles: Set<number>; watchTime: number }> = {};

  const applyCredits = (ratingKey: number, watchTime: number, users: Set<number>, meta: CreditsLookupResult) => {
    meta.genres?.forEach((genre) => {
      if (!genreCounts[genre]) genreCounts[genre] = { titles: new Set(), watchTime: 0 };
      genreCounts[genre].titles.add(ratingKey);
      genreCounts[genre].watchTime += watchTime;
    });

    meta.actors?.forEach((actor) => {
      if (!actorCounts[actor]) {
        actorCounts[actor] = { score: 0, users: new Set(), titles: new Set(), watchTime: 0 };
      }
      actorCounts[actor].score += users.size;
      users.forEach((u) => actorCounts[actor].users.add(u));
      actorCounts[actor].titles.add(ratingKey);
      actorCounts[actor].watchTime += watchTime;
    });

    meta.directors?.forEach((director) => {
      if (!directorCounts[director]) {
        directorCounts[director] = { score: 0, users: new Set(), titles: new Set(), watchTime: 0 };
      }
      directorCounts[director].score += users.size;
      users.forEach((u) => directorCounts[director].users.add(u));
      directorCounts[director].titles.add(ratingKey);
      directorCounts[director].watchTime += watchTime;
    });
  };

  for (const [ratingKey, data] of [...movieEntries, ...showEntries]) {
    const meta = lookup(ratingKey);
    if (meta) applyCredits(ratingKey, data.watchTime, data.users, meta);
  }

  const topGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1].watchTime - a[1].watchTime)
    .slice(0, 8)
    .map(([genre, data]) => ({ genre, count: data.titles.size, watchTime: data.watchTime }));

  const rankPeople = (counts: typeof actorCounts, limit: number) =>
    Object.entries(counts)
      .sort((a, b) => b[1].score - a[1].score || b[1].users.size - a[1].users.size || b[1].watchTime - a[1].watchTime)
      .slice(0, limit)
      .map(([name, data]) => ({
        name,
        count: data.users.size,
        titleCount: data.titles.size,
        watchTime: data.watchTime,
      }));

  return { topGenres, topActors: rankPeople(actorCounts, 8), topDirectors: rankPeople(directorCounts, 5) };
};

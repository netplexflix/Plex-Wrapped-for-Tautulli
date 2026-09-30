// Local copy of the Tautulli watch history (movies + episodes only)
//
// Storage: history-cache.ndjson holds one row per line. Incremental syncs only append
// new/changed rows (the last line for a row wins); the file is rewritten ("compacted")
// on full syncs or once too many superseded lines pile up. Sync times and the user list
// live in the small history-meta.json.

import fs from "node:fs";
import fsp from "node:fs/promises";
import readline from "node:readline";
import { dataPath, readJson, writeJsonAtomic } from "./storage";
import { tautulliCall, getServerInfo } from "./tautulli";
import { getConfig, updateConfig } from "./config";
import { getEventSeconds, getHistoryKey, isVideoContent, normalizeEpochSeconds, parseHistoryRow } from "@/lib/stats";
import type { TautulliUser, WatchHistory } from "@/types/tautulli";

const ROWS_FILE = dataPath("history-cache.ndjson");
const META_FILE = dataPath("history-meta.json");
const PAGE_SIZE = 5000;
const INCREMENTAL_PAGE_SIZE = 1000; // a typical day fits in one small request
// Incremental syncs read rows by stop time (Tautulli writes a row when a session stops),
// re-reading the last day to be safe
const INCREMENTAL_OVERLAP = 24 * 3600;
const MAX_ROWS = 10_000_000;
const COMPACT_RATIO = 0.25;

// Only the fields the stats actually use are kept
const KEEP_FIELDS = [
  "reference_id", "row_id", "id", "date", "started", "stopped", "duration", "play_duration", "paused_counter",
  "user_id", "user", "friendly_name", "platform", "ip_address", "media_type", "rating_key", "parent_rating_key",
  "grandparent_rating_key", "full_title", "title", "grandparent_title", "year", "thumb", "group_count", "group_ids",
  "percent_complete", "watched_status",
] as const;

export type StoredUser = Pick<TautulliUser, "user_id" | "username" | "friendly_name" | "thumb" | "email" | "is_active" | "is_admin">;

interface HistoryMeta {
  version: 2;
  lastFullSync: number | null;
  lastIncrementalSync: number | null;
  users: StoredUser[];
}

const compact = (row: WatchHistory): WatchHistory => {
  const out: Record<string, unknown> = {};
  for (const field of KEEP_FIELDS) {
    const value = (row as unknown as Record<string, unknown>)[field];
    if (value !== undefined && value !== null && value !== "") out[field] = value;
  }
  return out as unknown as WatchHistory;
};

let rows: WatchHistory[] = [];
let byUser = new Map<number, WatchHistory[]>();
let users: StoredUser[] = [];
let version = 0;
let lastFullSync: number | null = null;
let lastIncrementalSync: number | null = null;
let oldestEvent: number | null = null;
let newestStopped = 0;
let supersededLines = 0;
let loaded = false;

const index = (next: WatchHistory[]) => {
  next.sort((a, b) => getEventSeconds(b) - getEventSeconds(a));
  rows = next;
  byUser = new Map();
  let oldest: number | null = null;
  let stopped = 0;
  for (const row of next) {
    const list = byUser.get(row.user_id);
    if (list) list.push(row);
    else byUser.set(row.user_id, [row]);
    const t = getEventSeconds(row);
    if (t > 0 && (oldest === null || t < oldest)) oldest = t;
    stopped = Math.max(stopped, normalizeEpochSeconds(row.stopped));
  }
  oldestEvent = oldest;
  newestStopped = stopped;
  version++;
};

// ============ Persistence ============

const saveMeta = () => writeJsonAtomic(META_FILE, { version: 2, lastFullSync, lastIncrementalSync, users } satisfies HistoryMeta);

/** Rewrites the rows file with exactly the current rows */
const rewriteRows = async () => {
  const tmp = `${ROWS_FILE}.tmp`;
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(tmp, { encoding: "utf8" });
    out.on("error", reject);
    out.on("finish", resolve);
    let i = 0;
    const writeMore = () => {
      while (i < rows.length) {
        if (!out.write(JSON.stringify(rows[i++]) + "\n")) {
          out.once("drain", writeMore);
          return;
        }
      }
      out.end();
    };
    writeMore();
  });
  await fsp.rename(tmp, ROWS_FILE);
  supersededLines = 0;
};

const appendRows = (list: WatchHistory[]) => fsp.appendFile(ROWS_FILE, list.map((r) => JSON.stringify(r)).join("\n") + "\n");

export const loadHistory = async () => {
  const meta = await readJson<Partial<HistoryMeta>>(META_FILE, {});
  users = meta.users ?? [];
  lastFullSync = meta.lastFullSync ?? null;
  lastIncrementalSync = meta.lastIncrementalSync ?? null;

  const byKey = new Map<string, WatchHistory>();
  let lines = 0;
  let skipped = 0;
  let legacyHeader = false;
  try {
    const lineReader = readline.createInterface({ input: fs.createReadStream(ROWS_FILE, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of lineReader) {
      if (!line.trim()) continue;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line);
      } catch {
        skipped++; // e.g. a partial line from an interrupted append
        continue;
      }
      // Files written by the first 2026.09.30 builds start with a header line
      if ("users" in parsed && "version" in parsed && !("user_id" in parsed)) {
        legacyHeader = true;
        if (meta.version === undefined) {
          users = (parsed.users as StoredUser[]) ?? [];
          lastFullSync = (parsed.lastFullSync as number) ?? null;
          lastIncrementalSync = (parsed.lastIncrementalSync as number) ?? null;
        }
        continue;
      }
      lines++;
      const row = parsed as unknown as WatchHistory;
      byKey.set(getHistoryKey(row), row); // later lines win
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.error("[History] Failed to load cache:", error);
  }

  index([...byKey.values()]);
  supersededLines = lines - byKey.size;
  if (skipped) console.warn(`[History] Skipped ${skipped} unreadable line(s)`);
  if (legacyHeader || skipped) {
    await rewriteRows();
    await saveMeta();
  }
  if (rows.length) console.log(`[History] Loaded ${rows.length} cached history rows`);
  loaded = true;
};

export const clearHistory = async () => {
  index([]);
  users = [];
  lastFullSync = null;
  lastIncrementalSync = null;
  supersededLines = 0;
  await Promise.all([fsp.rm(ROWS_FILE, { force: true }), fsp.rm(META_FILE, { force: true })]);
};

// ============ Sync ============

const fetchPage = async (start: number, orderColumn: "started" | "stopped", length: number): Promise<WatchHistory[]> => {
  const data = await tautulliCall<{ data?: unknown[] }>(
    "get_history",
    { length, start, order_column: orderColumn, order_dir: "desc", include_activity: 0, grouping: 0 },
    { timeoutMs: 180_000 }
  );
  return (data?.data || []).map(parseHistoryRow);
};

const refreshUsersAndServer = async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = await tautulliCall<any[]>("get_users");
    users = (list || []).map((u) => ({
      user_id: Number(u.user_id),
      username: u.username || "",
      friendly_name: u.friendly_name || "",
      thumb: u.user_thumb || u.thumb || "",
      email: u.email || "",
      is_active: u.is_active,
      is_admin: u.is_admin,
    }));
  } catch (error) {
    console.error("[History] Failed to refresh users:", (error as Error).message);
  }
  try {
    const info = await getServerInfo();
    const current = getConfig().plexServer;
    if (info.pms_identifier && (current?.machineId !== info.pms_identifier || current?.name !== info.pms_name)) {
      await updateConfig((c) => {
        c.plexServer = { machineId: info.pms_identifier!, name: info.pms_name || "Plex Server" };
      });
    }
  } catch (error) {
    console.error("[History] Failed to refresh server info:", (error as Error).message);
  }
};

export type SyncProgress = (fetchedRows: number) => void;

const fullSync = async (onProgress?: SyncProgress) => {
  const collected = new Map<string, WatchHistory>();
  const seen = new Set<string>();
  let start = 0;
  while (start < MAX_ROWS) {
    const page = await fetchPage(start, "started", PAGE_SIZE);
    if (page.length === 0) break;
    let added = 0;
    for (const row of page) {
      const key = getHistoryKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      added++;
      if (isVideoContent(row.media_type)) collected.set(key, compact(row));
    }
    onProgress?.(seen.size);
    if (added === 0) break;
    start += page.length;
  }

  // Work out what actually changed (new, edited or deleted rows) so only affected reports are rebuilt
  const changedRows: WatchHistory[] = [];
  const previous = new Map<string, WatchHistory>();
  for (const row of rows) previous.set(getHistoryKey(row), row);
  for (const [key, row] of collected) {
    const old = previous.get(key);
    if (!old) changedRows.push(row);
    else if (JSON.stringify(old) !== JSON.stringify(row)) changedRows.push(old, row);
    previous.delete(key);
  }
  const deleted = previous.size;
  changedRows.push(...previous.values());

  if (changedRows.length > 0) index([...collected.values()]);
  if (changedRows.length > 0 || supersededLines > 0) await rewriteRows();
  return { changedRows, fetched: seen.size, deleted };
};

// Reads rows newest-stopped-first until it overlaps what's stored; only new or changed rows are kept
const incrementalSync = async (onProgress?: SyncProgress) => {
  const collected = new Map<string, WatchHistory>();
  for (const row of rows) collected.set(getHistoryKey(row), row);
  const cutoff = newestStopped - INCREMENTAL_OVERLAP;

  const seen = new Set<string>();
  const changedRows: WatchHistory[] = [];
  const affectedRows: WatchHistory[] = []; // new rows plus old and new versions of updated rows
  let replaced = 0;
  let start = 0;
  while (start < MAX_ROWS) {
    const page = await fetchPage(start, "stopped", INCREMENTAL_PAGE_SIZE);
    if (page.length === 0) break;
    let added = 0;
    for (const row of page) {
      const key = getHistoryKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      added++;
      if (!isVideoContent(row.media_type)) continue;
      const next = compact(row);
      const previous = collected.get(key);
      if (!previous || JSON.stringify(previous) !== JSON.stringify(next)) {
        if (previous) {
          replaced++;
          affectedRows.push(previous);
        }
        collected.set(key, next);
        changedRows.push(next);
        affectedRows.push(next);
      }
    }
    onProgress?.(seen.size);
    if (added === 0) break;
    start += page.length;
    const oldestStopped = normalizeEpochSeconds(page[page.length - 1].stopped);
    if (oldestStopped > 0 && oldestStopped < cutoff) break;
  }

  if (changedRows.length > 0) {
    index([...collected.values()]);
    await appendRows(changedRows);
    supersededLines += replaced;
    if (supersededLines > rows.length * COMPACT_RATIO) await rewriteRows();
  }
  return { changedRows: affectedRows, fetched: seen.size, newRows: changedRows.length - replaced, updatedRows: replaced };
};

export interface SyncResult {
  /** Rows that were added, edited (old and new version) or deleted */
  changedRows: WatchHistory[];
}

let syncPromise: Promise<SyncResult> | null = null;

/**
 * Full: re-reads the entire history (also picks up rows deleted/edited in Tautulli).
 * Incremental: only fetches sessions that stopped since the last sync.
 */
export const syncHistory = (mode: "full" | "incremental", onProgress?: SyncProgress): Promise<SyncResult> => {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const incremental = mode === "incremental" && rows.length > 0;
    const result = incremental ? await incrementalSync(onProgress) : await fullSync(onProgress);

    const now = Date.now();
    lastIncrementalSync = now;
    if (!incremental) lastFullSync = now;
    await refreshUsersAndServer();
    await saveMeta();

    if (incremental) {
      const r = result as Awaited<ReturnType<typeof incrementalSync>>;
      console.log(`[History] Incremental sync: ${r.newRows} new, ${r.updatedRows} updated (${r.fetched} rows checked, ${rows.length} total)`);
    } else {
      const r = result as Awaited<ReturnType<typeof fullSync>>;
      console.log(`[History] Full sync done: ${rows.length} rows, ${r.changedRows.length} changed, ${r.deleted} deleted (${r.fetched} fetched)`);
    }
    return { changedRows: result.changedRows };
  })().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
};

export const isSyncing = () => syncPromise !== null;

// ============ Accessors ============

export const historyLoaded = () => loaded;
export const hasHistory = () => lastIncrementalSync !== null;
export const getHistoryVersion = () => version;
export const getRowCount = () => rows.length;
export const getUsers = () => users;
export const getOldestEvent = () => oldestEvent;
export const getSyncTimes = () => ({ lastFullSync, lastIncrementalSync });

export const getRowsFor = (userId: number | null): WatchHistory[] => (userId === null ? rows : byUser.get(userId) ?? []);

export const getActiveUserIds = () => [...byUser.keys()];

/** Refreshes the user list from Tautulli if it hasn't been loaded yet */
export const ensureUsers = async () => {
  if (users.length === 0) await refreshUsersAndServer();
  return users;
};

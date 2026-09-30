// Plex Wrapped for Tautulli - server

import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import fs from "node:fs/promises";
import path from "node:path";
import { APP_VERSION } from "@/version";
import { isValidPeriod } from "@/lib/stats";
import type { AdminConfig, ApiUser } from "@/types/api";
import type { UserPassword } from "@/lib/adminStorage";
import { dataPath, ensureDataDir } from "./storage";
import { getConfig, getPublicConfig, getSettings, isTautulliConfigured, loadConfig, normalizeSettings, updateConfig } from "./config";
import {
  allowAttempt,
  clearAdminSession,
  clearPinCookie,
  clearViewerSession,
  generatePassword,
  getPinFromCookie,
  getSessionInfo,
  hashPassword,
  isAdmin,
  loadSessionSecret,
  requireAdmin,
  rotateSessionSecret,
  safeEqual,
  setAdminSession,
  setPinCookie,
  setViewerSession,
  verifyAdminPassword,
} from "./auth";
import { getServerInfo, normalizeTautulliUrl, tautulliImage, TautulliError } from "./tautulli";
import { clearHistory, ensureUsers, getUsers, hasHistory, loadHistory } from "./historyStore";
import { clearMetadataCache, loadMetadataCache } from "./metadataCache";
import { clearGeoCache, loadGeoCache } from "./geo";
import { buildReport, buildReportLocations, clearReportMemo, resolveTimeZone } from "./report";
import { getCacheStatus, maybeRefresh, runPipeline, scheduleNightly, startScheduler } from "./scheduler";
import { buildAuthUrl, checkPin, createPin, getAccount, getServerAccess, PlexError } from "./plex";
import { getVersionInfo } from "./version";
import { buildManifest, deleteAppIcons, getAppIconVersion, isAppIconName, loadAppIcons, readAppIcon, renderIndexHtml, saveAppIcons } from "./pwa";
import { APP_ICON_VARIANTS } from "@/lib/appIcons";

const LOGO_FILE = dataPath("custom-logo.png");
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || "dist");
const PORT = Number(process.env.PORT) || 2025;

const app = express();
// Trust reverse proxies on private networks (Docker, LAN) for req.secure / req.ip
app.set("trust proxy", "loopback, linklocal, uniquelocal");
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const api = express.Router();
api.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

const fail = (res: Response, status: number, error: string, extra: Record<string, unknown> = {}) => {
  res.status(status).json({ error, ...extra });
};

const toApiUser = (u: ReturnType<typeof getUsers>[number], withEmail: boolean): ApiUser => ({
  user_id: u.user_id,
  username: u.username,
  friendly_name: u.friendly_name,
  thumb: u.thumb,
  ...(withEmail ? { email: u.email } : {}),
});

// ============ Public ============

api.get("/public-config", (_req, res) => {
  res.json(getPublicConfig());
});

api.get("/session", (req, res) => {
  res.json(getSessionInfo(req));
});

api.post("/auth/logout", (_req, res) => {
  clearViewerSession(res);
  res.json({ success: true });
});

const logoContentType = (buf: Buffer) => {
  const head = buf.subarray(0, 64).toString("utf8").trimStart();
  if (head.startsWith("<")) return "image/svg+xml";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return "image/png";
};

api.get("/logo", async (_req, res) => {
  try {
    const logo = await fs.readFile(LOGO_FILE);
    res.set("Content-Type", logoContentType(logo));
    res.set("Cache-Control", "public, max-age=3600");
    res.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    res.send(logo);
  } catch {
    fail(res, 404, "No custom logo found");
  }
});

api.get("/logo/exists", async (_req, res) => {
  try {
    await fs.access(LOGO_FILE);
    res.json({ exists: true });
  } catch {
    res.json({ exists: false });
  }
});

// Uploaded app (PWA) icons; the defaults are static files in /icons
api.get("/pwa/icon/:file", async (req, res) => {
  const name = req.params.file.replace(/\.png$/, "");
  if (!isAppIconName(name) || getAppIconVersion() === null) return fail(res, 404, "No custom app icon");
  try {
    const icon = await readAppIcon(name);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=86400");
    res.set("Content-Security-Policy", "default-src 'none'");
    res.send(icon);
  } catch {
    fail(res, 404, "No custom app icon");
  }
});

// ============ Plex login ============

api.post("/auth/plex/pin", async (req, res) => {
  if (getSettings().accessMode !== "plex") return fail(res, 404, "Plex login is not enabled");
  if (!getConfig().plexServer) return fail(res, 503, "The Plex server has not been identified yet. Ask the admin to reconnect Tautulli.");
  if (!allowAttempt(req, "plex-pin")) return fail(res, 429, "Too many attempts, please wait a minute");

  // Redirect mode: send the user back here afterwards (same host only)
  let forwardBase: URL | null = null;
  if (typeof req.body?.forwardUrl === "string") {
    try {
      const url = new URL(req.body.forwardUrl);
      if ((url.protocol === "http:" || url.protocol === "https:") && url.host === req.get("host")) forwardBase = url;
    } catch {
      // ignore invalid forward URLs
    }
  }

  const pin = await createPin();
  let forwardUrl: string | undefined;
  if (forwardBase) {
    forwardBase.search = "";
    forwardBase.hash = "";
    forwardBase.searchParams.set("plexPin", String(pin.id));
    forwardUrl = forwardBase.toString();
  }
  setPinCookie(req, res, pin.id);
  res.json({ id: pin.id, authUrl: buildAuthUrl(pin.code, forwardUrl) });
});

api.get("/auth/plex/pin/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || getPinFromCookie(req) !== id) {
    return fail(res, 403, "This login attempt has expired. Please try again.", { status: "expired" });
  }
  const machineId = getConfig().plexServer?.machineId;
  if (getSettings().accessMode !== "plex" || !machineId) return fail(res, 404, "Plex login is not enabled");

  const { token, expired } = await checkPin(id);
  if (!token) {
    if (expired) clearPinCookie(res);
    return res.json({ status: expired ? "expired" : "pending" });
  }

  clearPinCookie(res);
  const account = await getAccount(token);
  const access = await getServerAccess(token, machineId);
  if (!access.hasAccess) {
    const serverName = getConfig().plexServer?.name || "this Plex server";
    return fail(res, 403, `Your Plex account (${account.username || account.title}) doesn't have access to ${serverName}.`, { status: "denied" });
  }

  // Tautulli user ids are Plex account ids; fall back to username/email matching
  const users = await ensureUsers();
  const lower = (s: string | undefined) => (s || "").toLowerCase();
  const tautulliUser =
    users.find((u) => u.user_id === account.id) ||
    users.find((u) => lower(u.username) && lower(u.username) === lower(account.username)) ||
    users.find((u) => lower(u.email) && lower(u.email) === lower(account.email));

  setViewerSession(req, res, {
    kind: "plex",
    userId: tautulliUser?.user_id ?? account.id,
    name: tautulliUser?.friendly_name || account.title || account.username,
    thumb: account.thumb,
    owner: access.owned,
  });
  res.json({ status: "ok" });
});

// ============ Discreet mode ============

api.get("/users/lookup", async (req, res) => {
  const settings = getSettings();
  if (settings.accessMode !== "discreet") return fail(res, 404, "Not available");
  if (!allowAttempt(req, "lookup")) return fail(res, 429, "Too many attempts, please wait a minute");
  const username = String(req.query.username || "").trim().toLowerCase();
  const users = await ensureUsers();
  const user = username ? users.find((u) => u.username.toLowerCase() === username) : undefined;
  if (!user) return fail(res, 404, "User not found");
  res.json({ userId: user.user_id, friendlyName: user.friendly_name || user.username, needsPassword: settings.passwordProtectUsers });
});

api.post("/auth/password", (req, res) => {
  const settings = getSettings();
  if (settings.accessMode !== "discreet" || !settings.passwordProtectUsers) return fail(res, 404, "Not available");
  if (!allowAttempt(req, "user-password")) return fail(res, 429, "Too many attempts, please wait a minute");
  const userId = Number(req.body?.userId);
  const password = String(req.body?.password ?? "");
  const stored = getConfig().userPasswords.find((p) => p.userId === userId);
  if (!stored || !safeEqual(stored.password, password)) return fail(res, 401, "Incorrect password");
  setViewerSession(req, res, { kind: "password", userId, name: stored.friendlyName || stored.username });
  res.json({ success: true });
});

// ============ Users & reports ============

api.get("/users", async (req, res) => {
  const session = getSessionInfo(req);
  if (!session.canViewAnyone) return fail(res, 403, "Not allowed");
  const users = await ensureUsers();
  res.json(users.map((u) => toApiUser(u, session.isAdmin)));
});

/** Resolves which user's stats may be shown (null = everyone); sends an error response and returns undefined if not allowed */
const resolveTarget = (req: Request, res: Response): number | null | undefined => {
  const settings = getSettings();
  const session = getSessionInfo(req);
  const param = String(req.query.user ?? "all");

  if (settings.accessMode === "plex" && !session.viewer && !session.isAdmin) {
    fail(res, 401, "Sign in with Plex to view stats", { needsLogin: true });
    return undefined;
  }
  if (param === "me") {
    if (!session.viewer) {
      fail(res, 400, "Not signed in");
      return undefined;
    }
    return session.viewer.userId;
  }
  if (param === "all") {
    if (session.canViewAnyone || settings.allowAllUsers) return null;
    fail(res, 403, "Viewing everyone's stats is disabled");
    return undefined;
  }

  const id = Number(param);
  if (!Number.isInteger(id)) {
    fail(res, 400, "Invalid user");
    return undefined;
  }
  if (session.canViewAnyone || session.viewer?.userId === id) return id;
  if (settings.accessMode === "discreet") {
    if (!settings.passwordProtectUsers) return id;
    fail(res, 401, "Password required", { needsPassword: true });
    return undefined;
  }
  fail(res, 403, "You can only view your own stats");
  return undefined;
};

const reportParams = (req: Request, res: Response) => {
  if (!isTautulliConfigured()) {
    fail(res, 400, "Plex Wrapped is not configured yet");
    return null;
  }
  const target = resolveTarget(req, res);
  if (target === undefined) return null;
  const period = String(req.query.period ?? "");
  if (!isValidPeriod(period)) {
    fail(res, 400, "Invalid period");
    return null;
  }
  if (!hasHistory()) {
    runPipeline("full");
    const status = getCacheStatus();
    res.status(503).json({ building: true, rows: status.progress?.done ?? 0, phase: status.phase || "Starting" });
    return null;
  }
  return { target, period, tz: resolveTimeZone(req.query.tz) };
};

api.get("/report", async (req, res) => {
  const params = reportParams(req, res);
  if (!params) return;
  res.type("application/json").send(await buildReport(params.target, params.period, params.tz));
  maybeRefresh();
});

api.get("/report/locations", async (req, res) => {
  if (!getSettings().enableGeolocation) return fail(res, 404, "Streaming locations are disabled");
  const params = reportParams(req, res);
  if (!params) return;
  const includeNames = getSessionInfo(req).canViewAnyone;
  res.json(await buildReportLocations(params.target, params.period, params.tz, includeNames));
});

api.get("/image", async (req, res) => {
  const session = getSessionInfo(req);
  if (getSettings().accessMode === "plex" && !session.viewer && !session.isAdmin) return fail(res, 401, "Sign in required");
  const thumb = String(req.query.thumb || "");
  if (!thumb.startsWith("/library/") || thumb.includes("..") || thumb.length > 300) return fail(res, 400, "Invalid image");
  try {
    const image = await tautulliImage(thumb, 300, 450);
    res.set("Content-Type", image.contentType);
    res.set("Cache-Control", "private, max-age=86400");
    res.send(image.buffer);
  } catch {
    fail(res, 404, "Image not available");
  }
});

// ============ Admin ============

api.get("/admin/status", (req, res) => {
  res.json({ passwordSet: getPublicConfig().adminPasswordSet, authenticated: isAdmin(req) });
});

api.post("/admin/setup", async (req, res) => {
  if (getPublicConfig().adminPasswordSet) return fail(res, 409, "An admin password is already set");
  const password = String(req.body?.password ?? "");
  if (password.length < 4) return fail(res, 400, "Password must be at least 4 characters");
  await updateConfig((c) => {
    c.adminPassword = hashPassword(password);
    delete c.adminPasswordHash;
  });
  setAdminSession(req, res);
  res.json({ success: true });
});

api.post("/admin/login", async (req, res) => {
  if (!allowAttempt(req, "admin-login")) return fail(res, 429, "Too many attempts, please wait a minute");
  const password = String(req.body?.password ?? "");
  const result = verifyAdminPassword(password);
  if (!result) return fail(res, 401, "Incorrect password");
  if (result === "upgrade") {
    await updateConfig((c) => {
      c.adminPassword = hashPassword(password);
      delete c.adminPasswordHash;
    });
  }
  setAdminSession(req, res);
  res.json({ success: true });
});

api.post("/admin/logout", (_req, res) => {
  clearAdminSession(res);
  res.json({ success: true });
});

const admin = express.Router();
admin.use(requireAdmin);

admin.get("/config", (_req, res) => {
  const c = getConfig();
  const body: AdminConfig = {
    tautulli: c.tautulli ?? null,
    settings: c.adminSettings,
    emailSettings: c.emailSettings,
    userPasswords: c.userPasswords,
    plexServer: c.plexServer ?? null,
    appIconVersion: getAppIconVersion(),
  };
  res.json(body);
});

admin.put("/settings", async (req, res) => {
  const current = getSettings();
  const next = normalizeSettings({ ...current, ...(req.body || {}) });
  if (next.accessMode === "plex" && !getConfig().plexServer) {
    return fail(res, 400, "Connect Tautulli first so your Plex server can be identified.");
  }
  await updateConfig((c) => {
    c.adminSettings = next;
  });
  if (next.nightlySyncTime !== current.nightlySyncTime) scheduleNightly();
  // Only settings that change the numbers invalidate the prepared reports
  const reportsChanged =
    next.normalizeTautulliAnomalies !== current.normalizeTautulliAnomalies || next.showLeaderboard !== current.showLeaderboard;
  if (reportsChanged) clearReportMemo();
  const needsWarmup = reportsChanged || (next.enableGeolocation && !current.enableGeolocation);
  if (needsWarmup && hasHistory()) runPipeline("incremental");
  res.json(next);
});

const upsertUserPassword = (list: UserPassword[], entry: UserPassword) => {
  const idx = list.findIndex((p) => p.userId === entry.userId);
  if (idx >= 0) list[idx] = { ...list[idx], ...entry };
  else list.push(entry);
};

admin.put("/user-passwords/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  const user = (await ensureUsers()).find((u) => u.user_id === userId);
  if (!user) return fail(res, 404, "User not found");
  const password = req.body?.password === undefined ? generatePassword() : String(req.body.password);
  if (password.length < 4) return fail(res, 400, "Password must be at least 4 characters");
  const c = await updateConfig((cfg) => {
    upsertUserPassword(cfg.userPasswords, { userId, username: user.username, friendlyName: user.friendly_name, email: user.email || undefined, password });
  });
  res.json(c.userPasswords);
});

admin.post("/user-passwords/generate-missing", async (_req, res) => {
  const users = await ensureUsers();
  const c = await updateConfig((cfg) => {
    for (const user of users) {
      if (!cfg.userPasswords.some((p) => p.userId === user.user_id)) {
        cfg.userPasswords.push({ userId: user.user_id, username: user.username, friendlyName: user.friendly_name, email: user.email || undefined, password: generatePassword() });
      }
    }
  });
  res.json(c.userPasswords);
});

admin.post("/tautulli/test", async (req, res) => {
  const url = String(req.body?.url ?? "").trim();
  const apiKey = String(req.body?.apiKey ?? "").trim();
  if (!url || !apiKey) return fail(res, 400, "Please enter both URL and API key");
  const conn = { url: normalizeTautulliUrl(url), apiKey };
  try {
    const info = await getServerInfo(conn);
    const previous = getConfig().tautulli;
    const changed = !previous || previous.url !== conn.url || previous.apiKey !== conn.apiKey;
    await updateConfig((c) => {
      c.tautulli = conn;
      if (info.pms_identifier) c.plexServer = { machineId: info.pms_identifier, name: info.pms_name || "Plex Server" };
    });
    runPipeline(changed || !hasHistory() ? "full" : "incremental");
    res.json({ success: true, serverName: info.pms_name || null });
  } catch (error) {
    const err = error as TautulliError;
    fail(res, 400, err.message || "Failed to connect", { hint: err.hint });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Invalid file type. Only PNG, JPEG, WebP, and SVG are allowed."));
  },
});

admin.post("/logo", upload.single("logo"), async (req, res) => {
  if (!req.file) return fail(res, 400, "No file uploaded");
  await fs.writeFile(LOGO_FILE, req.file.buffer);
  res.json({ success: true });
});

admin.delete("/logo", async (_req, res) => {
  await fs.rm(LOGO_FILE, { force: true });
  res.json({ success: true });
});

// The admin panel resizes the chosen image into every variant and uploads them as PNGs
const iconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: APP_ICON_VARIANTS.length },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/png") cb(null, true);
    else cb(new Error("Invalid file type. App icons must be PNG."));
  },
});

admin.post("/app-icon", iconUpload.fields(APP_ICON_VARIANTS.map((v) => ({ name: v.name, maxCount: 1 }))), async (req, res) => {
  const uploaded = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
  const files = Object.fromEntries(Object.entries(uploaded).map(([name, list]) => [name, list[0]?.buffer]));
  const error = await saveAppIcons(files);
  if (error) return fail(res, 400, error);
  res.json({ version: getAppIconVersion() });
});

admin.delete("/app-icon", async (_req, res) => {
  await deleteAppIcons();
  res.json({ success: true });
});

admin.get("/cache/status", (_req, res) => {
  res.json(getCacheStatus());
});

admin.post("/cache/sync", (req, res) => {
  if (!isTautulliConfigured()) return fail(res, 400, "Tautulli is not configured");
  runPipeline(req.body?.full ? "full" : "incremental");
  res.json(getCacheStatus());
});

admin.post("/cache/clear", async (req, res) => {
  const target = String(req.body?.target ?? "");
  if (target === "metadata") await clearMetadataCache();
  else if (target === "geolocation") await clearGeoCache();
  else if (target === "history") await clearHistory();
  else return fail(res, 400, "Unknown cache");
  clearReportMemo();
  if (target === "history" && isTautulliConfigured()) runPipeline("full");
  res.json(getCacheStatus());
});

admin.post("/sessions/revoke", async (req, res) => {
  await rotateSessionSecret();
  setAdminSession(req, res); // keep the current admin signed in
  res.json({ success: true });
});

admin.get("/version", async (_req, res) => {
  res.json(await getVersionInfo());
});

api.use("/admin", admin);

api.use((_req, res) => fail(res, 404, "Not found"));

api.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof TautulliError || error instanceof PlexError) return fail(res, error.status, error.message, { hint: (error as TautulliError).hint });
  if (error instanceof multer.MulterError || /Invalid file type/.test(error.message)) return fail(res, 400, error.message);
  if ((error as { type?: string }).type === "entity.parse.failed") return fail(res, 400, "Invalid JSON");
  console.error("[API] Unhandled error:", error);
  fail(res, 500, "Internal server error");
});

app.use("/api", api);

// ============ Web app ============

app.get("/manifest.webmanifest", (_req, res) => {
  res.set("Cache-Control", "no-cache");
  res.type("application/manifest+json").send(JSON.stringify(buildManifest(getSettings())));
});

// index.html carries the app name and icons, so it is rendered instead of served as-is
const sendIndex = async (_req: Request, res: Response) => {
  let template: string;
  try {
    template = await fs.readFile(path.join(STATIC_DIR, "index.html"), "utf8");
  } catch {
    return res.status(404).type("text/plain").send("The web app has not been built (npm run build)");
  }
  res.set("Cache-Control", "no-cache");
  res.type("html").send(renderIndexHtml(template, getSettings()));
};

app.get("/index.html", sendIndex);
app.use(express.static(STATIC_DIR, { index: false }));
app.use(sendIndex);

const start = async () => {
  await ensureDataDir();
  await loadConfig();
  await loadSessionSecret();
  await Promise.all([loadHistory(), loadMetadataCache(), loadGeoCache(), loadAppIcons()]);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Plex Wrapped ${APP_VERSION} running on port ${PORT} (data: ${dataPath("")})`);
  });
  startScheduler();
};

start().catch((error) => {
  console.error("Failed to start:", error);
  process.exit(1);
});

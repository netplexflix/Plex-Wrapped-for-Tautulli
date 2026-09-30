// Signed-cookie sessions, password hashing and login rate limiting

import crypto from "node:crypto";
import fs from "node:fs/promises";
import type { NextFunction, Request, Response } from "express";
import { dataPath } from "./storage";
import { getConfig, getSettings } from "./config";
import type { SessionInfo, ViewerInfo } from "@/types/api";

const SECRET_FILE = dataPath("session-secret");
const VIEWER_COOKIE = "pwft_session";
const ADMIN_COOKIE = "pwft_admin";
const PIN_COOKIE = "pwft_pin";

export const VIEWER_TTL = 7 * 24 * 3600;
const ADMIN_TTL = 12 * 3600;
const PIN_TTL = 15 * 60;

let secret: Buffer | null = null;

export const loadSessionSecret = async () => {
  try {
    const hex = (await fs.readFile(SECRET_FILE, "utf8")).trim();
    if (/^[0-9a-f]{64}$/.test(hex)) {
      secret = Buffer.from(hex, "hex");
      return;
    }
  } catch {
    // generated below
  }
  await rotateSessionSecret();
};

/** Invalidates every existing session (viewer and admin) */
export const rotateSessionSecret = async () => {
  const next = crypto.randomBytes(32);
  await fs.writeFile(SECRET_FILE, next.toString("hex"));
  secret = next;
};

const b64url = (buf: Buffer) => buf.toString("base64url");

const sign = (payload: object): string => {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const mac = b64url(crypto.createHmac("sha256", secret!).update(body).digest());
  return `${body}.${mac}`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const verify = (token: string | undefined): any | null => {
  if (!token || !secret) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
};

const parseCookies = (req: Request): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key) out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
};

const setCookie = (req: Request, res: Response, name: string, payload: object, ttl: number) => {
  res.cookie(name, sign({ ...payload, exp: Math.floor(Date.now() / 1000) + ttl }), {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: ttl * 1000,
    path: "/",
  });
};

const clearCookie = (res: Response, name: string) => res.clearCookie(name, { path: "/" });

// ============ Viewer sessions ============

export const setViewerSession = (req: Request, res: Response, viewer: ViewerInfo) => setCookie(req, res, VIEWER_COOKIE, viewer, VIEWER_TTL);

export const clearViewerSession = (res: Response) => clearCookie(res, VIEWER_COOKIE);

/** The viewer session, only if it is valid for the current access mode */
export const getViewer = (req: Request): ViewerInfo | null => {
  const payload = verify(parseCookies(req)[VIEWER_COOKIE]);
  if (!payload || typeof payload.userId !== "number") return null;
  const mode = getSettings().accessMode;
  if (payload.kind === "plex" && mode !== "plex") return null;
  if (payload.kind === "password" && mode !== "discreet") return null;
  return { kind: payload.kind, userId: payload.userId, name: payload.name, thumb: payload.thumb, owner: Boolean(payload.owner) };
};

// ============ Admin sessions ============

export const setAdminSession = (req: Request, res: Response) => setCookie(req, res, ADMIN_COOKIE, { kind: "admin" }, ADMIN_TTL);

export const clearAdminSession = (res: Response) => clearCookie(res, ADMIN_COOKIE);

export const isAdmin = (req: Request): boolean => verify(parseCookies(req)[ADMIN_COOKIE])?.kind === "admin";

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!isAdmin(req)) {
    res.status(401).json({ error: "Admin login required" });
    return;
  }
  next();
};

// ============ Plex PIN binding ============
// The PIN id is tied to the browser that created it, so nobody else can poll it.

export const setPinCookie = (req: Request, res: Response, pinId: number) => setCookie(req, res, PIN_COOKIE, { pinId }, PIN_TTL);

export const getPinFromCookie = (req: Request): number | null => {
  const payload = verify(parseCookies(req)[PIN_COOKIE]);
  return typeof payload?.pinId === "number" ? payload.pinId : null;
};

export const clearPinCookie = (res: Response) => clearCookie(res, PIN_COOKIE);

// ============ Access ============

export const getSessionInfo = (req: Request): SessionInfo => {
  const viewer = getViewer(req);
  const admin = isAdmin(req);
  const mode = getSettings().accessMode;
  const owner = viewer?.kind === "plex" && Boolean(viewer.owner);
  return { viewer, isAdmin: admin, canViewAnyone: admin || owner || mode === "regular" };
};

// ============ Passwords ============

export const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
};

const verifyScrypt = (password: string, stored: string): boolean => {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
};

// The hash older versions computed in the browser; only used to upgrade existing passwords
const legacySimpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(36);
};

/** Verifies the admin password. Returns "upgrade" when a legacy hash matched and should be re-hashed. */
export const verifyAdminPassword = (password: string): boolean | "upgrade" => {
  const c = getConfig();
  if (c.adminPassword) return verifyScrypt(password, c.adminPassword);
  if (c.adminPasswordHash) return legacySimpleHash(password) === c.adminPasswordHash ? "upgrade" : false;
  return false;
};

export const safeEqual = (a: string, b: string) => {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export const generatePassword = (): string => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 8; i++) password += chars[crypto.randomInt(chars.length)];
  return password;
};

// ============ Rate limiting ============

const attempts = new Map<string, { count: number; reset: number }>();

/** Returns false once a client exceeds 10 attempts per minute for the given bucket */
export const allowAttempt = (req: Request, bucket: string): boolean => {
  const key = `${bucket}:${req.ip}`;
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.reset < now) {
    attempts.set(key, { count: 1, reset: now + 60_000 });
    if (attempts.size > 10_000) {
      for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
    }
    return true;
  }
  entry.count++;
  return entry.count <= 10;
};

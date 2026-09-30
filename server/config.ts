// Server-side configuration (/data/config.json), including migration of older configs

import crypto from "node:crypto";
import { dataPath, readJson, writeJsonAtomic } from "./storage";
import { DEFAULT_ADMIN_SETTINGS, parseMonthDay, type AccessMode, type AdminSettings, type EmailSettings, type UserPassword } from "@/lib/adminStorage";
import type { PublicConfig } from "@/types/api";

const CONFIG_FILE = dataPath("config.json");

export const DEFAULT_EMAIL_TEMPLATE = `Hi {{friendlyName}},

Your Plex Wrapped for {{serverName}} is ready!

Visit {{appUrl}} to see your personalized viewing statistics.

Your login details:
Username: {{username}}
Password: {{password}}

Enjoy reliving your year in entertainment!

Best regards,
The {{serverName}} Team`;

export interface StoredConfig {
  tautulli?: { url: string; apiKey: string };
  adminPassword?: string; // scrypt hash
  adminPasswordHash?: string; // legacy (pre-2026.09) client-side hash, upgraded on login
  adminSettings: AdminSettings;
  emailSettings: EmailSettings;
  userPasswords: UserPassword[];
  plexClientId: string;
  plexServer?: { machineId: string; name: string };
}

let config: StoredConfig | null = null;

const ACCESS_MODES: AccessMode[] = ["regular", "discreet", "plex"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const normalizeSettings = (raw: any): AdminSettings => {
  const s = raw && typeof raw === "object" ? raw : {};
  const accessMode: AccessMode = ACCESS_MODES.includes(s.accessMode) ? s.accessMode : s.discreetMode ? "discreet" : "regular";
  const time = typeof s.nightlySyncTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.nightlySyncTime) ? s.nightlySyncTime : DEFAULT_ADMIN_SETTINGS.nightlySyncTime;
  const height = Number(s.logoMaxHeight);
  return {
    accessMode,
    allowAllUsers: Boolean(s.allowAllUsers ?? s.allowAllUsersInDiscreetMode ?? false),
    passwordProtectUsers: Boolean(s.passwordProtectUsers),
    normalizeTautulliAnomalies: Boolean(s.normalizeTautulliAnomalies),
    useCustomTitle: Boolean(s.useCustomTitle),
    customTitle: typeof s.customTitle === "string" && s.customTitle ? s.customTitle.slice(0, 100) : DEFAULT_ADMIN_SETTINGS.customTitle,
    useCustomLogo: Boolean(s.useCustomLogo),
    logoMaxHeight: Number.isFinite(height) && height >= 20 && height <= 400 ? height : DEFAULT_ADMIN_SETTINGS.logoMaxHeight,
    enableGeolocation: Boolean(s.enableGeolocation),
    showLeaderboard: s.showLeaderboard !== false,
    nightlySyncTime: time,
    // Not trimmed here: the admin panel saves while typing, trailing spaces included
    appName: typeof s.appName === "string" ? s.appName.slice(0, 60) : DEFAULT_ADMIN_SETTINGS.appName,
    currentYearFrom: parseMonthDay(s.currentYearFrom) ? s.currentYearFrom : DEFAULT_ADMIN_SETTINGS.currentYearFrom,
  };
};

export const loadConfig = async (): Promise<StoredConfig> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await readJson<any>(CONFIG_FILE, {});
  const loaded: StoredConfig = {
    tautulli: raw.tautulli?.url && raw.tautulli?.apiKey ? { url: raw.tautulli.url, apiKey: raw.tautulli.apiKey } : undefined,
    adminPassword: raw.adminPassword,
    adminPasswordHash: raw.adminPassword ? undefined : raw.adminPasswordHash,
    adminSettings: normalizeSettings(raw.adminSettings),
    emailSettings: {
      appUrl: raw.emailSettings?.appUrl ?? "",
      serverName: raw.emailSettings?.serverName ?? "Plex Server",
      emailTemplate: raw.emailSettings?.emailTemplate ?? DEFAULT_EMAIL_TEMPLATE,
    },
    userPasswords: Array.isArray(raw.userPasswords) ? raw.userPasswords : [],
    plexClientId: typeof raw.plexClientId === "string" && raw.plexClientId ? raw.plexClientId : crypto.randomUUID(),
    plexServer: raw.plexServer?.machineId ? raw.plexServer : undefined,
  };
  config = loaded;

  // Persist migrations (renamed settings, generated client id) right away
  const migrated = JSON.stringify(raw.adminSettings) !== JSON.stringify(loaded.adminSettings) || raw.plexClientId !== loaded.plexClientId;
  if (migrated) await saveConfig();
  return loaded;
};

export const getConfig = (): StoredConfig => {
  if (!config) throw new Error("Config not loaded");
  return config;
};

export const saveConfig = async (): Promise<void> => {
  await writeJsonAtomic(CONFIG_FILE, getConfig(), true);
};

export const updateConfig = async (mutate: (c: StoredConfig) => void): Promise<StoredConfig> => {
  const c = getConfig();
  mutate(c);
  await saveConfig();
  return c;
};

export const getSettings = () => getConfig().adminSettings;


export const isTautulliConfigured = () => Boolean(getConfig().tautulli);

export const getPublicConfig = (): PublicConfig => {
  const c = getConfig();
  const { nightlySyncTime, ...settings } = c.adminSettings;
  return {
    configured: Boolean(c.tautulli),
    adminPasswordSet: Boolean(c.adminPassword || c.adminPasswordHash),
    settings,
    plexServerName: c.plexServer?.name ?? null,
  };
};

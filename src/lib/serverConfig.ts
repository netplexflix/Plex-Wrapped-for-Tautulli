// Public (non-secret) server configuration, cached for the session.
// Secrets (Tautulli API key, passwords) never reach the browser; admin
// changes go through the admin API in src/lib/api.ts.

import { api } from "@/lib/api";
import { DEFAULT_ADMIN_SETTINGS, type AdminSettings } from "@/lib/adminStorage";
import type { PublicConfig } from "@/types/api";

let publicConfig: PublicConfig | null = null;

export const loadPublicConfig = async (): Promise<PublicConfig> => {
  try {
    publicConfig = await api.publicConfig();
  } catch (error) {
    console.error("Failed to load server config:", error);
    publicConfig ??= {
      configured: false,
      adminPasswordSet: false,
      settings: DEFAULT_ADMIN_SETTINGS,
      plexServerName: null,
    };
  }
  return publicConfig;
};

export const getPublicConfig = (): PublicConfig | null => publicConfig;

// Current display settings (synchronous; backed by the last loaded public config)
export const getServerAdminSettings = (): AdminSettings => ({
  ...DEFAULT_ADMIN_SETTINGS,
  ...(publicConfig?.settings ?? {}),
});

/** Updates the cached settings after an admin change so the UI reflects it immediately */
export const setCachedSettings = (settings: AdminSettings) => {
  if (publicConfig) {
    publicConfig = { ...publicConfig, settings };
  }
};

// Logo helpers
export const checkLogoExists = async (): Promise<boolean> => {
  try {
    const response = await fetch("/api/logo/exists");
    if (response.ok) {
      const data = await response.json();
      return data.exists;
    }
    return false;
  } catch {
    return false;
  }
};

export const getLogoUrl = (): string => {
  return `/api/logo?t=${Date.now()}`; // Add timestamp to bust cache
};

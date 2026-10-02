// Shared admin settings types (stored server-side in /data/config.json)

export type AccessMode = "regular" | "discreet" | "plex";

export interface AdminSettings {
  accessMode: AccessMode;
  allowAllUsers: boolean; // Discreet & Plex Login: allow viewing everyone's combined stats
  passwordProtectUsers: boolean; // Discreet: require a per-user password
  normalizeTautulliAnomalies: boolean;
  useCustomTitle: boolean;
  customTitle: string;
  useCustomLogo: boolean;
  logoMaxHeight: number; // Max height in pixels for the logo
  enableGeolocation: boolean;
  showLeaderboard: boolean;
  showViewerRank: boolean; // Tell viewers in the top half how their watch time ranks on the server
  nightlySyncTime: string; // "HH:mm", server timezone
  appName: string; // Installed app (PWA) name; empty = use the title
  currentYearFrom: string; // "MM-DD": from this date on, reports open on the current year instead of the previous one
}

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  accessMode: "regular",
  allowAllUsers: false,
  passwordProtectUsers: false,
  normalizeTautulliAnomalies: false,
  useCustomTitle: false,
  customTitle: "Plex Wrapped",
  useCustomLogo: false,
  logoMaxHeight: 80,
  enableGeolocation: false,
  showLeaderboard: true,
  showViewerRank: false,
  nightlySyncTime: "03:00",
  appName: "",
  currentYearFrom: "12-01",
};

// February allows the 29th; in other years that date simply means March 1st
export const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Parses a "MM-DD" setting (1-based month); null if it isn't a real date */
export const parseMonthDay = (value: unknown): { month: number; day: number } | null => {
  if (typeof value !== "string" || !/^\d{2}-\d{2}$/.test(value)) return null;
  const [month, day] = value.split("-").map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1] ? { month, day } : null;
};

export const formatMonthDay = (month: number, day: number) => `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** The year reports open on for a date (0-based month): the previous year until `currentYearFrom`, then the current one */
export const defaultReportYear = (year: number, month0: number, day: number, currentYearFrom: string) => {
  const from = parseMonthDay(currentYearFrom) ?? parseMonthDay(DEFAULT_ADMIN_SETTINGS.currentYearFrom)!;
  const month = month0 + 1;
  const reached = month > from.month || (month === from.month && day >= from.day);
  return reached ? year : year - 1;
};

/** The report title: the custom title when enabled, otherwise "Plex Wrapped" */
export const getDisplayTitle = (settings: Pick<AdminSettings, "useCustomTitle" | "customTitle">) =>
  (settings.useCustomTitle && settings.customTitle.trim()) || "Plex Wrapped";

/** Name of the installed app (home screen, window title); falls back to the report title */
export const getAppName = (settings: Pick<AdminSettings, "appName" | "useCustomTitle" | "customTitle">) =>
  settings.appName.trim() || getDisplayTitle(settings);

export interface EmailSettings {
  appUrl: string;
  serverName: string;
  emailTemplate: string;
}

export interface UserPassword {
  userId: number;
  username: string;
  friendlyName: string;
  email?: string;
  password: string;
}

// Types shared between the server API and the web app

import type { AdminSettings, EmailSettings, UserPassword } from "@/lib/adminStorage";
import type { StreamingLocation, TautulliUser, WrappedStats } from "./tautulli";

export type PublicSettings = Omit<AdminSettings, "nightlySyncTime">;

export interface PublicConfig {
  configured: boolean;
  adminPasswordSet: boolean;
  settings: PublicSettings;
  plexServerName: string | null;
}

export interface ViewerInfo {
  kind: "plex" | "password";
  userId: number;
  name: string;
  thumb?: string;
  owner?: boolean;
}

export interface SessionInfo {
  viewer: ViewerInfo | null;
  isAdmin: boolean;
  /** Viewer may pick any user (Regular mode, admin, or Plex server owner) */
  canViewAnyone: boolean;
}

/** A report period: a calendar year ("2025"), the past 12 months, or all time */
export type ReportPeriod = string;

export interface LeaderboardEntry {
  userId: number;
  username: string;
  friendlyName: string;
  totalWatchTime: number;
}

export interface ReportUser {
  user_id: number;
  username: string;
  friendly_name: string;
  thumb: string;
}

export interface ReportResponse {
  stats: WrappedStats;
  user: ReportUser | null;
  leaderboard: LeaderboardEntry[];
  oldestYear: number | null;
  generatedAt: number;
}

export interface LocationsResponse {
  locations: StreamingLocation[];
  totalIPs: number;
}

export interface BuildingResponse {
  building: true;
  rows: number;
  phase: string;
}

export type CacheState = "idle" | "syncing" | "metadata" | "geolocation" | "prewarm";

export interface CacheStatus {
  state: CacheState;
  phase: string;
  progress: { done: number; total: number } | null;
  rows: number;
  users: number;
  oldestYear: number | null;
  lastFullSync: number | null;
  lastIncrementalSync: number | null;
  lastError: string | null;
  nextRun: number | null;
  metadataEntries: number;
  geolocationEntries: number;
}

export interface AdminConfig {
  tautulli: { url: string; apiKey: string } | null;
  settings: AdminSettings;
  emailSettings: EmailSettings;
  userPasswords: UserPassword[];
  plexServer: { machineId: string; name: string } | null;
  /** Version of the uploaded app icon, or null when the default icon is used */
  appIconVersion: number | null;
}

export type VersionStatus = "update-available" | "up-to-date" | "develop" | "unknown";

export interface VersionInfo {
  current: string;
  latest: string | null;
  status: VersionStatus;
  releaseUrl: string;
}

export type ApiUser = Pick<TautulliUser, "user_id" | "username" | "friendly_name" | "thumb" | "email">;

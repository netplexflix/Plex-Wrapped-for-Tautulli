// Typed client for the Plex Wrapped server API

import type { AdminSettings, UserPassword } from "@/lib/adminStorage";
import type {
  AdminConfig,
  ApiUser,
  BuildingResponse,
  CacheStatus,
  LocationsResponse,
  PublicConfig,
  ReportPeriod,
  ReportResponse,
  SessionInfo,
  VersionInfo,
} from "@/types/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

const request = async <T>(path: string, options: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> => {
  const init: RequestInit = { method: options.method || "GET", credentials: "same-origin", cache: "no-store" };
  if (options.form) {
    init.body = options.form;
  } else if (options.body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(options.body);
  }
  const response = await fetch(path, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (HTTP ${response.status})`, response.status, data);
  }
  return data as T;
};

export const viewerTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export interface ReportQuery {
  user: number | "all" | "me";
  period: ReportPeriod;
}

const reportQuery = ({ user, period }: ReportQuery) =>
  new URLSearchParams({ user: String(user), period, tz: viewerTimeZone() }).toString();

// Format the peak-concurrency time in the viewer's locale (the server sends a timestamp)
const localizeReport = (report: ReportResponse): ReportResponse => {
  const peak = report.stats.peakConcurrentStreams;
  if (peak?.timestamp) {
    try {
      peak.time = new Date(peak.timestamp * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: viewerTimeZone(),
      });
    } catch {
      // keep the server-formatted HH:mm
    }
  }
  return report;
};

export const isBuilding = (error: unknown): error is ApiError & { data: BuildingResponse } =>
  error instanceof ApiError && error.status === 503 && Boolean(error.data?.building);

export const api = {
  publicConfig: () => request<PublicConfig>("/api/public-config"),
  session: () => request<SessionInfo>("/api/session"),
  logout: () => request<{ success: boolean }>("/api/auth/logout", { method: "POST" }),

  plexCreatePin: (forwardUrl?: string) =>
    request<{ id: number; authUrl: string }>("/api/auth/plex/pin", { method: "POST", body: { forwardUrl } }),
  plexPollPin: (id: number) => request<{ status: "pending" | "ok" | "expired" }>(`/api/auth/plex/pin/${id}`),

  lookupUser: (username: string) =>
    request<{ userId: number; friendlyName: string; needsPassword: boolean }>(
      `/api/users/lookup?${new URLSearchParams({ username })}`
    ),
  passwordLogin: (userId: number, password: string) =>
    request<{ success: boolean }>("/api/auth/password", { method: "POST", body: { userId, password } }),

  users: () => request<ApiUser[]>("/api/users"),
  report: async (query: ReportQuery) => localizeReport(await request<ReportResponse>(`/api/report?${reportQuery(query)}`)),
  reportLocations: (query: ReportQuery) => request<LocationsResponse>(`/api/report/locations?${reportQuery(query)}`),

  admin: {
    status: () => request<{ passwordSet: boolean; authenticated: boolean }>("/api/admin/status"),
    setup: (password: string) => request<{ success: boolean }>("/api/admin/setup", { method: "POST", body: { password } }),
    login: (password: string) => request<{ success: boolean }>("/api/admin/login", { method: "POST", body: { password } }),
    logout: () => request<{ success: boolean }>("/api/admin/logout", { method: "POST" }),
    config: () => request<AdminConfig>("/api/admin/config"),
    saveSettings: (settings: Partial<AdminSettings>) => request<AdminSettings>("/api/admin/settings", { method: "PUT", body: settings }),
    setUserPassword: (userId: number, password?: string) =>
      request<UserPassword[]>(`/api/admin/user-passwords/${userId}`, { method: "PUT", body: password === undefined ? {} : { password } }),
    generateMissingPasswords: () => request<UserPassword[]>("/api/admin/user-passwords/generate-missing", { method: "POST" }),
    testTautulli: (url: string, apiKey: string) =>
      request<{ success: boolean; serverName: string | null }>("/api/admin/tautulli/test", { method: "POST", body: { url, apiKey } }),
    uploadLogo: (file: File) => {
      const form = new FormData();
      form.append("logo", file);
      return request<{ success: boolean }>("/api/admin/logo", { method: "POST", form });
    },
    deleteLogo: () => request<{ success: boolean }>("/api/admin/logo", { method: "DELETE" }),
    /** Uploads an icon set rendered by renderAppIcons (one PNG per variant) */
    uploadAppIcon: (icons: Record<string, Blob>) => {
      const form = new FormData();
      for (const [name, blob] of Object.entries(icons)) form.append(name, blob, `${name}.png`);
      return request<{ version: number }>("/api/admin/app-icon", { method: "POST", form });
    },
    deleteAppIcon: () => request<{ success: boolean }>("/api/admin/app-icon", { method: "DELETE" }),
    cacheStatus: () => request<CacheStatus>("/api/admin/cache/status"),
    cacheSync: (full: boolean) => request<CacheStatus>("/api/admin/cache/sync", { method: "POST", body: { full } }),
    cacheClear: (target: "metadata" | "geolocation" | "history") =>
      request<CacheStatus>("/api/admin/cache/clear", { method: "POST", body: { target } }),
    revokeSessions: () => request<{ success: boolean }>("/api/admin/sessions/revoke", { method: "POST" }),
    version: () => request<VersionInfo>("/api/admin/version"),
  },
};

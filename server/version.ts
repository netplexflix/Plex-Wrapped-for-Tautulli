// Compares the running version with the latest GitHub release

import { APP_VERSION, GITHUB_REPO } from "@/version";
import type { VersionInfo, VersionStatus } from "@/types/api";

const CACHE_MS = 6 * 3600 * 1000;
const RELEASES_URL = `https://github.com/${GITHUB_REPO}/releases`;

// Parses a JSON response from an external API (shape validated at the call site)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readBody = (response: Response): Promise<any> => response.json();

let cached: { latest: string; releaseUrl: string; checkedAt: number } | null = null;

/** Parses tags like v2026.01.07 or 2026.1.7.2 into comparable numbers */
export const parseVersion = (tag: string): number[] | null => {
  const match = tag.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[.-](\d+))?$/);
  if (!match) return null;
  return [match[1], match[2], match[3], match[4] ?? "0"].map(Number);
};

export const compareVersions = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
};

const fetchLatest = async () => {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Plex-Wrapped-for-Tautulli" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  const data = await readBody(response);
  if (typeof data.tag_name !== "string") throw new Error("Unexpected GitHub response");
  return { latest: data.tag_name as string, releaseUrl: (data.html_url as string) || RELEASES_URL };
};

export const getVersionInfo = async (current = APP_VERSION): Promise<VersionInfo> => {
  if (!cached || Date.now() - cached.checkedAt > CACHE_MS) {
    try {
      cached = { ...(await fetchLatest()), checkedAt: Date.now() };
    } catch (error) {
      console.warn("[Version] Update check failed:", (error as Error).message);
      // Keep the last good result if there is one; retry in 10 minutes
      if (cached) cached.checkedAt = Date.now() - CACHE_MS + 10 * 60 * 1000;
    }
  }
  if (!cached) return { current, latest: null, status: "unknown", releaseUrl: RELEASES_URL };

  const currentParts = parseVersion(current);
  const latestParts = parseVersion(cached.latest);
  let status: VersionStatus = "unknown";
  if (currentParts && latestParts) {
    const cmp = compareVersions(currentParts, latestParts);
    status = cmp < 0 ? "update-available" : cmp > 0 ? "develop" : "up-to-date";
  }
  return { current, latest: cached.latest, status, releaseUrl: cached.releaseUrl };
};

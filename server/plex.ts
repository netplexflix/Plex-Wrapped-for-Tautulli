// Plex OAuth (PIN flow) and server-access verification against plex.tv.
// The user's Plex token is only used during login and never stored.

import { APP_VERSION } from "@/version";
import { getConfig } from "./config";

const PRODUCT = "Plex Wrapped";

// Parses a JSON response from an external API (shape validated at the call site)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readBody = (response: Response): Promise<any> => response.json();

const plexHeaders = (token?: string): Record<string, string> => ({
  Accept: "application/json",
  "X-Plex-Product": PRODUCT,
  "X-Plex-Version": APP_VERSION,
  "X-Plex-Client-Identifier": getConfig().plexClientId,
  "X-Plex-Platform": "Web",
  "X-Plex-Device-Name": PRODUCT,
  ...(token ? { "X-Plex-Token": token } : {}),
});

export class PlexError extends Error {
  constructor(
    message: string,
    public status = 502
  ) {
    super(message);
  }
}

const plexFetch = async (url: string, init: RequestInit & { token?: string } = {}) => {
  try {
    const response = await fetch(url, { ...init, headers: plexHeaders(init.token), signal: AbortSignal.timeout(15_000) });
    return response;
  } catch (error) {
    throw new PlexError(`Could not reach plex.tv: ${(error as Error).message}`);
  }
};

export const createPin = async (): Promise<{ id: number; code: string }> => {
  const response = await plexFetch("https://plex.tv/api/v2/pins?strong=true", { method: "POST" });
  if (!response.ok) throw new PlexError(`plex.tv returned HTTP ${response.status} when creating a login PIN`);
  const data = await readBody(response);
  return { id: data.id, code: data.code };
};

export const buildAuthUrl = (code: string, forwardUrl?: string) => {
  const params = new URLSearchParams({
    clientID: getConfig().plexClientId,
    code,
    "context[device][product]": PRODUCT,
  });
  if (forwardUrl) params.set("forwardUrl", forwardUrl);
  return `https://app.plex.tv/auth#?${params.toString().replace(/\+/g, "%20")}`;
};

/** Returns the auth token once the user has approved the PIN, null while pending */
export const checkPin = async (id: number): Promise<{ token: string | null; expired: boolean }> => {
  const response = await plexFetch(`https://plex.tv/api/v2/pins/${id}`);
  if (response.status === 404) return { token: null, expired: true };
  if (!response.ok) throw new PlexError(`plex.tv returned HTTP ${response.status} when checking the login PIN`);
  const data = await readBody(response);
  const expired = data.expiresAt ? Date.parse(data.expiresAt) < Date.now() : false;
  return { token: data.authToken || null, expired };
};

export interface PlexAccount {
  id: number;
  username: string;
  title: string;
  email: string;
  thumb: string;
}

export const getAccount = async (token: string): Promise<PlexAccount> => {
  const response = await plexFetch("https://plex.tv/api/v2/user", { token });
  if (!response.ok) throw new PlexError("Could not read your Plex account", 401);
  const data = await readBody(response);
  return { id: Number(data.id), username: data.username || "", title: data.title || data.username || "", email: data.email || "", thumb: data.thumb || "" };
};

/** Checks whether the account can access our Plex server; `owned` marks the server owner */
export const getServerAccess = async (token: string, machineId: string): Promise<{ hasAccess: boolean; owned: boolean }> => {
  const response = await plexFetch("https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1", { token });
  if (!response.ok) throw new PlexError("Could not read your Plex servers", 502);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resources: any[] = await readBody(response);
  const server = resources.find(
    (r) => r?.clientIdentifier === machineId && String(r?.provides || "").split(",").includes("server")
  );
  return { hasAccess: Boolean(server), owned: Boolean(server?.owned) };
};

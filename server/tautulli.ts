// Server-side Tautulli API client (the browser never talks to Tautulli directly)

import { getConfig } from "./config";

export interface TautulliConnection {
  url: string;
  apiKey: string;
}

export class TautulliError extends Error {
  constructor(
    message: string,
    public hint?: string,
    public status = 502,
    /** "network": Tautulli couldn't be reached; "response": Tautulli answered with an error */
    public kind: "network" | "response" = "response"
  ) {
    super(message);
  }
}

export const normalizeTautulliUrl = (input: string): string => {
  let url = input.trim().replace(/\/$/, "");
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `http://${url}`;
  }
  return url;
};

const buildUrl = (conn: TautulliConnection, cmd: string, params: Record<string, string | number>) => {
  const url = new URL(normalizeTautulliUrl(conn.url));
  // Preserve an HTTP root (e.g. /stats) and append /api/v2
  const existingPath = url.pathname !== "/" ? url.pathname.replace(/\/$/, "") : "";
  url.pathname = `${existingPath}/api/v2`;
  url.searchParams.set("cmd", cmd);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  url.searchParams.set("apikey", conn.apiKey);
  return url;
};

const connectionOrThrow = (conn?: TautulliConnection): TautulliConnection => {
  const c = conn ?? getConfig().tautulli;
  if (!c) throw new TautulliError("Tautulli is not configured", undefined, 400);
  return c;
};

const networkError = (error: unknown): TautulliError => {
  const err = error as { name?: string; code?: string; cause?: { code?: string }; message?: string };
  const code = err.cause?.code || err.code;
  const fail = (message: string, hint: string | undefined, status: number) => new TautulliError(message, hint, status, "network");
  if (err.name === "TimeoutError") return fail("Connection to Tautulli timed out.", "Check your network connection and Tautulli accessibility.", 504);
  switch (code) {
    case "EHOSTUNREACH":
      return fail("The Tautulli server is unreachable from this container.", "If using Docker, try host.docker.internal:PORT or your host machine's network IP address instead of localhost.", 503);
    case "ECONNREFUSED":
      return fail("Connection refused.", "Check that Tautulli is running and the port is correct.", 503);
    case "ENOTFOUND":
      return fail("Hostname could not be resolved.", "Verify the URL is correct.", 503);
    case "ETIMEDOUT":
      return fail("Connection timed out.", "Check your network connection and Tautulli accessibility.", 504);
    default:
      return fail(`Failed to fetch from Tautulli: ${err.message || "unknown error"}`, undefined, 502);
  }
};

const request = async (conn: TautulliConnection, cmd: string, params: Record<string, string | number>, timeoutMs: number) => {
  try {
    return await fetch(buildUrl(conn, cmd, params), { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw networkError(error);
  }
};

/** Calls a Tautulli API command and returns `response.data` */
export const tautulliCall = async <T = unknown>(
  cmd: string,
  params: Record<string, string | number> = {},
  options: { conn?: TautulliConnection; timeoutMs?: number } = {}
): Promise<T> => {
  const conn = connectionOrThrow(options.conn);
  const response = await request(conn, cmd, params, options.timeoutMs ?? 60_000);

  if (!response.ok) {
    const hint =
      response.status === 404
        ? "API endpoint not found. If you have a HTTP Root configured in Tautulli (e.g., /stats), include it in your URL: http://192.168.1.250:8181/stats"
        : "Check that Tautulli is running and accessible at the configured URL";
    throw new TautulliError(`Tautulli returned HTTP ${response.status}: ${response.statusText}`, hint);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
      throw new TautulliError(
        "Tautulli returned an HTML page instead of JSON. This usually means the URL or API key is incorrect, or Tautulli requires authentication.",
        "Verify: 1) URL is correct (e.g., http://192.168.1.5:8181) 2) API key is valid 3) HTTP Root in Tautulli settings matches your URL"
      );
    }
    throw new TautulliError("Unexpected response from Tautulli", "The response was not in the expected JSON format");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (await response.json()) as any;
  if (body?.response?.result !== "success") {
    throw new TautulliError(body?.response?.message || `Tautulli command ${cmd} failed`);
  }
  return body.response.data as T;
};

/** Fetches a poster/thumbnail through Tautulli's image proxy */
export const tautulliImage = async (thumb: string, width: number, height: number) => {
  const conn = connectionOrThrow();
  const response = await request(conn, "pms_image_proxy", { img: thumb, width, height }, 30_000);
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.startsWith("image/")) {
    throw new TautulliError("Image not available", undefined, 404);
  }
  return { contentType, buffer: Buffer.from(await response.arrayBuffer()) };
};

export interface TautulliServerInfo {
  pms_identifier?: string;
  pms_name?: string;
}

export const getServerInfo = (conn?: TautulliConnection) => tautulliCall<TautulliServerInfo>("get_server_info", {}, { conn, timeoutMs: 15_000 });

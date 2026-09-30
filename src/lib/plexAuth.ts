// Plex sign-in helpers (the PIN flow itself runs on the server)

import { api, ApiError } from "@/lib/api";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls a Plex login PIN until it is approved. Resolves "ok" once the server has
 * set the session cookie. Throws an ApiError when access is denied.
 */
export const waitForPlexPin = async (id: number, shouldStop: () => boolean): Promise<"ok" | "expired" | "cancelled"> => {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    if (shouldStop()) return "cancelled";
    const result = await api.plexPollPin(id);
    if (result.status === "ok") return "ok";
    if (result.status === "expired") return "expired";
    await sleep(1500);
  }
  return "expired";
};

export const plexLoginErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : "Could not sign in with Plex. Please try again.";

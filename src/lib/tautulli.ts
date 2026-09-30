// Display helpers for Tautulli data. Stats are computed server-side (see src/lib/stats.ts).

// Poster/thumbnail through the server's image proxy
export const getImageUrl = (thumb: string): string => {
  if (!thumb) return "";
  return `/api/image?${new URLSearchParams({ thumb })}`;
};

export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
};

export const formatHours = (seconds: number): number => {
  return Math.round((seconds / 3600) * 10) / 10;
};

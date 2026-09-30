// Data directory + atomic JSON persistence

import fs from "node:fs/promises";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || "/data";

export const dataPath = (file: string) => path.join(DATA_DIR, file);

export const ensureDataDir = () => fs.mkdir(DATA_DIR, { recursive: true });

export const readJson = async <T>(file: string, fallback: T): Promise<T> => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[Storage] Failed to read ${file}:`, error);
    }
    return fallback;
  }
};

// Writes are serialized per file and done via temp file + rename so a crash
// mid-write never leaves a truncated JSON file behind.
const writeQueues = new Map<string, Promise<void>>();

export const writeJsonAtomic = (file: string, data: unknown, pretty = false): Promise<void> => {
  const previous = writeQueues.get(file) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data));
      await fs.rename(tmp, file);
    });
  writeQueues.set(file, next);
  return next;
};

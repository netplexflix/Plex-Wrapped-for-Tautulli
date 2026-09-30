// Installable web app (PWA): manifest, custom app icons and the app name in index.html

import fs from "node:fs/promises";
import path from "node:path";
import { getAppName, type AdminSettings } from "@/lib/adminStorage";
import { APP_BACKGROUND, APP_ICON_VARIANTS, customAppIconUrl, defaultAppIconUrl, type AppIconName } from "@/lib/appIcons";
import { dataPath } from "./storage";

const ICON_DIR = dataPath("app-icons");
const iconFile = (name: AppIconName) => path.join(ICON_DIR, `${name}.png`);

/** Version of the uploaded icon set (upload time), or null when the default icons are used */
let customIconVersion: number | null = null;

export const getAppIconVersion = () => customIconVersion;

export const isAppIconName = (name: string): name is AppIconName => APP_ICON_VARIANTS.some((v) => v.name === name);

export const loadAppIcons = async () => {
  try {
    const stats = await Promise.all(APP_ICON_VARIANTS.map((v) => fs.stat(iconFile(v.name))));
    customIconVersion = Math.floor(Math.max(...stats.map((s) => s.mtimeMs)));
  } catch {
    customIconVersion = null; // missing (or incomplete) set: use the defaults
  }
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Checks the PNG signature and the IHDR dimensions */
const isPngOfSize = (buf: Buffer, size: number) =>
  buf.length > 24 &&
  buf.subarray(0, 8).equals(PNG_SIGNATURE) &&
  buf.subarray(12, 16).toString("latin1") === "IHDR" &&
  buf.readUInt32BE(16) === size &&
  buf.readUInt32BE(20) === size;

/** Stores a full icon set; every variant must be a square PNG of the expected size */
export const saveAppIcons = async (files: Partial<Record<string, Buffer>>): Promise<string | null> => {
  for (const v of APP_ICON_VARIANTS) {
    const buf = files[v.name];
    if (!buf) return `Missing the ${v.name} icon`;
    if (!isPngOfSize(buf, v.size)) return `The ${v.name} icon must be a ${v.size}x${v.size} PNG`;
  }
  await fs.mkdir(ICON_DIR, { recursive: true });
  // Write everything first, then swap in, so a failed upload never leaves a mixed set
  await Promise.all(APP_ICON_VARIANTS.map((v) => fs.writeFile(`${iconFile(v.name)}.tmp`, files[v.name]!)));
  await Promise.all(APP_ICON_VARIANTS.map((v) => fs.rename(`${iconFile(v.name)}.tmp`, iconFile(v.name))));
  customIconVersion = Date.now();
  return null;
};

export const deleteAppIcons = async () => {
  await fs.rm(ICON_DIR, { recursive: true, force: true });
  customIconVersion = null;
};

export const readAppIcon = (name: AppIconName) => fs.readFile(iconFile(name));

export const appIconUrl = (name: AppIconName) =>
  customIconVersion === null ? defaultAppIconUrl(name) : customAppIconUrl(name, customIconVersion);

export const buildManifest = (settings: AdminSettings) => {
  const name = getAppName(settings);
  return {
    id: "/",
    name,
    short_name: name,
    description: "Your year on Plex, powered by Tautulli",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: APP_BACKGROUND,
    theme_color: APP_BACKGROUND,
    icons: [
      { src: appIconUrl("icon-192"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: appIconUrl("icon-512"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: appIconUrl("maskable-512"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Puts the app name and icons into index.html (the built file keeps the defaults for `npm run dev`) */
export const renderIndexHtml = (template: string, settings: AdminSettings) => {
  const name = escapeHtml(getAppName(settings));
  // Replacer functions, so a "$" in the name is never read as a substitution pattern
  const setAttr = (html: string, prefix: string, value: string) =>
    html.replace(new RegExp(`(${prefix})[^"]*"`), (_m, start: string) => `${start}${value}"`);

  let html = template.replace(/<title>[^<]*<\/title>/, () => `<title>${name}</title>`);
  html = setAttr(html, '<meta name="application-name" content="', name);
  html = setAttr(html, '<meta name="apple-mobile-web-app-title" content="', name);
  html = setAttr(html, '<meta property="og:title" content="', name);
  html = setAttr(html, '<link rel="apple-touch-icon" href="', appIconUrl("apple-touch-icon"));
  if (customIconVersion !== null) {
    // Use the uploaded icon for the browser tab too
    html = html.replace(/<link rel="icon"[^>]*>/, () => `<link rel="icon" type="image/png" href="${appIconUrl("icon-192")}" />`);
  }
  return html;
};

// Installable web app (PWA): service worker, install prompt and app icon rendering

import { useSyncExternalStore } from "react";
import { APP_BACKGROUND, APP_ICON_VARIANTS, type AppIconName, type AppIconVariant } from "@/lib/appIcons";

// ============ Install prompt ============

// Chromium's install event (not in the TypeScript DOM types)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let installPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Call once at startup: the install event can fire before React has rendered */
export const initPwa = () => {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Kept (not prevented) so the browser's own install hint still shows too
    installPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    notify();
  });

  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Service worker registration failed:", error));
    });
  }
};

/** Running as an installed app */
export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iPhone/iPad, where installing is done by hand (Share, then Add to Home Screen) */
export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export const useInstallPrompt = () => {
  const canInstall = useSyncExternalStore(subscribe, () => installPrompt !== null);

  const install = async () => {
    const event = installPrompt;
    if (!event) return;
    // A prompt can only be shown once
    installPrompt = null;
    notify();
    await event.prompt();
  };

  return { canInstall, install };
};

// ============ App icons ============

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That image could not be read"));
    img.src = url;
  });

const toPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not create the icon"))), "image/png");
  });

/** The image's own background colour when its corners are opaque, else null */
const cornerColor = (img: HTMLImageElement): string | null => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, 32, 32);
  const sum = [0, 0, 0];
  for (const [x, y] of [[1, 1], [30, 1], [1, 30], [30, 30]]) {
    const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
    if (a < 250) return null;
    sum[0] += r;
    sum[1] += g;
    sum[2] += b;
  }
  return `rgb(${sum.map((c) => Math.round(c / 4)).join(", ")})`;
};

// How much of the icon the image may fill. Maskable icons get cropped to a circle
// (only the middle 80% is safe); iOS rounds the corners itself.
const imageScale = (variant: AppIconVariant, fullBleed: boolean) => {
  if (variant.name === "maskable-512") return fullBleed ? 0.8 : 0.7;
  if (variant.name === "apple-touch-icon") return fullBleed ? 1 : 0.8;
  return 1;
};

/**
 * Renders an uploaded image into every app icon variant. Images with an opaque background
 * are extended with their own corner colour; transparent ones get the app background.
 */
export const renderAppIcons = async (file: File): Promise<{ icons: Record<AppIconName, Blob>; lowResolution: boolean }> => {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const isSvg = file.type === "image/svg+xml";
    // SVGs without a size report 0 (or a default size); they scale cleanly anyway
    const width = img.naturalWidth || 512;
    const height = img.naturalHeight || 512;
    const background = cornerColor(img);

    const icons = {} as Record<AppIconName, Blob>;
    for (const variant of APP_ICON_VARIANTS) {
      const { size } = variant;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingQuality = "high";
      if (variant.opaque) {
        ctx.fillStyle = background ?? APP_BACKGROUND;
        ctx.fillRect(0, 0, size, size);
      }
      const box = size * imageScale(variant, background !== null);
      const ratio = Math.min(box / width, box / height);
      const w = width * ratio;
      const h = height * ratio;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      icons[variant.name] = await toPng(canvas);
    }
    // Upscaled into the 512px icons (they fit the image by its longest side)
    return { icons, lowResolution: !isSvg && Math.max(width, height) < 512 };
  } finally {
    URL.revokeObjectURL(url);
  }
};

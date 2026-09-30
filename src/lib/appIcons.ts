// App (PWA) icon variants, shared by the server and the admin panel.
// Uploaded icons are resized in the browser into each variant, so the server
// only has to validate and store PNGs.

export type AppIconName = "icon-192" | "icon-512" | "maskable-512" | "apple-touch-icon";

export interface AppIconVariant {
  name: AppIconName;
  size: number;
  /** Full-bleed background (maskable icons and iOS don't support transparency) */
  opaque: boolean;
}

export const APP_ICON_VARIANTS: AppIconVariant[] = [
  { name: "icon-192", size: 192, opaque: false },
  { name: "icon-512", size: 512, opaque: false },
  { name: "maskable-512", size: 512, opaque: true },
  { name: "apple-touch-icon", size: 180, opaque: true },
];

/** App background (--background), used for the manifest and icon backgrounds */
export const APP_BACKGROUND = "#09090b";

/** The bundled default icons (public/icons) */
export const defaultAppIconUrl = (name: AppIconName) => `/icons/${name}.png`;

/** An uploaded icon; the version busts browser and home-screen caches after a change */
export const customAppIconUrl = (name: AppIconName, version: number) => `/api/pwa/icon/${name}.png?v=${version}`;

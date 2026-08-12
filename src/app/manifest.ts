import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AiFeed — Wiadomości AI",
    short_name: "AiFeed",
    description: "Twoje codzienne źródło wiadomości o AI",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    // Ikony brandowe mają jasny kafelek (tło jak logo — zob. brand-icon.tsx),
    // więc chrome PWA też jest jasny, spójnie z themeColor light w layout.tsx.
    // Poprzedni #5b3df7 pasował do starej fioletowej ikony „a.".
    theme_color: "#fafafa",
    lang: "pl",
    icons: [
      // Static PNGs in /public/. Pre-rendered (not generated on demand) so
      // the manifest fetch is fast and CDN-cacheable. Both files derive from
      // the same source design as /favicon.ico.
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

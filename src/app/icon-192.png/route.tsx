import { renderBrandIcon } from "@/lib/brand-icon";

// PWA icon 192×192 — URL `/icon-192.png` jest wpisany w `app/manifest.ts`.
// Route handler zamiast statycznego PNG, żeby design był generowany z tego
// samego kodu co apple-icon (zero binarek w repo). `force-static` → render
// raz w build time, potem serwowane z CDN.
export const dynamic = "force-static";

export function GET() {
  return renderBrandIcon(192);
}

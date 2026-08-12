import { brandIconAutoSvg } from "@/lib/brand-icon";

// Favicon SVG „auto" — podąża za motywem systemu (media query w SVG).
// Route handler zamiast statycznego pliku: design generowany z tego samego
// kodu co pozostałe ikony (brand-icon.tsx), zero zduplikowanych ścieżek
// glifów w repo. `force-static` → render raz w build time, serwowane z CDN.
// Link `<link rel="icon">` jest dodany ręcznie w <head> root layoutu —
// katalog `icon.svg/` to zwykły route, nie file-convention Nexta.
export const dynamic = "force-static";

export function GET() {
  return new Response(brandIconAutoSvg(), {
    headers: { "Content-Type": "image/svg+xml" },
  });
}

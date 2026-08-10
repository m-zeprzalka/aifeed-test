import { renderBrandIcon } from "@/lib/brand-icon";

// PWA icon 512×512 — URL `/icon-512.png` jest wpisany w `app/manifest.ts`
// oraz w JSON-LD `Organization.logo` (root layout) i `publisher.logo`
// (strona artykułu). Zob. komentarz w `icon-192.png/route.tsx`.
export const dynamic = "force-static";

export function GET() {
  return renderBrandIcon(512);
}

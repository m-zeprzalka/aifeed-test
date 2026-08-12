import { brandIconSvg } from "@/lib/brand-icon";

// Jawnie jasny wariant faviconu — używany przez ThemeFavicon, gdy użytkownik
// wybrał motyw w przełączniku na stronie (media query w /icon.svg zna tylko
// preferencję systemu, nie wybór in-app).
export const dynamic = "force-static";

export function GET() {
  return new Response(brandIconSvg("light"), {
    headers: { "Content-Type": "image/svg+xml" },
  });
}

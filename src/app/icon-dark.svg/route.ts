import { brandIconSvg } from "@/lib/brand-icon";

// Jawnie ciemny wariant faviconu — zob. komentarz w icon-light.svg/route.ts.
export const dynamic = "force-static";

export function GET() {
  return new Response(brandIconSvg("dark"), {
    headers: { "Content-Type": "image/svg+xml" },
  });
}

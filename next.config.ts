import type { NextConfig } from "next";

// Wyciągamy hostname z `NEXT_PUBLIC_SUPABASE_URL` (jeśli ustawione w env
// na czas build/runtime), żeby precyzyjnie zezwolić Next/Image na nasz
// projekt Storage. Brak env nie wywala builda — `*.supabase.co` (poniżej
// w `remotePatterns`) i tak pokrywa każdy projekt na hostingu Supabase.
function parseSupabaseHostname(): { protocol: "https"; hostname: string }[] {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];
  try {
    const { hostname } = new URL(url);
    return [{ protocol: "https" as const, hostname }];
  } catch {
    return [];
  }
}

const supabaseRemotePatterns = parseSupabaseHostname();

const nextConfig: NextConfig = {
  reactCompiler: true,
  images: {
    // Image optimization (`/_next/image`) is disabled globally. Vercel's
    // optimizer was re-encoding scraped thumbnails into broken/blank outputs
    // for some sources, so we serve every image as-is from its origin URL.
    unoptimized: true,
    remotePatterns: [
      // Supabase Storage — domena rozwiązywana z env w runtime (kasujemy
      // hardcoded ref projektu z kodu); fallback `*.supabase.co` pokrywa
      // każdy projekt na hostingu Supabase nawet bez ustawionej zmiennej.
      ...supabaseRemotePatterns,
      { protocol: "https", hostname: "*.supabase.co" },
      // Common source domains
      { protocol: "https", hostname: "*.techcrunch.com" },
      { protocol: "https", hostname: "*.theverge.com" },
      { protocol: "https", hostname: "*.arstechnica.com" },
      { protocol: "https", hostname: "*.wired.com" },
      { protocol: "https", hostname: "*.venturebeat.com" },
      { protocol: "https", hostname: "*.openai.com" },
      { protocol: "https", hostname: "*.google.com" },
      { protocol: "https", hostname: "*.deepmind.com" },
      { protocol: "https", hostname: "*.microsoft.com" },
      { protocol: "https", hostname: "*.nvidia.com" },
      { protocol: "https", hostname: "*.anthropic.com" },
      { protocol: "https", hostname: "*.huggingface.co" },
      { protocol: "https", hostname: "*.spidersweb.pl" },
      { protocol: "https", hostname: "*.wp.com" },
      { protocol: "https", hostname: "*.medium.com" },
      { protocol: "https", hostname: "*.unsplash.com" },
      { protocol: "https", hostname: "*.githubusercontent.com" },
      { protocol: "https", hostname: "*.cloudfront.net" },
      { protocol: "https", hostname: "*.imgur.com" },
      { protocol: "https", hostname: "*.cdn.sanity.io" },
      // Catch-all: the AI pipeline scrapes thumbnails from unpredictable RSS
      // sources, so a fixed whitelist will always have gaps. HTTPS-only.
      { protocol: "https", hostname: "**" },
    ],
  },
  // 301 redirects for the English → Polish URL migration. External links,
  // Google index, RSS readers and newsletter archives that still reference
  // the old paths land on the Polish canonical instead of a 404.
  async redirects() {
    return [
      { source: "/article/:slug", destination: "/artykul/:slug", permanent: true },
      { source: "/category/:slug", destination: "/kategoria/:slug", permanent: true },
      { source: "/search", destination: "/szukaj", permanent: true },
      { source: "/about", destination: "/o-serwisie", permanent: true },
      { source: "/privacy", destination: "/polityka-prywatnosci", permanent: true },
    ];
  },
};

export default nextConfig;

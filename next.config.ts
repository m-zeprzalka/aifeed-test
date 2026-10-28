import type { NextConfig } from "next";

// Publiczne obiekty Supabase Storage — jedyne obrazy, które przepuszczamy
// przez optymalizator. Host z `NEXT_PUBLIC_SUPABASE_URL` (nasz projekt);
// bez env (np. build bez sekretów) fallback na `*.supabase.co`, żeby build
// nie padał — `Thumbnail` i tak optymalizuje wyłącznie host z env.
const STORAGE_PATHNAME = "/storage/v1/object/public/**";
function supabaseImagePattern(): { protocol: "https"; hostname: string; pathname: string } {
  try {
    const { hostname } = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return { protocol: "https", hostname, pathname: STORAGE_PATHNAME };
  } catch {
    return { protocol: "https", hostname: "*.supabase.co", pathname: STORAGE_PATHNAME };
  }
}

/**
 * Content-Security-Policy — każda dyrektywa to świadoma decyzja:
 *
 * - `script-src 'unsafe-inline'`: Next/React 19 emituje inline scripty (RSC
 *   payload, JSON-LD przez `dangerouslySetInnerHTML`, no-FOUC next-themes).
 *   Nonce wymagałby renderowania per-request (koniec ISR/CDN cache dla
 *   wszystkich stron) — świadomy kompromis, ROADMAP backlog. `'unsafe-eval'`
 *   wyłącznie w dev (React dev tools odtwarzają callstacki przez eval()).
 * - `style-src 'unsafe-inline'`: Next/Image i Tailwind dokładają `style="..."`.
 * - `img-src https:`: miniatury scrape'owane z dowolnych domen RSS.
 * - `connect-src`: GA4 (+ doubleclick przy ads signals) i Vercel Analytics.
 *   Supabase i OpenRouter celowo pominięte — przeglądarka nie łączy się
 *   z nimi nigdy (dane idą przez RSC i /api/*, miniatury przez /_next/image).
 * - `frame-ancestors 'none'`: odpowiednik X-Frame-Options DENY (XFO zostaje
 *   dla starych przeglądarek).
 */
const isDev = process.env.NODE_ENV === "development";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.google-analytics.com https://www.google-analytics.com https://stats.g.doubleclick.net https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

// Nagłówki bezpieczeństwa są STATYCZNE, więc żyją tutaj, a nie w proxy.
// Vercel nakłada je na krawędzi CDN razem z odpowiedzią z cache — zero
// wywołań funkcji. Wcześniej `proxy.ts` (runtime Node.js) uruchamiał się
// przed cache na KAŻDE wejście na stronę: +50–130 ms TTFB (hop do regionu
// funkcji) i jedno wywołanie funkcji na odsłonę. Proxy obsługuje już tylko
// Basic Auth dla /admin.
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  // COOP odcina referencje cross-window (Spectre-style side channels). CORP
  // `same-site` dotyczy wyłącznie NASZYCH zasobów (apex ↔ www mogą je
  // osadzać, obce domeny nie) — miniatury z RSS są cross-origin i ich nie
  // obejmuje.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

// /admin: zakaz cache'owania i indeksowania na poziomie HTTP (uzupełnienie
// meta noindex z layoutu admina i Disallow w robots.txt).
const ADMIN_HEADERS = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Cache-Control", value: "private, no-store, no-cache, max-age=0" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Nie ogłaszamy frameworka w każdej odpowiedzi (`x-powered-by: Next.js`).
  poweredByHeader: false,
  images: {
    // Optymalizacja jest sterowana per-obraz w `components/ui/thumbnail.tsx`:
    // przez `/_next/image` idą WYŁĄCZNIE miniatury z naszego Supabase Storage
    // (LCP artykułu); scrape'owane obrazy z obcych domen renderują się jako
    // `unoptimized` (zwykłe <img>), które w ogóle nie sprawdza remotePatterns.
    //
    // Dlatego whitelist obejmuje TYLKO Supabase. Dawny catch-all `**` robił
    // z `/_next/image` otwarte proxy dla dowolnego obrazu z internetu —
    // każdy mógł zużywać nasz limit transformacji Vercela i dobijać się do
    // powierzchni ataku optymalizatora (seria CVE w Next 16.0–16.4.0).
    remotePatterns: [supabaseImagePattern()],
    qualities: [75],
    // Miniatury w Storage są niemutowalne (`ai-<timestamp>.png`), więc
    // zoptymalizowany wariant może żyć długo — mniej transformacji (limit
    // planu) i mniej zimnych optymalizacji na LCP.
    minimumCacheTTL: 2_678_400,
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/admin", headers: ADMIN_HEADERS },
      { source: "/admin/:path*", headers: ADMIN_HEADERS },
    ];
  },
  // Permanent (308) redirects for the English → Polish URL migration.
  // External links, Google index, RSS readers and newsletter archives that
  // still reference the old paths land on the Polish canonical instead of
  // a 404. (Next emits 308, not 301 — SEO-equivalent.)
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

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";

/**
 * Content-Security-Policy. Wynesiona do stałej, bo szczegółowa i wymaga
 * komentarzy przy każdej decyzji — każda zmiana psuje konkretne integracje.
 *
 * - `script-src 'unsafe-inline'`: Next/React 19 emituje inline scripty (RSC
 *   payload, `dangerouslySetInnerHTML` dla JSON-LD, no-FOUC ThemeProvider).
 *   Przejście na nonce wymaga zmian w SSR (Next 16 nie ma jeszcze stabilnego
 *   nonce streaming'u przez App Router) — zostawiamy `'unsafe-inline'` jako
 *   świadomy kompromis. `'unsafe-eval'` celowo POMINIĘTE.
 * - `style-src 'unsafe-inline'`: Tailwind + Next/Image dodają `style="..."`
 *   atrybuty na elementach. Bez tego znika cały styling.
 * - `img-src https:`: pipeline scrape'uje thumbnaile z dowolnych domen RSS,
 *   biała lista nigdy nie nadąży. `data:`/`blob:` dla Next/Image internals.
 * - `connect-src`: Supabase (REST + Realtime gdyby kiedyś), Google Analytics,
 *   Vercel Analytics endpoint. OpenRouter celowo POMINIĘTE — pipeline go
 *   wywołuje wyłącznie po stronie serwera, klient go nie potrzebuje.
 * - `font-src 'self' data:`: Next/Font samohostuje pliki w `_next/static/media`,
 *   `data:` dla wbudowanych fallbacków.
 * - `frame-ancestors 'none'`: duplikat X-Frame-Options DENY (CSP wygrywa w
 *   nowych przeglądarkach, XFO zostaje dla starych).
 */
// `'unsafe-eval'` WYŁĄCZNIE w dev: React/Next w trybie deweloperskim używa
// eval() do narzędzi debugowych (odtwarzanie callstacków); bez tego konsola
// sypie błędem "eval() is not supported". Produkcyjny React nigdy nie używa
// eval — na produkcji dyrektywa pozostaje bez niego.
const DEV_EVAL = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${DEV_EVAL} https://www.googletagmanager.com https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // `stats.g.doubleclick.net` — GA4 wysyła tam beacony przy włączonych ads
  // signals; bez wpisu byłyby po cichu ubijane przez CSP.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.google-analytics.com https://www.google-analytics.com https://stats.g.doubleclick.net https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * HTTP Basic Auth dla `/admin/*`. Weryfikacja siedzi w `lib/admin-auth.ts`
 * (stałoczasowe porównanie, odporność na uszkodzony base64) i jest
 * współdzielona z Server Actions admina — proxy to tylko PIERWSZA warstwa
 * (browser challenge), nie jedyna. Bez env — 503 (fail-closed). Vercel Hobby
 * nie ma "Password Protection" (płatne), więc robimy własną warstwę.
 */
async function basicAuthCheck(request: NextRequest): Promise<NextResponse | null> {
  const result = await checkAdminAuth(request.headers.get("authorization"));

  if (result === "unconfigured") {
    return new NextResponse("Admin dashboard unavailable: missing ADMIN_USERNAME/ADMIN_PASSWORD env.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (result === "ok") return null;

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="AiFeed Admin", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

export async function proxy(request: NextRequest) {
  // Bramka admin — uruchamiana zanim trafimy na response z security headers
  // (te są mniej istotne dla 401). Jeśli auth fails, zwracamy własny response.
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const failure = await basicAuthCheck(request);
    if (failure) return failure;
  }

  const response = NextResponse.next();

  // Security headers
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-DNS-Prefetch-Control", "on");
  // HSTS — only effective on HTTPS; browsers ignore it on HTTP so it's safe to send always.
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  // CSP + isolation headers (P1-7). COOP odcina cross-window references —
  // chroni przed Spectre-style side-channels. CORP `same-site` pozwala
  // subdomenom (aifeed.pl ↔ www.aifeed.pl) na embed własnych zasobów, ale
  // blokuje każdą inną domenę — RSS thumbnaile są cross-origin i ładujemy
  // je sami, więc tego CORP nie dotyczy (header opisuje TYLKO nasze zasoby).
  response.headers.set("Content-Security-Policy", CSP);
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-site");

  // Dla /admin/* dodatkowo zakaz cachowania i indeksowania na poziomie HTTP
  // (uzupełnienie meta noindex z layoutu admina).
  if (request.nextUrl.pathname.startsWith("/admin")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "private, no-store, no-cache, max-age=0");
  }

  return response;
}

export const config = {
  // Runs on every request except Next internals and public static assets.
  // API routes are intentionally included — they benefit from the same security headers.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml|feed.xml).*)",
  ],
};

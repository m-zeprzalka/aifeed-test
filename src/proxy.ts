import { NextRequest, NextResponse } from "next/server";

/**
 * HTTP Basic Auth dla `/admin/*`. Hasło + login w env (`ADMIN_USERNAME`,
 * `ADMIN_PASSWORD`). Bez env — dashboard zwraca 503 (lepiej niż otwarty
 * dostęp). Vercel Hobby nie ma "Password Protection" (płatne), więc
 * robimy własną warstwę edge-side.
 */
function basicAuthCheck(request: NextRequest): NextResponse | null {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;

  if (!expectedUser || !expectedPass) {
    return new NextResponse("Admin dashboard unavailable: missing ADMIN_USERNAME/ADMIN_PASSWORD env.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    // Atob jest dostępne w runtime Vercel (Edge + Node). Decodujemy
    // header `Basic base64(user:pass)`.
    const decoded = atob(auth.slice("Basic ".length));
    const sepIdx = decoded.indexOf(":");
    const user = sepIdx >= 0 ? decoded.slice(0, sepIdx) : "";
    const pass = sepIdx >= 0 ? decoded.slice(sepIdx + 1) : "";
    if (user === expectedUser && pass === expectedPass) {
      return null;
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="AiFeed Admin", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

export function proxy(request: NextRequest) {
  // Bramka admin — uruchamiana zanim trafimy na response z security headers
  // (te są mniej istotne dla 401). Jeśli auth fails, zwracamy własny response.
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const failure = basicAuthCheck(request);
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

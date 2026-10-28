import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";

/**
 * Proxy (Next 16, runtime Node.js) — WYŁĄCZNIE bramka Basic Auth dla
 * `/admin/*`. Nagłówki bezpieczeństwa (CSP, HSTS, COOP/CORP…) żyją
 * w `next.config.ts › headers()`: są statyczne, więc Vercel nakłada je na
 * krawędzi bez wywoływania funkcji. Proxy na wszystkich ścieżkach oznaczał
 * wywołanie funkcji przed cache przy KAŻDEJ odsłonie (+TTFB, +koszt).
 *
 * To tylko PIERWSZA warstwa (challenge przeglądarki). Server Actions są
 * globalnymi endpointami POST, więc każda akcja admina sama woła
 * `checkAdminAuth()` (`assertAdmin()` w actions.ts). Weryfikacja: stałoczasowe
 * porównanie, odporność na uszkodzony base64 (`lib/admin-auth.ts`). Bez env —
 * 503 (fail-closed). Vercel Hobby nie ma płatnego "Password Protection".
 */
export async function proxy(request: NextRequest) {
  const result = await checkAdminAuth(request.headers.get("authorization"));

  if (result === "ok") return NextResponse.next();

  if (result === "unconfigured") {
    return new NextResponse("Admin dashboard unavailable: missing ADMIN_USERNAME/ADMIN_PASSWORD env.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="AiFeed Admin", charset="UTF-8"',
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};

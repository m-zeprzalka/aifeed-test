import { NextRequest } from "next/server";
import { searchArticles } from "@/lib/data";
import { checkRateLimit } from "@/lib/rate-limit";
import { SEARCH_QUERY_MAX_LENGTH } from "@/lib/search-utils";
import { clientIp } from "@/lib/request-ip";

export async function GET(request: NextRequest) {
  // Limit (30 req/min/IP) zdefiniowany centralnie w `LIMITS` w
  // `src/lib/rate-limit.ts`.
  const { allowed, remaining, resetAt } = await checkRateLimit("search", clientIp(request));

  if (!allowed) {
    return Response.json(
      { error: "Zbyt wiele zapytań. Spróbuj za chwilę." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const query = (request.nextUrl.searchParams.get("q") || "").trim();

  if (!query) return Response.json([]);
  if (query.length > SEARCH_QUERY_MAX_LENGTH) return Response.json([]);

  // Wyniki = dane kart (bez `content`) — zob. CARD_COLUMNS w lib/data.ts.
  const results = await searchArticles(query);
  return Response.json(results, {
    headers: { "X-RateLimit-Remaining": String(remaining) },
  });
}

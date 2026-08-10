/**
 * Wspólna weryfikacja HTTP Basic Auth dla powierzchni /admin.
 *
 * Używana w DWÓCH miejscach — i to jest istotne dla bezpieczeństwa:
 *
 * 1. `src/proxy.ts` — bramka na ścieżce `/admin/*` (401 challenge dla
 *    przeglądarki).
 * 2. Server Actions w `src/app/admin/.../actions.ts` — Next.js wystawia
 *    każdą akcję jako GLOBALNY endpoint POST (wywoływalny z dowolnej
 *    ścieżki, np. `POST /` z nagłówkiem `Next-Action`), więc sam check
 *    ścieżki w proxy NIE wystarcza. Każda akcja musi autoryzować
 *    samodzielnie. Przeglądarka po przejściu challenge'u wysyła nagłówek
 *    `Authorization` przy każdym żądaniu w obrębie `/admin`, więc legalne
 *    wywołania przechodzą bez zmian w UX.
 *
 * Porównanie jest stałoczasowe: porównujemy digesty SHA-256 (stała długość,
 * XOR-akumulacja) zamiast wczesnowyjściowego `===`. `crypto.subtle` działa
 * w obu runtime'ach (Edge + Node).
 */

const encoder = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}

export type AdminAuthResult = "ok" | "unauthorized" | "unconfigured";

/**
 * Sprawdza nagłówek `Authorization: Basic ...` przeciwko
 * `ADMIN_USERNAME`/`ADMIN_PASSWORD` z env.
 *
 * - `unconfigured` — brak zmiennych env (fail-closed: wołający MUSI odmówić).
 * - `unauthorized` — brak/nieprawidłowy nagłówek albo złe dane (w tym
 *   uszkodzony base64 — atob() rzuca, łapiemy i odmawiamy zamiast 500).
 */
export async function checkAdminAuth(authHeader: string | null): Promise<AdminAuthResult> {
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) return "unconfigured";

  if (!authHeader?.startsWith("Basic ")) return "unauthorized";

  let decoded: string;
  try {
    decoded = atob(authHeader.slice("Basic ".length));
  } catch {
    return "unauthorized";
  }

  const sepIdx = decoded.indexOf(":");
  if (sepIdx < 0) return "unauthorized";

  const [userOk, passOk] = await Promise.all([
    safeEqual(decoded.slice(0, sepIdx), expectedUser),
    safeEqual(decoded.slice(sepIdx + 1), expectedPass),
  ]);
  return userOk && passOk ? "ok" : "unauthorized";
}

/**
 * SSRF-hardened fetch dla całego scrapingu (treść artykułów + og:image).
 *
 * Trzy warstwy, których NIE wolno luzować:
 *
 * 1. `isBlockedHost` — blokuje hosty wewnętrzne (localhost, RFC1918,
 *    link-local/AWS metadata, IPv6 loopback/ULA/link-local) ORAZ wszystkie
 *    literały IP w każdej notacji (dziesiętna `2130706433`, hex `0x7f000001`,
 *    oktalna `0177.0.0.1`, skrócona `127.1`, IPv4-mapped IPv6
 *    `[::ffff:127.0.0.1]`). Legalne źródła newsowe zawsze używają nazw
 *    domenowych — URL z literałem IP w feedzie/og:image to niemal na pewno
 *    próba nadużycia, więc odrzucamy hurtowo zamiast parsować egzotyczne
 *    notacje. To zamyka klasę bypassów "inna pisownia tego samego IP".
 *
 * 2. `safeFetch` — NIE podąża automatycznie za przekierowaniami
 *    (`redirect: "manual"`). Każdy hop jest walidowany od nowa — publiczny
 *    URL odpowiadający `302 Location: http://169.254.169.254/...` zostaje
 *    ucięty na tym hopie. Limit 5 przekierowań.
 *
 * 3. `readTextCapped` — czyta body strumieniowo z twardym limitem bajtów.
 *    Zwykłe `res.text()` buforuje CAŁĄ odpowiedź zanim cokolwiek utniemy —
 *    wrogi serwer mógłby wysłać setki MB w limicie czasu (memory DoS).
 *
 * Świadomie nieobsłużone: DNS rebinding (hostname publiczny, A-record
 * wskazuje do środka). Pełny fix wymaga własnego resolvera z pinningiem;
 * na Vercelu wartość takiego ataku jest niska (brak sieci wewnętrznej).
 * Odnotowane w ROADMAP.md.
 */

const MAX_REDIRECTS = 5;

function isIpLiteral(hostname: string): boolean {
  // Bracketed IPv6 ([::1], [::ffff:a9fe:a9fe], [2001:db8::1], ...)
  if (hostname.startsWith("[") || hostname.includes(":")) return true;
  // Anything composed purely of digits/dots/hex-prefix — covers dotted-quad,
  // decimal, hex, octal and shortened IPv4 forms.
  return /^(0x[0-9a-f]+|[0-9.]+)$/i.test(hostname);
}

export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  // Wszystkie literały IP (v4 w dowolnej notacji + v6) — patrz nagłówek.
  if (isIpLiteral(h)) return true;
  return false;
}

/** Parse + protocol allow-list + host blocklist. Null = odrzucone. */
export function validateExternalUrl(url: string | URL, base?: URL): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (isBlockedHost(parsed.hostname)) return null;
  return parsed;
}

export interface SafeFetchInit {
  method?: string;
  headers?: Record<string, string>;
  timeoutMs: number;
}

/**
 * Fetch z per-hop walidacją przekierowań. Zwraca `null` gdy URL jest
 * odrzucony (zamiast rzucać) — call sites traktują to jak każdy inny
 * nieudany scrape.
 */
export async function safeFetch(url: string, init: SafeFetchInit): Promise<Response | null> {
  let current = validateExternalUrl(url);
  if (!current) return null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current.href, {
      method: init.method ?? "GET",
      headers: init.headers,
      signal: AbortSignal.timeout(init.timeoutMs),
      redirect: "manual",
    });

    if (res.status >= 301 && res.status <= 308) {
      const location = res.headers.get("location");
      // Body przekierowania nas nie interesuje — zwolnij połączenie.
      res.body?.cancel().catch(() => {});
      if (!location) return null;
      const next = validateExternalUrl(location, current);
      if (!next) return null;
      current = next;
      continue;
    }

    return res;
  }
  return null; // redirect loop / łańcuch dłuższy niż MAX_REDIRECTS
}

/** Read response body as text with a hard byte cap (anty memory-DoS). */
export async function readTextCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
  }
  reader.cancel().catch(() => {});

  const merged = new Uint8Array(Math.min(received, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const room = merged.length - offset;
    if (room <= 0) break;
    merged.set(room >= chunk.length ? chunk : chunk.subarray(0, room), offset);
    offset += Math.min(chunk.length, room);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

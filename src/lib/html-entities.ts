/**
 * Dekodowanie encji HTML w tekście wyciąganym ze stron źródłowych
 * (treść artykułu, atrybuty og:image / og:site_name).
 *
 * Dlaczego własna funkcja, a nie parser DOM: scraper działa na regexach po
 * surowym HTML (bez jsdom w runtime), a potrzebujemy tylko encji, które
 * realnie pojawiają się w newsach. Bez dekodowania w bazie lądowały m.in.
 * `Spider&#x27;s Web` (atrybucja zdjęcia widoczna pod artykułem) i URL-e
 * miniatur z `&amp;` zamiast `&` (parametry CDN szły pod złą nazwą).
 *
 * JEDEN przebieg jednym regexem: wynik dekodowania nie jest ponownie
 * skanowany, więc `&amp;lt;` → "&lt;" (dosłowny tekst), a `&#38;lt;` →
 * "&lt;" — nigdy "<" (podwójne dekodowanie).
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  nbsp: " ",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  laquo: "«",
  raquo: "»",
  bdquo: "„",
  euro: "€",
  copy: "©",
  reg: "®",
  trade: "™",
  middot: "·",
  bull: "•",
};

function fromCodePoint(code: number, original: string): string {
  // Zakres Unicode + odrzucenie surogatów i NUL — wadliwa encja zostaje
  // w tekście dosłownie zamiast rzucać RangeError.
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
    return original;
  }
  return String.fromCodePoint(code);
}

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      return fromCodePoint(parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10), match);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

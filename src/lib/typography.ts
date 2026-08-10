/**
 * Polish typography helper. Applies the cosmetic rules that LLMs reliably get
 * wrong:
 *   - NBSP after one-letter prepositions (a, i, o, u, w, z) and after numbers
 *     before short unit/abbreviation tokens.
 *   - Replace ASCII hyphen-minus with en-dash inside numeric ranges
 *     ("10-15 minut" -> "10–15 minut") and with em-dash in spaced positions
 *     ("AiFeed - codzienne ..." -> "AiFeed — codzienne ...").
 *   - Convert ASCII straight quotes to Polish typographic quotes („…")
 *     using simple boundary heuristics (open after whitespace/start, close
 *     after a letter/digit).
 *
 * Runs OUTSIDE markdown code blocks, link/image destinations (`](url)`) and
 * bare URLs, so it never corrupts a URL or code fence (anchor text still gets
 * typography). Designed to be idempotent: running it twice gives the same
 * result as running it once.
 */
export function polishTypography(input: string): string {
  const segments = splitProtectingCode(input);
  return segments
    .map((seg) => (seg.isCode ? seg.text : applyPolishRules(seg.text)))
    .join("");
}

interface Segment {
  text: string;
  isCode: boolean;
}

// Split the input on segments that must stay byte-identical:
//   - fenced code blocks (``` ... ```) and inline code (`...`),
//   - markdown link/image destinations `](url)` — anchor text PRZED `](`
//     nadal dostaje typografię, sam URL nie,
//   - bare URLs (https://...).
// Bez ochrony URL-i reguła "digit-hyphen-digit → en-dash" przepisywała
// `https://site.com/2024-01-15/x` na `2024–01–15` i obowiązkowy link do
// źródła kończył jako 404.
function splitProtectingCode(input: string): Segment[] {
  const out: Segment[] = [];
  const pattern = /```[\s\S]*?```|`[^`\n]*`|\]\([^)]*\)|https?:\/\/[^\s)]+/g;
  let lastIndex = 0;
  for (const match of input.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      out.push({ text: input.slice(lastIndex, start), isCode: false });
    }
    out.push({ text: match[0], isCode: true });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < input.length) {
    out.push({ text: input.slice(lastIndex), isCode: false });
  }
  return out;
}

const NBSP = " ";

function applyPolishRules(text: string): string {
  let out = text;

  // NBSP after one-letter Polish prepositions (case-insensitive). Match only
  // at a word boundary so "a" in "fortuna" doesn't trigger. Use [ \t]+ rather
  // than \s+ so we never collapse newlines (which would merge separate lines
  // and shred markdown structure).
  out = out.replace(/(^|[ \t(\[])([aiouwzAIOUWZ])[ \t]+(?=\S)/g, `$1$2${NBSP}`);

  // NBSP between number and short unit / abbreviation. Common cases for an AI
  // news magazine: kg, km, %, zł, currencies, "r." (year), "tys." / "mln" /
  // "mld". Word-ending units use a positive lookahead `(?=\W|$)` (rather than
  // `\b`) because tokens that already end in a non-word char like `r.` or `%`
  // have no `\b` between the dot and the following space.
  out = out.replace(
    /(\d)[ \t]+(kg|km|cm|mm|zł|USD|EUR|GBP|tys\.|mln|mld|r\.|w\.|%)(?=\W|$)/g,
    `$1${NBSP}$2`
  );

  // Numeric ranges with hyphen-minus → en-dash. "10-15 minut", "2024-2026".
  // We only match when there's no surrounding word character on either side
  // (so "covid-19" stays intact).
  out = out.replace(/(\d)-(\d)/g, "$1–$2");

  // Spaced hyphen used as a pause → em-dash. "AiFeed - codzienne..." →
  // "AiFeed — codzienne...". Skip if it's already an en/em-dash.
  out = out.replace(/(\S) - (\S)/g, "$1 — $2");

  // Polish quotation marks. We do this with a single state machine so that
  // every opening quote gets a matching closing quote in order.
  out = transformQuotes(out);

  return out;
}

function transformQuotes(text: string): string {
  // Open quote: " preceded by start-of-string, whitespace, or opening bracket.
  // Close quote: " preceded by a non-whitespace character.
  const chars = Array.from(text);
  let inside = false;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== '"') continue;
    const prev = i > 0 ? chars[i - 1] : "";
    const isOpenContext = i === 0 || /[\s([{—–-]/.test(prev);
    if (!inside && isOpenContext) {
      chars[i] = "„"; // „
      inside = true;
    } else if (inside) {
      chars[i] = "”"; // "
      inside = false;
    } else {
      // Defensive: stray closing-style quote treated as closing.
      chars[i] = "”";
    }
  }
  return chars.join("");
}

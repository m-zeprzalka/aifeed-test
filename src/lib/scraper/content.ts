import { safeFetch, readTextCapped, validateExternalUrl } from "@/lib/scraper/safe-fetch";
import { decodeHtmlEntities } from "@/lib/html-entities";

// Twardy limit czytanego HTML. 3 MB surowego HTML to bezpieczny zapas na
// kilkanaście tysięcy znaków tekstu; bez capa wrogi serwer mógłby wysłać
// setki MB w limicie czasu (memory DoS).
const MAX_HTML_BYTES = 3 * 1024 * 1024;

/** Domyślny budżet tekstu źródła dla promptu (~1500 tokenów). */
export const DEFAULT_SOURCE_CHARS = 6000;

/**
 * Wynik JEDNEGO pobrania strony źródłowej: treść dla AI + metadane do
 * miniatury. Wcześniej og:image był scrape'owany osobnym, drugim żądaniem
 * do tej samej strony (1–3 s budżetu pipeline'u na artykuł i podwójne
 * obciążenie wydawcy).
 */
export interface SourcePage {
  /** Czysty tekst artykułu; "" gdy strona nie nadaje się do adaptacji. */
  text: string;
  /** og:image (lub twitter:image) jako absolutny URL po walidacji SSRF. */
  ogImage: string | null;
  /** og:site_name po zdekodowaniu encji ("Spider's Web", nie "Spider&#x27;s Web"). */
  siteName: string | null;
  /** Powód pustego `text` — trafia do telemetrii (`scrape_skip`). */
  failure: string | null;
}

/**
 * Pobiera stronę źródłową przez `safeFetch` (SSRF: protokół, blokada hostów
 * wewnętrznych i literałów IP, walidacja KAŻDEGO hopu przekierowania — NIE
 * luzować; zmiany wymagają testów w `safe-fetch.test.ts`).
 */
export async function scrapeSourcePage(url: string, maxChars = DEFAULT_SOURCE_CHARS): Promise<SourcePage> {
  const failed = (failure: string): SourcePage => ({ text: "", ogImage: null, siteName: null, failure });
  try {
    const res = await safeFetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,pl;q=0.8",
      },
      timeoutMs: 15_000,
    });

    if (!res) return failed("blocked-url");
    if (!res.ok) return failed(`http-${res.status}`);

    // Reject non-HTML responses (PDFs, images, binaries)
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return failed(`content-type:${contentType.split(";")[0] || "none"}`);
    }

    const html = await readTextCapped(res, MAX_HTML_BYTES);
    // Względne og:image rozwiązujemy względem URL-a PO przekierowaniach.
    const base = new URL(res.url || url);
    const meta = extractOgMeta(html, base);
    const { text, failure } = extractArticleText(html, maxChars);
    if (failure) console.warn(`[Content Scraper] ${failure} for ${url}`);
    return { text, ...meta, failure };
  } catch (error) {
    console.warn(`[Content Scraper] Failed for ${url}:`, error);
    return failed(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network");
  }
}

// ===================== META (og:image / og:site_name) =====================

/**
 * Mapa `<meta>` po `property`/`name` (lowercase) → `content`. Parsujemy
 * atrybuty niezależnie od kolejności i rodzaju cudzysłowu; pierwsze
 * wystąpienie wygrywa (jak w crawlerach social).
 */
function readMetaTags(html: string): Map<string, string> {
  const head = html.slice(0, 400_000); // meta tagi żyją w <head>
  const tags = new Map<string, string>();
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? "";
    }
    const key = (attrs.property || attrs.name || "").toLowerCase();
    const content = attrs.content;
    if (key && content && !tags.has(key)) tags.set(key, decodeHtmlEntities(content).trim());
  }
  return tags;
}

export function extractOgMeta(html: string, base: URL): { ogImage: string | null; siteName: string | null } {
  const meta = readMetaTags(html);
  const rawImage =
    meta.get("og:image:secure_url") || meta.get("og:image") || meta.get("og:image:url") || meta.get("twitter:image");
  // og:image to treść atakowalna (kontroluje ją autor strony) — pełna
  // walidacja SSRF zanim URL trafi dalej (HEAD w generatorze, potem DB).
  const ogImage = rawImage ? validateExternalUrl(rawImage, base)?.href ?? null : null;
  const siteName = meta.get("og:site_name") || null;
  return { ogImage, siteName };
}

// ===================== TREŚĆ ARTYKUŁU =====================

const NON_CONTENT_TAGS = ["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg", "iframe"];

/**
 * HTML → czysty tekst artykułu (priorytet: `<article>` > `<main>` > `<body>`),
 * przycięty do `maxChars`. Zwraca `failure` zamiast tekstu, gdy wynik nie
 * nadaje się do adaptacji (za krótki, binarny).
 */
export function extractArticleText(rawHtml: string, maxChars = DEFAULT_SOURCE_CHARS): { text: string; failure: string | null } {
  // Binarny PDF, który prześlizgnął się przez content-type.
  if (rawHtml.startsWith("%PDF")) return { text: "", failure: "binary-pdf" };

  let html = rawHtml;
  for (const tag of NON_CONTENT_TAGS) {
    html = html.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi"), "");
  }
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const contentHtml = articleMatch?.[1] || mainMatch?.[1] || bodyMatch?.[1] || html;

  let text = decodeHtmlEntities(
    contentHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/blockquote>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length > maxChars) {
    text = text.slice(0, maxChars) + "\n\n[treść skrócona]";
  }

  if (text.length < 100) return { text: "", failure: `too-short:${text.length}` };

  // Udział znaków drukowalnych (łacina z diakrytykami, cyrylica, typografia)
  // — odrzuca "tekst" będący zdekodowanym binarnym śmieciem.
  const printable = text.replace(/[^\x20-\x7E -ɏЀ-ӿ‐-‧€\n]/g, "");
  if (printable.length / text.length < 0.7) return { text: "", failure: "unreadable" };

  return { text, failure: null };
}

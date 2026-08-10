import { safeFetch, readTextCapped } from "@/lib/scraper/safe-fetch";

// Twardy limit czytanego HTML. Interesuje nas pierwsze ~6000 znaków tekstu
// po ekstrakcji, więc 3 MB surowego HTML to bezpieczny zapas; bez capa wrogi
// serwer mógłby wysłać setki MB w limicie czasu (memory DoS).
const MAX_HTML_BYTES = 3 * 1024 * 1024;

/**
 * Scrapes the full text content of a source article from its URL.
 * Used to provide the AI writer with actual source material
 * instead of just an RSS title/snippet — preventing hallucinations.
 *
 * SSRF hardening (protokół, blokada hostów wewnętrznych i literałów IP,
 * walidacja KAŻDEGO hopu przekierowania) siedzi w `safeFetch` —
 * `src/lib/scraper/safe-fetch.ts`. NIE luzować; zmiany wymagają testów
 * w `safe-fetch.test.ts`.
 */
export async function scrapeArticleContent(url: string): Promise<string> {
  try {
    const res = await safeFetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      timeoutMs: 15_000,
    });

    if (!res) {
      console.warn(`[Content Scraper] URL rejected by SSRF guard or redirect chain: ${url}`);
      return "";
    }
    if (!res.ok) {
      console.warn(`[Content Scraper] HTTP ${res.status} for ${url}`);
      return "";
    }

    // Reject non-HTML responses (PDFs, images, binaries)
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      console.warn(`[Content Scraper] Skipping non-HTML content-type: ${contentType} for ${url}`);
      return "";
    }

    let html = await readTextCapped(res, MAX_HTML_BYTES);

    // Detect binary/PDF content that slipped through
    if (html.startsWith("%PDF") || html.includes("endobj") || html.includes("endstream")) {
      console.warn(`[Content Scraper] PDF binary detected for ${url}`);
      return "";
    }

    // ---- Strip non-content elements ----
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    html = html.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");
    html = html.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
    html = html.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
    html = html.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
    html = html.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");
    html = html.replace(/<form[^>]*>[\s\S]*?<\/form>/gi, "");
    html = html.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "");
    html = html.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "");
    html = html.replace(/<!--[\s\S]*?-->/g, "");

    // ---- Find the main article body ----
    // Priority: <article> > <main> > <body>
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    const contentHtml =
      articleMatch?.[1] || mainMatch?.[1] || bodyMatch?.[1] || html;

    // ---- Convert HTML to plain text ----
    let text = contentHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/blockquote>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      // Decode common HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#8217;/g, "\u2019")
      .replace(/&#8216;/g, "\u2018")
      .replace(/&#8220;/g, "\u201C")
      .replace(/&#8221;/g, "\u201D")
      .replace(/&#8212;/g, "\u2014")
      .replace(/&#8211;/g, "\u2013")
      // Clean up whitespace
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // ---- Truncate to fit AI token budget (~6000 chars ≈ 1800 tokens) ----
    const MAX_CHARS = 6000;
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + "\n\n[treść skrócona]";
    }

    // Validate text is actually readable (not garbled binary)
    if (text.length < 100) {
      console.warn(`[Content Scraper] Too short (${text.length} chars) for ${url}`);
      return "";
    }

    // Check ratio of printable characters — reject garbled content
    const printable = text.replace(/[^\x20-\x7E\u00A0-\u024F\u0400-\u04FF\n]/g, "");
    if (printable.length / text.length < 0.7) {
      console.warn(`[Content Scraper] Low readability ratio for ${url}, likely binary`);
      return "";
    }

    console.log(`[Content Scraper] Extracted ${text.length} chars from ${url}`);
    return text;
  } catch (error) {
    console.warn(`[Content Scraper] Failed for ${url}:`, error);
    return "";
  }
}

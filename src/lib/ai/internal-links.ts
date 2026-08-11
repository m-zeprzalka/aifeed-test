import { siteConfig } from "@/config/site";

/**
 * Sanityzacja linków wewnętrznych w treści wygenerowanej przez AI.
 *
 * Prompt (`ARTICLE_USER_PROMPT`) pozwala AI wplatać linki `[tekst](/artykul/slug)`
 * wyłącznie ze wskazanej listy ostatnich artykułów. Model bywa jednak kreatywny:
 * potrafi zmyślić slug, dokleić domenę, podlinkować kategorię albo stronę,
 * której nie ma. Każdy taki link to wewnętrzny 404 — sygnał niskiej jakości
 * dla Google i ślepa uliczka dla czytelnika. Ta funkcja jest twardą bramką:
 *
 * - `/artykul/<slug>` ze slugiem z `allowedSlugs` → zostaje (relatywny),
 * - absolutny URL na nasz host z `/artykul/<slug>` → przepisany na relatywny
 *   (jeśli slug dozwolony) albo rozpakowany do samego tekstu,
 * - każdy inny link relatywny (`/kategoria/...`, zmyślone ścieżki) → rozpakowany
 *   do samego tekstu kotwicy,
 * - linki zewnętrzne (http/https na obce hosty), kotwice `#...`, `mailto:` —
 *   nietknięte,
 * - obrazki `![alt](src)` — nietknięte.
 */

// Hosty traktowane jako "nasze". Kanoniczna produkcja + apex + host z env
// (dev/preview), żeby sanitizer działał identycznie we wszystkich środowiskach.
const SITE_HOSTS = (() => {
  const hosts = new Set(["aifeed.pl", "www.aifeed.pl"]);
  try {
    hosts.add(new URL(siteConfig.url).hostname);
  } catch {
    /* zły NEXT_PUBLIC_SITE_URL — ignorujemy, zostają defaulty */
  }
  return hosts;
})();

const ARTICLE_PREFIX = "/artykul/";

function extractSlug(pathname: string): string {
  return pathname
    .slice(ARTICLE_PREFIX.length)
    .split(/[?#]/)[0]
    .replace(/\/+$/, "");
}

export function sanitizeInternalLinks(
  content: string,
  allowedSlugs: ReadonlySet<string>
): string {
  // Markdown linki [tekst](cel). Negative lookbehind na "!" omija obrazki.
  return content.replace(
    /(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    (match, text: string, target: string) => {
      const keepIfAllowed = (slug: string) =>
        slug && allowedSlugs.has(slug) ? `[${text}](${ARTICLE_PREFIX}${slug})` : text;

      // Relatywny link do artykułu.
      if (target.startsWith(ARTICLE_PREFIX)) {
        return keepIfAllowed(extractSlug(target));
      }

      // Absolutny URL — nasz host przepisujemy/rozpakowujemy, obce zostają.
      if (/^https?:\/\//i.test(target)) {
        try {
          const url = new URL(target);
          if (SITE_HOSTS.has(url.hostname)) {
            if (url.pathname.startsWith(ARTICLE_PREFIX)) {
              return keepIfAllowed(extractSlug(url.pathname));
            }
            // Inny wewnętrzny URL absolutny (home, kategoria...) — AI nie ma
            // podstaw go tworzyć; rozpakowujemy do tekstu.
            return text;
          }
        } catch {
          /* nieparsowalny URL — traktuj jak zewnętrzny, zostaw */
        }
        return match;
      }

      // Pozostałe linki relatywne (/kategoria/..., zmyślone ścieżki) → tekst.
      if (target.startsWith("/")) {
        return text;
      }

      // Kotwice, mailto: itd. — bez zmian.
      return match;
    }
  );
}

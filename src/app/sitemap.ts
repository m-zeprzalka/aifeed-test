import { getSitemapArticles, getCategoriesLastModified } from "@/lib/data";
import { siteConfig } from "@/config/site";
import type { MetadataRoute } from "next";

/**
 * ISR — bez tego `sitemap.ts` jest (w tej wersji Next) cache'owanym route
 * handlerem budowanym RAZ, w build time. Produkcja 2026-10-28: sitemapa
 * z dnia deployu 2026-08-12 — 541 artykułów opublikowanych później w ogóle
 * nie było w sitemapie. Godzina to kompromis: crony publikują 3×/dzień,
 * a świeżość "na już" zapewniają news-sitemap (15 min) i IndexNow.
 */
export const revalidate = 3600;

/**
 * Limit protokołu sitemap to 50 000 URL-i na plik. Przy ~9 artykułach/dzień
 * to ~15 lat zapasu; gdy zbliżymy się do limitu — `generateSitemaps`
 * (ROADMAP, backlog). `getSitemapArticles` stronicuje po 1000 wierszy.
 */
const MAX_ARTICLE_URLS = 49_000;

/**
 * Strony statyczne z RĘCZNIE utrzymywaną datą ostatniej realnej zmiany
 * treści. Wcześniej `new Date()` — każdy crawl widział "zmienione teraz",
 * a Google przestaje ufać `lastmod` całej sitemapy, gdy jest nieprawdziwy
 * (także dla artykułów, gdzie jest uczciwy). Zmieniasz treść strony →
 * zaktualizuj datę tutaj.
 */
const STATIC_PAGES: { path: string; lastModified: string }[] = [
  { path: "/o-serwisie", lastModified: "2026-10-28" },
  { path: "/redakcja", lastModified: "2026-08-11" },
  { path: "/polityka-prywatnosci", lastModified: "2026-10-28" },
];

// `changeFrequency`/`priority` celowo pominięte — Google i Bing je ignorują,
// a stałe "weekly" dla artykułów, które się nie zmieniają, to fałszywy sygnał.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url;
  const [articles, categoryMods] = await Promise.all([
    getSitemapArticles(MAX_ARTICLE_URLS),
    getCategoriesLastModified(),
  ]);

  // Home: data najnowszego artykułu (realna zmiana treści strony głównej).
  const newestArticle = articles[0]?.updated_at;

  return [
    { url: baseUrl, ...(newestArticle && { lastModified: new Date(newestArticle) }) },
    ...siteConfig.categories.map((cat) => ({
      url: `${baseUrl}/kategoria/${cat.slug}`,
      ...(categoryMods[cat.slug] && { lastModified: categoryMods[cat.slug] }),
    })),
    ...STATIC_PAGES.map((page) => ({
      url: `${baseUrl}${page.path}`,
      lastModified: new Date(page.lastModified),
    })),
    // Strony tagów celowo NIE są w sitemapie — są `noindex, follow` (thin
    // content, zob. `tagMetadata` w lib/seo.ts); /szukaj też (noindex).
    ...articles.map((article) => ({
      url: `${baseUrl}/artykul/${article.slug}`,
      lastModified: new Date(article.updated_at),
    })),
  ];
}

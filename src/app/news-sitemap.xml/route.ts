import { getNewsSitemapArticles } from "@/lib/data";
import { siteConfig } from "@/config/site";

/**
 * Google News sitemap — osobna od głównej sitemapy, zawiera WYŁĄCZNIE
 * artykuły z ostatnich 48 h (starsze Google News ignoruje). Od 03.2025 nie ma
 * aplikowania do Google News — inclusion jest czysto algorytmiczne, a news
 * sitemap to formalny kanał sygnalizowania świeżej treści (przyspiesza też
 * crawl pod Discover). Zgłoszona w robots.ts; po deployu dodać w GSC obok
 * sitemap.xml.
 */
export const revalidate = 900;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const articles = await getNewsSitemapArticles();

  const urls = articles
    .map(
      (a) => `  <url>
    <loc>${escapeXml(`${siteConfig.url}/artykul/${a.slug}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(siteConfig.name)}</news:name>
        <news:language>pl</news:language>
      </news:publication>
      <news:publication_date>${new Date(a.published_at).toISOString()}</news:publication_date>
      <news:title>${escapeXml(a.title)}</news:title>
    </news:news>
  </url>`
    )
    .join("\n");

  // Pusty <urlset> (0 artykułów w oknie 48 h) jest poprawnym XML-em — Google
  // traktuje go jako "nic nowego", nie jako błąd.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}

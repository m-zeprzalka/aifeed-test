import { getArticles } from "@/lib/data";
import { siteConfig } from "@/config/site";

export const revalidate = 3600;

// Escape XML special characters — critical for URLs containing `&`.
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Wrap text fields with CDATA — the `]]>` sequence must be split to stay safe.
function cdata(value: string): string {
  return `<![CDATA[${value.replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

function inferImageMimeType(url: string): string {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".avif")) return "image/avif";
  if (clean.endsWith(".svg")) return "image/svg+xml";
  return "image/jpeg";
}

export async function GET() {
  const articles = await getArticles(50);
  const baseUrl = siteConfig.url;

  const items = articles
    .map((a) => {
      const articleUrl = escapeXml(`${baseUrl}/artykul/${a.slug}`);
      // Pusty <pubDate></pubDate> to niepoprawny RFC-822 — część walidatorów
      // odrzuca cały item. Brak daty → element pomijamy w całości.
      const pubDateTag = a.published_at
        ? `\n    <pubDate>${new Date(a.published_at).toUTCString()}</pubDate>`
        : "";
      const categoryTag = a.category
        ? `\n    <category>${escapeXml(a.category.name)}</category>`
        : "";
      const enclosureTag = a.thumbnail_url
        ? `\n    <enclosure url="${escapeXml(a.thumbnail_url)}" type="${inferImageMimeType(a.thumbnail_url)}" length="0"/>`
        : "";

      return `<item>
    <title>${cdata(a.title)}</title>
    <link>${articleUrl}</link>
    <description>${cdata(a.excerpt)}</description>${pubDateTag}
    <guid isPermaLink="true">${articleUrl}</guid>
    <dc:creator>AiFeed</dc:creator>${categoryTag}${enclosureTag}
  </item>`;
    })
    .join("\n  ");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>${escapeXml(siteConfig.name)}</title>
  <link>${escapeXml(baseUrl)}</link>
  <description>${cdata(siteConfig.description)}</description>
  <language>pl-PL</language>
  <managingEditor>kontakt@aifeed.pl (AiFeed)</managingEditor>
  <atom:link href="${escapeXml(`${baseUrl}/feed.xml`)}" rel="self" type="application/rss+xml"/>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  <image>
    <url>${escapeXml(`${baseUrl}/icon-512.png`)}</url>
    <title>${escapeXml(siteConfig.name)}</title>
    <link>${escapeXml(baseUrl)}</link>
  </image>
  ${items}
</channel>
</rss>`;

  return new Response(rss, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // `public` is explicit so any CDN between Vercel and the reader caches
      // the response. Without it, only Vercel's own cache benefits and shared
      // caches (Cloudflare, etc.) treat this as private.
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

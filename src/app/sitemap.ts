import {
  getSitemapArticles,
  getCategories,
  getCategoriesLastModified,
} from "@/lib/data";
import { siteConfig } from "@/config/site";
import type { MetadataRoute } from "next";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url;
  const [articles, categories, categoryMods] = await Promise.all([
    getSitemapArticles(5000),
    getCategories(),
    getCategoriesLastModified(),
  ]);

  const articleUrls = articles.map((article) => ({
    url: `${baseUrl}/artykul/${article.slug}`,
    lastModified: new Date(article.updated_at),
    changeFrequency: "weekly" as const,
    priority: article.is_featured ? 0.9 : 0.7,
  }));

  // Use the most recent article in the category as `lastModified`. Falls back
  // to the request time when the category has no published articles yet, so
  // the URL is still discoverable.
  const categoryUrls = categories.map((cat) => ({
    url: `${baseUrl}/kategoria/${cat.slug}`,
    lastModified: categoryMods[cat.slug] ?? new Date(),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  // Strony tagów celowo NIE są w sitemapie — są `noindex, follow` (thin
  // content, zob. komentarz przy `tagMetadata` w `lib/seo.ts`). Zgłaszanie
  // noindexowanych URL-i w sitemapie to sprzeczny sygnał dla Google.

  // Home `lastModified` derived from the newest article so a crawl reflects
  // actual content change, not the time the sitemap was generated.
  const newestArticle = articles[0]?.updated_at;

  return [
    {
      url: baseUrl,
      lastModified: newestArticle ? new Date(newestArticle) : new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/o-serwisie`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/polityka-prywatnosci`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    // /szukaj intentionally omitted — it's noindex'd (thin content) and has
    // no standalone value as a discoverable URL.
    ...categoryUrls,
    ...articleUrls,
  ];
}

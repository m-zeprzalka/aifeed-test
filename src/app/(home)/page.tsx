import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { ArticleCard } from "@/components/articles/article-card";
import { TrendingTags } from "@/components/layout/trending-tags";
import { siteConfig } from "@/config/site";
import {
  getArticlesGroupedByCategory,
  getPopularTags,
} from "@/lib/data";
import { jsonLdScript } from "@/lib/jsonld";
import { homeMetadata } from "@/lib/seo";

// Home metadata pochodzi z centralnego helpera `lib/seo.ts`. Używa
// `title.absolute` żeby ominąć template z root layoutu (uniknięcie "AiFeed |
// AiFeed"). Wszystkie inne strony (kategoria/tag/artykuł) używają template
// poprzez wywołanie `categoryMetadata`/`tagMetadata`/`articleMetadata`.
export const metadata = homeMetadata();

export const revalidate = 300;

// How many articles to fetch per category. Enough to fill the hero slot (1)
// plus the per-category section below (up to 4) without re-querying.
const PER_CATEGORY = 6;

export default async function HomePage() {
  const allCategories = siteConfig.categories;
  const categorySlugs = allCategories.map((c) => c.slug);

  const [categoryArticles, trendingTags] = await Promise.all([
    getArticlesGroupedByCategory(categorySlugs, PER_CATEGORY),
    getPopularTags(10),
  ]);

  // Hero = the latest article from each of the first 5 categories. The 6th
  // category surfaces in its own dedicated section below to avoid duplication.
  const heroPicks = allCategories
    .slice(0, 5)
    .map((cat) => (categoryArticles[cat.slug] || [])[0])
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  const hero = heroPicks[0];
  const sideFeatures = heroPicks.slice(1, 5);
  const heroIds = new Set(heroPicks.map((a) => a.id));

  // Each section excludes whatever already appears in the hero, so a reader
  // never sees the same article twice on the home page.
  const categoryEntries = allCategories
    .map((cat) => ({
      ...cat,
      articles: (categoryArticles[cat.slug] || []).filter((a) => !heroIds.has(a.id)),
    }))
    .filter((cat) => cat.articles.length > 0);

  return (
    <>
      {/* sr-only h1 — owner decision: visible hero copy doesn't fit the
          magazine layout. Crawlers still get a strong h1 signal; sighted
          readers go straight from sticky header into the hero card (which
          uses h2 for the article title). Revisit if a brand hero is
          designed later. */}
      <h1 className="sr-only">AiFeed — wiadomości AI, badania i raporty po polsku</h1>

      <TrendingTags tags={trendingTags} />

      {/* Hero — 1 latest article from each of the top 5 categories */}
      {hero && (
        <section className="mx-auto max-w-7xl px-4 pt-6 pb-2 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7 xl:col-span-8 animate-fade-in-up">
              <ArticleCard article={hero} variant="featured" className="h-full min-h-[360px] lg:min-h-[480px]" />
            </div>

            {sideFeatures.length > 0 && (
              <div className="flex flex-col lg:col-span-5 xl:col-span-4 h-full border border-border/50 bg-card rounded-xl divide-y divide-border/50">
                {sideFeatures.map((article, i) => (
                  <div
                    key={article.id}
                    className="animate-fade-in-up flex-1 p-3"
                    style={{ "--stagger": i + 2 } as React.CSSProperties}
                  >
                    <ArticleCard article={article} variant="compact" className="h-full hover:bg-transparent hover:border-transparent" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Category sections — each shows the latest from a single category,
          alternating layouts for visual rhythm. */}
      {categoryEntries.map((cat, catIndex) => {
        const lead = cat.articles[0];
        const side = cat.articles.slice(1, 4);

        return (
          <section key={cat.slug} className="border-t border-border/40">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight">
                  {cat.name}
                </h2>
                <Link
                  href={`/kategoria/${cat.slug}`}
                  className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Wszystkie <ArrowRight className="size-3" />
                </Link>
              </div>

              {catIndex % 3 === 0 ? (
                /* Layout A: Lead default card + side compact cards */
                <div className="grid gap-6 lg:grid-cols-12">
                  <div className="lg:col-span-7">
                    {/* First category lead is the LCP candidate after the
                        hero featured card — eager-load it so Next.js can
                        preload the image and the browser doesn't wait for
                        layout to discover it. */}
                    <ArticleCard article={lead} className="h-full" priority={catIndex === 0} />
                  </div>
                  {side.length > 0 && (
                    <div className="flex flex-col gap-1 lg:col-span-5">
                      {side.map((article) => (
                        <ArticleCard key={article.id} article={article} variant="compact" />
                      ))}
                    </div>
                  )}
                </div>
              ) : catIndex % 3 === 1 ? (
                /* Layout B: 4-column compact grid */
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {cat.articles.slice(0, 4).map((article, idx) => (
                    <Link
                      key={article.id}
                      href={`/artykul/${article.slug}`}
                      className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card card-hover"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                        {article.thumbnail_url ? (
                          <Image
                            src={article.thumbnail_url}
                            alt={article.title}
                            fill
                            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                            sizes="(max-width: 768px) 50vw, 25vw"
                            loading={idx === 0 ? "eager" : "lazy"}
                          />
                        ) : (
                          <div className="h-full w-full bg-gradient-to-br from-muted to-muted/50" />
                        )}
                      </div>
                      <div className="p-3">
                        <h3 className="text-sm font-bold leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-300">
                          {article.title}
                        </h3>
                        {article.published_at && (
                          <time
                            dateTime={article.published_at}
                            className="mt-2 text-xs font-mono text-muted-foreground block"
                          >
                            {new Date(article.published_at).toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}
                          </time>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                /* Layout C: Featured wide card + grid below */
                <div className="space-y-5">
                  <ArticleCard
                    article={lead}
                    variant="featured"
                    className="min-h-[240px] lg:min-h-[300px]"
                    priority={catIndex === 0}
                  />
                  {side.length > 0 && (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {side.map((article) => (
                        <ArticleCard key={article.id} article={article} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        );
      })}

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: siteConfig.name,
            url: siteConfig.url,
            description: siteConfig.description,
            potentialAction: {
              "@type": "SearchAction",
              target: `${siteConfig.url}/szukaj?q={search_term_string}`,
              "query-input": "required name=search_term_string",
            },
          }),
        }}
      />
    </>
  );
}

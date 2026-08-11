import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Thumbnail } from "@/components/ui/thumbnail";
import { ArticleCard } from "@/components/articles/article-card";
import { TrendingTags } from "@/components/layout/trending-tags";
import { PreferredSourceCard } from "@/components/layout/preferred-source-card";
import { siteConfig } from "@/config/site";
import {
  getArticles,
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

// How many of the newest articles get guaranteed above-the-fold placement.
// 9 = a full publishing day at the 3×3 cron cadence, so nothing published
// today can "sink" below the category sections (decyzja właściciela:
// najnowsze zawsze na górze — stara rotacja per-kategoria potrafiła schować
// świeży artykuł w połowie strony).
const LATEST_COUNT = 9;

export default async function HomePage() {
  const allCategories = siteConfig.categories;
  const categorySlugs = allCategories.map((c) => c.slug);

  const [latest, categoryArticles, trendingTags] = await Promise.all([
    getArticles(LATEST_COUNT),
    getArticlesGroupedByCategory(categorySlugs, PER_CATEGORY),
    getPopularTags(10),
  ]);

  // Top of page = strictly newest-first: hero (1) + side column (4) + grid (4).
  const hero = latest[0];
  const sideFeatures = latest.slice(1, 5);
  const freshGrid = latest.slice(5, LATEST_COUNT);
  const latestIds = new Set(latest.map((a) => a.id));

  // Category sections exclude everything already shown above, so a reader
  // never sees the same article twice on the home page.
  const categoryEntries = allCategories
    .map((cat) => ({
      ...cat,
      articles: (categoryArticles[cat.slug] || []).filter((a) => !latestIds.has(a.id)),
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

      {/* Fresh grid — pozycje 6-9 z najnowszych. Razem z hero gwarantuje, że
          pełny dzień publikacji (9 artykułów) jest widoczny nad sekcjami
          kategorii. */}
      {freshGrid.length > 0 && (
        <section aria-label="Najnowsze artykuły" className="mx-auto max-w-7xl px-4 pt-4 pb-2 sm:px-6 lg:px-8">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {freshGrid.map((article) => (
              <Link
                key={article.id}
                href={`/artykul/${article.slug}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card card-hover"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                  {article.thumbnail_url ? (
                    <Thumbnail
                      src={article.thumbnail_url}
                      alt={article.title}
                      fill
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                      sizes="(max-width: 768px) 50vw, 25vw"
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
                          <Thumbnail
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
                /* Layout C: Featured wide card + grid below. (Bez `priority` —
                   catIndex===0 zawsze bierze Layout A, więc warunek był tu
                   martwy; sekcje C są głęboko poniżej fold.) */
                <div className="space-y-5">
                  <ArticleCard
                    article={lead}
                    variant="featured"
                    className="min-h-[240px] lg:min-h-[300px]"
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

      {/* Preferred Sources (ROADMAP §3.4) — dyskretny box na dole strony
          (decyzja właściciela: priorytet ma treść i ruch organiczny). */}
      <div className="pb-8">
        <PreferredSourceCard />
      </div>

      {/* JSON-LD. Bez `SearchAction` — Google wycofał sitelinks searchbox
          (2024), a nasz /szukaj jest noindex; blok był martwym sygnałem. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: siteConfig.name,
            url: siteConfig.url,
            description: siteConfig.description,
            inLanguage: "pl-PL",
            publisher: {
              "@type": "Organization",
              name: siteConfig.name,
              url: siteConfig.url,
            },
          }),
        }}
      />
    </>
  );
}

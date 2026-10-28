import { ArrowRight } from "lucide-react";
import Link from "next/link";
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
import { homeMetadata, websiteJsonLd } from "@/lib/seo";

// Home metadata pochodzi z centralnego helpera `lib/seo.ts`. Używa
// `title.absolute` żeby ominąć template z root layoutu (uniknięcie "AiFeed |
// AiFeed"). Wszystkie inne strony (kategoria/tag/artykuł) używają template
// poprzez wywołanie `categoryMetadata`/`tagMetadata`/`articleMetadata`.
export const metadata = homeMetadata();

export const revalidate = 300;

// How many articles to fetch per category. Enough to cover the biggest
// section layout (Layout C: 2 featured + 3 grid = 5) plus one spare for
// articles filtered out as duplicates of the newest-first block above.
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

      {/* Hero — najnowszy artykuł + kolumna 4 kolejnych (newest-first) */}
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
              <ArticleCard key={article.id} article={article} variant="tile" />
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
                  {cat.articles.slice(0, 4).map((article) => (
                    <ArticleCard key={article.id} article={article} variant="tile" />
                  ))}
                </div>
              ) : (
                /* Layout C: dwa featured 50/50 na desktopie (decyzja
                   właściciela 2026-08-12 — jeden wpis na całą szerokość
                   containera przytłaczał sekcję) + siatka niżej.
                   `priority={false}` jawnie: FeaturedCard domyślnie ustawia
                   priority=true (jest hero na home), a sekcje C leżą głęboko
                   pod foldem — dwa preloady obrazów psułyby LCP. */
                <div className="space-y-5">
                  <div className="grid gap-5 lg:grid-cols-2">
                    {cat.articles.slice(0, 2).map((article) => (
                      <ArticleCard
                        key={article.id}
                        article={article}
                        variant="featured"
                        priority={false}
                        className="min-h-[240px] lg:min-h-[280px]"
                      />
                    ))}
                  </div>
                  {cat.articles.length > 2 && (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {cat.articles.slice(2, 5).map((article) => (
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

      {/* WebSite JSON-LD (z `@id`, wydawca po referencji do organizacji
          z root layoutu) — zob. `websiteJsonLd` w lib/seo.ts. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteJsonLd()) }}
      />
    </>
  );
}

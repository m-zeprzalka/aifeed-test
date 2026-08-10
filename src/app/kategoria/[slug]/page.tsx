import { notFound } from "next/navigation";
import { Newspaper } from "lucide-react";
import { ArticleCard } from "@/components/articles/article-card";
import { Pagination } from "@/components/ui/pagination";
import { Breadcrumbs } from "@/components/articles/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { getCategoryBySlug, getArticlesByCategoryPaginated } from "@/lib/data";
import { siteConfig } from "@/config/site";
import { jsonLdScript } from "@/lib/jsonld";
import { categoryMetadata, notFoundMetadata, buildItemListJsonLd } from "@/lib/seo";
import type { Metadata } from "next";

export const revalidate = 300;

const PAGE_SIZE = 12;

/**
 * Uwaga nt. renderowania: strona czyta `searchParams` (paginacja `?page=N`),
 * a to Dynamic API — route renderuje się per-request mimo `revalidate`.
 * Koszt jest kontrolowany: `getCategoryBySlug` jest deduplikowane przez
 * React cache() (1 query zamiast 3), a paginacja poza zakresem kończy się
 * natychmiastowym notFound(). Przejście na ścieżkową paginację
 * (`/kategoria/[slug]/strona/[nr]`) przywróciłoby pełne ISR — punkt w
 * ROADMAP.md, wymaga 301 dla starych URL-i `?page=`.
 */
export function generateStaticParams() {
  return siteConfig.categories.map((c) => ({ slug: c.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ slug }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const pageNum = Math.max(1, parseInt(pageParam || "1", 10) || 1);
  const category = await getCategoryBySlug(slug);
  if (!category) return notFoundMetadata("Kategoria nie znaleziona");
  return categoryMetadata(category, pageNum);
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const pageNum = Math.max(1, parseInt(pageParam || "1", 10) || 1);

  const [category, paginated] = await Promise.all([
    getCategoryBySlug(slug),
    getArticlesByCategoryPaginated(slug, PAGE_SIZE, pageNum),
  ]);

  if (!category) notFound();

  const { articles, page, totalPages, total, hasPrev, hasNext } = paginated;

  // Puste strony paginacji (?page=9999) muszą być twardym 404. Bez tego każda
  // liczba całkowita to osobny, indeksowalny, pusty URL z self-canonical —
  // nieskończona przestrzeń thin content (soft-404), dokładnie sygnał
  // "scaled content abuse", którego unikamy.
  if (articles.length === 0 && page > 1) notFound();

  // Spójne `CollectionPage > ItemList` (taki sam wzorzec jak na stronie tagu).
  // `numberOfItems` ustawiamy na pełną liczbę artykułów w kategorii (nie tylko
  // w bieżącej stronie paginacji) — Google używa tego do sygnalizacji że
  // kolekcja jest stronicowana.
  const collectionJsonLd = articles.length > 0
    ? buildItemListJsonLd({
        name: category.name,
        description: category.description || `Artykuły z kategorii ${category.name}`,
        url:
          page > 1
            ? `${siteConfig.url}/kategoria/${category.slug}?page=${page}`
            : `${siteConfig.url}/kategoria/${category.slug}`,
        totalItems: total,
        items: articles.map((a) => ({ slug: a.slug, title: a.title })),
        startPosition: (page - 1) * PAGE_SIZE,
      })
    : null;

  return (
    <>
      {collectionJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(collectionJsonLd) }}
        />
      )}

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <Breadcrumbs
          items={[
            { label: "Strona główna", href: "/" },
            { label: category.name },
          ]}
        />

        {/* Header */}
        <div className="mb-8 mt-3">
          <span className="mb-2 inline-block text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">
            Kategoria
          </span>
          <h1 className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight text-balance">
            {category.name}
          </h1>
          {category.description && (
            <p className="mt-3 text-lg text-muted-foreground max-w-xl">
              {category.description}
            </p>
          )}
        </div>

        {articles.length > 0 ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((article, i) => (
                <div
                  key={article.id}
                  className="animate-fade-in-up"
                  style={{ "--stagger": Math.min(i + 1, 6) } as React.CSSProperties}
                >
                  <ArticleCard article={article} />
                </div>
              ))}
            </div>

            <Pagination
              basePath={`/kategoria/${slug}`}
              page={page}
              totalPages={totalPages}
              total={total}
              hasPrev={hasPrev}
              hasNext={hasNext}
            />
          </>
        ) : (
          <EmptyState
            icon={Newspaper}
            title="Jeszcze brak artykułów w tej kategorii"
            description="Wpadnij tu niedługo po nowe treści."
          />
        )}
      </div>
    </>
  );
}

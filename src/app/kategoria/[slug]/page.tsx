import { notFound } from "next/navigation";
import { Newspaper } from "lucide-react";
import { ArticleGrid } from "@/components/articles/article-grid";
import { Breadcrumbs } from "@/components/articles/breadcrumbs";
import { ListingHeader } from "@/components/articles/listing-header";
import { Pagination } from "@/components/ui/pagination";
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
 * a to Dynamic API — route renderuje się per-request mimo `revalidate`
 * (dlatego bez `generateStaticParams` — i tak by go ignorowała). Koszt jest
 * kontrolowany: `getCategoryBySlug` jest deduplikowane przez React cache(),
 * nieznany slug odcina layout.tsx (twarde 404), a paginacja poza zakresem
 * kończy się notFound() — przez loading.tsx już PO wysłaniu nagłówków, więc
 * ze statusem 200 + noindex (metadane niżej nie dają przy tym canonicala ani
 * "index"). Prawdziwe 404 i pełne ISR da ścieżkowa paginacja
 * (`/kategoria/[slug]/strona/[nr]`) — ROADMAP, backlog 7.2.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ slug }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const pageNum = Math.max(1, parseInt(pageParam || "1", 10) || 1);
  const [category, paginated] = await Promise.all([
    getCategoryBySlug(slug),
    getArticlesByCategoryPaginated(slug, PAGE_SIZE, pageNum),
  ]);
  if (!category) return notFoundMetadata("Kategoria nie znaleziona");
  // Strona poza zakresem: noindex BEZ canonicala/"index, follow" — inaczej
  // obok noindexu z notFound() szły sprzeczne sygnały.
  if (paginated.articles.length === 0 && pageNum > 1) return notFoundMetadata("Strona nie istnieje");
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

  // Puste strony paginacji (?page=9999) → notFound() (noindex, bez canonicala
  // — zob. generateMetadata). Bez tego każda liczba całkowita byłaby osobnym,
  // indeksowalnym, pustym URL-em z self-canonical — nieskończona przestrzeń
  // thin content, dokładnie sygnał "scaled content abuse", którego unikamy.
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

        <ListingHeader
          eyebrow="Kategoria"
          title={category.name}
          description={category.description || undefined}
        />

        {articles.length > 0 ? (
          <>
            <ArticleGrid articles={articles} />

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

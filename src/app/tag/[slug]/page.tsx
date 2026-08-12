import { notFound } from "next/navigation";
import { Hash } from "lucide-react";
import { ArticleGrid } from "@/components/articles/article-grid";
import { Breadcrumbs } from "@/components/articles/breadcrumbs";
import { ListingHeader } from "@/components/articles/listing-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { getTagBySlug, getArticlesByTagPaginated } from "@/lib/data";
import { siteConfig } from "@/config/site";
import { jsonLdScript } from "@/lib/jsonld";
import { pluralize } from "@/lib/search-utils";
import { tagMetadata, notFoundMetadata, buildItemListJsonLd } from "@/lib/seo";
import type { Metadata } from "next";

// Strony tagów są `noindex, follow` (zob. `tagMetadata` w `lib/seo.ts`) —
// nie prerenderujemy ich w build time; on-demand ISR w zupełności wystarcza
// dla ruchu użytkowników z linków tagowych pod artykułami.
export const revalidate = 300;

// Ten sam rozmiar strony co na /kategoria — spójna nawigacja listingów.
const PAGE_SIZE = 12;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const [{ slug }, { page: pageParam }] = await Promise.all([params, searchParams]);
  const pageNum = Math.max(1, parseInt(pageParam || "1", 10) || 1);
  const tag = await getTagBySlug(slug);
  if (!tag) return notFoundMetadata("Tag nie znaleziony");
  return tagMetadata(tag, pageNum);
}

export default async function TagPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const pageNum = Math.max(1, parseInt(pageParam || "1", 10) || 1);

  const [tag, paginated] = await Promise.all([
    getTagBySlug(slug),
    getArticlesByTagPaginated(slug, PAGE_SIZE, pageNum),
  ]);

  if (!tag) notFound();

  const { articles, page, totalPages, total, hasPrev, hasNext } = paginated;

  // Puste strony paginacji (?page=9999) → twarde 404, tak samo jak na
  // kategorii (żadnej nieskończonej przestrzeni pustych URL-i).
  if (articles.length === 0 && page > 1) notFound();

  const collectionJsonLd = articles.length > 0
    ? buildItemListJsonLd({
        name: `#${tag.name}`,
        description: `Artykuły oznaczone tagiem #${tag.name}`,
        url:
          page > 1
            ? `${siteConfig.url}/tag/${tag.slug}?page=${page}`
            : `${siteConfig.url}/tag/${tag.slug}`,
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
      {/* Breadcrumbs — spójność z kategorią. JSON-LD `BreadcrumbList`
          generowane wewnątrz komponentu Breadcrumbs. */}
      <Breadcrumbs
        items={[
          { label: "Strona główna", href: "/" },
          { label: `#${tag.name}` },
        ]}
      />

      <ListingHeader
        eyebrow="Tag"
        title={
          <>
            <span className="text-primary">#</span>
            {tag.name}
          </>
        }
        description={`${total} ${pluralize(total, ["artykuł", "artykuły", "artykułów"])} z tym tagiem`}
      />

      {articles.length > 0 ? (
        <>
          <ArticleGrid articles={articles} />

          <Pagination
            basePath={`/tag/${slug}`}
            page={page}
            totalPages={totalPages}
            total={total}
            hasPrev={hasPrev}
            hasNext={hasNext}
          />
        </>
      ) : (
        <EmptyState
          icon={Hash}
          title="Jeszcze brak artykułów z tym tagiem"
          description="Wpadnij tu niedługo po nowe treści."
        />
      )}
    </div>
    </>
  );
}

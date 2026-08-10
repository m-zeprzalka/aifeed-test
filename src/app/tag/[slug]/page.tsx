import { notFound } from "next/navigation";
import { Hash } from "lucide-react";
import { ArticleCard } from "@/components/articles/article-card";
import { Breadcrumbs } from "@/components/articles/breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";
import { getTagBySlug, getArticlesByTag } from "@/lib/data";
import { siteConfig } from "@/config/site";
import { jsonLdScript } from "@/lib/jsonld";
import { pluralize } from "@/lib/search-utils";
import { tagMetadata, notFoundMetadata, buildItemListJsonLd } from "@/lib/seo";
import type { Metadata } from "next";

// Strony tagów są `noindex, follow` (zob. `tagMetadata` w `lib/seo.ts`) —
// nie prerenderujemy ich w build time; on-demand ISR w zupełności wystarcza
// dla ruchu użytkowników z linków tagowych pod artykułami.
export const revalidate = 300;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const tag = await getTagBySlug(slug);
  if (!tag) return notFoundMetadata("Tag nie znaleziony");
  return tagMetadata(tag);
}

export default async function TagPage({ params }: PageProps) {
  const { slug } = await params;
  const tag = await getTagBySlug(slug);
  if (!tag) notFound();

  const articles = await getArticlesByTag(slug);

  const collectionJsonLd = articles.length > 0
    ? buildItemListJsonLd({
        name: `#${tag.name}`,
        description: `Artykuły oznaczone tagiem #${tag.name}`,
        url: `${siteConfig.url}/tag/${tag.slug}`,
        totalItems: articles.length,
        items: articles.map((a) => ({ slug: a.slug, title: a.title })),
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

      {/* Header */}
      <div className="mb-8 mt-3">
        <span className="mb-2 inline-block text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">
          Tag
        </span>
        <h1 className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight text-balance">
          <span className="text-primary">#</span>{tag.name}
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          {articles.length} {pluralize(articles.length, ["artykuł", "artykuły", "artykułów"])} z tym tagiem
        </p>
      </div>

      {articles.length > 0 ? (
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

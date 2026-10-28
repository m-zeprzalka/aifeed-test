import Link from "next/link";
import { Clock } from "lucide-react";
import { Thumbnail } from "@/components/ui/thumbnail";
import { ImageFallback } from "@/components/ui/image-fallback";
import type { ArticleCardData } from "@/lib/data";
import { formatDateShort } from "@/lib/dates";

interface ArticleCardProps {
  article: ArticleCardData;
  variant?: "default" | "featured" | "compact" | "tile";
  className?: string;
  /**
   * Set on cards rendered above the fold. Forwards to `<Image priority />`,
   * which makes Next.js skip lazy-loading and emit a `<link rel="preload">`
   * for the image. Use sparingly — only the actual LCP candidate(s).
   */
  priority?: boolean;
}

export function ArticleCard({ article, variant = "default", className = "", priority }: ArticleCardProps) {
  // FeaturedCard defaults to priority=true (it's almost always the LCP — hero
  // on home, lead on Layout C). DefaultCard defaults to false (lazy). Explicit
  // `priority` overrides both. Using `??` here so a missing prop falls through
  // to the variant's natural default rather than forcing `false`.
  if (variant === "featured") return <FeaturedCard article={article} className={className} priority={priority ?? true} />;
  if (variant === "compact") return <CompactCard article={article} className={className} />;
  if (variant === "tile") return <TileCard article={article} className={className} priority={priority ?? false} />;
  return <DefaultCard article={article} className={className} priority={priority ?? false} />;
}

function FeaturedCard({ article, className, priority = true }: { article: ArticleCardProps["article"]; className: string; priority?: boolean }) {
  return (
    <Link
      href={`/artykul/${article.slug}`}
      className={`group relative flex flex-col h-full w-full overflow-hidden rounded-xl bg-card card-hover ${className}`}
    >
      <div className="absolute inset-0 overflow-hidden">
        {article.thumbnail_url ? (
          <Thumbnail
            src={article.thumbnail_url}
            alt={article.title}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 100vw, 60vw"
            priority={priority}
          />
        ) : (
          <ImageFallback />
        )}
      </div>
      <div className="gradient-overlay absolute inset-0 z-10" />
      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7 z-20 flex flex-col justify-end h-full items-start">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {/* Marker showing why this card is at the top of the page. Distinct
              from the category pill so a reader instantly sees "polecany" vs.
              "kategoria" without having to read both labels. */}
          <span className="rounded-md px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white bg-primary/90 border border-primary/40">
            Polecane
          </span>
          {article.category && (
            <span className="rounded-md px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest text-white/90 bg-white/15 backdrop-blur-md border border-white/10">
              {article.category.name}
            </span>
          )}
        </div>
        <h2 className="text-xl sm:text-2xl lg:text-3xl text-white line-clamp-3">
          {article.title}
        </h2>
        <p className="hidden md:block text-sm text-white/80 line-clamp-2 mt-3 max-w-2xl">
          {article.excerpt}
        </p>
        <div className="flex items-center gap-2.5 text-xs font-mono tracking-wide text-white/60 mt-4">
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {article.reading_time} min
          </span>
          <span className="size-0.5 rounded-full bg-white/30" />
          {article.published_at ? (
            <time dateTime={article.published_at}>{formatDate(article.published_at)}</time>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function DefaultCard({ article, className, priority = false }: { article: ArticleCardProps["article"]; className: string; priority?: boolean }) {
  return (
    <Link
      href={`/artykul/${article.slug}`}
      className={`group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card card-hover ${className}`}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {article.thumbnail_url ? (
          <Thumbnail
            src={article.thumbnail_url}
            alt={article.title}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            sizes="(max-width: 768px) 100vw, 33vw"
            priority={priority}
          />
        ) : (
          <ImageFallback />
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        {article.category && (
          <span className="mb-2 inline-block w-fit text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
            {article.category.name}
          </span>
        )}
        <h3 className="mb-2 text-base line-clamp-2 group-hover:text-primary transition-colors duration-300">
          {article.title}
        </h3>
        <p className="mb-4 text-sm text-muted-foreground leading-relaxed line-clamp-2 flex-1">
          {article.excerpt}
        </p>
        <div className="flex items-center gap-3 text-xs font-mono tracking-wide text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="size-3" />
            {article.reading_time} min
          </span>
          <span className="size-0.5 rounded-full bg-muted-foreground/30" />
          {article.published_at ? (
            <time dateTime={article.published_at}>{formatDate(article.published_at)}</time>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function CompactCard({ article, className }: { article: ArticleCardProps["article"]; className: string }) {
  return (
    <Link
      href={`/artykul/${article.slug}`}
      className={`group flex gap-4 rounded-lg border border-transparent p-2 transition-colors hover:bg-muted/40 hover:border-border/30 ${className}`}
    >
      <div className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-muted">
        {article.thumbnail_url ? (
          <Thumbnail src={article.thumbnail_url} alt={article.title} fill className="object-cover" sizes="96px" />
        ) : (
          <ImageFallback />
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center min-w-0 py-1">
        {article.category && (
          <span className="mb-1.5 text-[9px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
            {article.category.name}
          </span>
        )}
        <h4 className="text-sm font-bold leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-300 pr-2">
          {article.title}
        </h4>
        <div className="mt-2 flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-2.5" aria-hidden="true" />
            {article.reading_time} min
          </span>
          {article.published_at && (
            <>
              <span className="size-0.5 rounded-full bg-muted-foreground/30" aria-hidden="true" />
              <time dateTime={article.published_at}>
                {formatDate(article.published_at)}
              </time>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * Kafelek: obraz 16:10 + tytuł + data. Siatki 4-kolumnowe na home (świeże
 * pozycje 6–9 i sekcje kategorii w układzie B) — wcześniej dwie kopie tego
 * samego markupu w page.tsx.
 */
function TileCard({ article, className, priority = false }: { article: ArticleCardProps["article"]; className: string; priority?: boolean }) {
  return (
    <Link
      href={`/artykul/${article.slug}`}
      className={`group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card card-hover ${className}`}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {article.thumbnail_url ? (
          <Thumbnail
            src={article.thumbnail_url}
            alt={article.title}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            priority={priority}
          />
        ) : (
          <ImageFallback />
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm font-bold leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-300">
          {article.title}
        </h3>
        {article.published_at && (
          <time dateTime={article.published_at} className="mt-2 text-xs font-mono text-muted-foreground block">
            {formatDate(article.published_at)}
          </time>
        )}
      </div>
    </Link>
  );
}

// Rok tylko dla artykułów spoza bieżącego roku (tekst z 2025 nie może
// wyglądać na tegoroczny); strefa Europe/Warsaw — zob. lib/dates.ts.
function formatDate(dateStr: string | null): string {
  return dateStr ? formatDateShort(dateStr) : "";
}

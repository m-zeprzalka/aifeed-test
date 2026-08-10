import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { pluralize } from "@/lib/search-utils";

interface PaginationProps {
  basePath: string;
  page: number;
  totalPages: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  className?: string;
}

function hrefForPage(basePath: string, page: number): string {
  return page <= 1 ? basePath : `${basePath}?page=${page}`;
}

const baseStyle =
  "inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors";
const activeStyle =
  "border-border/50 bg-card text-muted-foreground hover:text-foreground hover:bg-muted";
const disabledStyle =
  "border-border/30 text-muted-foreground/40 cursor-not-allowed";

export function Pagination({
  basePath,
  page,
  totalPages,
  total,
  hasPrev,
  hasNext,
  className,
}: PaginationProps) {
  if (!hasPrev && !hasNext) return null;

  return (
    <nav
      aria-label="Paginacja"
      className={cn("flex items-center justify-between gap-4 pt-10", className)}
    >
      <div className="text-[12px] font-mono text-muted-foreground/85">
        {total > 0 && `${total} ${pluralize(total, ["artykuł", "artykuły", "artykułów"])} · str. ${page}/${totalPages}`}
      </div>

      <div className="flex items-center gap-2">
        {hasPrev ? (
          <Link
            href={hrefForPage(basePath, page - 1)}
            rel="prev"
            aria-label="Przejdź do nowszych artykułów"
            className={cn(baseStyle, activeStyle)}
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Nowsze
          </Link>
        ) : (
          // Disabled <button> instead of <span aria-disabled>: the span is
          // skipped by keyboard navigation and screen readers don't hint that
          // it's an actionable control. <button disabled> is the WCAG-correct
          // pattern.
          <button
            type="button"
            disabled
            aria-label="Brak nowszych artykułów"
            className={cn(baseStyle, disabledStyle)}
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Nowsze
          </button>
        )}

        {hasNext ? (
          <Link
            href={hrefForPage(basePath, page + 1)}
            rel="next"
            aria-label="Przejdź do starszych artykułów"
            className={cn(baseStyle, activeStyle)}
          >
            Starsze
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-label="Brak starszych artykułów"
            className={cn(baseStyle, disabledStyle)}
          >
            Starsze
            <ChevronRight className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </nav>
  );
}

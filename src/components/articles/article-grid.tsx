import { ArticleCard } from "@/components/articles/article-card";
import type { ArticleWithRelations } from "@/lib/data";
import { cn } from "@/lib/utils";

interface ArticleGridProps {
  articles: ArticleWithRelations[];
  /** Nadpisania kolumn (twMerge), np. "lg:grid-cols-2" na /szukaj. */
  className?: string;
}

// Wspólna siatka listingów artykułów (kategoria / tag / szukaj) z animacją
// wejścia. Stagger jest ograniczony do 6 kroków, żeby 7+ karta nie czekała
// pół sekundy na pojawienie się — wizualnie i tak nie widać różnicy.
export function ArticleGrid({ articles, className }: ArticleGridProps) {
  return (
    <div className={cn("grid gap-5 sm:grid-cols-2 lg:grid-cols-3", className)}>
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
  );
}

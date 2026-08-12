"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search as SearchIcon, FileQuestion, AlertTriangle } from "lucide-react";
import { ArticleGrid } from "@/components/articles/article-grid";
import { EmptyState } from "@/components/ui/empty-state";
import type { ArticleWithRelations } from "@/lib/data";
import { pluralize, SEARCH_QUERY_MAX_LENGTH } from "@/lib/search-utils";
import { useArticleSearch } from "@/lib/hooks/use-article-search";

export default function SearchPage() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  // Cała logika debounce/abort/error siedzi w hooku współdzielonym
  // z SearchModal — zob. `src/lib/hooks/use-article-search.ts`.
  const { results, loading, error, searched } = useArticleSearch<ArticleWithRelations>(query, 300);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 text-center">
        <h1 className="mb-4 text-2xl sm:text-3xl font-heading font-extrabold tracking-tight">
          Wyszukiwarka
        </h1>
        <div className="relative mx-auto max-w-lg">
          <label htmlFor="search-input" className="sr-only">Szukaj artykułów</label>
          <SearchIcon className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
          <input
            id="search-input"
            type="search"
            placeholder="Szukaj newsów AI, modeli, badań..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            className="w-full h-10 rounded-lg border border-border bg-card pl-10 pr-4 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            autoFocus
          />
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {searched && !error && (
          <p className="mb-6 text-sm text-muted-foreground">
            {loading
              ? "Szukam..."
              : `${results.length} ${pluralize(results.length)} dla "${query}"`}
          </p>
        )}
      </div>

      {error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Wyszukiwanie chwilowo niedostępne"
          description="Zbyt wiele zapytań albo problem z połączeniem. Odczekaj chwilę i spróbuj ponownie."
        />
      ) : results.length > 0 ? (
        // Kontener /szukaj to max-w-4xl — trzy kolumny z defaultu ArticleGrid
        // byłyby za ciasne, stąd nadpisanie do dwóch.
        <ArticleGrid articles={results} className="lg:grid-cols-2" />
      ) : searched && !loading ? (
        <EmptyState
          icon={FileQuestion}
          title={`Nic nie znaleźliśmy dla „${query}".`}
          description="Sprawdź pisownię, użyj krótszej frazy albo przejrzyj kategorie z menu."
        />
      ) : null}
    </div>
  );
}

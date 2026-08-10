"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Loader2, ArrowRight, Clock, X } from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SEARCH_QUERY_MAX_LENGTH } from "@/lib/search-utils";
import { useArticleSearch } from "@/lib/hooks/use-article-search";

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
}

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RECENT_KEY = "aifeed:recent-searches";
const MAX_RECENT = 5;

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((q): q is string => typeof q === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function pushRecent(q: string): string[] {
  const trimmed = q.trim();
  if (!trimmed) return readRecent();
  const current = readRecent().filter((existing) => existing !== trimmed);
  const next = [trimmed, ...current].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode, quota) — recent is non-critical
  }
  return next;
}

export function SearchModal({ open, onOpenChange }: SearchModalProps) {
  const [query, setQuery] = useState("");
  // Debounce/abort/error — wspólny hook z /szukaj
  // (`src/lib/hooks/use-article-search.ts`).
  const { results, loading, error } = useArticleSearch<SearchResult>(query, 400);
  // Lazy initializer: na serwerze `readRecent()` zwraca [] (guard), na
  // kliencie czyta localStorage raz przy mount. DOM się nie różni (modal
  // zamknięty = brak treści), więc brak hydration mismatch. Po commit/clear
  // stan aktualizują handlery — bez efektu z synchronicznym setState
  // (reguła `react-hooks/set-state-in-effect`).
  const [recent, setRecent] = useState<string[]>(() => readRecent());

  const commitRecent = useCallback((q: string) => {
    setRecent(pushRecent(q));
  }, []);

  const clearRecent = useCallback(() => {
    try {
      window.localStorage.removeItem(RECENT_KEY);
    } catch {
      // ignore
    }
    setRecent([]);
  }, []);

  // Reset po zamknięciu — z opóźnieniem, żeby treść nie mignęła w trakcie
  // animacji zamykania. Timer MUSI być sprzątany: ponowne otwarcie w <200ms
  // kasowało query, które użytkownik właśnie zaczął wpisywać.
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setQuery(""), 200);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-xl p-0 gap-0 overflow-hidden bg-background border-border/60 shadow-2xl">
        <DialogHeader className="p-0 border-b border-border/50">
          <DialogTitle className="sr-only">Wyszukaj artykuły</DialogTitle>
          <div className="flex items-center px-4 py-3">
            <Search className="size-5 text-muted-foreground shrink-0 mr-3" />
            <input
              type="search"
              aria-label="Szukaj artykułów"
              placeholder="Szukaj newsów AI, modeli, raportów..."
              className="flex-1 bg-transparent border-none outline-none text-base placeholder:text-muted-foreground"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={SEARCH_QUERY_MAX_LENGTH}
              autoFocus
            />
            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground ml-3 shrink-0" />}
          </div>
        </DialogHeader>

        <div aria-live="polite" className="max-h-[300px] sm:max-h-[400px] overflow-y-auto no-scrollbar pb-2">
          {query.trim() === "" ? (
            recent.length > 0 ? (
              <div className="py-2">
                <div className="flex items-center justify-between px-4 py-2">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                    Ostatnie wyszukiwania
                  </p>
                  <button
                    type="button"
                    onClick={clearRecent}
                    className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 hover:text-foreground transition-colors"
                  >
                    Wyczyść
                  </button>
                </div>
                <ul className="flex flex-col">
                  {recent.map((q) => (
                    <li key={q} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => setQuery(q)}
                        className="flex-1 flex items-center gap-3 px-4 py-2 text-left text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                      >
                        <Clock className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                        <span className="truncate">{q}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = recent.filter((r) => r !== q);
                          try {
                            window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
                          } catch {
                            // ignore
                          }
                          setRecent(next);
                        }}
                        aria-label={`Usuń „${q}" z ostatnich wyszukiwań`}
                        className="px-3 py-2 text-muted-foreground/40 hover:text-foreground transition-colors"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="px-6 py-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Zacznij pisać aby odnaleźć tematy o sztucznej inteligencji...
                </p>
              </div>
            )
          ) : results.length > 0 ? (
            <div className="flex flex-col">
              {results.map((result) => (
                <Link
                  key={result.id}
                  href={`/artykul/${result.slug}`}
                  onClick={() => {
                    commitRecent(query);
                    onOpenChange(false);
                  }}
                  className="px-4 py-3 hover:bg-muted/50 transition-colors flex items-start gap-4 group border-b border-border/20 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                      {result.title}
                    </h4>
                    <p className="text-xs text-muted-foreground truncate opacity-80 mt-1">
                      {result.excerpt}
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0 mt-1" />
                </Link>
              ))}
            </div>
          ) : error ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Wyszukiwanie chwilowo niedostępne. Spróbuj za moment.
              </p>
            </div>
          ) : !loading && query.trim() !== "" ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Brak wyników dla &quot;{query}&quot;. Spróbuj inaczej.
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

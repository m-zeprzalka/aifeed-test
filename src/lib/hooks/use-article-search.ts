"use client";

import { useEffect, useState } from "react";

export interface ArticleSearchState<T> {
  results: T[];
  loading: boolean;
  /** Odpowiedź nie-OK (np. 429 rate limit) albo błąd sieci. */
  error: boolean;
  /** Czy wykonano przynajmniej jedno wyszukiwanie dla bieżącego query. */
  searched: boolean;
}

interface InternalState<T> extends ArticleSearchState<T> {
  /** Query, dla którego te wyniki są aktualne. */
  forQuery: string;
}

const idleState = { results: [], loading: false, error: false, searched: false };

/**
 * Wspólna logika debounced-search dla `/szukaj` i SearchModal. Jedno miejsce
 * na wszystkie pułapki, które wcześniej były rozwiązane tylko w modalu (albo
 * nigdzie):
 *
 * - AbortController — nowe query anuluje poprzedni request; wolna odpowiedź
 *   dla "gp" nie nadpisze wyników dla "gpt" (race condition).
 * - `res.ok` check — API zwraca `{ error }` z 429 przy rate limicie; bez
 *   checku `results.map` rzucał TypeError i wywalał całą stronę.
 * - Walidacja kształtu odpowiedzi (Array.isArray) + catch na błędy sieci.
 * - Cleanup timera debounce przy unmount/zmianie query.
 *
 * Stan "loading" i "puste query" jest DERYWOWANY w renderze (stan wewnętrzny
 * nosi `forQuery`) — zero synchronicznych setState w efektach (reguła
 * `react-hooks/set-state-in-effect` React 19).
 */
export function useArticleSearch<T>(query: string, debounceMs = 300): ArticleSearchState<T> {
  const [state, setState] = useState<InternalState<T>>({ ...idleState, forQuery: "" });

  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;

    const abortController = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: abortController.signal,
        });
        if (!res.ok) {
          setState({ results: [], loading: false, error: true, searched: true, forQuery: trimmed });
          return;
        }
        const data: unknown = await res.json();
        setState({
          results: Array.isArray(data) ? (data as T[]) : [],
          loading: false,
          error: false,
          searched: true,
          forQuery: trimmed,
        });
      } catch (err) {
        // Abort = nowszy effect przejął — jego stan derywuje się z forQuery.
        if ((err as Error).name === "AbortError") return;
        console.error("Search failed:", err);
        setState({ results: [], loading: false, error: true, searched: true, forQuery: trimmed });
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [trimmed, debounceMs]);

  if (!trimmed) return idleState;
  // Wyniki w stanie należą do innego query → debounce/fetch w toku.
  if (state.forQuery !== trimmed) {
    return { results: [], loading: true, error: false, searched: false };
  }
  return state;
}

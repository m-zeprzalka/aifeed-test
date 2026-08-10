-- Migration 004 — full-text search dla artykułów (P1-9)
-- =============================================================================
-- Aplikuj w Supabase SQL Editor. Idempotentne — IF NOT EXISTS / OR REPLACE.
--
-- Cel: zastąpić sekwencyjny scan w `searchArticles` (`.or("title.ilike.%X%, excerpt.ilike.%X%")`)
-- indeksowanym wyszukiwaniem przez tsvector + GIN. Korzyść: O(log n) zamiast
-- O(n), praktycznie ~50-100× szybciej przy 1000+ artykułów.
--
-- Plus trigram GIN na title — pozwala znaleźć artykuł nawet przy literówce
-- ("openi" znajdzie "openai") jako fallback gdy tsquery zwróci 0 wyników.
--
-- WAŻNE: `GENERATED ALWAYS AS ... STORED` znaczy, że PostgreSQL JEDNORAZOWO
-- przy aplikacji migracji przepisze tabelę i wyliczy search_vector dla
-- każdego wiersza. UWAGA: `ADD COLUMN ... STORED` bierze ACCESS EXCLUSIVE
-- lock (pełny rewrite tabeli), a `CREATE INDEX` bez CONCURRENTLY blokuje
-- zapisy na czas budowy. Przy <10k artykułów to sekundy — bez znaczenia;
-- przy dużej tabeli aplikuj poza oknem crona (05/11/17 UTC). Każdy nowy
-- INSERT/UPDATE generuje vector automatycznie — bez triggerów, bez kodu.
--
-- Konfiguracja `simple` (nie `polish`) — Postgres standardowo nie ma stemera
-- polskiego. `simple` znaczy "bez lematyzacji", czyli "modele" nie znajdzie
-- "model". To akceptowalny tradeoff dla MVP; pełna polska lematyzacja
-- wymagałaby ekstensji `unaccent` + custom dictionary.
-- =============================================================================

-- Ekstensja pg_trgm dla trigram similarity search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Computed column `search_vector` — wagi:
--   A (najwyższa) = title
--   B            = excerpt
-- to_tsvector zwraca lexemes (po tokenizacji i lowercase). `coalesce` chroni
-- przed NULL — tytuł nigdy nie jest null w schemacie, ale safety net.
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B')
  ) STORED;

-- Główny indeks dla `to_tsquery` / `plainto_tsquery` / `websearch_to_tsquery`.
-- GIN na tsvector to standard — wspiera operator @@ i jest hot-aktualizowany
-- automatycznie przy zmianach STORED column.
CREATE INDEX IF NOT EXISTS idx_articles_fts
  ON articles USING GIN (search_vector);

-- Trigram indeks na title — fallback dla queries które nie pasują do
-- tsquery (literówki, częściowe dopasowania). PostgREST `.ilike` używa tego
-- indeksu automatycznie gdy query > 3 znaki.
CREATE INDEX IF NOT EXISTS idx_articles_title_trgm
  ON articles USING GIN (title gin_trgm_ops);

-- =============================================================================
-- Quick smoke test po migracji:
--   SELECT id, title, ts_rank(search_vector, query) AS rank
--   FROM articles, plainto_tsquery('simple', 'openai') query
--   WHERE search_vector @@ query
--   ORDER BY rank DESC LIMIT 5;
--
-- Sprawdź też explain — powinien używać `idx_articles_fts`:
--   EXPLAIN ANALYZE SELECT * FROM articles WHERE search_vector @@ to_tsquery('simple', 'gpt');
-- =============================================================================

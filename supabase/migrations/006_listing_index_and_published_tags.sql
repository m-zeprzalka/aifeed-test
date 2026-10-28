-- Migracja 006 — indeks pod listy kategorii + popular_tags liczone wyłącznie
-- z OPUBLIKOWANYCH artykułów.
-- =============================================================================
-- Idempotentna (CREATE … IF NOT EXISTS, CREATE OR REPLACE). Wymaga 001
-- (definicja popular_tags) — uruchamiaj migracje po kolei: 001 → 006.
--
-- 1. Częściowy indeks złożony dla `getArticlesByCategoryPaginated` i sekcji
--    kategorii na home: WHERE is_published AND category_id = ? ORDER BY
--    published_at DESC, id DESC. Dotąd planner łączył `idx_articles_category`
--    z sortowaniem w pamięci — przy ~2k wierszy niezauważalne, przy 10k+
--    (horyzont ~3 lata przy 9 art./dzień) to różnica rzędu wielkości.
-- 2. `popular_tags` liczy tylko artykuły z `is_published = true`. Tagi
--    artykułów zdjętych w /admin (przegląd wsteczny, ROADMAP) nie mogą
--    sterować paskiem "Trendy" ani katalogiem tagów w prompcie pipeline'u.
--
-- Weryfikacja: supabase/verify.sql
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_articles_category_published
  ON articles (category_id, published_at DESC, id DESC)
  WHERE is_published;

-- `SET search_path = ''` + nazwy kwalifikowane schematem — odporność na
-- podmianę search_path (Supabase advisor `function_search_path_mutable`).
CREATE OR REPLACE FUNCTION popular_tags(tag_limit INT)
RETURNS TABLE (id UUID, name TEXT, slug TEXT, count BIGINT)
SET search_path = ''
AS $$
  SELECT t.id, t.name, t.slug, COUNT(*) AS count
  FROM public.article_tags at
  JOIN public.tags t ON at.tag_id = t.id
  JOIN public.articles a ON a.id = at.article_id
  WHERE a.is_published
  GROUP BY t.id, t.name, t.slug
  ORDER BY count DESC, t.name ASC
  LIMIT tag_limit;
$$ LANGUAGE SQL STABLE;

-- Smoke test (po migracji):
--   SELECT * FROM popular_tags(10);
--   EXPLAIN SELECT id FROM articles
--     WHERE is_published AND category_id = (SELECT id FROM categories WHERE slug = 'biznes')
--     ORDER BY published_at DESC, id DESC LIMIT 12;
--   → oczekiwany "Index Scan using idx_articles_category_published"

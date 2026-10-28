-- AiFeed — diagnostyka schematu (TYLKO ODCZYT, bezpieczne na produkcji)
-- =============================================================================
-- Supabase Dashboard → SQL Editor → wklej → Run. Każdy wiersz to jeden
-- element schematu i migracja, która go wprowadza. `ok = false` → uruchom
-- tę migrację (wszystkie są idempotentne; kolejność 001 → 007 ma znaczenie:
-- 005 nadpisuje trigger z 002, 007 musi iść po 005).
--
-- Produkcja 2026-10-28: przed migracją brakowało 001, indeksu z 002, 004
-- i 006; po wgraniu 001 → 007 (z backupem) wszystkie wiersze = true.
-- =============================================================================

SELECT element, ok FROM (VALUES
  (2,  '001: funkcja popular_tags(tag_limit)',
        EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'popular_tags')),
  (3,  '002: indeks idx_article_tags_tag_id',
        to_regclass('public.idx_article_tags_tag_id') IS NOT NULL),
  (4,  '002/005: trigger articles_set_updated_at',
        EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'articles_set_updated_at')),
  (5,  '003: tabela pipeline_events',
        to_regclass('public.pipeline_events') IS NOT NULL),
  (6,  '004: kolumna articles.search_vector (FTS)',
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'articles'
                  AND column_name = 'search_vector')),
  (7,  '004: indeks idx_articles_fts',
        to_regclass('public.idx_articles_fts') IS NOT NULL),
  (8,  '004: indeks idx_articles_title_trgm',
        to_regclass('public.idx_articles_title_trgm') IS NOT NULL),
  (9,  '005: trigger podbija updated_at TYLKO przy zmianie treści',
        EXISTS (SELECT 1 FROM pg_proc
                WHERE proname = 'set_updated_at' AND prosrc LIKE '%IS DISTINCT FROM%')),
  (10, '005: brak zdublowanego indeksu idx_articles_slug',
        to_regclass('public.idx_articles_slug') IS NULL),
  (11, '006: indeks idx_articles_category_published',
        to_regclass('public.idx_articles_category_published') IS NOT NULL),
  (12, '006: popular_tags liczy tylko opublikowane',
        EXISTS (SELECT 1 FROM pg_proc
                WHERE proname = 'popular_tags' AND prosrc LIKE '%is_published%')),
  (13, '007: funkcje ze stałym search_path (set_updated_at, popular_tags)',
        (SELECT count(*) FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace
           AND proname IN ('set_updated_at', 'popular_tags')
           AND proconfig @> ARRAY['search_path=""']) = 2),
  (14, 'Brak tabeli z e-mailami (newsletter wyłącznie w MailerLite)',
        to_regclass('public.newsletter_subscribers') IS NULL),
  (15, 'RLS włączone na wszystkich tabelach aplikacji',
        NOT EXISTS (SELECT 1 FROM pg_tables
                    WHERE schemaname = 'public'
                      AND tablename IN ('articles', 'categories', 'tags', 'article_tags',
                                        'scraped_items', 'pipeline_events')
                      AND NOT rowsecurity))
) AS checks(n, element, ok)
ORDER BY n;

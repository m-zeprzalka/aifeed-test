-- Migration 001 — popular_tags RPC
-- =============================================================================
-- Apply once in Supabase SQL Editor (dashboard → SQL Editor → New query → paste → Run).
-- Idempotent: `CREATE OR REPLACE` — safe to re-run. Definicję doprecyzowuje 006.
--
-- Pierwotnie migracja tworzyła też tabelę `newsletter_subscribers`. Usunięta
-- 2026-10-28, zanim trafiła na produkcję: adresy subskrybentów trzyma
-- wyłącznie MailerLite — baza nie przechowuje e-maili.
-- =============================================================================

-- RPC: agreguje top N tagów po użyciu (server-side GROUP BY).
-- Używane przez getPopularTags() w src/lib/data.ts zamiast pobierania
-- całej tabeli article_tags do JS'a. `STABLE` → cacheable per query.
CREATE OR REPLACE FUNCTION popular_tags(tag_limit INT)
RETURNS TABLE (id UUID, name TEXT, slug TEXT, count BIGINT) AS $$
  SELECT t.id, t.name, t.slug, COUNT(*) AS count
  FROM article_tags at
  JOIN tags t ON at.tag_id = t.id
  GROUP BY t.id, t.name, t.slug
  ORDER BY count DESC
  LIMIT tag_limit;
$$ LANGUAGE SQL STABLE;

-- Quick smoke test after running — powinien zwrócić listę tagów posortowanych
-- po `count` DESC (puste gdy w bazie nie ma jeszcze article_tags):
-- SELECT * FROM popular_tags(10);

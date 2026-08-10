-- Migration 005 — updated_at podbijany TYLKO przy zmianie treści + porządki
-- =============================================================================
-- Aplikuj w Supabase SQL Editor. Idempotentne (CREATE OR REPLACE,
-- DROP … IF EXISTS). Świeże instalacje: nie rób — schema.sql ma już to
-- wszystko.
--
-- DLACZEGO: `articles.updated_at` zasila sitemap `lastmod` i JSON-LD
-- `dateModified`. Dotychczasowy trigger podbijał datę przy KAŻDYM update
-- (np. przełączenie is_featured/is_published w panelu admina), co sygnalizuje
-- Google "treść zaktualizowana", gdy treść się nie zmieniła. Google jawnie
-- dewaluuje date-bumping bez zmiany treści i uczy się nie ufać lastmod
-- całej domeny. Po tej migracji data rusza wyłącznie przy realnej zmianie
-- treści (title/content/excerpt/thumbnail).
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.excerpt IS DISTINCT FROM OLD.excerpt
     OR NEW.thumbnail_url IS DISTINCT FROM OLD.thumbnail_url
  THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger zostaje ten sam (BEFORE UPDATE FOR EACH ROW) — podmieniamy tylko
-- funkcję; re-create dla pewności na starych instalacjach.
DROP TRIGGER IF EXISTS articles_set_updated_at ON articles;
CREATE TRIGGER articles_set_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Porządek: idx_articles_slug duplikował niejawny unikalny indeks z
-- constraintu `articles.slug UNIQUE` — czysty koszt zapisu, zero zysku.
DROP INDEX IF EXISTS idx_articles_slug;

-- Quick smoke test:
-- 1) UPDATE articles SET is_featured = NOT is_featured WHERE id = (SELECT id FROM articles LIMIT 1);
--    SELECT updated_at FROM articles WHERE id = ...;  — data BEZ zmiany.
-- 2) UPDATE articles SET title = title || '' WHERE id = ...;  — data BEZ zmiany
--    (IS DISTINCT FROM: identyczna wartość nie podbija).
-- 3) UPDATE articles SET title = title || '!' WHERE id = ...;  — data podbita.

-- AiFeed — Pełny schemat bazy danych
-- =============================================================================
-- Pojedyncze źródło prawdy. Uruchom w Supabase SQL Editor (dashboard → SQL
-- Editor → New query → wklej → Run). Plik jest w pełni idempotentny — można
-- go re-runnać na istniejącej bazie bez błędów.
--
-- Ewolucja schematu (dla baz które już miały wcześniejszą wersję):
-- zob. supabase/migrations/ dla inkrementalnych migracji.
-- =============================================================================

-- =============================================================================
-- TABELE
-- =============================================================================

-- Kategorie artykułów — 6 kategorii seedowanych na końcu pliku.
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Artykuły — główna tabela contentowa.
-- `source_urls[]` / `source_titles[]` — linki do oryginalnych źródeł (transparency).
-- `thumbnail_source` — null = AI-generated, string = atrybucja og:image.
CREATE TABLE IF NOT EXISTS articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT NOT NULL,
  content TEXT NOT NULL,
  category_id UUID REFERENCES categories(id),
  thumbnail_url TEXT,
  thumbnail_source TEXT,
  source_urls TEXT[] DEFAULT '{}',
  source_titles TEXT[] DEFAULT '{}',
  reading_time INT DEFAULT 5,
  is_featured BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tagi — powstają dynamicznie z AI output, upsertowane przez pipeline.
CREATE TABLE IF NOT EXISTS tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

-- Junction artykuł ↔ tag. CASCADE — kasując artykuł czyścimy powiązania.
CREATE TABLE IF NOT EXISTS article_tags (
  article_id UUID REFERENCES articles(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

-- Cache deduplikacji pipeline'u. Zapisuje każdy URL który pipeline widział,
-- żeby nie retry'ować na tych samych itemach z RSS.
CREATE TABLE IF NOT EXISTS scraped_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  source_name TEXT,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  is_processed BOOLEAN DEFAULT false
);

-- Subskrybenci newslettera. Celowo brak public policy — zapis i odczyt
-- wyłącznie przez service role key (admin client w /api/newsletter).
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ
);

-- Telemetria pipeline'u (P1-5) — zdarzenia z każdego cron run'u (start, end,
-- scrape skips, AI refusals, quality rejects, koszty). Czytane przez
-- dashboard /admin. Service role only (admin client).
CREATE TABLE IF NOT EXISTS pipeline_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id TEXT NOT NULL,
  event TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- INDEKSY
-- =============================================================================

-- Lookup po slug pokrywa niejawny unikalny indeks z constraintu
-- `articles.slug UNIQUE` — osobny indeks byłby czystą duplikacją
-- (migracja 005 usuwa go ze starych instalacji).

-- Hot path: lista najnowszych opublikowanych (home, category, feeds).
CREATE INDEX IF NOT EXISTS idx_articles_published
  ON articles(is_published, published_at DESC);

-- Hot path: artykuły danej kategorii (category page + grouped home).
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category_id);

-- Hot path: featured sekcje na home.
CREATE INDEX IF NOT EXISTS idx_articles_featured
  ON articles(is_featured, published_at DESC);

-- Full-text search dla `searchArticles` (migracja 004). STORED computed
-- column = wartość przechowywana, indeks GIN aktualizowany automatycznie
-- przy każdym INSERT/UPDATE artykułu. Wagi: title=A (najwyższa), excerpt=B.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_articles_fts
  ON articles USING GIN (search_vector);

-- Trigram fallback — znajduje literówki ("openi" → "openai") gdy tsquery
-- zwróci 0 wyników. Aplikacja używa tego przez `.ilike` po pustym FTS.
CREATE INDEX IF NOT EXISTS idx_articles_title_trgm
  ON articles USING GIN (title gin_trgm_ops);

-- Pipeline dedup — lookup przed wstawieniem.
CREATE INDEX IF NOT EXISTS idx_scraped_items_url ON scraped_items(source_url);

-- FK Postgres NIE jest auto-indexowane. RPC popular_tags robi JOIN po tag_id.
CREATE INDEX IF NOT EXISTS idx_article_tags_tag_id ON article_tags(tag_id);

-- pipeline_events: grupowanie po run + filtrowanie po event type/czasie.
CREATE INDEX IF NOT EXISTS idx_pipeline_events_run
  ON pipeline_events (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_event
  ON pipeline_events (event, created_at DESC);

-- =============================================================================
-- TRIGGER: updated_at
-- =============================================================================

-- Utrzymuje kolumnę articles.updated_at przy UPDATE — ale TYLKO gdy
-- zmieniła się treść (title/content/excerpt/thumbnail). Używane przez
-- sitemap.ts (lastModified) i JSON-LD (dateModified). Zmiana flag
-- (is_featured, is_published) NIE podbija daty — Google dewaluuje
-- date-bumping bez realnej zmiany treści (migracja 005).
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

DROP TRIGGER IF EXISTS articles_set_updated_at ON articles;
CREATE TRIGGER articles_set_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Włączenie RLS na wszystkich tabelach — ALTER jest idempotentne.
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_events ENABLE ROW LEVEL SECURITY;

-- Public SELECT policies. CREATE POLICY nie ma IF NOT EXISTS, więc najpierw
-- DROP IF EXISTS. Service role bypasuje RLS (admin client → pełny dostęp).

DROP POLICY IF EXISTS "Public read articles" ON articles;
CREATE POLICY "Public read articles" ON articles
  FOR SELECT USING (is_published = true);

DROP POLICY IF EXISTS "Public read categories" ON categories;
CREATE POLICY "Public read categories" ON categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read tags" ON tags;
CREATE POLICY "Public read tags" ON tags
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read article_tags" ON article_tags;
CREATE POLICY "Public read article_tags" ON article_tags
  FOR SELECT USING (true);

-- scraped_items, newsletter_subscribers i pipeline_events celowo BEZ public
-- policy — zapis i odczyt tylko przez service role key.

-- =============================================================================
-- RPC (stored functions)
-- =============================================================================

-- Agreguje top N tagów po użyciu (server-side GROUP BY). Używane przez
-- getPopularTags() w src/lib/data.ts zamiast pobierania całej article_tags
-- do JS. `STABLE` — wynik zależy tylko od tabel, cacheable w obrębie query.
CREATE OR REPLACE FUNCTION popular_tags(tag_limit INT)
RETURNS TABLE (id UUID, name TEXT, slug TEXT, count BIGINT) AS $$
  SELECT t.id, t.name, t.slug, COUNT(*) AS count
  FROM article_tags at
  JOIN tags t ON at.tag_id = t.id
  GROUP BY t.id, t.name, t.slug
  ORDER BY count DESC
  LIMIT tag_limit;
$$ LANGUAGE SQL STABLE;

-- =============================================================================
-- SEED: kategorie
-- =============================================================================

-- 6 kategorii — spójne z src/config/site.ts:siteConfig.categories.
-- ON CONFLICT DO NOTHING — re-run nie nadpisze edytowanych nazw/opisów.
INSERT INTO categories (name, slug, description, color) VALUES
  ('Modele AI', 'modele-ai', 'Premiery, aktualizacje i porównania modeli AI', '#6366f1'),
  ('Badania i Nauka', 'badania', 'Przełomowe badania naukowe i odkrycia w dziedzinie AI', '#8b5cf6'),
  ('Biznes i Rynek', 'biznes', 'AI w biznesie, startupy, inwestycje i rynek technologiczny', '#06b6d4'),
  ('Etyka i Bezpieczeństwo', 'etyka', 'Regulacje, etyka AI, alignment i bezpieczeństwo systemów AI', '#f59e0b'),
  ('Narzędzia i Aplikacje', 'narzedzia', 'Nowe narzędzia, aplikacje i platformy wykorzystujące AI', '#10b981'),
  ('Poradniki', 'poradniki', 'Praktyczne tutoriale, przewodniki i porady dotyczące AI', '#ec4899')
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- STORAGE (info)
-- =============================================================================

-- Bucket `thumbnails` dla AI-generowanych miniatur jest tworzony imperatywnie
-- w kodzie pipeline'u (src/lib/images/generator.ts::uploadToStorage):
--   public:          true
--   fileSizeLimit:   10 MB
-- Jeśli chcesz go utworzyć ręcznie: Supabase dashboard → Storage → New bucket
-- → name: thumbnails, public: ON, file size limit: 10 MB.

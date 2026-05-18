-- Migration 003 — pipeline_events (telemetria + dashboard /admin)
-- =============================================================================
-- Aplikuj w Supabase SQL Editor. Idempotentne — IF NOT EXISTS / DROP IF EXISTS.
--
-- Tabela trzyma zdarzenia z każdego run'u pipeline'u (cron generate). Używana
-- przez `src/lib/telemetry.ts::logPipelineEvent()` (zapis, service role) i
-- `src/lib/admin-data.ts` (odczyt z `/admin` dashboard, service role).
--
-- Typowy run zapisuje ~10-30 zdarzeń. 3 crony × 30 zdarzeń × 365 dni ≈ 33k/rok
-- — żaden problem dla Postgres. Indeksy poniżej trzymają hot queries (last 7d
-- aggregaty, per-source breakdown) w O(log n).
-- =============================================================================

CREATE TABLE IF NOT EXISTS pipeline_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- `run_id` grupuje zdarzenia jednego wywołania crona — generowany w
  -- runPipeline() jako `${timestamp}-${random}` żeby był sortowalny po czasie.
  run_id TEXT NOT NULL,
  -- event types: run_start, run_end, scrape_skip, ai_refusal, quality_reject,
  -- article_generated, article_failed, ai_cost, thumbnail_source, …
  event TEXT NOT NULL,
  -- JSONB pozwala każdemu eventowi mieć własny shape (title, score, cost_usd,
  -- itd.). Czytamy w admin-data.ts w JS — proste, brak nadmiernych JSONB
  -- queries (skala nie wymusza). Dashboard agreguje w pamięci po pobraniu.
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Hot path: dashboard `getRecentRuns(limit)` grupuje po run_id z porządkiem
-- czasowym. BTREE composite index obsługuje to bez sortowania.
CREATE INDEX IF NOT EXISTS idx_pipeline_events_run
  ON pipeline_events (run_id, created_at);

-- Hot path: dashboard `getRecentFailures()`, `getCostBreakdown()` filtrują po
-- event type i czasie. DESC po created_at — najnowsze najczęściej oglądane.
CREATE INDEX IF NOT EXISTS idx_pipeline_events_event
  ON pipeline_events (event, created_at DESC);

ALTER TABLE pipeline_events ENABLE ROW LEVEL SECURITY;

-- Celowo BRAK public policy — odczyt/zapis wyłącznie przez service role
-- (admin client). Anon key (publiczne strony) NIE widzi tej tabeli.
-- Dashboard `/admin` używa `createAdminClient()` w server component;
-- Basic Auth w proxy.ts chroni samą ścieżkę.

-- =============================================================================
-- Quick smoke test po migracji:
--   INSERT INTO pipeline_events (run_id, event, payload)
--   VALUES ('test-run', 'test', '{"hello": "world"}'::jsonb);
--   SELECT * FROM pipeline_events WHERE run_id = 'test-run';
--   DELETE FROM pipeline_events WHERE run_id = 'test-run';
-- =============================================================================

# Supabase — schemat i migracje

## Pliki

- **`schema.sql`** — pełny schemat bazy danych (source of truth). Idempotentny, można re-runnać. Dla świeżej instalacji wystarczy raz uruchomić.
- **`migrations/NNN_nazwa.sql`** — inkrementalne migracje dla baz, które już działają w produkcji. Każda aplikowana raz, po kolei.

## Dla świeżej instalacji (nowe DB)

1. Dashboard Supabase → **SQL Editor** → **New query**
2. Wklej całą zawartość `schema.sql`
3. **Run**
4. Gotowe — tabele + RLS + RPC + seed kategorii.
5. Opcjonalnie (storage bucket dla miniaturek): Storage → New bucket → name `thumbnails`, public ON, file size limit 10 MB. Można pominąć — kod pipeline tworzy bucket idempotentnie przy pierwszym uploadzie AI-image.

## Dla istniejących baz (upgrade path)

Aplikuj po kolei migracje których jeszcze nie było w Twojej DB:

| Migracja | Co dodaje |
|---|---|
| `001_newsletter_and_popular_tags.sql` | Tabela `newsletter_subscribers` + RPC `popular_tags(tag_limit)` |
| `002_updated_at_trigger_and_fk_index.sql` | Trigger `articles.updated_at` + indeks `article_tags(tag_id)` |
| `003_pipeline_events.sql` | Tabela `pipeline_events` (telemetria pipeline'u, czytana przez `/admin` dashboard) + 2 indeksy + RLS service-role-only |

Dla każdej: SQL Editor → New query → wklej → Run.

Migracje są idempotentne (`CREATE … IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP … IF EXISTS; CREATE …`), więc ponowne uruchomienie jest bezpieczne.

## Weryfikacja po wdrożeniu

```sql
-- Tabele
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
-- Expected: article_tags, articles, categories, newsletter_subscribers, pipeline_events, scraped_items, tags

-- RPC
SELECT proname FROM pg_proc
WHERE proname IN ('popular_tags', 'set_updated_at');
-- Expected: 2 rows

-- Trigger
SELECT tgname FROM pg_trigger WHERE tgname = 'articles_set_updated_at';
-- Expected: 1 row

-- Indeksy
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' ORDER BY indexname;
-- Expected: idx_article_tags_tag_id + wszystkie idx_articles_* + idx_scraped_items_url + auto-indexy PK/UNIQUE

-- RPC działa
SELECT * FROM popular_tags(10);
-- Expected: lista tagów posortowanych po count DESC (lub pusty wynik — też OK).
```

## Jak aplikacja używa schematu

- **Anon key + RLS** — frontend czyta wyłącznie `articles (WHERE is_published=true)`, `categories`, `tags`, `article_tags`. Reszta (scraped_items, newsletter_subscribers) niedostępna publicznie.
- **Service role key** — używany tylko server-side w `/api/cron/*` (pipeline) i `/api/newsletter` (upsert subskrybenta). Omija RLS.
- **`popular_tags(tag_limit)` RPC** — wywoływane z `src/lib/data.ts::getPopularTags()`. Brak RPC = fallback na in-memory aggregate (działa, ale wolniejsze, log `[data] getPopularTags RPC missing…`).
- **`articles.updated_at`** — autotriggerowane przez `articles_set_updated_at` przy każdym UPDATE. Używane w `sitemap.ts::lastModified` i JSON-LD `dateModified`.

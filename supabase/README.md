# Supabase — schemat, migracje, diagnostyka

## Pliki

- **`schema.sql`** — pełny schemat bazy (źródło prawdy). Idempotentny, dla świeżej instalacji wystarczy raz uruchomić.
- **`migrations/NNN_nazwa.sql`** — przyrostowe migracje dla działającej bazy. Wszystkie idempotentne; **uruchamiaj w kolejności numerów** (005 nadpisuje trigger z 002 — odwrotna kolejność cofnęłaby poprawkę `updated_at`; 007 musi iść po 005).
- **`verify.sql`** — diagnostyka **tylko do odczytu**: lista elementów schematu z informacją, czy istnieją i która migracja je wprowadza. Bezpieczna na produkcji.

## Sprawdzenie stanu bazy (zawsze najpierw)

Dashboard Supabase → **SQL Editor** → wklej `verify.sql` → **Run**. Każdy wiersz `ok = false` wskazuje migrację do uruchomienia.

> **Produkcja 2026-10-28, 18:23 UTC:** wgrane **001 → 007** jedną transakcją. Wcześniej brakowało 001, indeksu z 002, 004 i 006.
>
> Procedura:
> 1. Pełny backup (`pg_dump` przez Supabase CLI) odtworzony testowo w kontenerze z identyczną wersją Postgresa.
> 2. Migracje przetestowane na tej kopii, potem próba na produkcji z `ROLLBACK`.
> 3. Wgranie na produkcję.
>
> Po migracji `verify.sql` = wszystko `true`. Liczby wierszy i suma kontrolna `updated_at` są identyczne jak przed migracją. Ostrzeżenia Supabase Security Advisor (WARN) = 0.

## Świeża instalacja

1. SQL Editor → wklej całe `schema.sql` → Run (tabele, indeksy, RLS, RPC, trigger, seed 6 kategorii).
2. Opcjonalnie: Storage → New bucket `thumbnails` (public, limit 10 MB). Można pominąć — pipeline tworzy bucket przy pierwszym uploadzie.
3. `verify.sql` → wszystkie wiersze `true`.

## Istniejąca baza (upgrade)

| Migracja | Co dodaje |
|---|---|
| `001_newsletter_and_popular_tags.sql` | RPC `popular_tags(tag_limit)` (pierwotnie też tabela `newsletter_subscribers` — usunięta z migracji przed wdrożeniem; adresy trzyma wyłącznie MailerLite) |
| `002_updated_at_trigger_and_fk_index.sql` | Trigger `articles.updated_at` (wersja podstawowa — doprecyzowana w 005) + indeks `article_tags(tag_id)` |
| `003_pipeline_events.sql` | Tabela `pipeline_events` (telemetria pipeline'u dla `/admin`) + 2 indeksy + RLS service-role-only |
| `004_articles_fts.sql` | `articles.search_vector` (STORED tsvector, config `simple`, wagi title/A + excerpt/B) + GIN + trigram na `title` (`pg_trgm` w schemacie `extensions`). Jednorazowo przelicza istniejące wiersze (~2 tys. — sekundy; bez triggerów, `updated_at` nietknięte) |
| `005_content_gated_updated_at.sql` | Trigger `updated_at` podbija datę TYLKO przy zmianie treści (title/content/excerpt/thumbnail_url) — zmiany flag nie fałszują `lastmod`/`dateModified`. Usuwa zdublowany `idx_articles_slug` |
| `006_listing_index_and_published_tags.sql` | Częściowy indeks `(category_id, published_at DESC, id DESC) WHERE is_published` pod listy kategorii + `popular_tags` liczy tylko opublikowane artykuły (stały `search_path`, nazwy kwalifikowane) |
| `007_function_search_path.sql` | `set_updated_at()` ze stałym `search_path = ''` (Supabase advisor `function_search_path_mutable`) — po 005, bo `CREATE OR REPLACE` kasuje to ustawienie |

Dla każdej brakującej: SQL Editor → New query → wklej → Run. Ponowne uruchomienie już zaaplikowanej migracji jest bezpieczne (o ile zachowasz kolejność). Wszystkie migracje są addytywne — nie usuwają ani nie modyfikują danych artykułów.

## Jak aplikacja używa schematu

- **Anon key + RLS** — strona czyta wyłącznie `articles (WHERE is_published)`, `categories`, `tags`, `article_tags` (`src/lib/data.ts`). Listy pobierają tylko kolumny kart (bez `content`); artykuł — wiersz + kategoria + tagi jednym zapytaniem (osadzenie M2M przez `article_tags`).
- **Service role** — tylko serwer: pipeline (`/api/cron/generate`), Server Actions i dashboard `/admin`. Omija RLS. Newsletter nie dotyka bazy (MailerLite).
- **`popular_tags(tag_limit)`** — `getPopularTags()` (pasek „Trendy", katalog tagów w prompcie). Bez RPC działa stronicowany fallback w pamięci (wolniejszy, 7+ zapytań; log `[data] getPopularTags RPC missing…`).
- **`articles.updated_at`** — `sitemap.ts` (`lastmod`) i JSON-LD `dateModified`; podbijane triggerem wyłącznie przy zmianie treści.
- **Limit PostgREST**: każda odpowiedź ma maks. 1000 wierszy niezależnie od `.limit()` — większe odczyty stronicuj `.range()` (wzór: `getSitemapArticles`).

## Kopie zapasowe

- **Automatyczne:** organizacja jest na planie **Pro** — dzienne kopie fizyczne z 7 dni (Dashboard → Database → Backups). PITR wyłączony.
- **Ręczny pełny dump** (przed każdą zmianą schematu na produkcji) — wymaga Dockera i zalogowanego Supabase CLI; hasło bazy nie jest potrzebne, CLI tworzy tymczasową rolę logowania:

  ```bash
  B=../aifeed-backups/$(date +%F) && mkdir -p "$B"
  npx supabase@latest db dump --linked -f "$B/schema.sql"
  npx supabase@latest db dump --linked --data-only --use-copy -f "$B/data.sql"
  npx supabase@latest db dump --linked --role-only -f "$B/roles.sql"
  ```

  Kopie trzymamy **poza repozytorium** (`../aifeed-backups/`). Ostatnia: `2026-10-28` — sprzed migracji 001 → 007, odtworzona testowo, z instrukcją w `README.md` w katalogu kopii.
- **Wzorzec zmiany schematu na produkcji:**
  1. dump;
  2. odtworzenie w kontenerze `public.ecr.aws/supabase/postgres:<wersja>`;
  3. migracja na kopii i `verify.sql`;
  4. próba na produkcji w transakcji zakończonej `ROLLBACK`;
  5. właściwe wgranie;
  6. `verify.sql` i porównanie liczb wierszy.

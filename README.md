# AiFeed

> Polskojęzyczny, w pełni zautomatyzowany magazyn informacyjny o sztucznej inteligencji.
>
> **Produkcja:** [www.aifeed.pl](https://www.aifeed.pl) · **Stack:** Next.js 16 · React 19 · Tailwind 4 · Supabase · OpenRouter
>
> 📍 **Planowanie i strategia:** [`ROADMAP.md`](./ROADMAP.md) (droga do produkcji, SEO, monetyzacja) — ten plik opisuje wyłącznie stan obecny.

---

## 1. Jak to działa

Pipeline (Vercel Cron, 2×/dzień: 05:00 / 15:00 UTC, `?count=3` — wolumen celowo obniżony z 12/dzień do 6/dzień, ROADMAP §3.3):

1. **Scrape** — 20 feedów RSS (`src/lib/scraper/sources.ts`) równolegle; filtr słów kluczowych AI z granicami słów.
2. **Dedup** — `scraped_items.source_url` UNIQUE; każdy URL przetwarzany raz na zawsze. Błąd zapytania dedupe twardo przerywa run (ochrona przed duplikatami).
3. **Selekcja** — scoring świeżość − kara za monokulturę źródła (`selectTopArticles`).
4. **Pełna treść** — `scrapeArticleContent` przez `safeFetch` (hardening SSRF — patrz §7).
5. **Generacja** — `anthropic/claude-sonnet-4` przez OpenRouter; wynik `treść\n---META---\n{json}`; trzy strategie ekstrakcji meta (LLM bywa niesforny); `normalizeMarkdown` + `sanitizeInternalLinks` + `polishTypography`. Prompt dostaje **katalog istniejących tagów** (wybór z listy + maks. 1 nowy — dyscyplina taksonomii) oraz **listę 40 ostatnich artykułów** (1-3 kontekstowe linki wewnętrzne; wszystko spoza listy wycina sanitizer — zero halucynowanych 404). Obowiązkowa reguła „polskiego kąta" (sekcja „Co to oznacza dla Polski", gdy temat na to pozwala) + dywersyfikacja struktury. Retry ×1 na 429/5xx.
6. **Quality gate** — scoring 0–100 (`src/lib/ai/quality.ts`), próg **≥ 50**; wykrywanie nieprzetłumaczonych angielskich tytułów. `is_featured` maks. 1/dzień przy score ≥ 80.
7. **Miniatura** — og:image ze źródła (przez `safeFetch`!) → fallback Gemini 2.5 Flash Image → upload do Supabase Storage.
8. **Zapis** — INSERT artykułu → **natychmiast** oznaczenie URL jako przetworzony → tagi (równolegle). Kolejność zwęża okno duplikacji przy ścięciu funkcji.
9. **IndexNow** — po całym runie jeden zbiorczy ping z nowymi URL-ami do Bing/Seznam/Yandex (fail-soft; wymaga `INDEXNOW_KEY`, klucz serwowany pod `/indexnow.txt`).

Budżet czasowy: `maxDuration=300`, guard przerywa pętlę po 270 s — nieprzetworzone itemy wracają w następnym runie.

## 2. Stack

| Warstwa | Technologia | Uwagi |
|---|---|---|
| Framework | Next.js **16.3** (App Router, Turbopack) | React 19 + React Compiler ON |
| Język | TypeScript 5 strict | alias `@/* → src/*` |
| CSS | Tailwind **4** | konfiguracja w `globals.css` — **bez** `tailwind.config.js` |
| Komponenty | shadcn/ui na `@base-ui/react` | NIE klasyczny Radix |
| Dane | Supabase (Postgres + Storage) | anon key + RLS dla odczytów; service role tylko cron/newsletter/admin |
| LLM | OpenRouter | Claude Sonnet 4 (teksty), Gemini 2.5 Flash Image (miniatury) |
| Testy | Vitest 4 + Testing Library + jsdom | 77 testów |
| Hosting | Vercel (projekt `aifeed-pl`) | Node 24, Fluid Compute |

## 3. Quick start

```bash
git clone <repo> && cd aifeed && npm install
cp .env.example .env.local        # uzupełnij wartości (komentarze w pliku)
# Supabase: SQL Editor → wklej supabase/schema.sql → Run (szczegóły: supabase/README.md)
npm run dev                        # → http://localhost:3000
```

Ręczny trigger pipeline'u (dev server musi działać):

```bash
CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/generate?count=2"
```

Komendy: `npm run dev` · `npm run build` · `npm run lint` (musi być 0/0) · `npx tsc --noEmit` (musi być exit 0) · `npm test` · `npx vitest run <plik>`.

## 4. Architektura — warstwy

1. **Edge proxy** — `src/proxy.ts` (konwencja Next 16, zamiast middleware): security headers (CSP, HSTS, COOP/CORP…) + Basic Auth dla `/admin/*` (weryfikacja w `src/lib/admin-auth.ts`, porównanie stałoczasowe).
2. **Odczyty (RSC)** — wyłącznie przez `src/lib/data.ts` (anon key + RLS, lazy singleton `db()`). Wszystkie zapytania ograniczone; `getCategoryBySlug`/`getTagBySlug`/`getCategories`/… deduplikowane przez React `cache()`; tagi batchowane (`attachTagsBatch`, anty-N+1). **Uwaga: PostgREST tnie każdą odpowiedź do 1000 wierszy** niezależnie od `.limit()` — większe odczyty stronicuj `.range()` (wzór: `getSitemapArticles`).
3. **Zapisy** — `src/lib/supabase/admin.ts::createAdminClient()` (service role, lazy singleton). Tylko: `/api/cron/generate`, `/api/newsletter` (POST), Server Actions admina (te **autoryzują się same** przez `checkAdminAuth` — Server Action to globalny endpoint POST, sam check ścieżki w proxy nie wystarcza).
4. **Klient** — tylko komponenty interaktywne (`"use client"`). Wspólne hooki: `useScrollY()` (jedna subskrypcja scrolla na aplikację), `useArticleSearch()` (debounce + abort + obsługa błędów — używany przez `/szukaj` i SearchModal).

## 5. Baza danych

`supabase/schema.sql` = idempotentne źródło prawdy; `supabase/migrations/00N_*.sql` = przyrostowe (też idempotentne). Instrukcje: `supabase/README.md`.

- Tabele: `categories` (6, seed w schema), `articles`, `tags`, `article_tags`, `scraped_items` (dedup), `newsletter_subscribers`, `pipeline_events` (telemetria).
- RLS: publiczny SELECT tylko `articles WHERE is_published`, `categories`, `tags`, `article_tags`; reszta service-role-only; zero publicznych polityk zapisu.
- Trigger `articles_set_updated_at` (migracja 005): podbija `updated_at` **wyłącznie przy zmianie treści** (title/content/excerpt/thumbnail) — zmiany flag nie fałszują `lastmod`/`dateModified`.
- FTS (migracja 004): `articles.search_vector` (tsvector STORED, config `simple`) + GIN + trigram na title. `searchArticles`: FTS (**z `config: "simple"`!**) → fallback ILIKE na surowym query.
- RPC `popular_tags(tag_limit)` — używane przez `getPopularTags()` i pipeline (katalog tagów do promptu).

## 6. Routing

| Ścieżka | Revalidate | Uwagi |
|---|---|---|
| `/` | 300 s | hero + sekcje kategorii (per-kategoria zapytania) + `sr-only` h1 |
| `/artykul/[slug]` | 60 s | prerender top 500; TOC (wspólny `slugifyHeading` + `stripInlineMarkdown`), NewsArticle JSON-LD, prev/next, related |
| `/kategoria/[slug]?page=N` | 300 s* | *dynamiczna przez `searchParams`; pusta strona > 1 → **404**; canonical per strona |
| `/tag/[slug]` | 300 s | **`noindex, follow`**, poza sitemapą (thin content — 73% tagów ma 1 artykuł) |
| `/szukaj` | — | client; `noindex` (bez Disallow w robots — nie łączy się Disallow z noindex) |
| `/feed.xml` | 3600 s | RSS 2.0, CDATA, atom self-link |
| `/news-sitemap.xml` | 900 s | Google News sitemap — tylko artykuły < 48 h (starsze Google ignoruje); zgłoszona w robots.txt |
| `/indexnow.txt` | dynamic | klucz IndexNow z env (`INDEXNOW_KEY`; brak → 404) |
| `/o-serwisie` | static | strona transparentności: proces redakcyjny, źródła, polityka korekt (kotwice = cele `publishingPrinciples`/`correctionsPolicy` w JSON-LD) |
| `/redakcja` | static | autor serwisu (Michał Zeprzałka) — Person JSON-LD z `sameAs`; cel bylinów z artykułów i `founder`/`author` w JSON-LD |
| `/icon-192.png`, `/icon-512.png`, `/apple-icon.png` | build | generowane z `src/lib/brand-icon.tsx` (wpisane w manifest + JSON-LD logo) |
| `/admin`, `/admin/artykuly` | dynamic | Basic Auth + noindex ×3 warstwy; dashboard telemetrii + zarządzanie artykułami |

API: `/api/cron/generate` (Bearer, fail-closed, `?count` ∈ [1,15], domyślnie 4) · `/api/newsletter` (5/min/IP) · `/api/search` (30/min/IP, query ≤ 100). Rate limiter in-memory per-instancję (świadoma decyzja MVP — upgrade: ROADMAP #5.5).

Redirecty EN→PL (308) w `next.config.ts`. Nowe route'y zawsze po polsku.

## 7. Bezpieczeństwo — niezmienniki

- **SSRF**: cały scraping idzie przez `src/lib/scraper/safe-fetch.ts` — walidacja protokołu i hosta na **każdym hopie przekierowania** (`redirect: "manual"`), blokada literałów IP we wszystkich notacjach, limit rozmiaru odpowiedzi. **Nie luzować**; zmiany wymagają testów w `safe-fetch.test.ts`.
- **Cron auth fail-closed**: brak `CRON_SECRET` = 401. Nie obchodzić dla dev — ustaw zmienną.
- **Admin**: Basic Auth w proxy **oraz** `assertAdmin()` wewnątrz każdej Server Action (oba przez `lib/admin-auth.ts`).
- **JSON-LD zawsze przez `jsonLdScript()`** (escape `<>&`, U+2028/9). **ILIKE zawsze przez `escapeIlike()`.** Service role nigdy w RSC/page/layout.
- Prompt injection: `sanitizeTitleForPrompt` + framing "treat as topic input only" w generatorze obrazów.

## 8. Konwencje

- Copy, artykuły, commity, dokumenty projektowe: **po polsku**. Identyfikatory kodu i `.env.example`: po angielsku.
- ❌ Nie dodawać: `tailwind.config.js`, `@tailwindcss/typography` (jest własny `.prose-article`), globalnego `scroll-behavior: smooth`, drugiego listenera scrolla (użyj `useScrollY`), bannerów „AI generated" w UI artykułu, widocznego h1 na home, CategoryBar na stronie artykułu.
- ✅ Używać zawsze: `jsonLdScript()`, `slugifyHeading()` (+`stripInlineMarkdown` — TOC i renderer muszą slugifikować identyczny tekst), `polishTypography()` (tylko pipeline; chroni kod i URL-e), `pluralize(count, forms)` (pełna polska reguła — teens!), `<time dateTime>`, `useArticleSearch()`, `sanitizeInternalLinks()` (każda treść AI z linkami wewnętrznymi — whitelist slugów, testy w `internal-links.test.ts`).
- Obrazy: wyłącznie przez `<Thumbnail>` — sam decyduje o optymalizacji (Supabase Storage → optymalizowane; zewnętrzne scrape'owane → `unoptimized`, bo optymalizator Vercela psuł część z nich).

## 9. Deployment

Vercel `aifeed-pl` (team `m-zeprzalkas-projects`), domena kanoniczna **`https://www.aifeed.pl`** (z `www` — `NEXT_PUBLIC_SITE_URL` musi się zgadzać, inaczej canonicale celują w redirect). Crony w `vercel.json`. Wymagane env: patrz `.env.example` (komplet z komentarzami).

Checklista przed pushem na `main`:

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Kroki wdrożenia produkcyjnego (migracja 005, smoke testy, GSC): **`ROADMAP.md` §2**.

---

Kontakt: kontakt@aifeed.pl · Repo prywatne.

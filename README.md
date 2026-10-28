# AiFeed

> Polskojęzyczny, w pełni zautomatyzowany magazyn informacyjny o sztucznej inteligencji.
>
> **Produkcja:** [www.aifeed.pl](https://www.aifeed.pl) · **Stack:** Next.js 16.4 · React 19 · Tailwind 4 · Supabase · OpenRouter
>
> 📍 **Planowanie, decyzje i dalsze kroki:** [`ROADMAP.md`](./ROADMAP.md) — ten plik opisuje wyłącznie **stan obecny** (stan na 2026-10-28: ~1900 opublikowanych artykułów, 22 źródła RSS, 130 testów).

---

## 1. Jak to działa

Pipeline (Vercel Cron, 3×/dzień: 05:00 / 11:00 / 17:00 UTC, `?count=3` = do 9 artykułów/dzień — kompromis między skalą serwisu a profilem anty-slop, ROADMAP §3):

1. **Scrape RSS** — 22 feedy (`src/lib/scraper/sources.ts`) równolegle; filtr słów kluczowych AI z granicami słów; encje HTML w tytułach dekodowane.
2. **Dedup** — `scraped_items.source_url` UNIQUE; każdy URL przetwarzany raz na zawsze. Błąd zapytania dedupe **twardo przerywa run** (ochrona przed duplikatami).
3. **Selekcja** — scoring świeżość − kara za monokulturę źródła (`selectTopArticles`).
4. **Źródło — jeden fetch** — `scrapeSourcePage` (przez `safeFetch`, hardening SSRF — §7) zwraca naraz: tekst artykułu (do 12 tys. znaków), og:image i og:site_name; przy porażce podaje przyczynę (`http-403`, `too-short:…`) do telemetrii.
5. **Synteza źródeł** — `findRelatedItems` (≥3 wspólne tokeny tytułu, inny outlet) dokleja do promptu treść maks. 2 doniesień o tym samym wydarzeniu (information gain). Zmergowane URL-e są oznaczane jako przetworzone po insercie.
6. **Generacja** — `anthropic/claude-sonnet-5` przez OpenRouter (adaptive thinking; `max_tokens: 12000`), prompt systemowy budowany **per wywołanie** (aktualna data). Wynik `treść\n---META---\n{json}` → trzy strategie ekstrakcji meta → `normalizeMarkdown` → `sanitizeInternalLinks` → `polishTypography`. Kategoria sprowadzana do katalogu (fallback: kategoria feedu), czas czytania liczony z treści. Retry ×1 na 429/5xx i zerwany strumień odpowiedzi.
7. **Bramka jakości** — `isLikelyRefusal` (tylko początek odpowiedzi) + scoring 0–100 (`src/lib/ai/quality.ts`), próg `QUALITY_PUBLISH_THRESHOLD = 50`; angielski tytuł zawsze spada pod próg. `is_featured` maks. 1/dzień przy score ≥ 80.
8. **Miniatura** — og:image ze źródła (także grafiki stockowe i logo serwisów, np. arXiv — decyzja właściciela), walidacja HEAD przez `safeFetch` → gdy źródło nie ma obrazka: Gemini 2.5 Flash Image → upload do Supabase Storage.
9. **Zapis** — INSERT artykułu → **natychmiast** jeden batch oznaczający źródła (główne + zmergowane) jako przetworzone → tagi (`selectTags`: katalog top-100 → istniejące w bazie → maks. 1 nowy; łącznie maks. 5; istniejące linkowane po id, nigdy nie przemianowywane). Kolejność zwęża okno duplikacji przy ścięciu funkcji.
10. **IndexNow** — po runie jeden zbiorczy ping z nowymi URL-ami (Bing/Seznam/Yandex; fail-soft; `INDEXNOW_KEY`).

Budżet czasowy: `maxDuration=300`, guard przerywa pętlę po 270 s — nieprzetworzone itemy wracają w następnym runie. Telemetria każdego etapu (w tym koszt z `usage.cost` OpenRouter) → tabela `pipeline_events` → dashboard `/admin`.

## 2. Stack

| Warstwa | Technologia | Uwagi |
|---|---|---|
| Framework | Next.js **16.4** (App Router, Turbopack) | React 19 + React Compiler ON |
| Język | TypeScript 5 strict | alias `@/* → src/*` |
| CSS | Tailwind **4** | konfiguracja w `globals.css` — **bez** `tailwind.config.js` |
| Komponenty | shadcn/ui na `@base-ui/react` | NIE klasyczny Radix |
| Dane | Supabase (Postgres 17 + Storage), region **eu-west-3 (Paryż)** | anon key + RLS dla odczytów; service role tylko cron/admin |
| Newsletter | **MailerLite** (API `connect.mailerlite.com`, zapis od razu aktywny) | jedyne miejsce przechowywania listy; konfiguracja i szablon wiadomości powitalnej w `emails/` |
| Funkcje | Vercel, region **`cdg1` (Paryż)** — obok bazy | `vercel.json › regions`; Node 24, Fluid Compute |
| LLM | OpenRouter | Claude Sonnet 5 (teksty), Gemini 2.5 Flash Image (miniatury) |
| Testy | Vitest 4 + Testing Library + jsdom | 130 testów, CI na GitHub Actions |

## 3. Quick start

```bash
git clone <repo> && cd aifeed && npm install
cp .env.example .env.local        # uzupełnij wartości (komentarze w pliku)
# Supabase: SQL Editor → supabase/schema.sql → Run (szczegóły: supabase/README.md)
npm run dev                        # → http://localhost:3000
```

Komendy: `npm run dev` · `npm run build` · `npm run check` (= `typecheck` + `lint` + `test`, wszystko musi być zielone) · `npx vitest run <plik>`.

Ręczny trigger pipeline'u (dev server musi działać). **Uwaga:** `.env.local` wskazuje zwykle na produkcyjną bazę — ręczny run publikuje prawdziwe artykuły.

```bash
CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/generate?count=1"
```

## 4. Architektura — warstwy

1. **Nagłówki bezpieczeństwa — `next.config.ts › headers()`** (CSP, HSTS, COOP/CORP, Permissions-Policy…). Statyczne, więc Vercel nakłada je na krawędzi CDN razem z odpowiedzią z cache — **bez wywołania funkcji**.
2. **Proxy — `src/proxy.ts`, matcher wyłącznie `/admin/*`**: Basic Auth (weryfikacja w `src/lib/admin-auth.ts`, porównanie stałoczasowe). Proxy w Next 16 działa w runtime Node.js przed cache — na wszystkich ścieżkach oznaczał wywołanie funkcji przy każdej odsłonie.
3. **Odczyty (RSC)** — wyłącznie przez `src/lib/data.ts` (anon key + RLS, lazy singleton `db()`):
   - **listy** (home, kategoria, tag, szukaj, podobne, RSS) pobierają tylko kolumny karty (`CARD_COLUMNS`, typ `ArticleCardData`) — bez `content` i bez tagów,
   - **artykuł** (`getArticleBySlug`) — pełny wiersz + kategoria + tagi w **jednym** zapytaniu (osadzenie M2M przez `article_tags`),
   - **podobne publikacje** — po wspólnych tagach (deterministycznie), dopełnienie z kategorii,
   - URL-e miniatur normalizowane przy odczycie (`normalizeThumbnailUrl`: `&amp;` z historycznych rekordów); brak miniatury → `<ImageFallback>`,
   - `cache()` z React deduplikuje zapytania w obrębie requestu; **PostgREST tnie każdą odpowiedź do 1000 wierszy** — większe odczyty stronicuj `.range()` (wzór: `getSitemapArticles`).
4. **Zapisy** — `src/lib/supabase/admin.ts::createAdminClient()` (service role, lazy singleton). Tylko: `/api/cron/generate` i Server Actions admina (te **autoryzują się same** przez `checkAdminAuth` — Server Action to globalny endpoint POST).
5. **Newsletter** — `/api/newsletter` → `src/lib/newsletter/mailerlite.ts` → MailerLite `POST /api/subscribers` do grupy `MAILERLITE_GROUP_ID` ze `status: "active"` (bez double opt-in — decyzja właściciela) i IP zapisu jako dowodem zgody. Wiadomość „dziękujemy za zapis" wysyła automatyzacja MailerLite. Adresów nie trzymamy w Supabase (minimalizacja danych). Honeypot przeciw botom, identyczna odpowiedź dla nowego i istniejącego adresu. Konfiguracja panelu, DNS i szablon: `emails/README.md`.
6. **Klient** — tylko komponenty interaktywne (`"use client"`). Spis treści jest komponentem serwerowym (nie dubluje markdownu w payloadzie RSC). Wspólne hooki: `useScrollY()` (jedna subskrypcja scrolla), `useArticleSearch()` (debounce + abort + błędy).

## 5. Baza danych

`supabase/schema.sql` = idempotentne źródło prawdy; `supabase/migrations/00N_*.sql` = przyrostowe (też idempotentne, **kolejność 001 → 006 ma znaczenie**); `supabase/verify.sql` = diagnostyka tylko do odczytu („które migracje są w bazie"). Instrukcje: `supabase/README.md`.

> ✅ **Stan produkcji (2026-10-28):** wszystkie migracje **001 → 007** wgrane (z backupem; `supabase/README.md`) — FTS, RPC `popular_tags`, indeksy, utwardzone funkcje. `supabase/verify.sql` = wszystko `true`.

- Tabele: `categories` (6, seed w schema), `articles`, `tags`, `article_tags`, `scraped_items` (dedup), `pipeline_events` (telemetria). Brak tabeli z e-mailami — newsletter w MailerLite.
- RLS: publiczny SELECT tylko `articles WHERE is_published`, `categories`, `tags`, `article_tags`; reszta service-role-only; zero publicznych polityk zapisu.
- Trigger `articles_set_updated_at` (005): podbija `updated_at` **wyłącznie przy zmianie treści** — zmiany flag nie fałszują `lastmod`/`dateModified`.
- FTS (004): `articles.search_vector` (tsvector STORED, config `simple`) + GIN + trigram na title; `searchArticles` przekazuje **`config: "simple"`**, fallback ILIKE na surowym query przez `escapeIlike`.
- RPC `popular_tags(tag_limit)` (001, od 006 liczy tylko opublikowane) — pasek „Trendy" i katalog tagów w prompcie.

## 6. Routing

| Ścieżka | Revalidate | Uwagi |
|---|---|---|
| `/` | 300 s | 9 najnowszych na górze (hero + kolumna + kafelki), niżej sekcje kategorii bez duplikatów, box Preferred Sources na dole; `sr-only` h1; WebSite JSON-LD |
| `/artykul/[slug]` | 60 s | prerender top 500; **bez `loading.tsx`** (dzięki temu nieistniejący artykuł zwraca prawdziwe **404**); NewsArticle JSON-LD (autor/wydawca = organizacja po `@id`), TOC, prev/next, podobne po tagach |
| `/kategoria/[slug]?page=N` | per-request* | *dynamiczna przez `searchParams`; nieznany slug → **404 z `layout.tsx`** (bez zapytań do bazy); pusta strona > 1 → `notFound()` (przez `loading.tsx` status 200 + noindex — znane, akceptowane) |
| `/tag/[slug]?page=N` | per-request* | **noindex, follow**, poza sitemapą (cienkie strony); paginacja jak kategoria |
| `/szukaj` | — | client; noindex (bez Disallow w robots — noindex wymaga crawlowalności) |
| `/sitemap.xml` | **3600 s** | artykuły (do 49 tys.) + kategorie + strony statyczne z ręcznie utrzymywaną datą zmian; bez `changefreq`/`priority` |
| `/news-sitemap.xml` | 900 s | Google News sitemap, tylko artykuły < 48 h |
| `/feed.xml` | 3600 s | RSS 2.0 (50 najnowszych), CDATA, atom self-link |
| `/indexnow.txt` | dynamic | klucz IndexNow z env (`INDEXNOW_KEY`; brak → 404) |
| `/o-serwisie` | static | strona transparentności: proces, źródła, polityka korekt (kotwice = cele `publishingPrinciples`/`correctionsPolicy`) |
| `/redakcja` | static | twórca serwisu — `ProfilePage` + `Person` (`@id` = `founder` organizacji). **Nazwisko firmuje serwis, nie artykuły** (decyzja właściciela) |
| `/polityka-prywatnosci` | static | stan faktyczny narzędzi (GA4, Vercel Analytics, localStorage, newsletter) |
| `/icon-*.png`, `/apple-icon.png`, `/icon*.svg`, `/opengraph-image` | build | z `src/lib/brand-icon.tsx` / `ImageResponse` |
| `/admin`, `/admin/artykuly` | dynamic | Basic Auth (proxy) + `assertAdmin()` w akcjach + noindex ×3 warstwy |

API: `/api/cron/generate` (Bearer, porównanie stałoczasowe, fail-closed, `?count` ∈ [1,15], domyślnie 4) · `/api/newsletter` (5/min/IP, MailerLite, honeypot) · `/api/search` (30/min/IP, query ≤ 100, odpowiedź = dane kart). Rate limiter in-memory per-instancję (świadoma decyzja — upgrade: ROADMAP backlog).

Redirecty EN→PL (308) w `next.config.ts`. Nowe route'y zawsze po polsku.

## 7. Bezpieczeństwo — niezmienniki

- **SSRF**: cały scraping (treść, og:image, HEAD miniatur) idzie przez `src/lib/scraper/safe-fetch.ts` — walidacja protokołu i hosta na **każdym hopie przekierowania**, blokada literałów IP we wszystkich notacjach, limit rozmiaru odpowiedzi. og:image walidowany już przy ekstrakcji (`extractOgMeta`). **Nie luzować**; zmiany wymagają testów w `safe-fetch.test.ts`.
- **Optymalizator obrazów** przepuszcza wyłącznie nasz Supabase Storage (`images.remotePatterns`); obce miniatury renderują się jako `unoptimized` (`<Thumbnail>`). `/_next/image` nie jest otwartym proxy.
- **Cron auth fail-closed**: brak `CRON_SECRET` = 401. Nie obchodzić dla dev.
- **Admin**: Basic Auth w proxy **oraz** `assertAdmin()` wewnątrz każdej Server Action (+ walidacja typów argumentów).
- **JSON-LD zawsze przez `jsonLdScript()`**. **ILIKE zawsze przez `escapeIlike()`**. Service role nigdy w RSC/page/layout.
- Prompt injection: `sanitizeTitleForPrompt` + framing „treat as topic input only" w generatorze obrazów.
- Zależności: `npm audit --omit=dev` = 0 podatności (2026-10-28; 3× low tylko w dev-only `shadcn` CLI).

## 8. Wydajność — zasady

- Funkcje w tym samym regionie co baza (`cdg1` ↔ Supabase eu-west-3). Zmiana regionu Supabase ⇒ zmiana `vercel.json › regions`.
- Listy nigdy nie pobierają `content`. Nowe widoki listowe → `CARD_COLUMNS`/`ArticleCardData`.
- Brak preconnectu do Supabase — przeglądarka nie łączy się z bazą ani Storage bezpośrednio (miniatury własne idą przez `/_next/image`, wyszukiwarka przez `/api/search`).
- Nie dodawać `proxy` na publiczne ścieżki ani globalnego `images.unoptimized`.

## 9. Konwencje

- Copy, artykuły, commity, dokumenty projektowe: **po polsku**. Identyfikatory kodu i `.env.example`: po angielsku.
- ❌ Nie dodawać: `tailwind.config.js`, `@tailwindcss/typography`, globalnego `scroll-behavior: smooth`, drugiego listenera scrolla, bannerów „AI generated" w UI artykułu, widocznego h1 na home, CategoryBar na stronie artykułu, `loading.tsx` w `/artykul/[slug]` (zepsułby status 404).
- ✅ Używać zawsze: `jsonLdScript()`, `slugifyHeading()` + `stripInlineMarkdown()`, `polishTypography()` (tylko pipeline), `pluralize(count, forms)`, `formatDateLong`/`formatDateShort` (`lib/dates.ts` — strefa **Europe/Warsaw**), `<time dateTime>`, `useArticleSearch()`, `sanitizeInternalLinks()`, `decodeHtmlEntities()` dla tekstu ze stron źródłowych, `siteConfig.categories`/`CATEGORY_SLUGS` jako jedyny katalog kategorii, `siteConfig.contactEmail`.
- Obrazy: wyłącznie przez `<Thumbnail>` (decyduje o optymalizacji); brak zdjęcia → `<ImageFallback>` (markowy placeholder).

## 10. Testy

Pliki obok kodu (`src/**/*.test.{ts,tsx}`, 131 testów). Kontrakt: zmieniasz obszar → rozszerzasz jego testy. Kluczowe: `safe-fetch` (SSRF), `internal-links` (whitelist linków), `typography` (ochrona URL-i), `parser` (synteza źródeł), `content` (ekstrakcja treści/og:image), `tags` (dyscyplina katalogu), `quality` (bramka jakości), `dates` (strefa czasowa), `html-entities`, `thumbnail-url`, `mailerlite` (zapis do grupy, mapowanie błędów, brak e-maili w logach).

## 11. Deployment

Vercel `aifeed-pl` (team `m-zeprzalkas-projects`), domena kanoniczna **`https://www.aifeed.pl`** (`NEXT_PUBLIC_SITE_URL` z `www`). Crony i region w `vercel.json`. Wymagane env: `.env.example` (komplet z komentarzami).

**`git push` NIE deployuje** (projekt bez integracji Git — planowana migracja na Vercel Pro). Procedura:

```bash
npm run check && npm run build      # wszystko zielone
git push                            # CI (GitHub Actions): typecheck + lint + testy
npx vercel deploy --prod --yes      # właściwy deploy
```

Checklista po deployu i kroki ręczne (migracje, GSC, domena): **`ROADMAP.md` §0–§2**.

---

Kontakt: kontakt@aifeed.pl · Repo prywatne.

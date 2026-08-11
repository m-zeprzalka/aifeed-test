# AiFeed — Roadmapa: produkcja, SEO i monetyzacja

> **Status:** wersja 2.1 · 2026-08-11
> **Zastępuje:** `AUDIT.md` (audyt z 2026-05, w całości zrealizowany lub przeniesiony tutaj)
> **Stan serwisu:** 1340+ opublikowanych artykułów, pipeline 2×3/dzień (obniżony 2026-08-11), kod po pełnym audycie (0 podatności npm — git log 2026-08-10) + audycie SEO (git log 2026-08-11)

To jest **kanoniczny dokument planowania**. `README.md` opisuje stan obecny (architektura, uruchomienie), ten plik opisuje przyszłość: co zrobić, w jakiej kolejności i dlaczego.

---

## Spis treści

1. [Co zrobił audyt 2026-08-10 (skrót)](#1-co-zrobił-audyt-2026-08-10)
2. [Wdrożenie na produkcję — krok po kroku](#2-wdrożenie-na-produkcję)
3. [Strategia SEO — wyjście z szuflady „AI slop"](#3-strategia-seo) ← **PRIORYTET**
4. [Monetyzacja — realny plan finansowy](#4-monetyzacja)
5. [Backlog techniczny](#5-backlog-techniczny)
6. [KPI — co mierzymy](#6-kpi)

---

## 1. Co zrobił audyt 2026-08-10

Pełna lista zmian w git log; tu esencja, żeby rozumieć punkt startowy.

**Bezpieczeństwo:**
- Next.js 16.2.3 → 16.3.0 — łata m.in. bypass middleware (a tam siedzi Basic Auth `/admin`). `npm audit`: **18 podatności → 0**.
- Server Actions admina autoryzują się **wewnątrz akcji** (`lib/admin-auth.ts`, porównanie stałoczasowe) — wcześniej dało się je wywołać z pominięciem proxy.
- SSRF domknięty: walidacja **każdego hopu przekierowania**, guard na `og:image` (wcześniej brak!), blokada wszystkich literałów IP (dziesiętne/hex/IPv6-mapped), limit rozmiaru odpowiedzi. Testy w `safe-fetch.test.ts`.

**Poprawność:**
- **Sitemap gubił 340 artykułów** — Supabase tnie odpowiedzi do 1000 wierszy niezależnie od `.limit()`; teraz stronicowanie `.range()`. Sitemap: 1349 URL-i.
- `polishTypography` psuł URL-e w linkach (`2024-01-15` → `2024–01–15` = 404 na linku źródłowym) — URL-e są teraz chronione.
- Ikony PWA/logo (`/icon-192.png`, `/icon-512.png`, `apple-icon`) — **wszystkie były 404 na produkcji**; teraz generowane w build time.
- FTS wyszukiwarki parsował zapytania angielskim słownikiem (połykał polskie krótkie słowa) — dodany `config: "simple"`.
- Okno duplikacji artykułów w pipeline zwężone (URL oznaczany jako przetworzony od razu po insercie), błąd dedupe twardo przerywa run, walidacja dat z RSS, retry na 429/5xx OpenRouter.
- `/szukaj` przestał crashować przy rate-limicie; wspólny hook z abort/error handling dla strony i modala.

**SEO (techniczne):**
- **Tagi: `noindex, follow` + usunięte z sitemapy.** Katalog ma 2567 tagów, z czego 73% z JEDNYM artykułem — ~2500 stron-wydmuszek liczebnie przygniatało realną treść. To był największy techniczny „ślad AI slop".
- Pipeline dostaje **listę istniejących tagów** i wybiera z niej (maks. 1 nowy) — koniec płodzenia wariantów „GPT-5"/„GPT 5"/„gpt-5".
- Puste strony paginacji (`?page=9999`) → twarde 404 (wcześniej: nieskończona przestrzeń soft-404 z self-canonical).
- `updated_at` podbijany **tylko przy zmianie treści** (migracja 005) — koniec fałszywego `dateModified`/`lastmod` przy przełączaniu flag.
- Optymalizacja obrazów włączona dla miniatur z Supabase Storage (LCP artykułów); scrape'owane zewnętrzne bez zmian.
- robots.txt: zdjęty `Disallow: /szukaj` (konflikt z noindex), JSON-LD naprawiony (datePublished nullable, speakable, pozycje ItemList w paginacji).

**Czystość:**
- Usunięte: `/api/cron/seed` (generował artykuły ze zmyślonych tematów — ryzyko halucynacji), 11 nieużywanych komponentów UI, martwe klasy CSS, nieużywane zależności (`date-fns`, `@supabase/ssr`), stare makiety HTML, domyślne SVG Next.js, martwe funkcje w `data.ts` i typy w `database.ts`.

### 1a. Uzupełnienie: audyt SEO 2026-08-11

Realizacja techniczna filarów 2–4 strategii SEO (sekcja 3). W kodzie:

- **Wolumen obniżony do 6/dzień** (`vercel.json`: 2 crony × `count=3`, 05:00 i 15:00 UTC) — mniejszy odcisk scaled-content, tokeny idą w jakość.
- **Prompt — „polski kąt"**: obowiązkowa zasada nr 10 — sekcja „## Co to oznacza dla Polski" (dostępność w PL, ceny w zł jako przeliczenie ze źródła, kontekst AI Act), z twardym zakazem zmyślania; pomijana, gdy byłaby sztuczna. Do tego dywersyfikacja struktury (wariantowe nagłówki sekcji wniosków, 2–4 sekcje, zmienny rytm) — anty-sygnał „szablonowej fabryki".
- **Linkowanie wewnętrzne (on-site link building)**: prompt dostaje 40 ostatnich artykułów (tytuł+slug), AI wplata 1–3 kontekstowe linki `[kotwica](/artykul/slug)`; nowy `sanitizeInternalLinks` (`lib/ai/internal-links.ts`, 13 testów) wycina każdy link spoza listy — zero halucynowanych 404. Artykuły z bieżącego runu dołączają do puli (ten sam cykl newsowy). Renderer markdown: linki wewnętrzne przez `<Link>` w tej samej karcie (bez `target=_blank`/`noopener`).
- **News sitemap** (`/news-sitemap.xml`): artykuły < 48 h w formacie Google News, zgłoszona w robots.txt — formalny sygnał świeżości pod News/Discover.
- **IndexNow**: pipeline pinguje Bing/Seznam/Yandex po każdym runie (`lib/indexnow.ts`, fail-soft; klucz z env `INDEXNOW_KEY` serwowany pod `/indexnow.txt`).
- **Preferred Sources**: dyskretny box na home + link w stopce z deep-linkiem `google.com/preferences/source?q=aifeed.pl`.
- **`/o-serwisie` jako strona transparentności**: sekcje „Jak powstają nasze teksty" (proces, wierność źródłu, bramka jakości), „Skąd czerpiemy informacje" (imienna lista źródeł), „Zauważyłeś błąd?" (polityka korekt + kontakt) — rekomendacja Google i wymóg AdSense.
- **JSON-LD**: `Organization` → `NewsMediaOrganization` z `publishingPrinciples`/`correctionsPolicy`/`actionableFeedbackPolicy` wskazującymi kotwice na `/o-serwisie`.
- Tytuły artykułów: prompt wymusza ~70 znaków i frazę kluczową na początku.

**Poza kodem — nadal do zrobienia ręcznie:** teksty autorskie (3.3), wysyłka newslettera (3.4), profile społecznościowe (LinkedIn), zgłoszenie `news-sitemap.xml` w GSC. Decyzja o nazwisku podjęta 2026-08-11 (TAK) — `/redakcja` + Person JSON-LD wdrożone.

---

## 2. Wdrożenie na produkcję

Kolejność ma znaczenie. Całość to ~1 godzina pracy ręcznej.

### 2.1. Baza danych (przed deployem kodu)

- [ ] Supabase Dashboard → SQL Editor → wykonaj **`supabase/migrations/005_content_gated_updated_at.sql`** (trigger + drop zdublowanego indeksu). Smoke test w komentarzu migracji.
- [ ] Sprawdź, czy migracje 003 (pipeline_events) i 004 (FTS) były wykonane: `SELECT * FROM pipeline_events LIMIT 1;` oraz `SELECT id FROM articles WHERE search_vector @@ to_tsquery('simple','ai:*') LIMIT 1;` — brak błędu = OK.

### 2.2. Zmienne środowiskowe (Vercel → Settings → Environment Variables)

- [ ] Komplet wg `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL=https://www.aifeed.pl` (z `www`!), `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `NEXT_PUBLIC_GA_ID` (tylko Production).
- [ ] `ADMIN_PASSWORD`: długie, losowe, **ASCII** (`openssl rand -base64 24`).
- [ ] Jeśli od audytu z maja NIE zrotowałeś kluczy, które wyciekły do publicznego repo (`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`) — **zrób to teraz**. To jedyny niezamknięty punkt P0 ze starego audytu.

### 2.3. Deploy i smoke testy

- [ ] Merge/push na `main` → auto-deploy. Lokalnie przed pushem: `npx tsc --noEmit && npm run lint && npm test && npm run build`.
- [ ] `curl -sI https://www.aifeed.pl/icon-512.png` → **200** (było 404).
- [ ] `curl -s https://www.aifeed.pl/sitemap.xml | grep -c "<loc>"` → **~1349** (było 1618 z tagami, w tym tylko 1000 artykułów).
- [ ] `curl -s https://www.aifeed.pl/news-sitemap.xml | grep -c "<news:title>"` → liczba artykułów z ostatnich 48 h (po świeżym runie > 0).
- [ ] Po ustawieniu `INDEXNOW_KEY`: `curl -s https://www.aifeed.pl/indexnow.txt` → zwraca klucz (bez klucza: 404 = feature wyłączony, też OK).
- [ ] `curl -sI "https://www.aifeed.pl/kategoria/biznes?page=999"` → **404**.
- [ ] `https://www.aifeed.pl/admin` → Basic Auth działa; po zalogowaniu dashboard.
- [ ] Ręczny cron: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://www.aifeed.pl/api/cron/generate?count=1"` → sukces, artykuł z tagami z istniejącego katalogu.
- [ ] Rich Results Test (https://search.google.com/test/rich-results) dla przykładowego artykułu — NewsArticle bez błędów.

### 2.4. Search Console (dzień 1 po deployu)

- [ ] GSC → Sitemaps → ponownie zgłoś `sitemap.xml` (nowa zawartość: +340 artykułów, −600 tagów).
- [ ] GSC → Usuwanie treści: nic nie rób z tagami — `noindex` wyczyści je naturalnie w ciągu tygodni.
- [ ] Zapisz baseline: liczba zaindeksowanych stron, średnia pozycja, CTR (potrzebne do mierzenia efektu zmian).
- [ ] Bing Webmaster Tools: import z GSC (5 minut, darmowy drugi kanał).

---

## 3. Strategia SEO

### 3.1. Diagnoza — nazwać problem po imieniu

Polityka spamowa Google (aktualizacja 2026-05) definiuje **scaled content abuse** i wśród przykładów wymienia dosłownie: *„Scraping feeds (…) to generate many pages (including through automated transformations like synonymizing, **translating**, or obfuscation techniques)"*. Pipeline AiFeed — automatyczne polskie przepisania angielskich RSS-ów, 12/dzień, bez człowieka — **pasuje do litery tego przepisu**. Wytyczne dla raterów (styczeń 2025) każą dawać ocenę **Lowest** treściom „copied, paraphrased (…) auto or AI generated" bez wartości dodanej.

Precedensy: w marcu 2024 Google zdeindeksował setki takich serwisów (100% trafionych miało treści AI); flagowy przypadek — BNN Breaking (AI-przepisania newsów, fikcyjne bylines, 10M wizyt/mies.) — zdechł w miesiąc. **Odzyskanie widoczności po algorytmicznej klasyfikacji praktycznie się nie zdarza** (129/130 serwisów po HCU nigdy nie wróciło). Wniosek: nie „odzyskujemy rankingu", tylko **zmieniamy profil serwisu, zanim klasyfikacja się utrwali**.

Co Google toleruje, a nawet nagradza (udokumentowane cechy „ocalałych"): umiarkowane tempo publikacji z redakcją człowieka, **imienny, weryfikowalny autor**, transparentność procesu, **information gain** (coś, czego nie ma w źródle), zróżnicowana struktura tekstów.

### 3.2. Filar 1 — Tożsamość redakcyjna (E-E-A-T) · *tydzień 1–2*

To jest jednocześnie Twój cel wizerunkowy — serwis firmowany nazwiskiem buduje markę osobistą.

- [x] ~~**Decyzja właściciela**~~ ✅ 2026-08-11: TAK — serwis firmowany nazwiskiem **Michał Zeprzałka** (zeprzalka.com); cel: marka osobista i pozycja w branży AI.
- [x] ~~Strona **`/redakcja`**~~ ✅ 2026-08-11: bio (Digital Solutions Architect, 12+ lat), podział ról człowiek/automatyzacja, Person JSON-LD z `sameAs` (zeprzalka.com, GitHub, Facebook). Autor w NewsArticle JSON-LD: `Person` + widoczny byline „Redakcja: Michał Zeprzałka" na artykułach (celowo „Redakcja:", nie goły podpis — fikcyjne bylines to profil BNN Breaking). `founder` w NewsMediaOrganization. **Zostało:** zdjęcie + LinkedIn, gdy będziesz chciał je dodać.
- [x] ~~Rozbudowa **`/o-serwisie`**~~ ✅ 2026-08-11: sekcje „Jak powstają nasze teksty", „Skąd czerpiemy informacje", polityka korekt z kontaktem; kotwice podpięte pod `publishingPrinciples`/`correctionsPolicy` w JSON-LD.
- [ ] `siteConfig.links` + `Organization.sameAs`: realne profile (LinkedIn, X/GitHub) — załóż, jeśli nie istnieją.

### 3.3. Filar 2 — Information gain: przestawienie pipeline'u · *tydzień 2–6*

Zasada: **mniej, ale z wartością, której nie ma w źródle.** Konkurujesz z Google AI Overviews i z oryginałem — czysta parafraza przegrywa z oboma.

- [x] ~~**Zmniejsz wolumen**~~ ✅ 2026-08-11: `vercel.json` 2×3 (05:00 / 15:00 UTC).
- [x] ~~**Polski kąt w promptcie**~~ ✅ 2026-08-11: zasada nr 10 w `prompts.ts` (sekcja „Co to oznacza dla Polski" z anty-halucynacyjnymi ogranicznikami) + dywersyfikacja struktury + linkowanie wewnętrzne (1–3 linki z listy ostatnich 40 artykułów, sanitizer w `lib/ai/internal-links.ts`).
- [ ] **1 tekst autorski tygodniowo, pisany przez człowieka** (Ty): cotygodniowe podsumowanie „Tydzień w AI po polsku" (format newsletterowy, idealny też do dystrybucji), test narzędzia po polsku (jak radzi sobie z polszczyzną — genuinely underserved temat!), albo komentarz do wydarzenia. Podpisany nazwiskiem. To jest treść, którą linkują inni.
- [ ] **Przegląd wsteczny**: w `/admin/artykuly` masz listę — wyłącz z indeksu (unpublish) najsłabsze teksty z przeszłości (krótkie, bliskie źródłu). Mniejszy, czystszy indeks > większy, śmieciowy. (AdSense-owy case study: odrzucony serwis przeszedł review po wycięciu słabych stron.)

### 3.4. Filar 3 — Kanały dystrybucji · *tydzień 2–8, potem stale*

Realia 2026: AI Overviews zabrały ~40% ruchu z klasycznych wyników, ale **breaking news +103%**, a **Google Discover wysyła wydawcom tyle ruchu co wyszukiwarka**. Dla serwisu newsowego Discover > blue links.

- [ ] **Discover-ready obrazy**: wymóg ≥1200 px szerokości. Dziś generator AI robi 16:9, ale scrape'owane og:image bywają mniejsze — dodaj w pipeline preferencję dużych obrazów (backlog #5.3). `max-image-preview:large` już ustawione ✅.
- [x] ~~**Preferred Sources**~~ ✅ 2026-08-11: box na home + link w stopce (`google.com/preferences/source?q=aifeed.pl`).
- [ ] **Google News**: nie ma już aplikowania (od 03.2025 inclusion czysto algorytmiczne) — jedyna droga to E-E-A-T + jakość, czyli filary 1–2. ✅ 2026-08-11: `/news-sitemap.xml` (artykuły < 48 h) zgłoszona w robots.txt — **dodaj ją też ręcznie w GSC**.
- [ ] **Newsletter jako kanał własny**: masz formularz i tabelę subskrybentów — zacznij WYSYŁAĆ (cotygodniowy tekst autorski z 3.3). Wymaga: Resend/Brevo + double opt-in (backlog #5.4). Kanał odporny na algorytmy, fundament monetyzacji.
- [ ] **Dystrybucja PL**: LinkedIn (Twój profil — wizerunek!), Wykop, ew. grupy FB o AI. 15 min dziennie.
- [x] ~~**IndexNow/Bing**~~ ✅ 2026-08-11 (kod): ping po każdym runie pipeline'u + `/indexnow.txt`. **Zostało ręcznie:** wygeneruj klucz (`openssl rand -hex 16`), ustaw `INDEXNOW_KEY` w Vercel → Production, zweryfikuj `curl https://www.aifeed.pl/indexnow.txt`.

### 3.5. Filar 4 — Higiena techniczna · *zrobione + monitoring*

Zrobione w audycie (tagi noindex, sitemap, daty, soft-404, LCP, słownik tagów). Pozostaje monitoring:

- [ ] Co tydzień GSC: indeksacja (spadek liczby zaindeksowanych tagów = plan działa), krzywa pozycji/CTR, błędy crawl.
- [ ] Po 4 tygodniach: PageSpeed Insights baseline → LCP artykułu mobile < 2,5 s (miniatury Supabase są już optymalizowane; jeśli scrape'owane obrazy ciążą — backlog #5.3: re-host wszystkich miniatur do Storage).
- [ ] Konsolidacja katalogu tagów (backlog #5.2) — po niej można rozważyć przywrócenie indeksacji dla ~50 najmocniejszych tagów z realną treścią. Nie wcześniej.

### 3.6. Sekwencja — co robić w jakiej kolejności

| Tydzień | Działanie |
|---|---|
| 1 | Wdrożenie (sekcja 2) + baseline GSC + decyzja o nazwisku |
| 1–2 | `/redakcja` + rozbudowa `/o-serwisie` + profile społecznościowe |
| 2–3 | Zmiana promptu (polski kąt) + redukcja wolumenu do 6/dzień |
| 3–4 | Pierwszy tekst autorski + start wysyłki newslettera + box Preferred Sources |
| 4–6 | Przegląd i unpublish najsłabszych starych tekstów; IndexNow |
| 6–8 | Ocena pierwszych sygnałów GSC; korekta kursu |
| stale | 1 tekst autorski/tydz., dystrybucja, monitoring tygodniowy |

---

## 4. Monetyzacja

### 4.1. Zimny prysznic — liczby dla polskiego rynku

Display w Polsce płaci **1–5 zł RPM** (AdSense, polski język). Zoptymalizowane sieci (Ezoic/Journey) realnie 5–12 zł RPM. Czyli:

| Ruch/mies. | AdSense | Sieć zoptymalizowana |
|---|---|---|
| 10 000 PV | 10–50 zł | 50–120 zł |
| 50 000 PV | 50–250 zł | 250–600 zł |
| 100 000 PV | 100–500 zł | 500–1200 zł |

**Sam display nie spłaci nawet rachunku za OpenRouter.** Realny stack przychodów dla niszowego serwisu PL to: **afiliacja (USD/EUR) + artykuły sponsorowane + newsletter**, z displayem jako dodatkiem. Do tego korzyść wizerunkowa — która przy Twoim profilu (dev z marką osobistą) może być warta więcej niż wszystkie powyższe (zlecenia, konsultacje, wystąpienia).

### 4.2. Faza 0 — fundament (teraz, przychód: 0 zł)

- **NIE aplikuj jeszcze do AdSense.** Automatyczny serwis z tempem 12/dzień bez stron redakcyjnych to podręcznikowy profil odrzutu „low value content" — a odrzut zostaje w historii konta. Najpierw filary 1–2 SEO (tożsamość + strony transparentności — to są jednocześnie wymogi AdSense).
- Załóż konta: PartnerStack (afiliacje AI SaaS), WhitePress i Linkhouse (marketplace artykułów sponsorowanych — samo wystawienie serwisu jest darmowe).

### 4.3. Faza 1 — pierwsze przychody (1000+ sesji/mies.; horyzont: 1–3 mies.)

- [ ] **Journey by Mediavine** — próg obniżony do **1000 sesji/mies.** (od 01.2026), przyjmują serwisy międzynarodowe, rev-share 70%. Najlepszy pierwszy network dla PL (alternatywa: Ezoic bez progu). AdSense dopiero, gdyby Journey odrzucił.
- [ ] **Afiliacja AI SaaS** — wymaga treści recenzyjnych (→ synergiczne z filarem 2 SEO: testy narzędzi po polsku). Programy z realnymi stawkami (2026): ElevenLabs 22% recurring (12 mies.), Jasper 25–30% recurring, Writesonic 30% lifetime, Synthesia 25%, Murf 20% (do 24 mies.). Płacone w USD — omija słaby polski RPM. Zacznij od 2–3 recenzji/rankingu miesięcznie („Najlepsze AI do generowania głosu po polsku" itp.) z oznaczonymi linkami afiliacyjnymi.
- [ ] **Newsletter**: buduj listę (cel fazy: 500–1000 subskrybentów). Jeszcze nie monetyzuj.

### 4.4. Faza 2 — skalowanie (10 000+ PV/mies.; horyzont: 3–9 mies.)

- [ ] **Artykuły sponsorowane** przez WhitePress/Linkhouse: przy widocznym DR/ruchu niszowy serwis netto dostaje ~100–500 zł/publikację. Limit: 2–4/mies., zawsze oznaczone (`rel="sponsored"`) — nadmiar sam w sobie jest spam-sygnałem.
- [ ] **Sponsoring newslettera**: przy 1–2 tys. zaangażowanych subskrybentów w niszy AI — 300–800 zł/wydanie od narzędzi AI celujących w PL. (Precedens rynkowy: płatne newslettery tech w PL — 19–49 zł/mies.; unknowNews/Pucek jako wzorce formatu.)
- [ ] **Direct affiliate deals**: po zbudowaniu pozycji — indywidualne stawki z narzędziami zamiast marketplace'owych.

### 4.5. Faza 3 — dźwignia wizerunkowa (6–12 mies.)

- Płatny newsletter premium (konwersja free→paid w PL: 2–7%; 1000 subów × 5% × 299 zł/rok ≈ 15 000 zł/rok) — dopiero przy realnie unikalnej treści autorskiej.
- Produkty własne: kurs/e-book „AI w praktyce po polsku", konsultacje. Marża 100%, sprzedaż przez listę.
- Marka osobista: wystąpienia, podcasty, zlecenia B2B — „prowadzę największy polski serwis o AI" to zdanie otwierające drzwi. Wymaga nazwiska na serwisie (filar 1).

### 4.6. Czego NIE robić

- ❌ AdSense przed zbudowaniem stron E-E-A-T (ryzyko odrzutu, który zostaje w historii).
- ❌ Masowa sprzedaż linków — Google site reputation abuse (manual actions od 2024).
- ❌ Ściana reklam przy małym ruchu — zabija Discover-owe CTR-y i CWV za grosze.

---

## 5. Backlog techniczny

Świadomie odłożone; wracamy wg triggera.

| # | Co | Trigger / termin |
|---|---|---|
| 5.1 | **Konsolidacja tagów w DB** — skrypt SQL scalający warianty pisowni (2567 → docelowo ~300); po nim ewentualna re-indeksacja top-50 tagów | Po ustabilizowaniu nowego promptu (miesiąc) |
| 5.2 | ~~**Person JSON-LD + `/redakcja`**~~ ✅ 2026-08-11 | ~~Po decyzji o nazwisku~~ zrobione |
| 5.3 | **Miniatury: preferencja ≥1200 px + re-host wszystkich na Supabase Storage** (Discover + kontrola nad LCP + wąska whitelist w `next.config.ts`) | Przy pracach nad Discover |
| 5.4 | **Newsletter: double opt-in + unsubscribe + wysyłka (Resend)** — wymaga migracji DB (`confirmation_token`, `confirmed_at`) | Przed pierwszą wysyłką (RODO) |
| 5.5 | **Rate limit na Upstash Redis** (obecny in-memory jest per-instancję) | > 100 req/min na API albo anomalia w logach |
| 5.6 | **Paginacja ścieżkowa** `/kategoria/[slug]/strona/[nr]` (przywraca pełne ISR; dziś `searchParams` wymusza per-request render) | Gdy TTFB kategorii zacznie ciążyć w GSC |
| 5.7 | **Vercel Queues dla pipeline** (per-artykuł budżet 300 s, retry) | > 10 artykułów/dzień albo częste aborty |
| 5.8 | **DNS rebinding guard** (pinning resolvera w safe-fetch) | Niskie ryzyko na Vercelu; przy okazji prac nad scraperem |
| 5.9 | **CSP nonce zamiast `unsafe-inline`** | Gdy Next ustabilizuje nonce streaming |
| 5.10 | **CI (GitHub Actions): lint + tsc + test + build na PR** | Pierwszy wspólny kontrybutor albo po prostu wolny wieczór |
| 5.11 | **E2E (Playwright) dla ścieżek krytycznych** | Po CI |
| 5.12 | **PostgREST `db-max-rows`** — świadomość limitu 1000 (kod już stronicuje; przy dużych nowych zapytaniach pamiętać) | stale |

---

## 6. KPI

**SEO (tygodniowo, GSC):**
- Zaindeksowane strony: artykuły ↑, tagi ↓ (do ~0)
- Średnia pozycja i CTR dla 10 fraz śledzonych (np. „wiadomości AI", „nowy model OpenAI", „Claude po polsku")
- Wyświetlenia z Discover (osobna zakładka w GSC) — **główny wskaźnik sukcesu strategii**
- Crawl errors: 0 × 4xx z sitemapy

**Produkt (miesięcznie):**
- Subskrybenci newslettera (cel: +100/mies. po starcie wysyłki)
- Teksty autorskie opublikowane (cel: ≥4/mies.)
- Pipeline success rate > 80% i koszt OpenRouter/dzień < 1 USD (dashboard `/admin`)

**Finanse (miesięcznie):**
- Przychód łączny wg źródła (display / afiliacja / sponsorowane / newsletter)
- Próg rentowności #1: przychód > koszty infrastruktury (OpenRouter + ewentualny Vercel Pro)
- Kamień milowy: pierwszy 1000 zł/mies. (realnie: miesiąc 6–9 przy konsekwentnej realizacji)

---

*Dokument utrzymywany ręcznie. Aktualizuj po każdym zamkniętym etapie — nieaktualna roadmapa jest gorsza niż żadna.*

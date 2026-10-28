# AiFeed — Roadmapa: wdrożenie, decyzje, SEO, rozwój i monetyzacja

> **Status:** wersja 3.0 · 2026-10-28
> **Stan serwisu:** 1905 opublikowanych artykułów · 2618 tagów · pipeline 3×3/dzień na Claude Sonnet 5 · 22 źródła RSS · ruch rośnie
> **Stan kodu:** po audycie i refaktoryzacji 2026-10-28 (§1) — Next 16.4.3, 0 podatności produkcyjnych, 131 testów, CI · wdrożone 2026-10-28 · baza: migracje 001 → 007 wgrane

To jest **kanoniczny dokument planowania**. `README.md` opisuje stan obecny (architektura, uruchomienie), ten plik — co zrobić, w jakiej kolejności i dlaczego. Punkty oznaczone **[DECYZJA]** czekają na Twoją decyzję; przy każdym jest rekomendacja.

---

## Spis treści

0. [Do zrobienia teraz — kroki ręczne (P0)](#0-do-zrobienia-teraz)
1. [Audyt i refaktoryzacja 2026-10-28 — co zrobiono](#1-audyt-2026-10-28)
2. [Wdrożenie tej wersji — checklista](#2-wdrożenie)
3. [Decyzje do podjęcia](#3-decyzje)
4. [Strategia SEO](#4-strategia-seo)
5. [Kierunki rozwoju produktu (kwartały)](#5-kierunki-rozwoju)
6. [Monetyzacja](#6-monetyzacja)
7. [Backlog techniczny (z triggerami)](#7-backlog-techniczny)
8. [KPI i baseline](#8-kpi)
9. [Historia (skrót wcześniejszych etapów)](#9-historia)

---

## 0. Do zrobienia teraz

Kolejność ma znaczenie. 0.1 i 0.2 wykonane 2026-10-28. Reszta to praca ręczna w panelach, ~30 minut.

| # | Co | Dlaczego to P0 |
|---|---|---|
| 0.1 | ✅ ~~**Wdróż tę wersję** (§2)~~ — wdrożone 2026-10-28 | Sitemapa na produkcji jest zamrożona od 12.08 — **541 artykułów nie ma w sitemapie**; Next 16.3.0 ma krytyczne CVE (m.in. RCE w `next/og`, którego używamy do ikon i kart OG) |
| 0.2 | ✅ ~~**Migracje bazy**~~ — 001 → 007 wgrane 2026-10-28 po pełnym backupie i teście na odtworzonej kopii; `verify.sql` = wszystko `true`, dane nietknięte (`supabase/README.md`) | Brak FTS (004 — wyszukiwarka szuka dziś tylko dokładnej frazy w tytułach) i RPC `popular_tags` (001 — „Trendy" i katalog tagów liczone wolnym obejściem). Migracje są idempotentne, addytywne i bezpieczne dla danych |
| 0.2a | **MailerLite** (newsletter) — kod, token i ID grupy są już na produkcji. Zostało w panelu MailerLite: **„Double opt-in for API and integrations" → ON**, nadawca + uwierzytelnienie domeny `aifeed.pl` (DKIM/SPF + DMARC), opcjonalnie wygląd e-maila potwierdzającego (plan płatny) → `emails/README.md` | Formularz w stopce do 28.10 zwracał błąd (brak tabeli w bazie); teraz zapisuje do grupy „AiFeed — newsletter". Bez włączonego double opt-in adresy są aktywowane bez potwierdzenia |
| 0.3 | **Vercel → Settings → Domains → `aifeed.pl`**: przekierowanie na `www.aifeed.pl` ustaw jako **308 (permanent)** | Dziś apex odpowiada **307 (tymczasowe)** — Google nie konsoliduje sygnałów z linków do `aifeed.pl` tak pewnie jak przy stałym |
| 0.4 | **Google Search Console**: Sitemapy → ponownie prześlij `sitemap.xml` (teraz ~1910 URL-i) i `news-sitemap.xml`; Indeksowanie stron → sprawdź „Soft 404" (powinny zniknąć — nieistniejące artykuły zwracają już prawdziwe 404) | Szybsze wciągnięcie 541 brakujących artykułów |
| 0.5 | **[DECYZJA] Zgody na cookies (D1)** — przeczytaj §3 | GA4 działa dziś bez zgody użytkownika; to ryzyko prawne (PKE) i twardy wymóg przed jakąkolwiek reklamą |
| 0.6 | Rotacja kluczy `SUPABASE_SERVICE_ROLE_KEY` i `OPENROUTER_API_KEY`, **jeśli** nie zrobiłeś tego po wycieku z maja. Dodatkowo **token MailerLite** (był wklejony w rozmowie z asystentem): MailerLite → Integrations → API → nowy token → Vercel `MAILERLITE_API_TOKEN` → redeploy → usuń stary | Jedyny niezamknięty punkt P0 ze starego audytu |

---

## 1. Audyt 2026-10-28

Pełny przegląd kodu, produkcji (HTTP, HTML, sitemapy), bazy (tylko odczyt) i telemetrii pipeline'u z ostatnich 2 tygodni. Poniżej problemy **znalezione na produkcji** i to, co z nimi zrobiono.

### 1.1. Krytyczne (SEO i bezpieczeństwo)

- **Sitemapa zamrożona na dzień buildu.** `sitemap.ts` był w tej wersji Next cache'owanym route handlerem generowanym raz, przy deployu 12.08 — 1371 URL-i zamiast ~1910. → `revalidate = 3600`, limit podniesiony do 49 tys. URL-i, uczciwe `lastmod` stron statycznych (stała data zamiast `new Date()`), usunięte ignorowane przez Google `changefreq`/`priority`.
- **Next 16.3.0 → 16.4.3** — seria krytycznych CVE (RCE w `next/og` ImageResponse, RCE/SSRF w optymalizatorze obrazów, cache poisoning ISR). Do tego `npm audit fix` (sharp, source-map-js). Produkcyjnie: **0 podatności**.
- **`/_next/image` było otwartym proxy** dla dowolnego obrazu z internetu (catch-all `**` w `remotePatterns`) — zużywało limit transformacji i wystawiało powierzchnię ataku z CVE. → whitelist tylko naszego Supabase Storage; obce miniatury i tak renderują się jako `unoptimized`.
- **Soft-404:** nieistniejący artykuł zwracał **HTTP 200** (+noindex) — `loading.tsx` wysyłał nagłówki przed `notFound()`. → usunięty `loading.tsx` artykułu (nawigacja dalej natychmiastowa — strony ISR są prefetchowane w całości); nieznana kategoria → 404 z `layout.tsx`.
- **Nagłówki bezpieczeństwa przeniesione z proxy do `next.config.ts`.** Proxy (runtime Node.js) uruchamiał funkcję przed cache przy **każdej odsłonie** — pomiar: +50–130 ms TTFB i jedno wywołanie funkcji na wejście. Teraz proxy działa tylko na `/admin`.

### 1.2. Wydajność

- **Region funkcji `iad1` (Waszyngton) → `cdg1` (Paryż)**, obok bazy Supabase (eu-west-3). Każde zapytanie przy renderze przechodziło wcześniej przez Atlantyk; strony kategorii robią 3–4 zapytania sekwencyjnie.
- **Listy bez treści artykułów.** Home pobierał ~45 pełnych artykułów (`select *`, ~7 KB markdownu każdy), „Podobne" — 50 pełnych artykułów na render, a **`/api/search` wysyłał do przeglądarki ~140 KB JSON-a na zapytanie → teraz 12,8 KB**.
- **Spis treści jako komponent serwerowy** — cały markdown artykułu nie jest już dublowany w payloadzie RSC (HTML artykułu −13%).
- Tagi artykułu w jednym zapytaniu zamiast dwóch; layout nie pyta bazy o kategorie (siteConfig); usunięty bezużyteczny preconnect do Supabase; `x-powered-by` wyłączony; dłuższy cache zoptymalizowanych miniatur.

### 1.3. Pipeline (dane z telemetrii)

- **Koszty AI zapisywały się jako $0** (119/119 zdarzeń) — kod czytał `usage.total_cost`, a OpenRouter zwraca `usage.cost`. Dashboard `/admin` od teraz pokaże realne koszty.
- **231 URL-i miniatur z `&amp;`** (zepsute parametry CDN) i **125 atrybucji typu `Spider&#x27;s Web`** → pipeline dekoduje encje, historyczne rekordy normalizowane przy odczycie (bez zapisu do bazy); brak zdjęcia pokazuje markowy placeholder. Logo arXiv (211 artykułów) i grafiki stockowe **zostają** jako miniatury — decyzja właściciela (D3).
- **Kategoria spoza katalogu** („edukacja", 26.10) → artykuł bez kategorii (poza listami i breadcrumbem). → normalizacja z fallbackiem na kategorię feedu.
- **Data w prompcie zamrożona** w chwili załadowania modułu (Fluid Compute reużywa instancji między dniami) → budowana per wywołanie. Usunięte sprzeczności prompt systemowy vs użytkownika (liczba sekcji, nagłówek wniosków).
- **Bramka jakości przepuszczała angielski tytuł** w idealnym artykule (100−50 = 50, a próg odrzuca `< 50`) — wykryte nowym testem; kara podniesiona. Detektor odmowy AI sprawdza tylko początek odpowiedzi (cytat „nie mogę tego komentować" nie odrzuca już dobrego tekstu). Detektor angielszczyzny nie myli polskich „to/on/was/but".
- **Tagi:** upsert nadpisywał kanoniczną nazwę istniejącego tagu wariantem z AI („OpenAI" → „openai"). → dopasowanie po slugu, istniejące linkowane po id, powiązania jednym batchem.
- **Jeden fetch strony źródłowej** (treść + og:image) zamiast dwóch; większy budżet źródła (12 tys. znaków zamiast 6 — przy targecie 700–1200 słów stary limit ucinał bogate materiały); retry obejmuje zerwany strumień odpowiedzi (`TypeError: terminated` z telemetrii); `scrape_skip` loguje przyczynę.
- **Źródła RSS:** usunięte martwe (Microsoft AI Blog — 410, „Anthropic Research" — 404), zaktualizowane przeniesione (OpenAI, Google), encje w tytułach RSS dekodowane.

### 1.4. SEO on-page, UX, jakość kodu

- Graf encji JSON-LD z `@id`: NewsArticle (autor i wydawca) → NewsMediaOrganization → `founder` → Person na `/redakcja` (teraz `ProfilePage`); WebSite z `@id`. Wymiary OG deklarowane tylko dla własnej karty.
- **„Podobne publikacje" tematyczne** (wspólne tagi) zamiast losowych — spójne klastry linkowania wewnętrznego, deterministyczne między regeneracjami.
- Daty w strefie **Europe/Warsaw** (serwer w UTC pokazywał artykuł z 0:30 z datą dnia poprzedniego).
- Pasek kategorii w tej samej kolejności co menu mobilne, stopka i sekcje home (jedno źródło: `siteConfig`).
- Polityka prywatności zgodna ze stanem faktycznym (GA4, Vercel Analytics, localStorage, MailerLite jako podmiot przetwarzający).
- **Newsletter na MailerLite** z double opt-in (honeypot, bez kopii adresów w Supabase, identyczna odpowiedź dla nowych i istniejących adresów) + zaprojektowana wiadomość potwierdzająca (`emails/`).
- Admin: odświeżanie strony artykułu/sitemap po zdjęciu tekstu, walidacja argumentów akcji. Cron: porównanie sekretu stałoczasowe. Newsletter: wspólny klient, poprawne kody błędów.
- Testy 84 → **130** (nowe: bramka jakości, tagi, ekstrakcja treści/og:image, encje, miniatury, daty, kategorie). CI na GitHub Actions. `npm run check`.
- **Niezależny code review** (osobny agent, bez dostępu do moich założeń) potwierdził niezmienniki i znalazł m.in.: zbyt agresywny detektor angielskich tytułów (odrzucałby „Gemini in Chrome trafia do Polski i UE"), cache'owanie błędów bazy jako pustej sitemapy/404, ryzyko przekroczenia limitu funkcji przy retry — wszystkie poprawione (błędy bazy w ścieżkach ISR rzucają wyjątek → Next zachowuje poprzednią wersję; wywołania AI mają twardy termin).
- Migracje **006** (indeks pod listy kategorii, `popular_tags` tylko z opublikowanych) i **007** (stały `search_path` funkcji). `supabase/verify.sql` — diagnostyka schematu.
- **Baza zmigrowana na produkcji** (001 → 007, jedna transakcja):
  1. pełny backup przez Supabase CLI w `../aifeed-backups/2026-10-28/`, odtworzony testowo w kontenerze z identycznym Postgresem;
  2. migracje sprawdzone na tej kopii, potem próba na produkcji z `ROLLBACK`;
  3. właściwe wgranie.

  Wynik:
  - liczby wierszy i suma kontrolna `updated_at` identyczne jak przed migracją (lastmod w sitemapie nietknięty);
  - ostrzeżenia Security Advisor: 1 → 0;
  - `pg_trgm` w schemacie `extensions`;
  - nieużywana tabela `newsletter_subscribers` nigdy nie powstała.

---

## 2. Wdrożenie

### 2.1. Kolejność

1. **Baza najpierw** (kod działa też bez migracji — ma fallbacki; newsletter od nich nie zależy):
   - [x] `supabase/verify.sql` → braki: 001, indeks z 002, 004, 006.
   - [x] Backup + migracje 001 → 007 (procedura: `supabase/README.md` › Kopie zapasowe).
   - [x] `verify.sql` jeszcze raz → wszystkie `true` (2026-10-28).
2. **Deploy:**
   ```bash
   npm run check && npm run build
   git push
   npx vercel deploy --prod --yes
   ```
3. **Smoke testy** (wszystkie powinny przejść):
   - [ ] `curl -s https://www.aifeed.pl/sitemap.xml | grep -c "<loc>"` → **~1910+** (było 1371)
   - [ ] `curl -sI https://www.aifeed.pl/artykul/nie-istnieje | head -1` → **404** (było 200)
   - [ ] `curl -sI https://www.aifeed.pl/kategoria/xyz | head -1` → **404**
   - [ ] `curl -sI https://www.aifeed.pl/ | grep -i "x-vercel-id\|content-security"` → CSP obecne; `x-vercel-id` bez `iad1` (strona z CDN bez funkcji)
   - [ ] `curl -s -o /dev/null -w "%{http_code}" "https://www.aifeed.pl/_next/image?url=https%3A%2F%2Fupload.wikimedia.org%2Fwikipedia%2Fcommons%2F4%2F47%2FPNG_transparency_demonstration_1.png&w=64&q=75"` → **400** (było 200)
   - [ ] `https://www.aifeed.pl/admin` → Basic Auth działa
   - [ ] Formularz newslettera w stopce → „Prawie gotowe! Sprawdź skrzynkę" → mail potwierdzający z MailerLite → klik → adres aktywny w grupie (po kroku 0.2a)
   - [ ] Wyszukiwarka zwraca wyniki (004 wgrana — FTS)
   - [ ] Po najbliższym cronie: `/admin` → koszt runu > $0; nowy artykuł ma kategorię, tagi, miniaturę
   - [ ] Rich Results Test dla przykładowego artykułu — NewsArticle bez błędów
4. **Domena i GSC** — punkty 0.3 i 0.4.

### 2.2. Gdyby coś poszło nie tak

- Rollback kodu: Vercel → Deployments → poprzedni deployment → „Promote to Production" (natychmiastowy).
- Migracje są addytywne (nowe tabele/kolumny/indeksy/funkcje) — rollback kodu nie wymaga cofania bazy.

---

## 3. Decyzje

Każda decyzja ma rekomendację. Zaznacz wybór, a ja (lub kolejna sesja) to wdrożę.

### D1. Zgody na cookies (CMP) — **P0 przed jakąkolwiek monetyzacją**

Stan: GA4 ustawia cookies `_ga` bez zgody. Od 11.2024 polskie Prawo komunikacji elektronicznej (art. 399) wymaga **uprzedniej zgody** na cookies niebędące niezbędnymi; AdSense/Journey/Ezoic w EOG wymagają certyfikowanego CMP (TCF 2.2) i Consent Mode v2.

- **A (rekomendowane):** lekki baner zgód + **Google Consent Mode v2** (domyślnie `denied`, GA4 wysyła modelowane pingi bez cookies do czasu zgody). Teraz własny, minimalistyczny baner zgodny z designem; przy starcie reklam podmiana na certyfikowany CMP (np. darmowy „Privacy & messaging" Google). Koszt: ~1 sesja pracy. Efekt: zgodność + dane GA nadal użyteczne.
- B: wyłączyć GA4, zostawić tylko Vercel Web Analytics (bez cookies → bez banera). Najprostsze, ale tracisz GA4 (konwersje, źródła ruchu, przyszłe połączenie z AdSense).
- C: zostawić jak jest — **nie rekomenduję** (ryzyko prawne rośnie z ruchem; blokuje monetyzację).

### D2. Newsletter — częstotliwość i treść

✅ **Wybrane narzędzie: MailerLite** (2026-10-28, grupa „AiFeed — newsletter") — zapis z double opt-in z formularza w stopce, MailerLite przechowuje listę, wysyła potwierdzenia i obsługuje wypisy; copy w stopce bez obietnicy „codziennie". Konfiguracja panelu: `emails/README.md` (krok 0.2a).

Do decyzji: **co i jak często wysyłamy.**
- **A (rekomendowane):** **tygodniowo** — „Tydzień w AI po polsku": automatyczny draft z 5–7 najważniejszych artykułów tygodnia + Twój krótki komentarz (E-E-A-T, §5.2). Technicznie: endpoint tworzący w MailerLite szkic kampanii (API `campaigns`) do Twojej akceptacji — nie automatyczna wysyłka.
- B: codzienny digest automatyczny (kampania RSS w MailerLite z `feed.xml`) — zero pracy, ale niska wartość i ryzyko wypisów; nie rekomenduję na start.
- Dodatkowo: mail powitalny po potwierdzeniu (automatyzacja MailerLite z wyzwalaczem „dołączył do grupy") — mogę zaprojektować w stylu wiadomości potwierdzającej.

### D3. Miniatury: logo i grafiki stockowe ze źródeł

✅ **Decyzja właściciela (2026-10-28): zostają.** Pipeline bierze og:image ze źródła także wtedy, gdy to logo serwisu (arXiv — dziś 211 artykułów) albo stockowa grafika używana przez źródło wielokrotnie. AI generuje miniaturę tylko, gdy źródło nie ma żadnego obrazka (~5% artykułów).

Opcja na przyszłość (gdy Discover stanie się priorytetem): zastępować **wyłącznie logo arXiv** miniaturą AI. Koszt: ~1,2 artykułu z arXiv dziennie × ~$0,04 (Gemini 2.5 Flash Image) ≈ **$1,5/mies.**; jednorazowo dla 211 istniejących ≈ $8–9. Zmiana to kilka linijek w `generator.ts`. Realny koszt obrazka zobaczysz w `/admin` po pierwszym tygodniu (logowanie kosztów naprawione).

### D4. Przegląd wsteczny najsłabszych tekstów

Od kwietnia do sierpnia pipeline działał na słabszym modelu i promptach (krótsze teksty, angielskie slugi, 1 artykuł bez kategorii od 04.2026). Mniejszy, czystszy indeks > większy, śmieciowy.
- **A (rekomendowane):** raport w `/admin` „kandydaci do zdjęcia" (< 400 słów, brak sekcji wniosków, angielski slug, brak kategorii, 0 wyświetleń w GSC po 90 dniach) → ręczna decyzja per artykuł → unpublish (404, nie 410 — można przywrócić). Wymaga: integracja GSC API (opcjonalnie) albo eksport CSV z GSC.
- B: zostawić — mniejsze ryzyko, ale „ogon" słabych stron obniża ocenę całej domeny w modelu helpful content.

### D5. Model i wolumen

Stan (14 dni): 117 artykułów, średnio 801 słów, quality score śr. 99,9 (bramka praktycznie nie różnicuje — §5.1), synteza wielu źródeł tylko w 3% artykułów, 0 przerwanych runów (śr. 132 s, maks. 186 s z 270 s budżetu).
- **A (rekomendowane):** zostać przy Sonnet 5 i 9/dzień; po tygodniu z poprawnym logowaniem kosztów (od tej wersji) policzyć realny koszt/artykuł; nadwyżkę budżetu przeznaczyć na **weryfikację faktów** (§5.1), nie na droższy model.
- B: Opus 5 dla artykułów z syntezą ≥2 źródeł (najbardziej wymagające) — ~2,5× koszt tych tekstów.
- C: zwiększenie wolumenu — **nie teraz** (profil scaled content; najpierw sygnały jakości z GSC).

### D6. Źródła RSS

VentureBeat blokuje nasz bot (HTTP 429), AI News ma przerwy (502/timeout), ZDNet przekierowuje temat AI na ogólny feed newsów (filtr słów kluczowych go odsiewa). Polskich źródeł są 3 (Spider's Web, AntyWeb, Niebezpiecznik), a **Spider's Web regularnie nie daje się pobrać z serwerów Vercela** (lokalnie działa — od tej wersji telemetria pokaże kod błędu; przeniesienie funkcji do Paryża może to samo naprawić).
- **A (rekomendowane):** po tygodniu przejrzeć `scrape_skip.reason` w telemetrii; dodać 2–3 polskie źródła o AI (np. sekcje AI portali technologicznych, blogi polskich firm/uczelni AI) i 1–2 źródła regulacyjne UE (AI Act) — polski kąt to nasza przewaga (§4).

### D7. Vercel Pro

✅ **Stan (sprawdzony 2026-10-28):** projekt `aifeed-pl` jest w zespole **zeprzalka** na planie **Pro**. Ograniczenie Hobby („bez użycia komercyjnego") już nie dotyczy, są dłuższe logi i wyższe limity.

Do decyzji zostaje tylko **integracja z Git** — dziś jej nie ma (`git push` nie wdraża, deploy = `npx vercel deploy --prod --yes`).
- **A (rekomendowane przy kolejnych większych zmianach):** podłączyć repozytorium GitHub. Każdy push na `main` = deploy produkcyjny, każda gałąź = podgląd (preview) do sprawdzenia przed wdrożeniem. Wymaga zielonego CI jako bramki.
- B: zostać przy ręcznym deployu — pełna kontrola, ale łatwo zapomnieć o wdrożeniu (tak sitemapa „zamarzła" na 2,5 miesiąca).

### D8. Kopie zapasowe bazy

✅ **Stan (sprawdzony 2026-10-28):**
- Organizacja Supabase jest na planie **Pro** — dzienne kopie fizyczne, 7 dni wstecz (Dashboard → Database → Backups).
- Ręczny pełny dump sprzed migracji leży w `../aifeed-backups/2026-10-28/` i został odtworzony testowo. Procedura: `supabase/README.md`.

Do decyzji tylko **długi horyzont**: 7 dni nie chroni przed błędem zauważonym po tygodniu (np. masowe zepsucie treści). 1900+ artykułów to główny kapitał serwisu.
- **A (rekomendowane):** cotygodniowy dump (GitHub Action → prywatny storage, 12 tygodni retencji). Koszt ~0 zł.
- B: PITR (płatny dodatek Supabase) — odtworzenie do sekundy, ale drożej i wciąż w tym samym dostawcy.
- C: ręczny dump przed każdą większą zmianą (minimum — już stosowane).

---

## 4. Strategia SEO

### 4.1. Diagnoza (bez zmian od 08.2026)

Polityka spamowa Google definiuje **scaled content abuse** i wprost wymienia automatyczne tłumaczenie feedów. Ocalałe serwisy AI-assisted mają wspólne cechy: umiarkowane tempo, transparentność procesu, **information gain** (coś, czego nie ma w źródle), imienna odpowiedzialność za serwis, zróżnicowana struktura. Odzyskanie widoczności po klasyfikacji algorytmicznej praktycznie się nie zdarza — dlatego profil serwisu zmieniamy **zanim** klasyfikacja się utrwali.

### 4.2. Stan filarów

| Filar | Stan | Następny krok |
|---|---|---|
| 1. Tożsamość (E-E-A-T) | ✅ `/redakcja` (ProfilePage), `/o-serwisie` (proces, korekty), graf encji z `@id` | Profile społecznościowe serwisu (LinkedIn/X) → `sameAs` organizacji; zdjęcie na `/redakcja` |
| 2. Information gain | 🟡 polski kąt w prompcie, synteza źródeł (ale tylko 3% artykułów), linkowanie wewnętrzne | Klasteryzacja tematów (§5.1), huby tematyczne (§5.2), tekst autorski tygodniowo |
| 3. Dystrybucja | 🟡 news-sitemap, IndexNow, Preferred Sources | Newsletter (D2), Discover-ready obrazy (§5.3), social auto-posting |
| 4. Higiena techniczna | ✅ po tej wersji: sitemapa ISR, prawdziwe 404, region, payloady, nagłówki | Monitoring GSC co tydzień; Core Web Vitals po 28 dniach od deployu |

### 4.3. Tagi

Katalog: 2618 tagów, ~73% z jednym artykułem → strony tagów pozostają `noindex, follow` i poza sitemapą. Docelowo zastąpią je **huby tematyczne** (§5.2) — indeksowalne strony dla ~30–50 najważniejszych encji. Nie przywracać indeksacji tagów bez konsolidacji katalogu (backlog 7.1).

### 4.4. Czego nie robić

- ❌ Zwiększać wolumenu, zanim GSC pokaże stabilną indeksację i CTR nowych artykułów.
- ❌ Bylinów osób przy artykułach (decyzja właściciela — nazwisko firmuje serwis, nie teksty).
- ❌ Blokować crawlerów AI w robots.txt — dla serwisu o AI cytowania w ChatGPT/Perplexity/AI Overviews to kanał dystrybucji.
- ❌ Masowej sprzedaży linków / nadmiaru artykułów sponsorowanych (site reputation abuse).

---

## 5. Kierunki rozwoju

Cel: **najlepszy polski autonomiczny serwis o AI** = najbardziej wiarygodny (fakty), najbardziej użyteczny dla polskiego czytelnika (kontekst PL/UE), najlepiej zorganizowany (tematy, nie tylko strumień newsów).

### 5.1. Q4 2026 — jakość treści 2.0 (po wdrożeniu §0)

- **Weryfikacja faktów (LLM-as-judge):** drugi, tańszy przebieg modelu porównuje gotowy artykuł ze źródłem i zwraca listę twierdzeń bez pokrycia (liczby, daty, cytaty). Twierdzenie bez pokrycia → poprawka albo odrzut. Dziś bramka jakości ocenia tylko strukturę (śr. 99,9/100 — nie różnicuje). To największa dźwignia zaufania przy zerowym udziale człowieka. Koszt: ~$0,005–0,01/artykuł.
- **Klasteryzacja tematów (embeddingi):** zamiast porównania tokenów tytułów (synteza w 3% artykułów) — podobieństwo semantyczne całej puli feedów → więcej syntez z 2–3 źródeł i deduplikacja na poziomie wydarzenia (dziś ~1% par artykułów o tym samym temacie).
- **Raport jakości w `/admin`:** rozkład długości, odsetek syntez, odrzuty i ich przyczyny, koszty dzienne (dane już są w `pipeline_events`).

### 5.2. Q1 2027 — struktura i treści wiecznie zielone

- **Huby tematyczne** `/temat/[encja]` (OpenAI, Anthropic, Google, Meta, AI Act, modele open source…): krótkie, regularnie aktualizowane wprowadzenie (AI + Twoja redakcja), oś czasu wydarzeń, FAQ, wszystkie artykuły o encji. Indeksowalne — zastępują cienkie tagi jako cel linkowania wewnętrznego. Największa dźwignia topical authority.
- **„Tydzień w AI po polsku"** — automatyczny draft z artykułów tygodnia + Twój komentarz, podpisany nazwiskiem; jednocześnie wydanie newslettera (D2) i strona archiwum.
- **Słownik AI** (`/slownik/[termin]`) — evergreen, duży wolumen zapytań informacyjnych po polsku, naturalne linkowanie z artykułów.
- **Poradniki i porównania** („Najlepsze narzędzia AI do X po polsku") — fundament afiliacji (§6), pisane/redagowane przez Ciebie.

### 5.3. Q1–Q2 2027 — dystrybucja i Discover

- Miniatury ≥ 1200 px i re-host wszystkich miniatur do Storage (kontrola nad LCP i dostępnością; wymóg Discover) — backlog 7.3, D3.
- Auto-posting nowych artykułów na LinkedIn/X/Threads/Bluesky z pipeline'u (krótki lead + link; bez spamu — max kilka dziennie).
- Integracja GSC API z `/admin`: wyświetlenia/kliknięcia per artykuł i per źródło RSS → wagi w selekcji tematów (pętla zwrotna: piszemy więcej o tym, co Polacy realnie czytają).

### 5.4. Q2 2027+ — skala

- Vercel Queues dla pipeline'u (artykuł = osobne zadanie z własnym budżetem i retry) — gdy wolumen > 10/dzień albo pojawią się przerwane runy.
- Wyszukiwarka semantyczna (pgvector) — gdy archiwum przekroczy ~5 tys. artykułów.
- Personalizacja (ulubione tematy) — dopiero przy kontach użytkowników (newsletter premium).

---

## 6. Monetyzacja

### 6.1. Realia rynku PL (bez zmian)

Display w Polsce: **1–5 zł RPM** (AdSense), sieci zoptymalizowane 5–12 zł. Sam display nie pokryje kosztów. Realny stos: **afiliacja (USD/EUR) + artykuły sponsorowane + newsletter**, display jako dodatek; do tego dźwignia wizerunkowa (marka osobista, zlecenia B2B).

### 6.2. Warunki wstępne (twarde)

1. CMP + Consent Mode v2 (D1).
2. Vercel Pro (D7 — Hobby wyklucza użycie komercyjne).
3. Strony transparentności ✅, polityka prywatności z sekcją o reklamach (dopisać przy starcie reklam).
4. Przegląd wsteczny słabych tekstów (D4) — przed aplikacją do sieci reklamowej.

### 6.3. Fazy

| Faza | Próg | Działania |
|---|---|---|
| 0 — fundament | teraz | §0, D1, D2; konta: PartnerStack (afiliacje AI SaaS), WhitePress/Linkhouse (marketplace sponsorowanych — samo wystawienie darmowe) |
| 1 — pierwsze przychody | 1000+ sesji/mies. | **Journey by Mediavine** (próg 1000 sesji, rev-share 70%; alternatywa Ezoic); 2–3 poradniki/rankingi miesięcznie z oznaczoną afiliacją (ElevenLabs 22% recurring, Jasper 25–30%, Writesonic 30% lifetime, Synthesia 25%); newsletter: budowa listy (cel 500–1000) |
| 2 — skalowanie | 10 000+ PV/mies. | Artykuły sponsorowane 2–4/mies. (`rel="sponsored"`, oznaczone; 100–500 zł/szt.); sponsoring newslettera (300–800 zł/wydanie przy 1–2 tys. subskrybentów); bezpośrednie umowy afiliacyjne |
| 3 — dźwignia | 6–12 mies. | Newsletter premium (konwersja free→paid 2–7%), produkty własne (kurs/e-book „AI w praktyce po polsku"), konsultacje, wystąpienia |

### 6.4. Czego nie robić

- ❌ AdSense/Journey przed D1 i D4 (odrzut zostaje w historii konta).
- ❌ Ściana reklam przy małym ruchu (CWV i Discover CTR za grosze).
- ❌ Masowa sprzedaż linków.

---

## 7. Backlog techniczny

Świadomie odłożone; wracamy wg triggera.

| # | Co | Trigger |
|---|---|---|
| 7.1 | **Konsolidacja tagów w DB** (scalenie wariantów, 2618 → ~300) + ewentualna re-indeksacja top-50 lub zastąpienie hubami (§5.2) | Przed hubami tematycznymi |
| 7.2 | **Paginacja ścieżkowa** `/kategoria/[slug]/strona/[nr]` (pełne ISR zamiast renderu per-request, prawdziwe 404 dla pustych stron zamiast 200+noindex) + 301 dla `?page=` | TTFB kategorii w CrUX > 800 ms albo wzrost ruchu na listach |
| 7.3 | **Miniatury: preferencja ≥ 1200 px (`og:image:width`) + re-host do Storage** | Prace nad Discover (§5.3) |
| 7.4 | ~~**Newsletter: double opt-in + unsubscribe**~~ ✅ 2026-10-28 przez MailerLite. Zostało: szkic kampanii tygodniowej przez API MailerLite (D2-A), mail powitalny | Decyzja D2 |
| 7.5 | **Rate limit na Upstash Redis** (obecny in-memory per instancja) | > 100 req/min na API albo anomalia w logach |
| 7.6 | **Vercel Queues dla pipeline'u** | > 10 artykułów/dzień albo przerwane runy |
| 7.7 | **DNS rebinding guard** (pinning resolvera w safe-fetch) | Prace nad scraperem; niskie ryzyko na Vercelu |
| 7.8 | **CSP z nonce zamiast `unsafe-inline`** — wymaga renderu per-request (koniec ISR/CDN dla HTML), więc dziś koszt > zysk | Gdy Next da nonce kompatybilny z ISR albo pojawi się treść od użytkowników |
| 7.9 | **E2E (Playwright)**: home, artykuł, 404, kategoria, wyszukiwarka, newsletter | Po starcie Vercel Pro (preview deploys = środowisko testów) |
| 7.10 | **Retencja `pipeline_events`** (dziś 4,1 tys. wierszy, ~5 tys./rok) — czyszczenie > 180 dni | > 50 tys. wierszy |
| 7.11 | **`generateSitemaps`** (podział sitemapy) | > 40 tys. artykułów |
| 7.12 | **Karta OG z fontem marki** (dziś domyślny font silnika — poprawne polskie znaki, ale lżejszy krój niż logo) | Prace nad brandingiem |
| 7.13 | **Monitoring błędów** (Sentry lub Vercel Observability) + uptime (np. Better Stack) | Vercel Pro (D7) |
| 7.14 | **Typy Supabase** (`supabase gen types`) zamiast rzutowań w `data.ts` | Następna większa zmiana schematu |
| 7.15 | **Ponawianie źródeł po błędach przejściowych** (timeout, 429, 5xx): dziś każda porażka pobrania oznacza URL jako przetworzony na stałe. Wymaga kolumny `attempts` w `scraped_items` (dedup traktuje KAŻDY wiersz jako przetworzony) — bez limitu prób trwale padające źródło zajmowałoby slot w każdym runie | `scrape_skip` z przyczyną `timeout`/`http-5xx` > 5% runów (telemetria od tej wersji) |

---

## 8. KPI

**Baseline (2026-10-28):** 1902 artykuły · sitemap na produkcji 1371 URL-i (po wdrożeniu ~1910) · 14 dni: 117 artykułów, śr. 801 słów, 0 przerwanych runów, 12 pominiętych źródeł (`scrape_skip`), 1 odrzut jakości, 1 odmowa AI · synteza wielu źródeł 3% · miniatury AI 5% · koszt/artykuł — **nieznany** (logowanie naprawione w tej wersji; szacunek ~$0,05).

**SEO (tygodniowo, GSC):**
- Zaindeksowane artykuły ↑ (cel: > 90% z sitemapy w 4 tygodnie po wdrożeniu); tagi ↓ do ~0; „Soft 404" → 0
- Wyświetlenia z Discover — **główny wskaźnik sukcesu strategii**
- Średnia pozycja i CTR dla 10 śledzonych fraz
- Core Web Vitals (CrUX, mobile): LCP < 2,5 s, INP < 200 ms, CLS < 0,1

**Produkt (miesięcznie):**
- Subskrybenci newslettera (po D2: +100/mies.)
- Teksty autorskie (cel ≥ 4/mies.)
- Pipeline: success rate > 85%, synteza wielu źródeł > 15% (po §5.1), koszt/dzień (z `/admin`)

**Finanse (miesięcznie):** przychód wg źródła; próg #1: przychód > koszty (OpenRouter + Vercel Pro + Supabase); kamień milowy: 1000 zł/mies.

---

## 9. Historia

Szczegóły w `git log`. Najważniejsze etapy:

- **2026-08-10 — audyt produkcyjny:** Next 16.3, SSRF domknięty (`safe-fetch`), Server Actions admina z autoryzacją wewnątrz, sitemapa stronicowana (limit 1000 wierszy PostgREST), tagi `noindex` i poza sitemapą, pipeline z katalogiem tagów, `updated_at` tylko przy zmianie treści (005), usunięty `/api/cron/seed`.
- **2026-08-11 — SEO i jakość:** linkowanie wewnętrzne z whitelistą slugów, `news-sitemap.xml`, IndexNow, Preferred Sources, `/o-serwisie` jako strona transparentności, `/redakcja` (nazwisko firmuje serwis, nie artykuły), model **Claude Sonnet 5**, prompt 700–1200 słów z „Co to oznacza dla Polski", synteza wielu źródeł, tagi 3-stopniowe, wolumen 3×3/dzień, home „najnowsze na górze".
- **2026-08-12 — UX/brand:** favicon i ikony z glifów logo (light/dark), paginacja tagów, aktywny pill kategorii po hydratacji, fallback `popular_tags` stronicowany.
- **2026-10-28 — audyt i refaktoryzacja** (§1).

---

*Dokument utrzymywany ręcznie. Aktualizuj po każdym zamkniętym etapie — nieaktualna roadmapa jest gorsza niż żadna.*

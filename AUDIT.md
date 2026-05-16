# AiFeed — Audyt produkcyjny i plan napraw

> **Status:** wersja 1.0 · 2026-05-16
> **Zakres:** pełny przegląd 84 plików `.ts/.tsx`, schema Supabase, migracji, konfiguracji Vercel/Next, pipeline AI i komponentów UI.
> **Cel:** doprowadzić serwis do stanu gotowego na ekspozycję w wyszukiwarce Google i kampanie pozyskiwania ruchu.
> **Język produktu:** polski (cały copy, artykuły, commity, sloga URL).

---

## Spis treści

1. [Streszczenie wykonawcze](#1-streszczenie-wykonawcze)
2. [Klasyfikacja priorytetów](#2-klasyfikacja-priorytetów)
3. [P0 — KRYTYCZNE (zatrzymują produkcję)](#3-p0--krytyczne-zatrzymują-produkcję)
4. [P1 — WYSOKIE (przed publicznym launchem)](#4-p1--wysokie-przed-publicznym-launchem)
5. [P2 — ŚREDNIE (pierwszy miesiąc po launchu)](#5-p2--średnie-pierwszy-miesiąc-po-launchu)
6. [P3 — NISKIE (backlog ulepszeń)](#6-p3--niskie-backlog-ulepszeń)
7. [Co działa dobrze — chronić przed regresją](#7-co-działa-dobrze--chronić-przed-regresją)
8. [Roadmapa SEO/pozycjonowania](#8-roadmapa-seopozycjonowania)
9. [Checklisty wdrożeniowe](#9-checklisty-wdrożeniowe)
10. [Załącznik A — mapa plików i odpowiedzialności](#10-załącznik-a--mapa-plików-i-odpowiedzialności)

---

## 1. Streszczenie wykonawcze

### Stan ogólny

AiFeed jest dobrze zaprojektowanym MVP serwisu informacyjnego. Najsilniejsze elementy: **wstrzykiwanie JSON-LD przez bezpieczny helper z eskapingiem U+2028/U+2029**, **separacja anon/service role**, **idempotentne migracje SQL**, **SSRF guard w scraperze** (`isInternalHost` blokuje loopback, RFC1918, AWS metadata 169.254.169.254), **dzienny limit "wyróżnionego" artykułu** z progiem jakości ≥ 80, **wykrywanie angielskich tytułów** w `quality.ts` (50-punktowa kara stopword-based).

Najsłabsze punkty: **wyciek sekretów do publicznego repozytorium GitHub** (P0), **brak idempotencji pipeline'u** vs `maxDuration=300s`, **rate limiter in-memory** nieprzydatny na multi-instance Vercel, **brak observability** (logi tylko do stdout), **`images.unoptimized=true`** zabija LCP, **strony tagów** to thin content z ryzykiem keyword cannibalization, **brak `generateStaticParams()`** dla głównych routes (cold-start ISR).

### Co trzeba zrobić, żeby skutecznie pozycjonować

1. **Naprawić bezpieczeństwo** (P0) — bez tego dalsza praca nie ma sensu, klucze służą atakującym.
2. **Zagęścić sygnały SEO na poziomie artykułu** (P1) — JSON-LD jest już dobry, ale brakuje `generateStaticParams`, optymalizacji obrazów, kontroli paginacji i polityki tagów.
3. **Dodać observability** (P1) — bez metryk nie wiadomo, czy pipeline w ogóle publikuje, ile artykułów odrzuca quality gate, jaki jest koszt OpenRouter.
4. **Zoptymalizować Core Web Vitals** (P2) — Google używa CWV jako rankingowego sygnału; obecnie LCP jest zagrożony przez `unoptimized: true` na obrazach RSS.
5. **Wybrać strategię taksonomii tagów** (P2) — albo zainwestować w treść tagu, albo go znoindexować; obecny stan szkodzi.

### Co NIE jest priorytetem (świadomie pomijamy)

- **Migracja do Edge Functions** — Vercel oficjalnie odradza, Fluid Compute jest standardem.
- **Tailwind config** — Tailwind 4 nie potrzebuje `tailwind.config.js`, obecna konfiguracja w `globals.css` jest poprawna.
- **`rel="prev/next"`** na paginacji — Google ignoruje od 2019, canonical wystarcza.
- **Hreflang** — serwis monolingwalny.
- **Sentencja typu "AI generated"** w UI artykułu — to świadoma decyzja produktowa.

---

## 2. Klasyfikacja priorytetów

| Priorytet | Znaczenie | Termin | Liczba zadań |
|-----------|-----------|--------|--------------|
| **P0** | Krytyczne — wycieki, bezpieczeństwo, prawo | **natychmiast** | 3 |
| **P1** | Wysokie — blokują profesjonalny launch | przed kampanią | 9 |
| **P2** | Średnie — pierwsze 30 dni po launchu | jeden sprint | 12 |
| **P3** | Niskie — backlog ulepszeń | gdy czas pozwoli | 9 |

---

## 3. P0 — KRYTYCZNE (zatrzymują produkcję)

### P0-1. Wyciek sekretów w publicznym repozytorium GitHub  — ✅ KOD WYCZYSZCZONY (2026-05-16)

**Repozytorium źródłowe:** `git@github.com:mich-zeprzalka/aifeed-test.git` — w czasie audytu API GitHub raportowało `"private": false, "visibility": "public"`.

**Co wyciekło i gdzie było:**

| Klucz | Wartość (skrócona) | Lokalizacja w drzewie |
|-------|---------------------|------------------------|
| `OPENROUTER_API_KEY` | `sk-or-v1-5f86…c2910` | `scripts/seed-articles.mjs:5` |
| `UNSPLASH_ACCESS_KEY` | `U9vQ5_S…M9Y` | `scripts/seed-articles.mjs:6` |
| `SUPABASE_SERVICE_ROLE_KEY` | JWT z `exp: 2091385319` (**ważny do 2036**) | `scripts/seed-articles.mjs:10` |
| Project ref (`iwseooszjbafasmjdiki`) + pooler URL | n/d | `supabase/.temp/{linked-project.json, pooler-url, project-ref}` — śledzone w gicie! |
| Hardcoded host Supabase | n/d (URL publiczny, ale złe praktyki) | `next.config.ts:12`, `src/app/layout.tsx:147` |

**Co zostało zrobione w kodzie (commit pending):**

- ✅ **Usunięty `scripts/seed-articles.mjs`** całkowicie (`git rm`). Skrypt był jednorazowym seederem, jego zadanie realizuje dziś automatyczny pipeline `src/app/api/cron/generate/route.ts` — nie ma potrzeby trzymać duplikatu.
- ✅ **Usunięte z indeksu 9 plików `supabase/.temp/*`** (`git rm --cached`). To lokalne artefakty Supabase CLI (project ref, pooler URL, wersje wtyczek) — nigdy nie powinny były wejść do repo.
- ✅ **`.gitignore` rozszerzony** o:
  - `supabase/.temp/` oraz `supabase/.branches/` (Supabase CLI local state).
  - `scripts/*.local.*` (wzorzec na lokalne, dev-only skrypty z sekretami).
- ✅ **`next.config.ts:1-18, 27-33`** — host Supabase Storage parsowany z `NEXT_PUBLIC_SUPABASE_URL` w build time przez nową funkcję `parseSupabaseHostname()`. Fallback `*.supabase.co` pokrywa każdy projekt na hostingu Supabase nawet bez ustawionego env. Brak hardcoded project ref.
- ✅ **`src/app/layout.tsx`** — `<link rel="preconnect">` do Supabase Storage emit'owany tylko gdy `NEXT_PUBLIC_SUPABASE_URL` jest ustawione; origin pobierany przez `new URL(...).origin`. Brak hardcoded hosta.
- ✅ **Weryfikacja:** `grep -RIn -E "(sk-or-v1-[A-Za-z0-9]{20,}|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJ|U9vQ5_SLTvK9|iwseooszjbafasmjdiki)"` → **0 trafień** w kodzie aplikacji (poza tym dokumentem).
- ✅ `npx tsc --noEmit` exit 0, `npm run lint` exit 0, `npm test` 46/46 zielone.

**Co MUSISZ zrobić poza kodem (ręcznie, bo wymaga dostępu do dashboardów / przepisuje historię gita):**

1. **Natychmiast zrotuj wszystkie trzy klucze:**
   - Supabase Dashboard → Project Settings → API → przycisk "Reset" obok `service_role` key. Nowy klucz pojawi się natychmiast; stary jest unieważniony.
   - OpenRouter Dashboard → API Keys → "Revoke" przy `sk-or-v1-5f86…` + wygeneruj nowy.
   - Unsplash Developer Portal → twoja aplikacja → "Generate new access key", stary unieważnij.

2. **Wgraj nowe wartości w Vercel:**
   ```bash
   vercel env rm SUPABASE_SERVICE_ROLE_KEY production
   vercel env add SUPABASE_SERVICE_ROLE_KEY production
   # analogicznie OPENROUTER_API_KEY; UNSPLASH_ACCESS_KEY tylko jeśli nadal używany
   ```
   W `.env.local` (lokalnie) też podmień.

3. **Wyczyść historię gita ze wszystkich trzech sekretów + project ref.** Sam `git rm` (już wykonane) usuwa pliki z bieżącego commita, ale wartości pozostają w obiektach gita. `git filter-repo` przepisuje historię bez nich:
   ```bash
   pip install git-filter-repo
   git filter-repo --path scripts/seed-articles.mjs --invert-paths
   git filter-repo --path supabase/.temp --invert-paths
   git push origin --force --all
   git push origin --force --tags
   ```
   Alternatywa: `bfg-repo-cleaner`.

4. **Zmień widoczność repo na private** (GitHub → Settings → Danger Zone → Change visibility). Nawet po wyczyszczeniu historii — repo jest "trusted-no-more" i osoby, które miały fork/clone, wciąż mają stare obiekty.

5. **Sprawdź Supabase Logs** (Project → Logs → Postgres Logs) za ostatnie 30 dni — szczególnie zapytania na `newsletter_subscribers` z nieznanych IP oraz `INSERT/UPDATE/DELETE` poza godzinami cron (05:00/11:00/17:00 UTC).

6. **Sprawdź OpenRouter Activity** (Dashboard → Activity) — anomalie kosztów, generacje spoza krajowych IP.

7. **Po rotacji**: lokalnie `npm run build && npm run start` z nowymi wartościami i smoke test cron: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/generate?count=1"`.

**Defensywa na przyszłość (osobne taski, niepilne):**

- Pre-commit hook z `gitleaks` przez `husky`.
- GitHub Action `gitleaks-action` na każdy push.
- W settings repo: włącz "Secret scanning" + "Push protection".

---

### P0-2. Brak weryfikacji RLS po rotacji `service_role`

**Powiązane z P0-1.** Po rotacji klucza upewnij się, że żaden inny moduł nie zostawia hardcoded JWT-a. Wykonaj:

```bash
grep -RIn "eyJ" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" src/ scripts/
grep -RIn "sk-or-v1" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" src/ scripts/ docs/
```

Oba grep-y muszą zwrócić **zero wyników**. Dodatkowo zweryfikuj `.next/` (build cache) i `.vercel/` — usuń je, jeśli zawierają cokolwiek wrażliwego.

---

### P0-3. DOCS.md odwoływany przez CLAUDE.md, ale nie istnieje  — ✅ NAPRAWIONE (2026-05-16)

**Decyzja:** wybrano **ścieżkę A** — CLAUDE.md zostaje krótki ("quick orientation"), a `AUDIT.md` (ten dokument) jest kanonicznym źródłem dla planowania zmian.

**Co zostało zrobione:**
- `CLAUDE.md:11` — wykasowane odwołanie do `DOCS.md`, zastąpione wskazaniem na `AUDIT.md` jako kanoniczny dokument audytu i remediation plan.
- `CLAUDE.md:15` — usunięto wzmiankę "and DOCS.md" w sekcji language conventions; doprecyzowano, że `AUDIT.md` jest po polsku jako project document.

Jeśli w przyszłości pojawi się potrzeba pełnej dokumentacji architektonicznej (ścieżka B), można ją utworzyć jako `docs/ARCHITECTURE.md` (folder `docs/` już istnieje) — wtedy AUDIT zostaje dokumentem zmian, ARCHITECTURE opisem stanu obecnego.

---

## 4. P1 — WYSOKIE (przed publicznym launchem)

### P1-1. `maxDuration=300s` jest niewystarczające dla `count=10`  — ✅ MITIGACJA NA HOBBY (2026-05-16)

**Plan:** projekt zostaje na Vercel Hobby (limit `maxDuration=300s`). Bez Pro nie podniesiemy budżetu, więc rozwiązujemy problem przez **mniejszy count + graceful time-budget guard**.

**Co zostało zrobione:**

- ✅ **`vercel.json`** — count zmniejszony z `10/5/5` do **`4/4/4`** (12 artykułów dziennie zamiast 20). Worst-case per artykuł ~200 s ⇒ 4 artykuły × średnio ~50 s = ~200 s, w budżecie 300 s z 100 s buforem.
- ✅ **`src/app/api/cron/generate/route.ts`** — dodany **time-budget guard**:
  - Stała `PIPELINE_BUDGET_MS = 270_000` (300 s minus 30 s bufor na: ostatni insert + response stringify + cold-finish).
  - `runStartedAt = Date.now()` zapisywane na początku try-bloku.
  - Pętla zmieniona na `for(let i; …)`; na początku każdej iteracji `if (Date.now() - runStartedAt > PIPELINE_BUDGET_MS)` — pozostałe items idą do tablicy `aborted[]` i pętla się przerywa.
  - Items **NIE** są oznaczone jako processed (`scraped_items.is_processed`), więc trafiają z powrotem do kolejki przy następnym cronie (idempotent dedup po `source_url`).
  - Response dostał dwa nowe pola: `aborted: string[]` i `duration_ms: number` — telemetria (potem do zapięcia w P1-5).
- ✅ Lint, tsc, 48/48 testów zielone.

**Co warto zrobić dodatkowo (kiedy będzie więcej danych):**

- Po wgraniu P1-5 (telemetry) zmierz realne `duration_ms` przez 7 dni. Jeśli średnia jest <150 s, można ostrożnie podnieść count do 5 lub 6.
- **Docelowo (P2-12): rozdział na Vercel Queues** — każdy artykuł = osobne wywołanie funkcji z własnym budżetem 300 s. Wtedy ograniczenie znika.

---

### P1-2. Rate limiter w pamięci JS — nieprzydatny na produkcji  — ⚠️ ŚWIADOMA DECYZJA NA MVP (2026-05-16)

**Decyzja właściciela:** zostajemy przy in-memory dla startu serwisu. Brak Upstash / Redis / shared store. Powód: serwis jest świeży, brak znanego ruchu, brak realnego ryzyka rozproszonego ataku, a wprowadzanie nowego vendora (kolejna usługa, kolejny rachunek, kolejny punkt awarii) jest dla MVP overkill.

**Co zostało zrobione w kodzie (ulepszenia, niezależne od backendu):**

- ✅ **`src/lib/rate-limit.ts`** — przepisany na czyste API z forward-compatibility:
  - Centralna stała `LIMITS = { newsletter: 5/60s, search: 30/60s }` w jednym miejscu (zamiast magicznych liczb w call sites).
  - Publiczna funkcja: `checkRateLimit(kind, ip): Promise<RateLimitResult>` — `kind` typu `"newsletter" | "search"`. Limity zmienia się w jednym pliku, call sites nie wiedzą o szczegółach.
  - **Celowo async** — gdy kiedyś podmienimy implementację na shared store (Redis), sygnatura zostanie ta sama, `await` w call sites się nie zmieni. Zero kosztu teraz (zwraca natychmiast resolved promise).
  - Pełny komentarz w nagłówku pliku o stanie i ścieżce upgrade'u.
- ✅ **Call sites zaktualizowane** (oba handlery już były async):
  - `src/app/api/newsletter/route.ts:14` — `await checkRateLimit("newsletter", ip)`.
  - `src/app/api/search/route.ts:13` — `await checkRateLimit("search", ip)`.
- ✅ **Testy:** `rate-limit.test.ts` przepisany pod nowe async API (6 testów: allowed, blocked, IP-isolation, kind-isolation, search 30/min, resetAt).
- ✅ **Paczki `@upstash/*` odinstalowane** — żeby `package.json` nie zawierał nieużywanych dependencies (czyste node_modules).
- ✅ `npx tsc --noEmit` OK, `npm run lint` OK, `npm test` 48/48 zielone.

**Realne ograniczenie, które akceptujemy:**

- Vercel Fluid Compute trzyma kilka instancji równolegle. Każda ma własną `Map`. Atakujący z 30 równoległych połączeń trafi w 30 instancji i każda zacznie liczyć od zera.
- **Co to faktycznie znaczy w praktyce:** głupi bot z jednego IP wysyłający 100 req/s → zostanie szybko zatrzymany (większość requestów trafi w tę samą instancję, bo Vercel scaluje stopniowo). Rozproszony atak z botnetu → tego nie zatrzymamy.
- **Próg, przy którym warto wrócić do P1-2:** > 100 req/min realnego ruchu na endpointach, ALBO pojawienie się ataku (anomalie w logach Vercel / koszty Supabase rosną bez wzrostu legitnego ruchu).

**Jak wykonać upgrade później (gdy będzie potrzeba):**

Implementacja Upstash już była gotowa i jest w historii gita (commit P1-2 z tej sesji, można go odtworzyć przez `git log --all -- src/lib/rate-limit.ts`). Migracja zajmie ~15 min:

1. `npm install @upstash/ratelimit @upstash/redis`
2. Vercel Dashboard → Storage → Add Integration → Upstash → Redis (eu-west-1). Marketplace auto-wstrzyknie `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
3. Przepisz `src/lib/rate-limit.ts` — wewnątrz `checkRateLimit()` najpierw spróbuj `Ratelimit.limit()`, fallback na obecny in-memory gdy env brakuje.
4. **Call sites się nie zmieniają** (dlatego API jest async — kontrakt zostaje).

**Alternatywa rozważona, odrzucona:** Supabase jako rate-limit store (tabela `rate_limits`). Plusy: brak nowego vendora. Minusy: ~30-100 ms HTTP overhead na każde sprawdzenie, +zużycie limitów Supabase free tier. Nieproporcjonalna cena za rozwiązanie problemu, którego jeszcze nie mamy.

---

### P1-3. Brak `generateStaticParams()` dla głównych dynamicznych route'ów

**Lokalizacja:** `src/app/artykul/[slug]/page.tsx`, `src/app/kategoria/[slug]/page.tsx`, `src/app/tag/[slug]/page.tsx`.

**Problem:** każde pierwsze wejście na nowy `slug` to **on-demand ISR** — Vercel buduje stronę dopiero przy pierwszym żądaniu (≈ 800-2000 ms). Bot Google trafia w cold-start zamiast w gotowy HTML, co psuje Time-To-First-Byte i Core Web Vitals z perspektywy crawlowania.

**Akcja:**

```ts
// src/app/artykul/[slug]/page.tsx — DODAJ (po linii 22):
import { getSitemapArticles } from "@/lib/data";

export async function generateStaticParams() {
  // Pre-render top 500 najnowszych — reszta przez on-demand ISR.
  // Limit 500 chroni przed wybuchem build time przy 10k+ artykułów.
  const articles = await getSitemapArticles(500);
  return articles.map((a) => ({ slug: a.slug }));
}
```

Analogicznie dla `/kategoria/[slug]` (pre-render wszystkich 6 kategorii z `siteConfig.categories`) i `/tag/[slug]` (top 100 tagów przez `getPopularTags(100)`).

**Korzyść:** statyczne 500 artykułów = natychmiastowy HTML przy crawl + lepsze TTFB w narzędziach Google Search Console "Inspect URL".

---

### P1-4. `images.unoptimized: true` — LCP zagrożone

**Lokalizacja:** `next.config.ts:9`.

**Kontekst:** flaga została włączona z dobrego powodu (some scraped thumbnails wracały zniekształcone z `/_next/image`), ale jest brutalna globalnie — wszystkie obrazy (także AI-generated z Supabase Storage) idą surowe.

**Problem dla SEO:**
- LCP image artykułu (`src/app/artykul/[slug]/page.tsx:170-177`) idzie często jako 800 KB JPEG od źródła, podczas gdy mógłby być 80 KB AVIF.
- Google CWV-LCP cap dla "Good" to **2.5 s**. Przy 1.2 MB obrazie na 4G to nieosiągalne.
- Vercel liczy bandwidth — surowe obrazy bezpośrednio przyspieszają zużycie kwoty.

**Akcja (trzy etapy):**

**Etap A — szybka mitigacja:**
- Zostaw `unoptimized: true` dla scraped thumbnails (RSS hosts).
- Dla **Supabase Storage** (AI-generated) wymuszaj transformację: zmień `next.config.ts` na warunkową whitelist'ę, ale na produkcji wystaw też **Supabase Image Transformations** (płatne ~\$0,005/100 transform — niskie).

**Etap B — własna optymalizacja na pipeline:**
- W `src/lib/images/generator.ts::uploadToStorage()` (linia 227-266) konwertuj WebP/AVIF przed uploadem (`sharp` lub `@vercel/og`-style). Wtedy Storage zwraca już <100 KB pliki i `unoptimized: true` nie boli.

**Etap C — wybierz konkretne źródła:**
- Zostaw `unoptimized` tylko dla domen znanych z problemu (`*.wp.com`, niektóre cloudfronty). Dla pozostałych zezwól `next/image` na transformację, dodając per-image override:
  ```tsx
  <Image src={...} unoptimized={KNOWN_BROKEN_HOSTS.has(host)} />
  ```

**Mierzalny cel:** LCP dla artykułu < 1.8 s na 4G (Lighthouse mobile).

---

### P1-5. Brak observability — pipeline pada w ciszy

**Lokalizacja:** cały `src/app/api/cron/generate/route.ts`. Logi tylko `console.log/warn/error`.

**Skutek:** jeśli OpenRouter ma outage albo RSS źródło zwraca 503, pipeline zaloguje błąd i pójdzie dalej. **Nie wiesz**: ile generacji się nie udało, jaki jest koszt dzienny, czy quality gate odrzuca 5% czy 50%, ile dni z rzędu wpadasz w refusal.

**Akcja:**

1. **Tabela `pipeline_events` w Supabase**:
   ```sql
   CREATE TABLE IF NOT EXISTS pipeline_events (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     run_id TEXT NOT NULL,
     event TEXT NOT NULL,
     payload JSONB,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   CREATE INDEX idx_pipeline_events_run ON pipeline_events(run_id, created_at);
   CREATE INDEX idx_pipeline_events_event ON pipeline_events(event, created_at DESC);
   ALTER TABLE pipeline_events ENABLE ROW LEVEL SECURITY;
   -- brak public policy — service role only
   ```

2. **Helper w `src/lib/telemetry.ts`**:
   ```ts
   import { createAdminClient } from "@/lib/supabase/admin";
   export async function logPipelineEvent(
     runId: string, event: string, payload: Record<string, unknown> = {}
   ) {
     try {
       await createAdminClient().from("pipeline_events").insert({ run_id: runId, event, payload });
     } catch (e) { console.error("[telemetry]", e); }
   }
   ```

3. **Instrumentacja** w `runPipeline()`:
   - Start: `{event: "run_start", count}`
   - Per artykuł: `scrape_ok / scrape_skip / ai_ok / ai_refusal / quality_reject / insert_ok / insert_fail`
   - Koszt: po każdym `generateArticle`, zapisz `prompt_tokens`, `completion_tokens`, `usage.total_cost` (writer.ts:188-193 ma już te dane — tylko trzeba je zapisywać zamiast logować).
   - End: `{event: "run_end", generated, rejected, failed, duration_ms}`.

4. **Dashboard:** prosty `/admin` (chroniony Basic Auth lub Vercel Authentication) z paroma kafelkami: koszty 7d, generations 7d, refusal rate, top failure reasons.

5. **Alerting:** w Supabase Database Webhooks → trigger na `INSERT INTO pipeline_events WHERE event LIKE '%_fail%'` → POST do Discord/Slack webhook.

**Bez tego nie da się eksploatować produkcyjnie ani optymalizować promptów na bazie danych.**

---

### P1-6. Strony tagów to thin content — ryzyko Google penalty

**Lokalizacja:** `src/app/tag/[slug]/page.tsx:25-94`.

**Problem:** strona ma tylko `#name`, licznik artykułów i grid kart. Brak opisu, brak unikalności, brak signal że to jest osobna semantyczna jednostka. W Google CCC `tag/openai` i `kategoria/modele-ai` walczą o te same frazy → **keyword cannibalization**.

**Akcja — wybierz jedną z trzech ścieżek:**

**Ścieżka A — zamknij tagi przed indexowaniem (najszybsza, polecana na start):**
```ts
// src/lib/seo.ts:179 — przebuduj tagMetadata:
export function tagMetadata(tag: Tag): Metadata {
  return {
    ...buildPageMetadata({
      title: `#${tag.name}`,
      description: `Artykuły z tagiem #${tag.name}`,
      path: `/tag/${tag.slug}`,
      ogType: "website",
    }),
    robots: { index: false, follow: true },  // ← DODAJ
  };
}
```
Plus w `src/app/sitemap.ts:38-43` **usuń** tagi z sitemapy i w `src/app/robots.ts:14` dodaj `/tag/` do disallow.

**Ścieżka B — zainwestuj w content tagów (najlepsza długoterminowo):**
- Dodaj kolumnę `tags.description TEXT` + `tags.seo_intro TEXT` (~150 słów).
- Wygeneruj opisy raz przez Claude'a (one-off script): "Napisz akapit po polsku, opisujący, dlaczego tag X jest ważny w kontekście AI...".
- Wyświetl na `/tag/[slug]` powyżej gridu (~200 słów = nie thin).
- Dodaj limit max 50 artykułów per tag w pipeline (artykuły z 7+ tagów to spam).

**Ścieżka C — hybrid:** indexuj tylko tagi z `>= 10` artykułów; reszta noindex.

**Rekomendacja:** **A teraz, B za 30 dni**.

---

### P1-7. Brak Content-Security-Policy + brakujące security headers

**Lokalizacja:** `src/proxy.ts:1-24`.

**Co jest:** HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. **Brakuje:** CSP, COOP, CORP, COEP.

**Akcja:**

```ts
// src/proxy.ts — DODAJ przed `return response`:
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://va.vercel-scripts.com",
  // 'unsafe-inline' bo Next emit'uje inline scripty (RSC payload, JSON-LD)
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",        // any HTTPS image (RSS thumbnails)
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https://*.supabase.co https://openrouter.ai https://www.google-analytics.com https://va.vercel-scripts.com",
  "frame-ancestors 'none'",                    // duplikat X-Frame-Options DENY, ale CSP wygrywa
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

response.headers.set("Content-Security-Policy", csp);
response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
```

**Uwaga:** każda zmiana CSP wymaga testu wszystkich stron + monitor `/api/csp-report` endpoint (lub bez raportowania, ale wtedy testować dokładnie).

---

### P1-8. Hardcoded GA ID w layout.tsx

**Lokalizacja:** `src/app/layout.tsx:184` — `<GoogleAnalytics gaId="G-5SD17PTF0C" />`.

**Problem:** stage/preview deployments i lokalny dev wysyłają eventy do tego samego property co produkcja → zafałszowane metryki, niedokładne CTR, błędne decyzje SEO.

**Akcja:**
```ts
// src/app/layout.tsx:184:
{process.env.NEXT_PUBLIC_GA_ID && <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />}
```
Dodaj `NEXT_PUBLIC_GA_ID=G-5SD17PTF0C` w **Production** env Vercel, **NIE** ustawiaj w Preview/Development.

---

### P1-9. `searchArticles` używa ILIKE bez full-text index

**Lokalizacja:** `src/lib/data.ts:256-275`.

**Problem:** `.or("title.ilike.%foo%, excerpt.ilike.%foo%")` to **sekwencyjny skan** całej tabeli `articles` na każde wyszukiwanie. Przy 1000 artykułów to 50-100 ms, przy 10 000 — sekunda. Trigram index lub PostgreSQL FTS to standardowe rozwiązanie.

**Akcja — migracja 003:**
```sql
-- supabase/migrations/003_fts_search.sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(excerpt, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_articles_fts ON articles USING GIN (search_vector);
-- Fallback dla nieprefiksowanych zapytań:
CREATE INDEX IF NOT EXISTS idx_articles_title_trgm ON articles USING GIN (title gin_trgm_ops);
```
*Uwaga: PostgreSQL standardowo nie ma konfiguracji `polish`; `simple` jest bezpieczną domyślką bez stemmingu. Jeśli zależy ci na lematyzacji polskiej — Supabase wspiera ekstensję `unaccent` + custom dictionary, ale to dłuższa praca.*

Następnie w `data.ts:256-275`:
```ts
const tsQuery = safe.trim().split(/\s+/).map(t => `${t}:*`).join(" & ");
const { data, error } = await db()
  .from("articles")
  .select("*, category:categories(*)")
  .eq("is_published", true)
  .textSearch("search_vector", tsQuery)
  .order("published_at", { ascending: false })
  .limit(20);
```

**Korzyść:** 50-100× szybsze przy >1000 artykułów + lepsza relevancja.

---

## 5. P2 — ŚREDNIE (pierwszy miesiąc po launchu)

### P2-1. Brak idempotencji pipeline'u

**Lokalizacja:** `src/app/api/cron/generate/route.ts:30-249`.

**Problem:** Vercel Cron może (rzadko, ale jednak) re-triggerować przy timeoutach. Pipeline nie chroni przed duplikatami — `buildUniqueSlug` (linia 18-28) nie jest atomowe (race condition między SELECT i INSERT).

**Akcja:** dodaj **deduplication key** opartą o sumę URL + day:
```ts
const idempotencyKey = crypto
  .createHash("sha256")
  .update(`${item.url}|${new Date().toISOString().slice(0,10)}`)
  .digest("hex");

// dodaj kolumnę articles.dedup_key TEXT UNIQUE w migracji 004
// przed insertem — sprawdź:
const { data: exists } = await supabase
  .from("articles").select("id").eq("dedup_key", idempotencyKey).maybeSingle();
if (exists) { console.log("Duplicate skipped"); continue; }
```

---

### P2-2. N+1 i nieefektywne queries

**Lokalizacja:**
- `src/lib/data.ts:474-558` — `getAdjacentArticles` może wykonać do 6 zapytań w pesymistycznym przypadku.
- `src/lib/data.ts:618-640` — `getCategoriesLastModified` ładuje **wszystkie opublikowane artykuły** (brak LIMIT) tylko po to, żeby zrobić in-memory aggregate. Przy 10 000+ artykułów = pamięć + wolny sitemap.

**Akcja:** Dwa RPC w migracji 004:
```sql
CREATE OR REPLACE FUNCTION category_last_modified()
RETURNS TABLE (slug TEXT, last_modified TIMESTAMPTZ) AS $$
  SELECT c.slug, MAX(a.updated_at)
  FROM categories c
  LEFT JOIN articles a ON c.id = a.category_id AND a.is_published = true
  GROUP BY c.id, c.slug;
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION tag_last_modified()
RETURNS TABLE (slug TEXT, last_modified TIMESTAMPTZ) AS $$
  SELECT t.slug, MAX(a.updated_at)
  FROM tags t
  JOIN article_tags at ON at.tag_id = t.id
  JOIN articles a ON a.id = at.article_id AND a.is_published = true
  GROUP BY t.id, t.slug;
$$ LANGUAGE SQL STABLE;
```
Następnie w `data.ts` zamień ciało obu funkcji na `db().rpc("category_last_modified")` itp.

---

### P2-3. Offset pagination nieodporna na nowy content

**Lokalizacja:** `src/lib/data.ts:167-223`.

**Problem:** jeśli między żądaniem page 1 i page 2 publikuje się nowy artykuł, użytkownik zobaczy duplikat (artykuł, który był na końcu page 1, przesunie się na page 2). Google crawling też się o to potyka.

**Akcja:** zostań przy offset (UX prostsze), ale dodaj **tiebreaker po `id`**:
```ts
.order("published_at", { ascending: false })
.order("id", { ascending: false })  // ← deterministyczne
```

Dla dużych kolekcji (> 100 stron) — przejdź na cursor (`?after=<isoDate>:<id>`).

---

### P2-4. Brak monitoringu kosztów AI

**Lokalizacja:** `src/lib/ai/writer.ts:186-193`, `src/lib/images/generator.ts:184-187` — koszty są logowane, ale nigdzie nie zapisywane.

**Akcja:** dołącz do P1-5 (telemetry). Tabela `pipeline_events` z eventem `ai_cost` i payload `{model, prompt_tokens, completion_tokens, cost_usd}` da prosty SUM po dacie do dashboardu.

---

### P2-5. Wyszukiwarka — query w URL trafia do GA

**Lokalizacja:** `src/app/layout.tsx:184` — domyślnie GA loguje `?q=...`.

**Problem:** RODO + zafałszowanie raportów (każde unikalne zapytanie = unikalny URL → niedokładne metryki strony `/szukaj`).

**Akcja:** użyj `gtag` configure z `anonymize_ip: true` oraz **wyłącz `page_path` z query** — najprostsza opcja:
```ts
// Wrap GoogleAnalytics w komponencie który nadpisuje pathname:
<GoogleAnalytics gaId={...} dataLayer={{
  page_path: pathname.startsWith("/szukaj") ? "/szukaj" : pathname + searchParams,
}} />
```
*(Wymaga client component; alternatywnie skonfiguruj GA4 "Internal Site Search" oficjalnie — wtedy `q` parametr jest właściwy, ale nie wycieka do raportu Page paths.)*

---

### P2-6. Brak `prefers-reduced-motion` w `ScrollToTop` smooth scroll

**Lokalizacja:** `src/components/layout/scroll-to-top.tsx:31-33`.

**Problem:** WCAG 2.1 wymaga respektowania preferencji animacji. Smooth scroll dla user'a z motion sickness = źle.

**Akcja:**
```ts
const scrollToTop = useCallback(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
}, []);
```
To samo dla `header.tsx:89-97` (`handleLogoClick`).

---

### P2-7. `.prose-article` nie pokrywa wszystkich elementów markdown

**Lokalizacja:** `src/app/globals.css:185-252`.

**Brakuje stylów dla:** `table`, `th`, `td`, `hr`, `em`, `figcaption`, `figure`. Pipeline używa `remark-gfm` (`writer.ts:18`), więc tabele mogą trafiać do artykułu.

**Akcja:** dopisz na koniec sekcji `.prose-article` w `globals.css`:
```css
.prose-article em { @apply italic text-foreground/95; }

.prose-article hr {
  @apply border-0 border-t border-border/40 my-8;
}

.prose-article table {
  @apply w-full border-collapse mb-6 text-sm;
}
.prose-article th,
.prose-article td {
  @apply border border-border/50 px-3 py-2;
}
.prose-article th {
  @apply bg-muted font-semibold;
}

.prose-article figcaption {
  @apply text-xs text-muted-foreground text-center mt-2;
}
```

---

### P2-8. `scroll-padding-top: 5rem` zbyt duże na mobile

**Lokalizacja:** `src/app/globals.css:145`.

**Akcja:**
```css
html { scroll-padding-top: 4.5rem; }
@media (max-width: 768px) { html { scroll-padding-top: 3.5rem; } }
```

---

### P2-9. Brak `error.tsx` dla `/`, `/kategoria`, `/tag`

**Lokalizacja:** `src/app/(home)/`, `src/app/kategoria/[slug]/`, `src/app/tag/[slug]/` — tylko `loading.tsx`.

**Akcja:** dodaj minimalny `error.tsx` w każdym z tych folderów (treść jak w `src/app/artykul/[slug]/error.tsx` z customem dla kontekstu). Bez tego, awaria Supabase = goła trace ze strony.

---

### P2-10. Brak Sitemap-Index — limit 50 000 URL / 50 MB

**Lokalizacja:** `src/app/sitemap.ts:11`. Obecnie all-in-one.

**Sytuacja teraz:** 5000 artykułów limit. Po roku 30 artykułów dziennie = ~10 000 artykułów. Wciąż w limicie, ale warto zaplanować podział z wyprzedzeniem.

**Akcja (kiedy ~30 000 URL):** Next 16 wspiera `sitemap-{idx}.xml` przez `generateSitemaps`:
```ts
export async function generateSitemaps() {
  const total = await getArticleCount();
  const pages = Math.ceil(total / 5000);
  return Array.from({ length: pages }, (_, i) => ({ id: i }));
}
export default async function sitemap({ id }: { id: number }) { /* artykuły dla strony id */ }
```

---

### P2-11. Brak `rel=nofollow` na tag linkach z artykułu

**Lokalizacja:** `src/app/artykul/[slug]/page.tsx:232-239`.

**Wpływ:** każdy artykuł ma 3-5 linków do tagów; jeśli tagi są thin content (P1-6), te linki **rozcieńczają link equity**. Po decyzji z P1-6:
- Ścieżka A (noindex tagów) → dodaj `rel="nofollow"` na tag linkach.
- Ścieżka B (treść na tagach) → zostaw bez nofollow.

---

### P2-12. Pipeline monolityczny — rozważ Vercel Queues

**Lokalizacja:** cały `src/app/api/cron/generate/route.ts` (250 linii, robi wszystko).

**Akcja długoterminowa:**
1. Cron tylko **enqueue'uje** zadania (`scrape_rss`, `generate_article`, `make_thumbnail`).
2. Per-zadanie handler `/api/queue/generate` ma własny `maxDuration` i retry.
3. Vercel Queues (Public Beta) zapewnia at-least-once delivery.

**Profity:**
- Pojedynczy failure nie ubija pipeline'u.
- Retry-friendly.
- Lepsze observability (statusy w Vercel dashboard).

To 1-2 dni pracy — warte, kiedy będzie >20 artykułów/dzień.

---

## 6. P3 — NISKIE (backlog ulepszeń)

| # | Co | Gdzie | Wartość |
|---|----|-------|---------|
| P3-1 | `sanitizeTitleForPrompt` używa `drop` zamiast `escape` cudzysłowów | `src/lib/images/generator.ts:127-134` | Defensywne, niski risk bo prompt już ma "Ignore any instructions" |
| P3-2 | Niepotrzebny `useMemo` (React Compiler i tak memoizuje) | `src/components/articles/table-of-contents.tsx:30` | Czystość kodu |
| P3-3 | `useTransition` w keydown handlerach Header — lepsze INP | `src/components/layout/header.tsx:43-69` | Mikro-optymalizacja CWV |
| P3-4 | `loading="lazy"` explicit na non-priority Image | `src/components/articles/article-card.tsx:92-99` | Już domyślnie tak, ale explicit lepiej dla audytów |
| P3-5 | Brak audit trail dla artykułów (kto/kiedy edytuje) | brak — wymagałoby UI admin | Tylko gdy ktoś będzie ręcznie edytować |
| P3-6 | `getPopularTags` fallback tylko `console.warn` przy braku RPC | `src/lib/data.ts:351` | Po P1-5 dodaj `logPipelineEvent("rpc_missing", {name: "popular_tags"})` |
| P3-7 | Brak Suspense granularnych w artykule | `src/app/artykul/[slug]/page.tsx:40-45` | UX poprawa dla wolnych połączeń |
| P3-8 | Brak `og:image:alt` w `app/opengraph-image.tsx` (eksportuje `alt` ale verify) | sprawdzić działanie | Marginalny SEO signal |
| P3-9 | `newsletter`/double opt-in | `src/app/api/newsletter/route.ts` | RODO best practice; nieobowiązkowe technicznie ale tak |

---

## 7. Co działa dobrze — chronić przed regresją

Te elementy są wykonane na poziomie ponadprzeciętnym. **Nie psuj ich przy refaktorach.**

### Bezpieczeństwo (poza P0)

- **SSRF guard** w `scrapeArticleContent` (`content.ts:5-16`): blokuje localhost, RFC1918, link-local, AWS metadata. Komentarz w CLAUDE.md już zaznacza: "do not loosen this".
- **Fail-closed cron auth**: `route.ts:34` — brak `CRON_SECRET` w env = 401, nigdy "bypass for local dev".
- **Anon key + RLS** dla wszystkich publicznych odczytów. `service_role` używany **wyłącznie** w `/api/cron/*` i `/api/newsletter`.
- **JSON-LD eskapacja** (`lib/jsonld.ts`): `<`, `>`, `&`, U+2028/U+2029 → escape. Brak XSS przez wstrzyknięcie tekstu artykułu do `<script type="application/ld+json">`.
- **Content-Type guard** w scraperze (`content.ts:58-62`): odrzuca PDF/binary, czytelność check (`text.length / printable.length >= 0.7`).

### SEO

- **NewsArticle JSON-LD** w artykule (`page.tsx:80-110`) zawiera: `headline` (cap 110), `wordCount`, `articleBody`, `SpeakableSpecification` (h1 + `.article-excerpt`), `inLanguage: pl-PL`, `isAccessibleForFree: true`, `articleSection`, `keywords` z tagów. To jest na poziomie BBC/Reuters.
- **Canonical strategy** — page 1 → `/kategoria/slug`, page N → `?page=N` (`lib/seo.ts:166`). Aktualne zalecenie Google (2024+).
- **RSS auto-discovery** — `RSS_ALTERNATE` zapewnia, że każda strona ma `<link rel="alternate" type="application/rss+xml">` (dokumentacja w komentarzu jak Next merguje metadata).
- **`sr-only h1`** na home (`page.tsx:62`) — crawler widzi mocny h1 bez psucia magazynowego layoutu.
- **`scroll-margin-top: 5rem`** na `.prose-article h2/h3` — anchory działają pod sticky headerem.
- **`speakable`** w JSON-LD — boost dla Google Voice Search.
- **Wykrywanie angielskich tytułów** w `quality.ts:62-69` — stopword-based regex z 50-punktową karą, świadomy komentarz historyczny ("don't publish 'Jury selection in Musk v. Altman' again").
- **Dzienne ograniczenie `is_featured`** (`route.ts:73-85`) — chroni przed zalewem priority=0.9 w sitemap.

### Performance i UX

- **`use-scroll-y.ts`** — `useSyncExternalStore` z shared subscription, jeden listener na całą aplikację (CLAUDE.md zaznacza: "any new scroll-position-driven UI musi tego używać").
- **Hydration-safe Mac/iOS detection** w Header (`header.tsx:18-20`) — `getServerSnapshot()` zwraca false; po commit React swap'uje na realny `navigator.platform`.
- **WAAPI marquee w NewsTicker** z aria-hidden clone — SEO-neutralne, nie duplikuje linków w widoku crawlera.
- **`inert={!mobileOpen}`** w mobile nav — wyłącza focus + accessibility tree.
- **`text-balance`** na nagłówkach — lepsza wizualnie wrap.
- **Bezpieczne `is_internal_host` na poziomie hooka `useCallback`** — dobre użycie React 19 patterns.

### Procesy

- **Idempotentne migracje SQL** (`supabase/migrations/`) — `CREATE OR REPLACE`, `IF NOT EXISTS`, `DROP IF EXISTS`. Re-run safe.
- **301 redirects EN→PL** w `next.config.ts:42-49` — historia URL nie psuje SEO.
- **`articles.updated_at` trigger** (`schema.sql:121-125`) — bez niego sitemap `lastModified` i JSON-LD `dateModified` byłyby zawsze równe `created_at`. CLAUDE.md zaznacza.
- **`popular_tags(tag_limit)` RPC** z indexem na FK (`article_tags.tag_id`) — server-side GROUP BY zamiast pull all w JS.
- **`/szukaj` w robots.txt i `robots: noindex`** — nie indexujemy permutacji query.
- **Polish typography** (`writer.ts:201`) — NBSP po jednoliterowych przyimkach, en/em-dash, „cudzysłowy".

---

## 8. Roadmapa SEO/pozycjonowania

Przy założeniu, że P0 zrobione, P1 wdrażane.

### Tydzień 1 (foundation)

- [ ] **Google Search Console** — zweryfikuj domenę `aifeed.pl` (DNS TXT) i `www.aifeed.pl` osobno.
- [ ] **Bing Webmaster Tools** — drugi, niedoceniany kanał (10-15% ruchu PL).
- [ ] **Wgranie sitemapy** w GSC — `/sitemap.xml` (powinien już być znaleziony przez robots.txt, ale ręczne submit przyspiesza).
- [ ] **GA4 Internal Site Search** — skonfiguruj `q` parameter w GA4 dla `/szukaj`.
- [ ] **Rich Results Test** każdy typ strony: artykuł (NewsArticle), kategoria (ItemList), home (WebSite SearchAction) — https://search.google.com/test/rich-results.
- [ ] **Page Speed Insights** snapshot każdej z 5 głównych ścieżek (home, artykuł, kategoria, tag, wyszukiwarka). Zapisz baseline.

### Miesiąc 1 (content + technical)

- [ ] **Internal linking audit** — każdy artykuł powinien mieć 2-3 linki do innych artykułów (poza related). Można wzmocnić pipeline: po wygenerowaniu artykułu, drugi przebieg LLM wkleja 1-2 kontekstowe linki do istniejących artykułów.
- [ ] **EEAT signals** — strona `/o-serwisie` powinna konkretnie wskazywać autorytet (kim jest redakcja, jak działa AI pipeline, źródła). Obecnie pewnie jest zbyt ogólna.
- [ ] **Schema.org Organization** w root layout — masz, ale dodaj `sameAs` jak tylko będą social profile.
- [ ] **Strukturyzowana strona "Polityka redakcyjna"** — opisuje, że artykuły są generowane AI, weryfikowane heurystykami jakości, źródła są linkowane. **Buduje trust dla Google News.**
- [ ] **Google News Publisher Center** — aplikuj o włączenie do Google News (wymaga punktów EEAT, polityki redakcyjnej, ToS).

### Miesiąc 2-3 (skala)

- [ ] **Backlinki** — gościnne wpisy, listy "top serwisów AI po polsku", PR.
- [ ] **Topic clusters** — wybierz 5 głównych tematów (np. "modele Claude", "AI w biznesie"), zbuduj pillar pages + linki z odpowiednich artykułów.
- [ ] **Schema dla wyszukiwarki internej** — `SearchAction` jest, ale dodaj **SiteNavigationElement** w nawigacji.
- [ ] **Optymalizacja CTR** w SERP — A/B testuj tytuły artykułów w generatorze (dwa warianty, mierz CTR przez 30 dni).
- [ ] **Pillar `/przewodnik` lub `/poradnik-ai-dla-poczatkujacych`** — 5000+ słów, evergreen, target frazy long-tail.

### Stałe KPI do monitorowania

- **CWV LCP** mobile < 2.5 s
- **CWV INP** mobile < 200 ms
- **Indexed pages** w GSC (powinien rosnąć ~30/dzień po launchu cron)
- **Crawl errors** w GSC — 0 dla 4xx
- **Average position** dla 10 kluczowych fraz (np. "claude opus", "openai nowy model", "ai polska")
- **Click-through rate** w SERP — > 3% dla rankingowych fraz
- **OpenRouter cost** / dzień — alert > $1
- **Pipeline success rate** — > 80% (z telemetry)

---

## 9. Checklisty wdrożeniowe

### Sprint 0 — security (do zamknięcia w 24h)

- [x] **Usunięcie `scripts/seed-articles.mjs` z drzewa roboczego** (2026-05-16)
- [x] **Usunięcie 9 plików `supabase/.temp/*` z indeksu gita** (2026-05-16)
- [x] **`.gitignore` rozszerzony o `supabase/.temp/`, `supabase/.branches/`, `scripts/*.local.*`** (2026-05-16)
- [x] **`next.config.ts` — host Supabase z env, brak hardcoded project ref** (2026-05-16)
- [x] **`src/app/layout.tsx` — preconnect z env, brak hardcoded hosta** (2026-05-16)
- [x] **CLAUDE.md — usunięcie odwołania do nieistniejącego DOCS.md (P0-3)** (2026-05-16)
- [ ] Rotacja `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Rotacja `OPENROUTER_API_KEY`
- [ ] Rotacja `UNSPLASH_ACCESS_KEY`
- [ ] Update env vars w Vercel (production)
- [ ] Update `.env.local`
- [ ] `git filter-repo` usunięcie `scripts/seed-articles.mjs` z historii
- [ ] `git filter-repo` usunięcie `supabase/.temp` z historii
- [ ] Force-push wszystkich branchy
- [ ] Repo `aifeed-test` → **private**
- [ ] Sprawdzenie Supabase audit log za ostatnie 30 dni
- [ ] Sprawdzenie OpenRouter usage spike
- [ ] Dodanie `gitleaks` pre-commit hook
- [ ] Decyzja: usunąć `CLAUDE.md:11-13` ref do DOCS.md albo utworzyć DOCS.md

### Sprint 1 — pre-launch (1-2 tygodnie)

- [ ] `generateStaticParams()` dla artykułu, kategorii, tagów (P1-3)
- [x] **Rate limiter — ulepszenie API (P1-2) — 2026-05-16**; świadoma decyzja: zostajemy na in-memory dla MVP, upgrade na shared store gdy ruch wzrośnie (>100 req/min) lub pojawi się anomalia
- [x] **`count=4` w `vercel.json` + time-budget guard w pipeline (P1-1) — 2026-05-16** (zostajemy na Hobby)
- [ ] `pipeline_events` tabela + telemetry helper (P1-5)
- [ ] `noindex` na tagach (Ścieżka A z P1-6)
- [ ] CSP + COOP + CORP w proxy (P1-7)
- [ ] `NEXT_PUBLIC_GA_ID` env var (P1-8)
- [ ] Migracja 003 — FTS dla `searchArticles` (P1-9)
- [ ] Sharp/AVIF preprocessing dla AI thumbnails (P1-4, Etap B)
- [ ] Manualny QA wszystkich rich results testem

### Sprint 2 — post-launch (30 dni)

- [ ] Migracja 004 — `dedup_key` + RPC `category_last_modified`/`tag_last_modified` (P2-1, P2-2)
- [ ] Cursor pagination ALBO tiebreaker po `id` w offset (P2-3)
- [ ] Cost monitoring + alerty Discord/Slack (P2-4, dopełnienie P1-5)
- [ ] GA4 query masking (P2-5)
- [ ] `prefers-reduced-motion` w `scroll-to-top` i logo click (P2-6)
- [ ] `prose-article` style dla table/hr/em (P2-7)
- [ ] Responsive `scroll-padding-top` (P2-8)
- [ ] `error.tsx` dla home/kategoria/tag (P2-9)
- [ ] (warunkowo) decyzja o `rel="nofollow"` na tagach (P2-11)
- [ ] (warunkowo) Vercel Queues split jeśli > 20 artykułów/dzień (P2-12)

---

## 10. Załącznik A — mapa plików i odpowiedzialności

Krótka mapa "kto za co odpowiada" — przydatna przy nawigacji w kodzie i przy decydowaniu, gdzie wprowadzać zmiany.

### Edge / middleware

| Plik | Rola | Zmiana w audycie |
|------|------|-------------------|
| `src/proxy.ts` | Security headers (HSTS, X-Frame, Permissions-Policy) | + CSP/COOP/CORP (P1-7) |

### Server data layer

| Plik | Rola | Zmiana w audycie |
|------|------|-------------------|
| `src/lib/data.ts` | Wszystkie publiczne odczyty (anon key) | FTS (P1-9), idx tiebreaker (P2-3), RPC last_modified (P2-2) |
| `src/lib/supabase/admin.ts` | Service role client (cron + newsletter) | Runtime env validation |
| `src/lib/search-utils.ts` | `escapeIlike`, `sanitizeOrQuery`, `MAX_LEN` | bez zmian |
| `src/lib/rate-limit.ts` | ✅ in-memory z czystym async API (P1-2, MVP decision) | upgrade na shared store gdy potrzeba |
| `src/types/database.ts` | TS typy bazy | + `dedup_key` (P2-1) |

### Pipeline AI

| Plik | Rola | Zmiana w audycie |
|------|------|-------------------|
| `src/app/api/cron/generate/route.ts` | Główny pipeline, 300s budget | ✅ time-budget guard + count=4 (P1-1) · TODO: telemetry (P1-5), idempotency (P2-1) |
| `src/app/api/cron/seed/route.ts` | Ręczny seed kategorii | weryfikacja czy uż używane |
| `src/lib/scraper/sources.ts` | 20 RSS feedów | nowe źródła PL warto dorzucić |
| `src/lib/scraper/parser.ts` | Parse + AI_KEYWORD_REGEX + greedy diversity | bez zmian — solidne |
| `src/lib/scraper/content.ts` | Scrape full text + SSRF guards | **NIE LUZUJ** isInternalHost |
| `src/lib/ai/writer.ts` | OpenRouter call + extractMeta + normalizeMarkdown | retry-with-backoff (P3) |
| `src/lib/ai/prompts.ts` | System + user prompt (po polsku) | bez zmian — dopracowane |
| `src/lib/ai/quality.ts` | Heurystyczny scoring 0-100, threshold 50 | sprawdzić edge cases dla score 50-79 |
| `src/lib/images/generator.ts` | og:image scrape → Gemini 2.5 Flash → Supabase Storage | sharp/AVIF (P1-4), escape titles (P3-1) |
| `src/lib/typography.ts` | Polish NBSP/dash/quotes | bez zmian |

### Public API

| Plik | Rola | Zmiana w audycie |
|------|------|-------------------|
| `src/app/api/newsletter/route.ts` | POST email, 5/min/IP | ✅ async checkRateLimit (P1-2) · TODO: double opt-in (P3-9) |
| `src/app/api/search/route.ts` | GET ?q=, 30/min/IP, MAX_LEN=100 | ✅ async checkRateLimit (P1-2) · TODO: FTS (P1-9) |

### Strony

| Plik | revalidate | Zmiana w audycie |
|------|-----------|-------------------|
| `src/app/(home)/page.tsx` | 300s | priorytety LCP, generateStaticParams |
| `src/app/artykul/[slug]/page.tsx` | 60s | **generateStaticParams (P1-3)**, `<noscript>` fallback dla TOC |
| `src/app/kategoria/[slug]/page.tsx` | 300s | generateStaticParams (P1-3) |
| `src/app/tag/[slug]/page.tsx` | 300s | **noindex (P1-6)** ALBO content investment |
| `src/app/szukaj/page.tsx` | client | noindex OK |
| `src/app/o-serwisie/page.tsx` | — | EEAT content boost (sprint 1) |
| `src/app/polityka-prywatnosci/page.tsx` | — | sprawdzić RODO compliance |
| `src/app/feed.xml/route.ts` | 3600s | OK |
| `src/app/sitemap.ts` | — | + sitemap-index, jeśli > 30 000 URL (P2-10) |
| `src/app/robots.ts` | — | + `/tag/` po decyzji A (P1-6) |
| `src/app/opengraph-image.tsx` | — | weryfikacja `alt` (P3-8) |
| `src/app/manifest.ts` | — | OK |
| `src/app/not-found.tsx` | — | OK |

### SEO helpers

| Plik | Rola | Zmiana w audycie |
|------|------|-------------------|
| `src/lib/seo.ts` | `buildPageMetadata`, wrappery per typ strony | `tagMetadata` → noindex (P1-6) |
| `src/lib/jsonld.ts` | Bezpieczna serializacja JSON-LD | bez zmian — wzór |
| `src/lib/heading-id.ts` | `slugifyHeading` używane przez TOC i markdown renderer | bez zmian — kluczowa spójność |
| `src/config/site.ts` | Brand config, kategorie | gdy social profile gotowe → `links` + `sameAs` w Organization JSON-LD |

### Komponenty (kluczowe)

| Plik | Rola | Zmiana w audycie |
|------|------|-------------------|
| `src/components/layout/header.tsx` | Sticky header, mobile menu, Cmd+K | useTransition (P3-3), reduced motion (P2-6) |
| `src/components/layout/news-ticker.tsx` | WAAPI marquee | bez zmian |
| `src/components/layout/footer.tsx` | Footer | OK |
| `src/components/layout/scroll-to-top.tsx` | Smooth scroll button | reduced motion (P2-6) |
| `src/components/layout/search-modal.tsx` | Cmd+K modal | minor — reset setTimeout |
| `src/components/layout/newsletter-form.tsx` | Newsletter input | po Upstash (P1-2) |
| `src/components/articles/article-card.tsx` | featured/default/compact | `priority` lifecycle (sprawdzony) |
| `src/components/articles/table-of-contents.tsx` | TOC z slugifyHeading | usuń useMemo (P3-2) |
| `src/components/articles/breadcrumbs.tsx` | BreadcrumbList JSON-LD | OK |
| `src/components/articles/category-bar.tsx` | Horizontal scroll nav | OK |
| `src/components/articles/share-buttons.tsx` | Twitter/LinkedIn/copy | OK |
| `src/components/articles/reading-progress.tsx` | Top progress bar | OK |

### Konfiguracja

| Plik | Zmiana w audycie |
|------|-------------------|
| `next.config.ts` | ✅ host Supabase z env (P0-1) · TODO: selective `unoptimized` (P1-4 Etap C) |
| `vercel.json` | ✅ count 4/4/4 (P1-1) |
| `eslint.config.mjs` | OK |
| `tsconfig.json` | OK |
| `components.json` | OK |
| `.env.example` | bez zmian (Upstash nieużywany) · TODO: `NEXT_PUBLIC_GA_ID` (P1-8) |
| `.gitignore` | ✅ `supabase/.temp/`, `supabase/.branches/`, `scripts/*.local.*` (P0-1) |

---

## Notatki końcowe

**Decyzje produktowe, które trzeba podjąć przed wdrożeniem:**

1. **Tagi: noindex czy inwestycja w content?** (P1-6) — wpływa na całą strategię taksonomii.
2. **`count` artykułów: 10 czy 4?** (P1-1) — kompromis między świeżością a stabilnością pipeline'u.
3. **Plan Vercel: Pro (`maxDuration` do 800s) czy Hobby?** — wpływ na P1-1 i Vercel Queues.
4. **Upstash Redis: free tier wystarczy?** (P1-2) — przy >10k req/dzień trzeba paid.
5. **Google News: aplikować?** — wymaga inwestycji w polityki, ale daje sygnał EEAT.

**Czego ten audyt nie obejmuje (świadomie):**

- Testów (vitest config jest OK, ale brakuje testów e2e — to osobny temat na kolejny sprint).
- Internacjonalizacji (serwis monolingwalny z założenia).
- Strategii treści — to nie jest dokument marketingowy.
- Wyboru CMS dla ręcznych edycji — pipeline jest fully automated, ręczne edycje są out-of-scope.

**Następny krok:** zatwierdź priorytety, przypisz właściciela każdego P0/P1, otwórz Issues w GitHub na podstawie tej listy.

---

*Audyt wykonany przez analizę 84 plików `.ts/.tsx`, schematu Supabase (2 migracje, schema.sql), `next.config.ts`, `vercel.json`, `tsconfig.json`, `eslint.config.mjs`, `.env.example`, `package.json`, plus weryfikacja gita i widoczności repo na GitHubie. Wnioski oparte na zachowaniu produkcyjnym Next.js 16 + React 19 + Vercel Fluid Compute + Supabase Postgres 15.*

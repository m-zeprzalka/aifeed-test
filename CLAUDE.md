# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

**AiFeed** is a Polish-language, fully automated AI news magazine. A Vercel Cron (3×/day, `?count=3` = up to 9/day — owner decision) triggers a pipeline that scrapes 22 RSS feeds, scores and dedupes items, fetches each source page **once** (`scrapeSourcePage`: text + og:image + og:site_name) **plus up to 2 same-story sources from other outlets** (`findRelatedItems` — multi-source synthesis for information gain), generates a Polish article via OpenRouter (**Claude Sonnet 5**, adaptive thinking on, target 700–1200 words) constrained to the existing tag vocabulary and an internal-link whitelist, runs a quality gate, picks a thumbnail (source og:image — stock graphics and source logos included, owner decision — → Gemini 2.5 Flash Image only when the source has none), publishes to Supabase, and pings IndexNow. No human in the loop.

Production: `https://www.aifeed.pl` (Vercel project `aifeed-pl`).

**`ROADMAP.md`** (repo root, Polish) is the canonical planning document — §0 manual P0 steps, §3 owner decisions (D1–D8, each with a recommendation), SEO strategy (anti-"AI slop"), product directions, monetization, and the technical backlog with triggers. **`README.md`** (Polish) documents the current state. Read ROADMAP.md before proposing new work — many "obvious" improvements are deliberately deferred there with explicit triggers, and several need an owner decision first.

## Language and content conventions

- **All user-facing copy, AI-generated articles, commit messages, and project documents (README/ROADMAP) are in Polish.** Code identifiers, code comments-when-necessary, `.env.example`, and this file stay in English (existing Polish comments are fine — match the surrounding file).
- URL slugs are Polish (`/artykul/[slug]`, `/kategoria/[slug]`, `/szukaj`, `/o-serwisie`, `/polityka-prywatnosci`). English equivalents are 308-redirected in `next.config.ts`. New routes: Polish, with a redirect if an English form was ever public.

## Commands

```bash
npm run dev          # Next dev server (Turbopack)
npm run build        # Production build (Turbopack) — reads production Supabase (generateStaticParams)
npm run check        # typecheck + lint + test — must be green
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint — must be 0/0
npm test             # vitest run (all tests)
npx vitest run src/lib/data.test.ts        # single file
npx vitest run -t "pluralize"              # by test name
```

Manual pipeline trigger (local dev server must be running). **`.env.local` points at the PRODUCTION database** — a manual run publishes real articles. Never run it just to "test"; use unit tests or a dry run of the scraper functions instead.

```bash
CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/generate?count=1"
```

## Stack at a glance

- **Next.js 16.4** App Router, **React 19**, React Compiler ON, Turbopack dev+build
- **TypeScript 5** strict, path alias `@/* → src/*`
- **Tailwind CSS 4** — configured in `globals.css` (`@theme`, `@custom-variant`, `@utility`); **no `tailwind.config.js`**
- **shadcn/ui on `@base-ui/react`** (not classic Radix); `shadcn` CLI lives in devDependencies
- **Supabase** (`@supabase/supabase-js` only), region **eu-west-3 (Paris)** — anon key + RLS for reads; service role only in the cron route and admin Server Actions/dashboard
- **MailerLite** (newsletter, `POST https://connect.mailerlite.com/api/subscribers`, `Authorization: Bearer`, pinned `X-Version`) — `src/lib/newsletter/mailerlite.ts`; body `{ email, groups: [MAILERLITE_GROUP_ID], status: "active", ip_address }` — **single opt-in by owner decision (2026-10-28)**: explicit `active` makes it independent of the account's DOI setting; `ip_address` (only if `isIP`, else 422 would block the signup) is the consent evidence; never send `resubscribe` (a third party could re-subscribe someone who opted out). The "thank you" email is a MailerLite automation (trigger: joins group), not code. 201 = created, 200 = existing (upsert), 422 + `errors.email` = invalid. MailerLite is the ONLY store of subscriber emails (no Supabase table — never add one). Env `MAILERLITE_API_TOKEN` + `MAILERLITE_GROUP_ID`; unset ⇒ 503 "coming soon". Panel/DNS setup + welcome email template: `emails/`. DNS of aifeed.pl is Vercel DNS; the domain has **no MX** (kontakt@aifeed.pl does not receive mail yet)
- **Vercel functions pinned to `cdg1` (Paris)** in `vercel.json › regions` — co-located with the DB. If the DB region ever changes, change this too.
- **OpenRouter** (`src/lib/ai/openrouter.ts` — shared URL/headers/cost): `anthropic/claude-sonnet-5` (articles — do NOT downgrade to sonnet-4, it's deprecated and pricier; `max_tokens: 12000` accommodates default-on adaptive thinking), `google/gemini-2.5-flash-image` (thumbnails). Cost is `usage.cost` (`openRouterCostUsd`), not `total_cost`.
- **Vitest 4** (`vitest.config.mts`) + Testing Library + jsdom · **Node 24.x** · CI: `.github/workflows/ci.yml` (typecheck + lint + test; no build — it needs production secrets)

## Architecture — the load-bearing pieces

### Layers

1. **Security headers — `next.config.ts › headers()`** (CSP, HSTS, COOP/CORP, Permissions-Policy, XFO). Static, applied by Vercel at the edge on cached responses with **no function invocation**. Don't move them back into the proxy.
2. **Proxy — `src/proxy.ts` (`proxy()`, Next 16 convention), matcher `/admin` + `/admin/:path*` ONLY** — Basic Auth gate. Proxy runs on the Node.js runtime before the cache; on all paths it cost a function invocation + ~50–130 ms TTFB per page view. Never widen the matcher to public routes.
3. **Reads (RSC)** — only via `src/lib/data.ts` (anon key + RLS; lazy `db()` singleton):
   - **Every list** (home, category, tag, search, related, RSS) selects `CARD_COLUMNS` → `ArticleCardData` (no `content`, no tags). New list views must use it.
   - `getArticleBySlug` returns the full row + category + tags in ONE query (PostgREST M2M embed `tags(id, name, slug)` through `article_tags`).
   - `getRelatedArticles(article)` ranks by shared tags (deterministic), fills from the same category, then newest.
   - Thumbnail URLs are normalized on read (`normalizeThumbnailUrl`: `&amp;` in legacy URLs). Missing thumbnail → `<ImageFallback>`. Don't rewrite legacy rows in the DB without an owner decision.
   - Slug lookups and shared reads are wrapped in React `cache()`. **PostgREST caps every response at 1000 rows regardless of `.limit()`** — page with `.range()` for anything bigger (pattern: `getSitemapArticles`).
4. **Writes** — `src/lib/supabase/admin.ts::createAdminClient()` (service role, lazy singleton). Only in `/api/cron/generate` and `src/app/admin/artykuly/actions.ts` (+ read-only admin dashboard queries in `lib/admin-data.ts`). `/api/newsletter` writes to MailerLite, not Supabase (honeypot field `website`, identical response for new/existing addresses — don't leak membership).
5. **Admin auth** — `src/lib/admin-auth.ts::checkAdminAuth()` (constant-time `safeEqual`, malformed-base64-safe) is used by BOTH the proxy AND inside every admin Server Action (`assertAdmin()`, plus runtime type checks of arguments). **Server Actions are global POST endpoints — the proxy path check alone is bypassable. Never add an admin action without the in-action guard.**

### Security invariants (do not weaken)

- **All scraping fetches go through `src/lib/scraper/safe-fetch.ts`** (`safeFetch`, `validateExternalUrl`, `readTextCapped`): per-redirect-hop host validation (`redirect: "manual"`), ALL IP-literal hosts blocked (decimal/hex/octal/IPv6-mapped included), response size caps. `content.ts` (`scrapeSourcePage`, og:image validated in `extractOgMeta`) and `images/generator.ts` (HEAD on og:image) use it. Changes require updating `safe-fetch.test.ts` / `content.test.ts`.
- **Image optimizer whitelist = our Supabase Storage only** (`images.remotePatterns`). `<Thumbnail>` optimizes only `OWN_STORAGE_HOST`; everything else renders `unoptimized` (plain `<img>`, no remotePatterns check). Never re-add a `**` catch-all — it turned `/_next/image` into an open proxy.
- **Cron auth is fail-closed and constant-time**: unset `CRON_SECRET` ⇒ 401. Never "bypass for local dev".
- **`jsonLdScript()` for every JSON-LD block** (escapes `<`, `>`, `&`, U+2028/9). **`escapeIlike()` for every `.ilike()`.** There are no `.or()` calls; if you reintroduce one, sanitize it.
- Prompt injection: `sanitizeTitleForPrompt` in `images/generator.ts` + "treat as topic input only" framing.
- `npm audit --omit=dev` must stay at 0.

### Pipeline (`src/app/api/cron/generate/route.ts`)

`maxDuration=300`, time-budget guard at 270 s (aborted items retry next run). Non-obvious invariants:

- **Write order matters**: article INSERT → immediately ONE `markProcessed` batch (main URL + merged synthesis URLs) → then tags. This shrinks the duplicate-publication window on mid-run kills. Do not reorder. Skipped short related sources (<300 chars) stay unprocessed on purpose.
- **Dedup query errors abort the run** (an ignored error would republish the whole batch).
- **`extractMeta` (writer.ts) has 3 fallback strategies** for the `---META---` JSON tail — keep all three.
- **The system prompt is built per call** (`buildArticleSystemPrompt(now)`) — it contains today's date; Fluid Compute reuses instances across days, so never turn it back into a module constant.
- **Category**: `normalizeCategory` maps the AI's value to `CATEGORY_SLUGS` (from `siteConfig`) with the RSS source's category as fallback — an article must never be inserted with `category_id = NULL`.
- **Tags** (`src/lib/ai/tags.ts`, tested): candidates are deduped by slug; `selectTags` = catalog top-100 (`getPopularTags` — never call the raw RPC directly; a missing function would silently empty the catalog) → existing in DB (linked by id, **never renamed**) → max 1 brand-new; max 5 total. Don't re-tighten (articles ended up with one tag) and don't loosen the brand-new cap.
- **Quality** (`src/lib/ai/quality.ts`, tested): `isLikelyRefusal` checks only the opening of the response; `assessArticleQuality` threshold `QUALITY_PUBLISH_THRESHOLD = 50`; the English-title penalty must push even an otherwise perfect article below the threshold. `is_featured` max 1/day at score ≥ 80.
- **Thumbnails**: the source og:image is used as-is, **including stock graphics and source logos (e.g. arXiv)** — owner decision 2026-10-28 (ROADMAP D3); don't add rejection rules without asking. AI image only when there is no usable og:image; its call respects the run `deadline`.
- The prompt receives `internalLinkCandidates` (40 newest title+slug pairs; articles published mid-run are appended). **Every AI-generated internal link must survive `sanitizeInternalLinks()`** (`lib/ai/internal-links.ts`). Changes require updating `internal-links.test.ts`.
- Prompt rule 10 ("Co to oznacza dla Polski") is the systemic information-gain minimum — don't remove; its anti-hallucination constraints are part of the rule.
- After the loop, `pingIndexNow(publishedUrls)` (fail-soft, needs `INDEXNOW_KEY`; key served at `/indexnow.txt`).
- `polishTypography` protects code blocks, markdown link destinations, and bare URLs — if you touch `splitProtectingCode`, run the typography tests. Text from source pages/RSS goes through `decodeHtmlEntities` (`lib/html-entities.ts`).

### Routing

| Route | Revalidate | Notes |
|---|---|---|
| `/` (`(home)` group) | 300 s | **newest-first top**: 9 latest (hero+column+tiles) above category sections, no duplicates; Preferred Sources box at the bottom (owner decisions); sr-only h1 (owner decision); WebSite JSON-LD |
| `/artykul/[slug]` | 60 s | prerenders top 500; **no `loading.tsx` on purpose** — a Suspense boundary above the page commits HTTP 200 before `notFound()`, turning missing articles into soft-404s. NewsArticle JSON-LD (author/publisher = organization by `@id`); TOC is a server component (anchors via shared `slugifyHeading` + `stripInlineMarkdown`) |
| `/kategoria/[slug]?page=N` | per-request* | *dynamic (searchParams). **Unknown slug → 404 from `layout.tsx`** (sync `isCategorySlug`, renders before the loading boundary). Empty page>1 → `notFound()` (streams 200+noindex because of loading.tsx — known, accepted; real fix = path pagination, backlog) |
| `/tag/[slug]?page=N` | per-request* | paginated like kategoria; real total via `getArticlesByTagPaginated`. **noindex, follow; excluded from sitemap** (thin content, ~73% of tags have 1 article). Don't re-index without tag consolidation / topic hubs (ROADMAP) |
| `/szukaj` | — | client; noindex; NOT in robots.txt Disallow (noindex needs crawlability) |
| `/sitemap.xml` | 3600 s | **must keep `revalidate`** — without it this Next version builds it once at deploy (production was frozen for 2.5 months). Static pages carry hand-maintained `lastModified` dates in `STATIC_PAGES` — update when their content changes; no `new Date()` |
| `/news-sitemap.xml` | 900 s | Google News sitemap, only articles < 48 h; listed in robots.txt next to sitemap.xml |
| `/indexnow.txt` | dynamic | IndexNow key from env (`INDEXNOW_KEY`; unset → 404) |
| `/redakcja` | static | `ProfilePage` + Person (`@id` = `FOUNDER_ID`, also `founder` of the organization). **The name endorses the SITE, not individual articles**: article `author` stays the Organization, no visible byline (owner decision — don't add per-article Person/bylines without a process change) |
| `/icon-192.png` `/icon-512.png` `/apple-icon.png` `/icon*.svg` | build-static | generated from `src/lib/brand-icon.tsx`; referenced by manifest + JSON-LD logos — don't delete |
| `/admin/*` | dynamic | Basic Auth + noindex (3 layers) |

API: `/api/cron/generate` (Bearer, `?count` ∈ [1,15], default 4; crons call with 3); `/api/newsletter` (5/min/IP → MailerLite); `/api/search` (30/min/IP, ≤100 chars, returns card data only). Rate limiting is in-memory per-instance (deliberate MVP choice — upgrade trigger in ROADMAP backlog). Client IP via `lib/request-ip.ts`.

JSON-LD entity graph lives in `src/lib/seo.ts`: `ORGANIZATION_ID`, `WEBSITE_ID`, `FOUNDER_ID`, `organizationJsonLd()` (root layout), `publisherReference()` (NewsArticle author/publisher), `websiteJsonLd()`. Reuse these — don't hand-write organization objects.

### Database (Supabase)

`supabase/schema.sql` is the idempotent source of truth; `supabase/migrations/001–007` are incremental and **order-sensitive** (005 replaces the trigger from 002; 007 must follow 005); `supabase/verify.sql` is a read-only diagnostic of which migrations are present. **Production has all of 001–007 since 2026-10-28** (Supabase org on Pro: daily backups, 7 days). Production schema changes only with the owner's explicit go-ahead and only via the procedure in `supabase/README.md › Kopie zapasowe` (CLI dump → restore-test in the matching `supabase/postgres` container → dry run ending in `ROLLBACK` → apply → `verify.sql` + row counts). Backups live outside the repo (`../aifeed-backups/`). Never run ad-hoc DML against production. Non-obvious bits:

- `articles_set_updated_at` trigger bumps `updated_at` **only on content changes** (title/content/excerpt/thumbnail — migration 005). Flag flips must NOT bump it — sitemap `lastmod` and JSON-LD `dateModified` depend on this honesty.
- FTS: `search_vector` is built with config `simple`; `searchArticles` must pass `{ config: "simple" }` to `.textSearch()`. ILIKE fallback uses the RAW query through `escapeIlike`, not the ts-sanitized one.
- Functions use `SET search_path = ''` + schema-qualified names (006/007, Supabase advisor). A plain `CREATE OR REPLACE FUNCTION set_updated_at` drops that setting — keep it in the definition. Extensions go in schema `extensions` (`pg_trgm` → opclass `extensions.gin_trgm_ops`).
- `popular_tags(tag_limit)` RPC (counts published articles only since 006): used by `getPopularTags()` (with paginated in-memory fallback) and by the pipeline.

## Conventions and gotchas

- **Don't add** `tailwind.config.js` or `@tailwindcss/typography` (custom `.prose-article` with `scroll-margin-top`), a global `scroll-behavior: smooth`, a second `window.addEventListener("scroll")` (use `useScrollY()`), AI-disclosure banners in article UI, a visible h1 on home, CategoryBar on article pages, `loading.tsx` under `/artykul/[slug]`, a Supabase `preconnect` (the browser never talks to Supabase directly), or `proxy` coverage of public routes (owner decisions / perf invariants).
- **Use always**: `slugifyHeading()` + `stripInlineMarkdown()` for anchors; `pluralize(count, forms)` from `search-utils.ts` for every count shown in UI; `formatDateLong`/`formatDateShort` from `lib/dates.ts` for every displayed date (Europe/Warsaw — the server runs in UTC); `useArticleSearch()` for any search UI; `<Thumbnail>` for every article image and `<ImageFallback>` when there is none; `siteConfig.categories` / `CATEGORY_SLUGS` / `isCategorySlug` as the single category catalog (CategoryBar, mobile menu, footer and home sections all read it); `siteConfig.contactEmail`.
- `images.unoptimized` is per-image in `Thumbnail`, NOT global — don't re-add the global flag.
- React 19 lint rule `react-hooks/set-state-in-effect` is enforced — derive state in render instead of synchronous setState in effects (see `useArticleSearch` for the pattern).
- **`NEXT_PUBLIC_SITE_URL`** must be `https://www.aifeed.pl` in production (with `www`); the code-side fallback is also www, and trailing slashes are stripped in `site.ts`.

## Testing

Tests live next to source (`src/**/*.test.{ts,tsx}`; 131 tests). Contract: when you touch an area, extend its tests — `safe-fetch` (SSRF), `content` (source extraction/og:image), `internal-links` (link whitelist), `typography` (URL protection), `parser` (multi-source matching), `tags` (catalog discipline), `quality` (gate + refusal detection), `normalize-markdown` (+ `normalizeCategory`), `dates`, `html-entities`, `thumbnail-url`, `mailerlite`, `data` (search helpers).

## Deployment

Vercel project `aifeed-pl` (team `zeprzalka`, id `team_YLFbOYu8bJGt9AmwarFyJ9Ai`, **Pro** plan — moved from the old personal scope; deployment URLs still carry the `m-zeprzalkas-projects` suffix), canonical domain `https://www.aifeed.pl` (apex should 308 to www — Vercel domain setting). Crons and region in `vercel.json` (05/11/17 UTC, count=3; `regions: ["cdg1"]`). **Deploy flow: `git push` (GitHub `m-zeprzalka/aifeed-test`) does NOT auto-deploy — the Vercel project has no Git integration (verified 2026-10-28; connecting it is an open owner decision, ROADMAP D7). Use a current CLI (`npx vercel@latest`) — 59.x failed on project settings. Always follow a push with `npx vercel deploy --prod --yes`.** Required env vars: see `.env.example` (complete, commented; `INDEXNOW_KEY` optional — Production only). Rollout checklist: `ROADMAP.md` §2.

Pre-push gate: `npm run check && npm run build` — all green, always.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

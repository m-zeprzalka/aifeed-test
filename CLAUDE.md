# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

**AiFeed** is a Polish-language, fully automated AI news magazine. A Vercel Cron (3×/day, `?count=3` = 9/day — owner decision, ROADMAP §1b) triggers a pipeline that scrapes 24 RSS feeds, scores and dedupes items, scrapes full source content **plus up to 2 same-story sources from other outlets** (`findRelatedItems` — multi-source synthesis for information gain), generates a Polish article via OpenRouter (**Claude Sonnet 5**, adaptive thinking on, target 700–1200 words) constrained to the existing tag vocabulary and an internal-link whitelist, runs a quality gate, picks a thumbnail (og:image → Gemini 2.5 Flash Image fallback), publishes to Supabase, and pings IndexNow. No human in the loop.

Production: `https://www.aifeed.pl` (Vercel project `aifeed-pl`).

**`ROADMAP.md`** (repo root, Polish) is the canonical planning document — production rollout steps, SEO strategy (anti-"AI slop"), monetization phases, and the technical backlog with triggers. **`README.md`** (Polish) documents the current state. Read ROADMAP.md before proposing new work — many "obvious" improvements are deliberately deferred there with explicit triggers.

## Language and content conventions

- **All user-facing copy, AI-generated articles, commit messages, and project documents (README/ROADMAP) are in Polish.** Code identifiers, code comments-when-necessary, `.env.example`, and this file stay in English.
- URL slugs are Polish (`/artykul/[slug]`, `/kategoria/[slug]`, `/szukaj`, `/o-serwisie`, `/polityka-prywatnosci`). English equivalents are 308-redirected in `next.config.ts`. New routes: Polish, with a redirect if an English form was ever public.

## Commands

```bash
npm run dev          # Next dev server (Turbopack)
npm run build        # Production build (Turbopack)
npm run lint         # ESLint — must be 0/0
npx tsc --noEmit     # Typecheck — must exit 0
npm test             # vitest run (all tests)
npx vitest run src/lib/data.test.ts        # single file
npx vitest run -t "pluralize"              # by test name
```

Manual pipeline trigger (local dev server must be running):

```bash
CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/generate?count=2"
```

## Stack at a glance

- **Next.js 16.3** App Router, **React 19**, React Compiler ON, Turbopack dev+build
- **TypeScript 5** strict, path alias `@/* → src/*`
- **Tailwind CSS 4** — configured in `globals.css` (`@theme`, `@custom-variant`, `@utility`); **no `tailwind.config.js`**
- **shadcn/ui on `@base-ui/react`** (not classic Radix); `shadcn` CLI lives in devDependencies
- **Supabase** (`@supabase/supabase-js` only) — anon key + RLS for reads; service role only in cron route, newsletter POST, and admin Server Actions
- **OpenRouter**: `anthropic/claude-sonnet-5` (articles — do NOT downgrade to sonnet-4, it's deprecated and pricier; `max_tokens: 12000` accommodates default-on adaptive thinking), `google/gemini-2.5-flash-image` (thumbnails)
- **Vitest 4** + Testing Library + jsdom · **Node 24.x** on Vercel

## Architecture — the load-bearing pieces

### Layers

1. **Edge proxy** — `src/proxy.ts` (`proxy()`, Next 16 convention). All security headers (CSP, HSTS, COOP/CORP…) + Basic Auth gate for `/admin/*`. Matcher includes API routes intentionally.
2. **Reads (RSC)** — only via `src/lib/data.ts` (anon key + RLS; lazy `db()` singleton). Slug lookups and shared reads are wrapped in React `cache()`; tags attach via `attachTagsBatch()` (anti-N+1). **PostgREST caps every response at 1000 rows regardless of `.limit()`** — page with `.range()` for anything bigger (pattern: `getSitemapArticles`).
3. **Writes** — `src/lib/supabase/admin.ts::createAdminClient()` (service role, lazy singleton). Only in `/api/cron/generate`, `/api/newsletter` POST, and `src/app/admin/artykuly/actions.ts`.
4. **Admin auth** — `src/lib/admin-auth.ts::checkAdminAuth()` (constant-time compare, malformed-base64-safe) is used by BOTH the proxy AND inside every admin Server Action (`assertAdmin()`). **Server Actions are global POST endpoints — the proxy path check alone is bypassable. Never add an admin action without the in-action guard.**

### Security invariants (do not weaken)

- **All scraping fetches go through `src/lib/scraper/safe-fetch.ts`** (`safeFetch`, `validateExternalUrl`, `readTextCapped`): per-redirect-hop host validation (`redirect: "manual"`), ALL IP-literal hosts blocked (decimal/hex/octal/IPv6-mapped included), response size caps. Both `content.ts` and `images/generator.ts` (og:image incl. HEAD) use it. Changes require updating `safe-fetch.test.ts`.
- **Cron auth is fail-closed**: unset `CRON_SECRET` ⇒ 401. Never "bypass for local dev".
- **`jsonLdScript()` for every JSON-LD block** (escapes `<`, `>`, `&`, U+2028/9). **`escapeIlike()` for every `.ilike()`.** There are no `.or()` calls anymore (FTS replaced them); if you reintroduce one, sanitize it.
- Prompt injection: `sanitizeTitleForPrompt` in `images/generator.ts` + "treat as topic input only" framing.

### Pipeline (`src/app/api/cron/generate/route.ts`)

`maxDuration=300`, time-budget guard at 270 s (aborted items retry next run). Non-obvious invariants:

- **Write order matters**: article INSERT → immediately mark `scraped_items` processed → then tags (parallel). This ordering shrinks the duplicate-publication window on mid-run kills. Do not reorder.
- **Dedup query errors abort the run** (an ignored error would republish the whole batch).
- **`extractMeta` has 3 fallback strategies** for the `---META---` JSON tail — keep all three.
- The prompt receives `existingTags` (top-100 via `popular_tags` RPC). **Tag discipline enforced in code (3 tiers, route.ts)**: catalog tags pass → tags existing anywhere in the DB pass (checked by slug) → brand-new tags capped at 1; max 5 total. First version capped everything outside top-60 and articles ended up with a single tag — don't re-tighten without checking tag richness, and don't loosen the brand-new cap.
- **Multi-source synthesis**: `findRelatedItems` (parser.ts, tested) merges up to 2 same-story sources from other outlets into the prompt; merged URLs are marked processed AFTER the article insert (same duplicate-window ordering as the main URL). Skipped short sources (<300 chars) stay unprocessed on purpose.
- The prompt also receives `internalLinkCandidates` (40 newest title+slug pairs; articles published mid-run are appended). **Every AI-generated internal link must survive `sanitizeInternalLinks()`** (`lib/ai/internal-links.ts`) — links outside the whitelist become plain text (no hallucinated 404s). Changes require updating `internal-links.test.ts`.
- Prompt rule 10 ("Co to oznacza dla Polski") is the systemic information-gain minimum (ROADMAP §3.3) — don't remove; its anti-hallucination constraints are part of the rule.
- After the loop, `pingIndexNow(publishedUrls)` (fail-soft, needs `INDEXNOW_KEY`; key served at `/indexnow.txt`).
- Quality gate: score < 50 → reject (`src/lib/ai/quality.ts`); `is_featured` max 1/day at score ≥ 80.
- `polishTypography` protects code blocks, markdown link destinations, and bare URLs — if you touch `splitProtectingCode`, run the typography tests.

### Routing

| Route | Revalidate | Notes |
|---|---|---|
| `/` (`(home)` group) | 300 s | **newest-first top**: 9 latest (hero+column+grid) above category sections, no duplicates; Preferred Sources box at the bottom (owner decisions); sr-only h1 (owner decision) |
| `/artykul/[slug]` | 60 s | prerenders top 500; NewsArticle JSON-LD; TOC anchors via shared `slugifyHeading` + `stripInlineMarkdown` |
| `/kategoria/[slug]?page=N` | 300 s* | *dynamic (searchParams); empty page>1 → `notFound()` — keep this, it kills a soft-404 space |
| `/tag/[slug]` | 300 s | **noindex, follow; excluded from sitemap** (thin content, ~73% of tags have 1 article). Don't re-index without ROADMAP #5.1 (catalog consolidation) |
| `/szukaj` | — | client; noindex; NOT in robots.txt Disallow (noindex needs crawlability) |
| `/news-sitemap.xml` | 900 s | Google News sitemap, only articles < 48 h; listed in robots.txt next to sitemap.xml |
| `/indexnow.txt` | dynamic | IndexNow key from env (`INDEXNOW_KEY`; unset → 404) |
| `/redakcja` | static | site-creator page (Person JSON-LD, `siteConfig.author`) + `founder` in NewsMediaOrganization. **The name endorses the SITE, not individual articles**: article `author` stays Organization, no visible byline (owner decision — don't add per-article Person/bylines without a process change) |
| `/icon-192.png` `/icon-512.png` `/apple-icon.png` | build-static | generated from `src/lib/brand-icon.tsx`; referenced by manifest + JSON-LD logos — don't delete |
| `/admin/*` | dynamic | Basic Auth + noindex (3 layers) |

API: `/api/cron/generate` (Bearer, `?count` ∈ [1,15], default 4; crons call with 3); `/api/newsletter` (5/min/IP); `/api/search` (30/min/IP, ≤100 chars). Rate limiting is in-memory per-instance (deliberate MVP choice — upgrade trigger in ROADMAP #5.5).

### Database (Supabase)

`supabase/schema.sql` is the idempotent source of truth; `supabase/migrations/001–005` are incremental (see `supabase/README.md`). Non-obvious bits:

- `articles_set_updated_at` trigger bumps `updated_at` **only on content changes** (title/content/excerpt/thumbnail — migration 005). Flag flips must NOT bump it — sitemap `lastmod` and JSON-LD `dateModified` depend on this honesty.
- FTS: `search_vector` is built with config `simple`; `searchArticles` must pass `{ config: "simple" }` to `.textSearch()` (the default `english` config eats short Polish words). ILIKE fallback uses the RAW query through `escapeIlike`, not the ts-sanitized one.
- `popular_tags(tag_limit)` RPC: used by `getPopularTags()` (with in-memory fallback) and by the pipeline for the tag vocabulary.

## Conventions and gotchas

- **Don't add** `tailwind.config.js` or `@tailwindcss/typography` (custom `.prose-article` with `scroll-margin-top`), a global `scroll-behavior: smooth`, a second `window.addEventListener("scroll")` (use `useScrollY()`), AI-disclosure banners in article UI, a visible h1 on home, or CategoryBar on article pages (owner decisions).
- **Use always**: `slugifyHeading()` + `stripInlineMarkdown()` for anchors (TOC and the markdown renderer must slugify the *identical* string); `pluralize(count, forms)` from `search-utils.ts` for every count shown in UI (full Polish rule incl. teens); `useArticleSearch()` for any search UI; `<Thumbnail>` for every article image (it decides optimization: Supabase Storage → optimized, external scraped → `unoptimized` because Vercel's optimizer mangled some sources).
- `images.unoptimized` is per-image in `Thumbnail`, NOT global — don't re-add the global flag. `remotePatterns` keeps the HTTPS `**` catch-all (scraped thumbnails come from anywhere).
- React 19 lint rule `react-hooks/set-state-in-effect` is enforced — derive state in render instead of synchronous setState in effects (see `useArticleSearch` for the pattern).
- **`NEXT_PUBLIC_SITE_URL`** must be `https://www.aifeed.pl` in production (with `www`); the code-side fallback is also www, and trailing slashes are stripped in `site.ts`.

## Testing

Tests live next to source (`src/**/*.test.{ts,tsx}`; 84 tests). `data.test.ts` imports real helpers from `search-utils.ts`; `safe-fetch.test.ts` covers the SSRF guard; typography tests cover URL protection; `internal-links.test.ts` covers the internal-link whitelist; `parser.test.ts` covers multi-source title matching. When you touch those areas, extend the tests — that's the contract.

## Deployment

Vercel project `aifeed-pl` (team `m-zeprzalkas-projects`), canonical domain `https://www.aifeed.pl`. Crons in `vercel.json` (05/11/17 UTC, count=3). **Deploy flow: `git push` (GitHub `m-zeprzalka/aifeed-test`) does NOT auto-deploy — the Vercel project has no Git integration (deliberate; migration to a Vercel PRO account is planned). Always follow a push with `npx vercel deploy --prod --yes`.** Required env vars: see `.env.example` (complete, commented; `INDEXNOW_KEY` optional — Production only). Production rollout checklist: `ROADMAP.md` §2.

Pre-push gate: `npx tsc --noEmit && npm run lint && npm test && npm run build` — all green, always.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

**AiFeed** is a Polish-language, fully automated AI news magazine. A Vercel Cron (3×/day) triggers a pipeline that scrapes 20 RSS feeds, scores and dedupes items, scrapes full source content, generates a Polish article via OpenRouter (Claude Sonnet 4), runs a quality gate, picks a thumbnail (og:image → Gemini 2.5 Flash Image fallback), and publishes to Supabase. No human in the loop.

Production: `https://www.aifeed.pl` (Vercel project `aifeed-pl`).

`AUDIT.md` (in the repo root) is the canonical audit and remediation plan — read it for the full picture of known issues, priorities, and architectural decisions. This file is a quick orientation, not a substitute.

## Language and content conventions

- **All user-facing copy, AI-generated articles, and commit messages are in Polish.** This is a hard requirement — the product is a Polish magazine. Code identifiers, comments-when-necessary, and CLAUDE.md / `.env.example` stay in English. `AUDIT.md` is in Polish because it's a project document, not source.
- URL slugs are Polish (`/artykul/[slug]`, `/kategoria/[slug]`, `/szukaj`, `/o-serwisie`, `/polityka-prywatnosci`). English equivalents (`/article`, `/category`, `/search`, `/about`, `/privacy`) are 301-redirected in `next.config.ts`. When adding routes, keep them Polish and add a 301 if the English form was ever public.

## Commands

```bash
npm run dev          # Next dev server (Turbopack)
npm run build        # Production build (Turbopack)
npm run start        # Serve production build
npm run lint         # ESLint — must be 0/0
npx tsc --noEmit     # Typecheck — must exit 0
npm test             # vitest run (all tests)
npm run test:watch   # vitest watch mode

# Run a single test file or pattern
npx vitest run src/lib/data.test.ts
npx vitest run -t "sanitizeOrQuery"
```

Manual pipeline trigger (local dev server must be running):

```bash
CRON_SECRET=$(grep '^CRON_SECRET=' .env.local | cut -d= -f2-)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/cron/generate?count=10"
```

## Stack at a glance

- **Next.js 16.2.3** App Router, **React 19.2.4**, React Compiler ON, Turbopack dev+build
- **TypeScript 5** strict, path alias `@/* → src/*`
- **Tailwind CSS 4** — new syntax (`@theme`, `@custom-variant`, `@utility` in `globals.css`); **no `tailwind.config.js`**
- **shadcn/ui 4.2** built on **`@base-ui/react`** (not classic Radix) — keep this in mind when adding/replacing primitives
- **Supabase** (`@supabase/supabase-js` + `@supabase/ssr`) — anon key + RLS for reads, service role only in `/api/cron/*` and newsletter POST
- **OpenRouter** for `anthropic/claude-sonnet-4` (articles) and `google/gemini-2.5-flash-image` (thumbnails)
- **Vitest 4** + `@testing-library/react` + `jsdom`
- **Node 24.x** runtime on Vercel

## Architecture — the load-bearing pieces

### Layers

1. **Edge proxy** — `src/proxy.ts` exports `proxy()` (Next 16 convention; replaces `middleware.ts`). Sets all security headers (HSTS, X-Frame, etc.). Matcher includes API routes intentionally.
2. **Server (RSC)** — pages and route handlers read via the **anon key + RLS** through a lazy singleton in `src/lib/data.ts`. Importing `data.ts` does not require env vars; `db()` constructs the client on first call.
3. **Admin client** — `src/lib/supabase/admin.ts::createAdminClient()` uses service role and is only invoked from `/api/cron/*` and `/api/newsletter`. Never reach for it from a page or RSC.
4. **Client components** — only the interactive ones marked `"use client"` (Header, SearchModal, NewsTicker, ThemeToggle, NewsletterForm, ReadingProgress, TableOfContents, CategoryBar, ShareButtons, ScrollToTop, search page).

### Data flow contract

- `src/lib/data.ts` is the **only** read path used by pages. All queries are bounded (`limit`/`maxBy`), use `.maybeSingle()` where 0-row is valid, and call `attachTagsBatch()` to avoid N+1. New page-side reads should go here, not directly into a page component.
- `src/lib/search-utils.ts` — `escapeIlike`, `sanitizeOrQuery`, `pluralize`, `MAX_LEN`. **PostgREST `.or()` queries must be passed through `sanitizeOrQuery`** (escapes `%_\` and strips `,()`). The data tests in `src/lib/data.test.ts` import from here directly — keep their signatures stable.
- `src/lib/heading-id.ts::slugifyHeading` is shared by the markdown renderer and TOC. **Use this same function** for any new anchor generation, otherwise TOC anchors stop matching headings (Polish diacritics are preserved by design: `ą→a`, `ł→l`, …).
- `src/lib/jsonld.ts::jsonLdScript` — always render JSON-LD through this helper (escapes `<`, `>`, `&`, U+2028/U+2029). Don't hand-roll `<script type="application/ld+json">`.

### Pipeline (`src/app/api/cron/generate/route.ts`)

`maxDuration=300`, fail-closed Bearer auth (`Authorization: Bearer ${CRON_SECRET}`; missing env = 401). Stages live in `src/lib/scraper/{sources,parser,content}.ts`, `src/lib/ai/{writer,quality,prompts}.ts`, `src/lib/images/generator.ts`. Two non-obvious invariants:

- **`scrapeArticleContent` has SSRF guards** in `isInternalHost()` (blocks loopback, RFC1918, link-local, AWS metadata `169.254.169.254`, IPv6 loopback/ULA). When touching scraping code, do not loosen this; add new tests if you change `isInternalHost`.
- **`extractMeta` has 3 fallback strategies** for the `---META---` JSON tail (delimiter, last `{...}` block, smart-quote/trailing-comma fix). LLM output is unreliable — keep all three when refactoring.
- Quality gate threshold is **score < 50 → reject** (`src/lib/ai/quality.ts`).

### Routing

| Route | Revalidate | Notes |
|---|---|---|
| `/` (`(home)` group) | 300s | Hero + featured + latest + alternating category sections + newsletter |
| `/artykul/[slug]` | 60s | TOC, prose, share, adjacent (prev/next), related; `NewsArticle` JSON-LD |
| `/kategoria/[slug]?page=N` | 300s | Offset pagination, `rel=prev/next`, `ItemList` JSON-LD |
| `/tag/[slug]` | 300s | `CollectionPage` + `ItemList` JSON-LD |
| `/szukaj` | — | Client; **`robots: noindex`**, excluded from sitemap, disallowed in `robots.txt` |
| `/feed.xml` | 3600s | RSS 2.0 with CDATA + atom self link |
| `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest` | — | Metadata routes |

API: `/api/cron/generate` (Bearer, 300s, `?count=N` ∈ [1,15]); `/api/cron/seed` (Bearer, manual category seed); `/api/newsletter` (5/min/IP, email ≤254); `/api/search` (30/min/IP, query ≤100).

Rate limiting (`src/lib/rate-limit.ts`) is **in-memory sliding window** — per-instance only, not multi-region safe. If you change deploy topology or want global limits, swap to Upstash via Vercel Marketplace (item #6 in `DOCS.md` todo).

### Database (Supabase)

`supabase/schema.sql` is the **idempotent source of truth** (re-run safe). Incremental migrations live in `supabase/migrations/NNN_*.sql` and are also idempotent. See `supabase/README.md` for the apply order. Two non-obvious bits:

- `articles.updated_at` requires the `articles_set_updated_at` trigger (migration 002). Without it, `sitemap.ts::lastModified` and JSON-LD `dateModified` are wrong.
- `popular_tags(tag_limit)` RPC is the fast path for `getPopularTags()`; `data.ts` falls back to in-memory aggregate with a console warn if the RPC is missing.

## Conventions and gotchas

- **Don't add a `tailwind.config.js`.** Tailwind 4 is configured via `globals.css` (`@theme inline`, `@custom-variant dark`, `@utility`).
- **Don't use `@tailwindcss/typography`.** Article body uses the custom `.prose-article` class with `scroll-margin-top: 5rem` on `h2/h3` (anchor offset under sticky header).
- **No global `scroll-behavior: smooth`** on `html` — it caused "land mid-page then animate up" on navigation. Smooth scroll is opt-in per call (logo click, ScrollToTop button).
- **Use the shared `useScrollY()` hook** (`src/lib/hooks/use-scroll-y.ts`) for any new scroll-position-driven UI. It's a `useSyncExternalStore` shared subscription — adding another `window.addEventListener("scroll")` reintroduces the duplication this hook was created to remove.
- **Cron auth is fail-closed.** If `CRON_SECRET` is unset, the handler returns 401 — do not "bypass for local dev". Set the var in `.env.local`.
- **`is_featured` flag** — currently set to "first article in a generated batch." Treat as cosmetic, not editorial.
- **`NEXT_PUBLIC_SITE_URL`** is consumed in SEO/sitemap/RSS/OG; a wrong value silently breaks canonicals. Production must be `https://www.aifeed.pl` (with `www`, matching the served traffic).
- The `next.config.ts` `images.remotePatterns` ends with a `**` HTTPS catch-all because the pipeline scrapes thumbnails from unpredictable RSS sources. Keep it.

## Testing

Tests live next to source: `src/**/*.test.{ts,tsx}` (vitest config). The data tests import real implementations from `src/lib/search-utils.ts` rather than re-implementing helpers — when you refactor those helpers, run `npm test` before assuming the change is safe. Setup file: `src/test/setup.ts` (`@testing-library/jest-dom`).

## Deployment

Vercel project `aifeed-pl` (team `m-zeprzalkas-projects`), domains `aifeed.pl` + `www.aifeed.pl`. Crons run at 05:00 / 11:00 / 17:00 UTC (`vercel.json`). Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`. See `.env.example`.

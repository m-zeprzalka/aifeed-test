import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Article, Category, Tag } from "@/types/database";
import { escapeIlike, sanitizeTsQuery } from "@/lib/search-utils";

// ----- Supabase client (read-only, anon key) -----
// Uses anon key (not server.ts cookie client) because all data access here is
// public read-only — no RLS row ownership needed. Lazy singleton — constructed
// on first use so importing this module doesn't require env vars at build time.
let _client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables");
  _client = createClient(url, key);
  return _client;
}

export type ArticleWithRelations = Article & { category: Category | null; tags: Tag[] };

// ===================== BATCH HELPERS =====================

/** Attach tags to multiple articles in a single query (eliminates N+1) */
async function attachTagsBatch(
  articles: (Article & { category: Category | null })[]
): Promise<ArticleWithRelations[]> {
  if (articles.length === 0) return [];

  const ids = articles.map((a) => a.id);
  const { data: tagRows, error } = await db()
    .from("article_tags")
    .select("article_id, tag:tags(*)")
    .in("article_id", ids);

  if (error) {
    console.error("[data] attachTagsBatch failed:", error.message);
    return articles.map((a) => ({ ...a, tags: [] }));
  }

  // PostgREST returns the joined `tag:tags(*)` row as `Tag | Tag[] | null`
  // depending on the join arity. We coerce through `unknown` to a narrow
  // local type instead of `any` so the rest of the function stays typed.
  type TagJoinRow = { article_id: string; tag: Tag | Tag[] | null };
  const tagMap = new Map<string, Tag[]>();
  for (const row of (tagRows || []) as unknown as TagJoinRow[]) {
    if (!row.tag) continue;
    const tags = Array.isArray(row.tag) ? row.tag : [row.tag];
    const existing = tagMap.get(row.article_id) || [];
    existing.push(...tags);
    tagMap.set(row.article_id, existing);
  }

  return articles.map((a) => ({ ...a, tags: tagMap.get(a.id) || [] }));
}

/** Attach tags to a single article */
async function attachTags(
  article: Article & { category: Category | null }
): Promise<ArticleWithRelations> {
  const results = await attachTagsBatch([article]);
  return results[0];
}

// ===================== DATA ACCESS =====================

export async function getArticles(limit = 10): Promise<ArticleWithRelations[]> {
  const { data: articles, error } = await db()
    .from("articles")
    .select("*, category:categories(*)")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[data] getArticles failed:", error.message);
    return [];
  }
  if (!articles || articles.length === 0) return [];

  return attachTagsBatch(articles);
}

export async function getArticleBySlug(slug: string): Promise<ArticleWithRelations | null> {
  const { data: article, error } = await db()
    .from("articles")
    .select("*, category:categories(*)")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.error("[data] getArticleBySlug failed:", error.message);
    return null;
  }
  if (!article) return null;

  return attachTags(article);
}

export interface PaginatedResult {
  articles: ArticleWithRelations[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * Offset-based pagination for category listings. Uses page numbers so that
 * "Previous" navigates to `page - 1` (not back to page 1 like the previous
 * cursor-only scheme).
 */
export async function getArticlesByCategoryPaginated(
  categorySlug: string,
  pageSize = 12,
  page = 1,
): Promise<PaginatedResult> {
  const safePage = Math.max(1, Math.floor(page) || 1);

  // `getCategoryBySlug` jest owinięte w React cache() — generateMetadata,
  // page i ta funkcja współdzielą jeden query na request.
  const category = await getCategoryBySlug(categorySlug);

  if (!category) {
    return { articles: [], page: safePage, pageSize, total: 0, totalPages: 0, hasPrev: false, hasNext: false };
  }

  const { count } = await db()
    .from("articles")
    .select("*", { count: "exact", head: true })
    .eq("is_published", true)
    .eq("category_id", category.id);

  const total = count || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  if (total === 0 || from >= total) {
    return { articles: [], page: safePage, pageSize, total, totalPages, hasPrev: safePage > 1, hasNext: false };
  }

  const { data: articles, error } = await db()
    .from("articles")
    .select("*, category:categories(*)")
    .eq("is_published", true)
    .eq("category_id", category.id)
    // Tiebreaker po `id` — bez niego artykuły publikowane w tej samej sekundzie
    // mogą się przesuwać między stronami paginacji między requestami
    // (duplikaty/przeskoki dla użytkownika i crawlera).
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error || !articles || articles.length === 0) {
    if (error) console.error("[data] getArticlesByCategoryPaginated failed:", error.message);
    return { articles: [], page: safePage, pageSize, total, totalPages, hasPrev: safePage > 1, hasNext: false };
  }

  const withTags = await attachTagsBatch(articles);

  return {
    articles: withTags,
    page: safePage,
    pageSize,
    total,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

// `cache()` from React 19 deduplicates calls within the same request — so
// when the root layout AND the home page both call `getCategories()` we only
// hit Supabase once. Each request gets its own cache; nothing leaks across
// requests. Same pattern below for `getTickerArticles` and `getPopularTags`.
export const getCategories = cache(async (): Promise<Category[]> => {
  const { data, error } = await db()
    .from("categories")
    .select("*")
    .order("name");

  if (error) {
    console.error("[data] getCategories failed:", error.message);
    return [];
  }
  return data || [];
});

// cache() — generateMetadata + page + getArticlesByCategoryPaginated wołają
// to w tym samym request'cie; bez dedupe każdy render kategorii robił 3×
// ten sam SELECT.
export const getCategoryBySlug = cache(async (slug: string): Promise<Category | null> => {
  const { data, error } = await db()
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[data] getCategoryBySlug failed:", error.message);
    return null;
  }
  return data;
});

/**
 * Wyszukiwarka. Strategia dwustopniowa:
 *
 * 1. **FTS przez `articles.search_vector`** (migracja 004) — indeksowany
 *    GIN, O(log n). Każde słowo zapytania jest prefix-matched (`term:*`),
 *    łączone AND-em — "open ai" znajduje artykuły z "openai" i "AI" jednocześnie.
 * 2. **Fallback trigram ILIKE na title** — gdy FTS zwróci 0 wyników
 *    (literówki, słowa spoza katalogu). `idx_articles_title_trgm` (GIN
 *    gin_trgm_ops) obsługuje to w O(log n).
 *
 * Bez migracji 004 FTS zwraca błąd — wtedy też lecimy na ILIKE fallback
 * (gracefulnie). Dzięki temu deploy kodu może wyprzedzić aplikację
 * migracji bez padania UX.
 */
export async function searchArticles(query: string): Promise<ArticleWithRelations[]> {
  const safe = sanitizeTsQuery(query);
  if (!safe) return [];

  // Build prefix tsquery: "open ai" → "open:* & ai:*"
  const tsQuery = safe.split(" ").filter(Boolean).map((t) => `${t}:*`).join(" & ");

  let articles: (Article & { category: Category | null })[] = [];

  // Stage 1: FTS. `config: "simple"` MUSI się zgadzać z konfiguracją, którą
  // zbudowano `search_vector` (migracja 004) — bez tego parametru zapytanie
  // parsuje domyślny słownik `english`, którego stopwordy połykają krótkie
  // polskie słowa ("i", "a", "to", "do", "on"...).
  const ftsRes = await db()
    .from("articles")
    .select("*, category:categories(*)")
    .eq("is_published", true)
    .textSearch("search_vector", tsQuery, { config: "simple" })
    .order("published_at", { ascending: false })
    .limit(20);

  if (ftsRes.error) {
    // Migracja 004 mogła nie być jeszcze zaaplikowana (search_vector nie istnieje)
    // — log warn, lecimy od razu na ILIKE.
    console.warn("[data] searchArticles FTS failed, falling back to ILIKE:", ftsRes.error.message);
  } else if (ftsRes.data) {
    articles = ftsRes.data;
  }

  // Stage 2: trigram ILIKE fallback przy 0 wyników z FTS. Celowo na SUROWYM
  // (przyciętym) zapytaniu, nie na wyniku sanitizeTsQuery — sanitizer wycina
  // interpunkcję, więc "open-source" stałoby się "open source" i ILIKE nigdy
  // nie trafiłoby tytułu zawierającego myślnik. escapeIlike wystarcza tu
  // za całą sanityzację (parametr jest bindowany, nie sklejany w SQL).
  if (articles.length === 0) {
    const ilikeRes = await db()
      .from("articles")
      .select("*, category:categories(*)")
      .eq("is_published", true)
      .ilike("title", `%${escapeIlike(query.trim())}%`)
      .order("published_at", { ascending: false })
      .limit(20);
    if (ilikeRes.error) {
      console.error("[data] searchArticles ILIKE fallback failed:", ilikeRes.error.message);
      return [];
    }
    articles = ilikeRes.data ?? [];
  }

  if (articles.length === 0) return [];

  return attachTagsBatch(articles);
}

/**
 * Articles for the home page category sections: one small indexed query per
 * category, in parallel, then a single batched tag fetch.
 *
 * Wcześniejsza wersja ciągnęła jedną wspólną pulę 360 najnowszych artykułów
 * i grupowała w pamięci — kategoria, której najnowszy artykuł wypadł poza
 * pulą (≈ miesiąc bez publikacji), znikała z home w całości. Per-kategoria
 * limit nie ma tej wady i jest tańszy (6 × `limit 4` na indeksie zamiast
 * jednego skanu 360 rzędów).
 */
export async function getArticlesGroupedByCategory(
  categorySlugs: string[],
  limitPerCategory = 4
): Promise<Record<string, ArticleWithRelations[]>> {
  const { data: categories, error: catError } = await db()
    .from("categories")
    .select("id, slug")
    .in("slug", categorySlugs);

  if (catError || !categories || categories.length === 0) return {};

  const perCategory = await Promise.all(
    categories.map(async (cat) => {
      const { data, error } = await db()
        .from("articles")
        .select("*, category:categories(*)")
        .eq("is_published", true)
        .eq("category_id", cat.id)
        .order("published_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limitPerCategory);
      if (error) {
        console.error(`[data] getArticlesGroupedByCategory(${cat.slug}) failed:`, error.message);
        return { slug: cat.slug, articles: [] };
      }
      return { slug: cat.slug, articles: data ?? [] };
    })
  );

  // Batch tags for all articles at once
  const allArticles = perCategory.flatMap((g) => g.articles);
  const withTags = await attachTagsBatch(allArticles);
  const taggedMap = new Map(withTags.map((a) => [a.id, a]));

  const result: Record<string, ArticleWithRelations[]> = {};
  for (const group of perCategory) {
    if (group.articles.length === 0) continue;
    result[group.slug] = group.articles
      .map((a) => taggedMap.get(a.id))
      .filter((a): a is ArticleWithRelations => Boolean(a));
  }
  return result;
}

/**
 * Fetch popular tags ranked by usage count.
 * Prefers the Supabase RPC `popular_tags(tag_limit)` (server-side GROUP BY).
 * Falls back to in-memory aggregation if the RPC is missing (older DBs).
 */
export const getPopularTags = cache(async (limit = 10): Promise<Tag[]> => {
  const rpc = await db().rpc("popular_tags", { tag_limit: limit });
  if (!rpc.error && Array.isArray(rpc.data)) {
    return rpc.data.map((row: { id: string; name: string; slug: string }) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
    }));
  }

  // Fallback — only runs when the RPC hasn't been deployed yet.
  console.warn("[data] getPopularTags RPC missing, falling back to in-memory aggregate");

  // PostgREST tnie KAŻDĄ odpowiedź do 1000 rzędów (zob. getSitemapArticles) —
  // pojedynczy select na article_tags liczyłby popularność z wycinka danych
  // (produkcja 2026-08-12: 6388 wierszy → ranking z ~16% próbki i „trendy"
  // niezgodne z realną popularnością). Stronicujemy z deterministycznym
  // ORDER BY po kluczu złożonym; cap 20k wierszy to margines ~3× nad obecnym
  // wolumenem — do tego czasu RPC powinno być zaaplikowane (migracja 001).
  const BATCH = 1000;
  const MAX_ROWS = 20_000;
  const countRows: { tag_id: string }[] = [];
  for (let from = 0; from < MAX_ROWS; from += BATCH) {
    const { data, error } = await db()
      .from("article_tags")
      .select("article_id, tag_id")
      .order("article_id", { ascending: true })
      .order("tag_id", { ascending: true })
      .range(from, from + BATCH - 1);

    if (error) {
      console.error("[data] getPopularTags fallback page failed:", error.message);
      break;
    }
    countRows.push(...(data ?? []));
    if (!data || data.length < BATCH) break;
  }

  if (countRows.length === 0) return [];

  const countMap = new Map<string, number>();
  for (const row of countRows) {
    countMap.set(row.tag_id, (countMap.get(row.tag_id) || 0) + 1);
  }

  const topTagIds = [...countMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  const { data: tags, error: tagError } = await db()
    .from("tags")
    .select("id, name, slug")
    .in("id", topTagIds);

  if (tagError || !tags) return [];

  const tagMap = new Map(tags.map((t) => [t.id, t as Tag]));
  return topTagIds.map((id) => tagMap.get(id)).filter(Boolean) as Tag[];
});

/**
 * Slugs for the sitemap, paged in 1000-row batches.
 *
 * WAŻNE: PostgREST (Supabase) tnie KAŻDĄ odpowiedź do server-side
 * `db-max-rows` (domyślnie 1000) niezależnie od `.limit()`. Pojedyncze
 * `.limit(5000)` zwracało dokładnie 1000 rzędów — przy >1000 artykułów
 * sitemap po cichu gubił wszystkie starsze. Stronicujemy przez `.range()`.
 */
export async function getSitemapArticles(limit = 5000): Promise<{ slug: string; updated_at: string; is_featured: boolean }[]> {
  const BATCH = 1000;
  const all: { slug: string; updated_at: string; is_featured: boolean }[] = [];

  for (let from = 0; from < limit; from += BATCH) {
    const to = Math.min(from + BATCH, limit) - 1;
    const { data, error } = await db()
      .from("articles")
      .select("slug, updated_at, is_featured")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("[data] getSitemapArticles failed:", error.message);
      break;
    }
    all.push(...(data ?? []));
    // Niepełny batch = koniec danych.
    if (!data || data.length < to - from + 1) break;
  }
  return all;
}

export const getTickerArticles = cache(async (limit = 10): Promise<{ title: string; slug: string }[]> => {
  const { data, error } = await db()
    .from("articles")
    .select("title, slug")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[data] getTickerArticles failed:", error.message);
    return [];
  }
  return data || [];
});

// ===================== TAG PAGES =====================

// cache() — generateMetadata, page i getArticlesByTagPaginated wołają to
// 3× na request.
export const getTagBySlug = cache(async (slug: string): Promise<Tag | null> => {
  const { data, error } = await db()
    .from("tags")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[data] getTagBySlug failed:", error.message);
    return null;
  }
  return data;
});

/**
 * Paginacja po tagu — ten sam kształt i kontrakt co
 * `getArticlesByCategoryPaginated` (strona tagu reużywa `Pagination`).
 *
 * Filtr przez embedded resource `article_tags!inner` + `.eq()` na kolumnie
 * joina: jeden indeksowany JOIN po `idx_article_tags_tag_id` i `count:
 * "exact"` z prawdziwą liczbą wpisów. Poprzednia wersja ciągnęła listę
 * article_id osobnym zapytaniem (PostgREST tnie każdą odpowiedź do 1000
 * rzędów — popularny tag po cichu gubiłby starsze artykuły) i miała twardy
 * `limit 50`, przez co strona tagu zawsze pokazywała „50 artykułów".
 */
export async function getArticlesByTagPaginated(
  tagSlug: string,
  pageSize = 12,
  page = 1,
): Promise<PaginatedResult> {
  const safePage = Math.max(1, Math.floor(page) || 1);

  const tag = await getTagBySlug(tagSlug);

  if (!tag) {
    return { articles: [], page: safePage, pageSize, total: 0, totalPages: 0, hasPrev: false, hasNext: false };
  }

  const { count } = await db()
    .from("articles")
    .select("article_tags!inner(tag_id)", { count: "exact", head: true })
    .eq("is_published", true)
    .eq("article_tags.tag_id", tag.id);

  const total = count || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  if (total === 0 || from >= total) {
    return { articles: [], page: safePage, pageSize, total, totalPages, hasPrev: safePage > 1, hasNext: false };
  }

  const { data: articles, error } = await db()
    .from("articles")
    .select("*, category:categories(*), article_tags!inner(tag_id)")
    .eq("is_published", true)
    .eq("article_tags.tag_id", tag.id)
    // Tiebreaker po `id` — jak w kategorii (stabilne strony paginacji).
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error || !articles || articles.length === 0) {
    if (error) console.error("[data] getArticlesByTagPaginated failed:", error.message);
    return { articles: [], page: safePage, pageSize, total, totalPages, hasPrev: safePage > 1, hasNext: false };
  }

  const withTags = await attachTagsBatch(articles);

  return {
    articles: withTags,
    page: safePage,
    pageSize,
    total,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
}

// ===================== ADJACENT ARTICLES =====================

export interface AdjacentArticle {
  slug: string;
  title: string;
}

export interface AdjacentArticles {
  prev: AdjacentArticle | null;
  next: AdjacentArticle | null;
}

/**
 * Get previous and next articles for the article navigation footer.
 *
 * Strategy: prefer same-category neighbors, but always return both prev and
 * next when more than one published article exists. At category edges (newest
 * or oldest in category) we wrap within the category — newest article's "prev"
 * loops back to the oldest in that category, and vice versa. If the category
 * has only one article (the current one), we cross category boundaries and use
 * the global newest/oldest. This guarantees the user can always navigate left
 * and right, eliminating dead-end posts.
 */
export async function getAdjacentArticles(
  articleId: string,
  categoryId: string,
  publishedAt: string
): Promise<AdjacentArticles> {
  const [olderInCat, newerInCat] = await Promise.all([
    db()
      .from("articles")
      .select("slug, title")
      .eq("is_published", true)
      .eq("category_id", categoryId)
      .neq("id", articleId)
      .lt("published_at", publishedAt)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db()
      .from("articles")
      .select("slug, title")
      .eq("is_published", true)
      .eq("category_id", categoryId)
      .neq("id", articleId)
      .gt("published_at", publishedAt)
      .order("published_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  let prev: AdjacentArticle | null = olderInCat.data || null;
  let next: AdjacentArticle | null = newerInCat.data || null;

  // Prev missing (current is oldest in category) → wrap to newest in category.
  if (!prev) {
    const { data } = await db()
      .from("articles")
      .select("slug, title")
      .eq("is_published", true)
      .eq("category_id", categoryId)
      .neq("id", articleId)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    prev = data || null;
  }

  // Next missing (current is newest in category) → wrap to oldest in category.
  if (!next) {
    const { data } = await db()
      .from("articles")
      .select("slug, title")
      .eq("is_published", true)
      .eq("category_id", categoryId)
      .neq("id", articleId)
      .order("published_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    next = data || null;
  }

  // Still missing — category has only this one article. Fall back globally.
  if (!prev) {
    const { data } = await db()
      .from("articles")
      .select("slug, title")
      .eq("is_published", true)
      .neq("id", articleId)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    prev = data || null;
  }
  if (!next) {
    const { data } = await db()
      .from("articles")
      .select("slug, title")
      .eq("is_published", true)
      .neq("id", articleId)
      .order("published_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    next = data || null;
  }

  return { prev, next };
}

// ===================== RELATED ARTICLES =====================

/**
 * Pick `count` articles to show under "Podobne publikacje" on the article page.
 *
 * Goal: always show the full set (default 3) and maximise variety, even when
 * the current article's category is sparse. We pull recent posts (last 7 days
 * first, widening to 30/90 days, then all-time) excluding the current article,
 * shuffle in memory, and slice. This sidesteps PostgREST not exposing
 * `ORDER BY random()`.
 */
export async function getRelatedArticles(
  currentArticleId: string,
  count = 3
): Promise<ArticleWithRelations[]> {
  const windows = [7, 30, 90, null] as const; // days; null = no time filter

  for (const days of windows) {
    let query = db()
      .from("articles")
      .select("*, category:categories(*)")
      .eq("is_published", true)
      .neq("id", currentArticleId)
      .order("published_at", { ascending: false })
      // Pull a healthy candidate pool so the shuffle has variety.
      .limit(50);

    if (days !== null) {
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      query = query.gte("published_at", since);
    }

    const { data: articles, error } = await query;
    if (error) {
      console.error("[data] getRelatedArticles failed:", error.message);
      return [];
    }
    // Za mało kandydatów → poszerz okno czasowe. W ostatnim oknie (all-time)
    // bierzemy co jest — lepiej pokazać 2 podobne niż ukryć sekcję.
    if (!articles || articles.length === 0) continue;
    if (articles.length < count && days !== null) continue;

    // Fisher-Yates shuffle, then take `count`.
    const pool = [...articles];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return attachTagsBatch(pool.slice(0, count));
  }

  return [];
}

// ===================== SITEMAP HELPERS =====================

/**
 * Artykuły z ostatnich 48 h dla `/news-sitemap.xml` (Google News / Discover).
 * Google czyta z news-sitemapy tylko wpisy młodsze niż 48 h — starsze i tak
 * ignoruje, więc nie ma sensu ich zgłaszać. Limit 100 to margines ~16× nad
 * realnym wolumenem (6/dzień → ~12 wpisów w oknie), grubo poniżej limitu
 * PostgREST (1000), więc stronicowanie nie jest tu potrzebne.
 */
export async function getNewsSitemapArticles(): Promise<
  { slug: string; title: string; published_at: string }[]
> {
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data, error } = await db()
    .from("articles")
    .select("slug, title, published_at")
    .eq("is_published", true)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[data] getNewsSitemapArticles failed:", error.message);
    return [];
  }
  return (data || []).filter(
    (a): a is { slug: string; title: string; published_at: string } =>
      Boolean(a.slug && a.title && a.published_at)
  );
}

/**
 * Per-category max(updated_at). Used by sitemap.ts so each category URL gets
 * a `lastModified` reflecting its actual content. Without this, every crawl
 * sees `new Date()` and Google wastes budget on un-changed pages.
 *
 * One tiny indexed query per category (6 total) instead of pulling every
 * published article into memory — the previous approach scaled O(n) with the
 * article count on every sitemap render.
 */
export async function getCategoriesLastModified(): Promise<Record<string, Date>> {
  const categories = await getCategories();
  if (categories.length === 0) return {};

  const results = await Promise.all(
    categories.map(async (cat) => {
      const { data } = await db()
        .from("articles")
        .select("updated_at")
        .eq("is_published", true)
        .eq("category_id", cat.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return [cat.slug, data?.updated_at] as const;
    })
  );

  const seen: Record<string, Date> = {};
  for (const [slug, updatedAt] of results) {
    if (updatedAt) seen[slug] = new Date(updatedAt);
  }
  return seen;
}

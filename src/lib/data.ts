import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Article, Category, CategoryRef, Tag } from "@/types/database";
import { escapeIlike, sanitizeTsQuery } from "@/lib/search-utils";
import { normalizeThumbnailUrl } from "@/lib/images/thumbnail-url";

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

// ===================== TYPY I PROJEKCJE =====================

/**
 * Projekcja dla WSZYSTKICH list artykułów (home, kategoria, tag, wyszukiwarka,
 * podobne, RSS). Celowo bez `content` (~7 KB markdownu na artykuł) i bez
 * tagów — karty ich nie renderują. Wcześniej listy ciągnęły `select("*")`
 * + osobne zapytanie o tagi: regeneracja home pobierała ~45 pełnych treści,
 * a /api/search wysyłał do przeglądarki ~140 KB JSON-a na jedno zapytanie.
 */
const CARD_COLUMNS =
  "id, title, slug, excerpt, thumbnail_url, reading_time, published_at, category:categories(id, name, slug)";

export type ArticleCardData = Pick<
  Article,
  "id" | "title" | "slug" | "excerpt" | "thumbnail_url" | "reading_time" | "published_at"
> & { category: CategoryRef | null };

/** Pełny artykuł (strona `/artykul/[slug]`) z kategorią i tagami. */
export type ArticleWithRelations = Article & { category: Category | null; tags: Tag[] };

/** Wiersz z `article_tags!inner(tag_id)` — filtr/scoring po tagach. */
type WithTagMatches = ArticleCardData & { article_tags?: { tag_id: string }[] };

/**
 * Wiersz z bazy → dane karty: zdejmuje pomocniczy embed `article_tags`
 * (filtry po tagu) i normalizuje URL miniatury (`&amp;` z historycznych
 * rekordów — zob. `lib/images/thumbnail-url.ts`).
 */
function toCard(row: WithTagMatches): ArticleCardData {
  const { id, title, slug, excerpt, thumbnail_url, reading_time, published_at, category } = row;
  return { id, title, slug, excerpt, reading_time, published_at, category, thumbnail_url: normalizeThumbnailUrl(thumbnail_url) };
}

function toCards(rows: unknown): ArticleCardData[] {
  return ((rows ?? []) as WithTagMatches[]).map(toCard);
}

/**
 * Polityka błędów bazy: funkcje, z których powstają strony cache'owane przez
 * ISR (home, artykuł, sitemapy, RSS), RZUCAJĄ — nieudana regeneracja zostawia
 * wtedy w cache poprzednią, poprawną wersję. Zwrócenie "pustych danych"
 * zostałoby zcache'owane: chwilowa czkawka Supabase dawała pustą sitemapę na
 * godzinę albo prawdziwe 404 istniejącego artykułu (od kiedy artykuł nie ma
 * `loading.tsx`, `notFound()` ustawia realny status). Elementy pomocnicze
 * (ticker, trendy, podobne, prev/next) degradują się łagodnie — log + pusto.
 */
function dbFailure(context: string, error: { message: string }): Error {
  return new Error(`[data] ${context} failed: ${error.message}`);
}

// ===================== ARTYKUŁY =====================

/** Najnowsze opublikowane artykuły (home, RSS). */
export async function getArticles(limit = 10): Promise<ArticleCardData[]> {
  const { data, error } = await db()
    .from("articles")
    .select(CARD_COLUMNS)
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) throw dbFailure("getArticles", error);
  return toCards(data);
}

/**
 * Pełny artykuł z kategorią i tagami w JEDNYM zapytaniu — PostgREST sam
 * wykrywa relację wiele-do-wielu przez `article_tags` (PK = oba FK), więc
 * `tags(...)` osadza tagi bez osobnego round-tripu.
 */
export async function getArticleBySlug(slug: string): Promise<ArticleWithRelations | null> {
  const { data, error } = await db()
    .from("articles")
    .select("*, category:categories(*), tags(id, name, slug)")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  // Błąd ≠ brak artykułu: `null` oznacza WYŁĄCZNIE "nie istnieje" (→ 404).
  if (error) throw dbFailure("getArticleBySlug", error);
  if (!data) return null;
  const article = data as ArticleWithRelations;
  return { ...article, thumbnail_url: normalizeThumbnailUrl(article.thumbnail_url), tags: article.tags ?? [] };
}

export interface PaginatedResult {
  articles: ArticleCardData[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

function emptyPage(page: number, pageSize: number, total = 0): PaginatedResult {
  return {
    articles: [],
    page,
    pageSize,
    total,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    hasPrev: page > 1,
    hasNext: false,
  };
}

function pageResult(articles: ArticleCardData[], page: number, pageSize: number, total: number): PaginatedResult {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { articles, page, pageSize, total, totalPages, hasPrev: page > 1, hasNext: page < totalPages };
}

/**
 * Offset-based pagination for category listings. Uses page numbers so that
 * "Previous" navigates to `page - 1` (not back to page 1 like the previous
 * cursor-only scheme). `cache()` — generateMetadata i page wołają z tymi
 * samymi argumentami (metadane sprawdzają zakres stron), jedno zapytanie.
 */
export const getArticlesByCategoryPaginated = cache(async (
  categorySlug: string,
  pageSize = 12,
  page = 1,
): Promise<PaginatedResult> => {
  const safePage = Math.max(1, Math.floor(page) || 1);

  // `getCategoryBySlug` jest owinięte w React cache() — generateMetadata,
  // page i ta funkcja współdzielą jeden query na request.
  const category = await getCategoryBySlug(categorySlug);
  if (!category) return emptyPage(safePage, pageSize);

  const { count } = await db()
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("is_published", true)
    .eq("category_id", category.id);

  const total = count || 0;
  const from = (safePage - 1) * pageSize;
  if (total === 0 || from >= total) return emptyPage(safePage, pageSize, total);

  const { data, error } = await db()
    .from("articles")
    .select(CARD_COLUMNS)
    .eq("is_published", true)
    .eq("category_id", category.id)
    // Tiebreaker po `id` — bez niego artykuły publikowane w tej samej sekundzie
    // mogą się przesuwać między stronami paginacji między requestami
    // (duplikaty/przeskoki dla użytkownika i crawlera).
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error || !data || data.length === 0) {
    if (error) console.error("[data] getArticlesByCategoryPaginated failed:", error.message);
    return emptyPage(safePage, pageSize, total);
  }
  return pageResult(toCards(data), safePage, pageSize, total);
});

// `cache()` from React 19 deduplicates calls within the same request — so
// when several server components need the categories we only hit Supabase
// once. Each request gets its own cache; nothing leaks across requests.
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
 * 2. **Fallback ILIKE na title** — gdy FTS zwróci 0 wyników (fraza
 *    w środku wyrazu, interpunkcja: "open-source"). Literówek nie łapie
 *    (to byłoby `similarity()`); `idx_articles_title_trgm` (GIN
 *    gin_trgm_ops) przyspiesza `%fraza%` z O(n) do indeksu.
 *
 * Bez migracji 004 FTS zwraca błąd — wtedy też lecimy na ILIKE fallback
 * (gracefulnie). Dzięki temu deploy kodu może wyprzedzić aplikację
 * migracji bez padania UX.
 */
export async function searchArticles(query: string): Promise<ArticleCardData[]> {
  const safe = sanitizeTsQuery(query);
  if (!safe) return [];

  // Build prefix tsquery: "open ai" → "open:* & ai:*"
  const tsQuery = safe.split(" ").filter(Boolean).map((t) => `${t}:*`).join(" & ");

  // Stage 1: FTS. `config: "simple"` MUSI się zgadzać z konfiguracją, którą
  // zbudowano `search_vector` (migracja 004) — bez tego parametru zapytanie
  // parsuje domyślny słownik `english`, którego stopwordy połykają krótkie
  // polskie słowa ("i", "a", "to", "do", "on"...).
  const ftsRes = await db()
    .from("articles")
    .select(CARD_COLUMNS)
    .eq("is_published", true)
    .textSearch("search_vector", tsQuery, { config: "simple" })
    .order("published_at", { ascending: false })
    .limit(20);

  if (ftsRes.error) {
    // Migracja 004 mogła nie być jeszcze zaaplikowana (search_vector nie istnieje)
    // — log warn, lecimy od razu na ILIKE.
    console.warn("[data] searchArticles FTS failed, falling back to ILIKE:", ftsRes.error.message);
  } else if (ftsRes.data && ftsRes.data.length > 0) {
    return toCards(ftsRes.data);
  }

  // Stage 2: trigram ILIKE fallback przy 0 wyników z FTS. Celowo na SUROWYM
  // (przyciętym) zapytaniu, nie na wyniku sanitizeTsQuery — sanitizer wycina
  // interpunkcję, więc "open-source" stałoby się "open source" i ILIKE nigdy
  // nie trafiłoby tytułu zawierającego myślnik. escapeIlike wystarcza tu
  // za całą sanityzację (parametr jest bindowany, nie sklejany w SQL).
  const ilikeRes = await db()
    .from("articles")
    .select(CARD_COLUMNS)
    .eq("is_published", true)
    .ilike("title", `%${escapeIlike(query.trim())}%`)
    .order("published_at", { ascending: false })
    .limit(20);
  if (ilikeRes.error) {
    console.error("[data] searchArticles ILIKE fallback failed:", ilikeRes.error.message);
    return [];
  }
  return toCards(ilikeRes.data);
}

/**
 * Articles for the home page category sections: one small indexed query per
 * category, in parallel.
 *
 * Wcześniejsza wersja ciągnęła jedną wspólną pulę 360 najnowszych artykułów
 * i grupowała w pamięci — kategoria, której najnowszy artykuł wypadł poza
 * pulą (≈ miesiąc bez publikacji), znikała z home w całości. Per-kategoria
 * limit nie ma tej wady i jest tańszy (6 × `limit N` na indeksie zamiast
 * jednego skanu 360 rzędów).
 */
export async function getArticlesGroupedByCategory(
  categorySlugs: string[],
  limitPerCategory = 4
): Promise<Record<string, ArticleCardData[]>> {
  const wanted = new Set(categorySlugs);
  const categories = (await getCategories()).filter((c) => wanted.has(c.slug));
  if (categories.length === 0) return {};

  const perCategory = await Promise.all(
    categories.map(async (cat) => {
      const { data, error } = await db()
        .from("articles")
        .select(CARD_COLUMNS)
        .eq("is_published", true)
        .eq("category_id", cat.id)
        .order("published_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limitPerCategory);
      if (error) throw dbFailure(`getArticlesGroupedByCategory(${cat.slug})`, error);
      return [cat.slug, toCards(data)] as const;
    })
  );

  const result: Record<string, ArticleCardData[]> = {};
  for (const [slug, articles] of perCategory) {
    if (articles.length > 0) result[slug] = articles;
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
  // ORDER BY po kluczu złożonym; cap 20k wierszy to margines ~2× nad obecnym
  // wolumenem (2026-10: ~9k) — do tego czasu RPC powinno być zaaplikowane
  // (migracja 001).
  const BATCH = 1000;
  const MAX_ROWS = 20_000;
  const countRows: { tag_id: string }[] = [];
  for (let from = 0; from < MAX_ROWS; from += BATCH) {
    // `articles!inner` + RLS anon (SELECT tylko `is_published`) odcina tagi
    // artykułów zdjętych w /admin — ta sama semantyka co RPC po migracji 006.
    const { data, error } = await db()
      .from("article_tags")
      .select("article_id, tag_id, articles!inner(id)")
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
export async function getSitemapArticles(limit = 5000): Promise<{ slug: string; updated_at: string }[]> {
  const BATCH = 1000;
  const all: { slug: string; updated_at: string }[] = [];

  for (let from = 0; from < limit; from += BATCH) {
    const to = Math.min(from + BATCH, limit) - 1;
    const { data, error } = await db()
      .from("articles")
      .select("slug, updated_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    // Rzucamy zamiast zwracać niepełną listę — sitemapa z ucięciem w połowie
    // zostałaby zcache'owana na godzinę (revalidate w sitemap.ts).
    if (error) throw dbFailure("getSitemapArticles", error);
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
 * "exact"` z prawdziwą liczbą wpisów (zamiast listy article_id ciętej przez
 * limit 1000 wierszy PostgREST).
 */
export const getArticlesByTagPaginated = cache(async (
  tagSlug: string,
  pageSize = 12,
  page = 1,
): Promise<PaginatedResult> => {
  const safePage = Math.max(1, Math.floor(page) || 1);

  const tag = await getTagBySlug(tagSlug);
  if (!tag) return emptyPage(safePage, pageSize);

  const { count } = await db()
    .from("articles")
    .select("article_tags!inner(tag_id)", { count: "exact", head: true })
    .eq("is_published", true)
    .eq("article_tags.tag_id", tag.id);

  const total = count || 0;
  const from = (safePage - 1) * pageSize;
  if (total === 0 || from >= total) return emptyPage(safePage, pageSize, total);

  const { data, error } = await db()
    .from("articles")
    .select(`${CARD_COLUMNS}, article_tags!inner(tag_id)`)
    .eq("is_published", true)
    .eq("article_tags.tag_id", tag.id)
    // Tiebreaker po `id` — jak w kategorii (stabilne strony paginacji).
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error || !data || data.length === 0) {
    if (error) console.error("[data] getArticlesByTagPaginated failed:", error.message);
    return emptyPage(safePage, pageSize, total);
  }
  return pageResult(toCards(data), safePage, pageSize, total);
});

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
 * "Podobne publikacje" — realnie powiązane tematycznie, nie losowe.
 *
 * 1. Kandydaci: 40 najnowszych artykułów dzielących z bieżącym ≥1 tag
 *    (`article_tags!inner` z filtrem `in` zwraca per artykuł tylko PASUJĄCE
 *    wiersze, więc ich liczba = liczba wspólnych tagów).
 * 2. Ranking: więcej wspólnych tagów wyżej; remis → nowszy (sort stabilny
 *    zachowuje kolejność po dacie z zapytania).
 * 3. Dopełnienie (artykuł bez tagów / niszowy temat): najnowsze z tej samej
 *    kategorii, a w ostateczności najnowsze w ogóle.
 *
 * Deterministyczne (poprzednia wersja tasowała losowo pulę 50 PEŁNYCH
 * artykułów z treścią — ~350 KB z bazy na każdy render i zmienne linki
 * przy każdej regeneracji ISR). Spójne klastry tematyczne to silniejszy
 * sygnał linkowania wewnętrznego dla Google i lepsza ścieżka dla czytelnika.
 */
export async function getRelatedArticles(
  article: { id: string; category_id: string | null; tags: Pick<Tag, "id">[] },
  count = 3
): Promise<ArticleCardData[]> {
  const picked: ArticleCardData[] = [];
  const seen = new Set<string>([article.id]);
  const take = (rows: ArticleCardData[]) => {
    for (const row of rows) {
      if (picked.length >= count) return;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      picked.push(row);
    }
  };

  const tagIds = article.tags.map((t) => t.id);
  if (tagIds.length > 0) {
    const { data, error } = await db()
      .from("articles")
      .select(`${CARD_COLUMNS}, article_tags!inner(tag_id)`)
      .eq("is_published", true)
      .neq("id", article.id)
      .in("article_tags.tag_id", tagIds)
      .order("published_at", { ascending: false })
      .limit(40);
    if (error) {
      console.error("[data] getRelatedArticles (tags) failed:", error.message);
    } else {
      // supabase-js bez wygenerowanych typów zgaduje embed `category` jako
      // tablicę — dla relacji many-to-one PostgREST zwraca obiekt.
      const ranked = [...((data ?? []) as unknown as WithTagMatches[])].sort(
        (a, b) => (b.article_tags?.length ?? 0) - (a.article_tags?.length ?? 0)
      );
      take(ranked.map(toCard));
    }
  }

  const fill = async (categoryId: string | null) => {
    if (picked.length >= count) return;
    let query = db()
      .from("articles")
      .select(CARD_COLUMNS)
      .eq("is_published", true)
      .neq("id", article.id);
    if (categoryId) query = query.eq("category_id", categoryId);
    const { data, error } = await query
      .order("published_at", { ascending: false })
      .limit(count + picked.length);
    if (error) {
      console.error("[data] getRelatedArticles (fill) failed:", error.message);
      return;
    }
    take(toCards(data));
  };

  if (article.category_id) await fill(article.category_id);
  await fill(null);
  return picked;
}

// ===================== SITEMAP HELPERS =====================

/**
 * Artykuły z ostatnich 48 h dla `/news-sitemap.xml` (Google News / Discover).
 * Google czyta z news-sitemapy tylko wpisy młodsze niż 48 h — starsze i tak
 * ignoruje, więc nie ma sensu ich zgłaszać. Limit 100 to margines ~5× nad
 * realnym wolumenem (9/dzień → ~18 wpisów w oknie), grubo poniżej limitu
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

  if (error) throw dbFailure("getNewsSitemapArticles", error);
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

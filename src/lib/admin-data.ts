/**
 * Queries dla dashboardu `/admin`. Wszystkie używają `createAdminClient()`
 * (service role) bo `pipeline_events` ma RLS service-role-only. Nigdy nie
 * eksportować tych funkcji do client component / nie wystawiać ich przez
 * publiczne API — service role omija RLS.
 *
 * Strategia: pobieramy surowe eventy (bounded `limit`) i agregujemy w JS.
 * Skala (≤ 30k events/rok) na to pozwala, a JSONB queries w Postgres byłyby
 * cięższe do zapisania i utrzymania niż prosta mapa w pamięci.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeIlike } from "@/lib/search-utils";
import type { Category, Tag } from "@/types/database";

interface PipelineEventRow {
  id: string;
  run_id: string;
  event: string;
  payload: Record<string, unknown>;
  created_at: string;
}

async function fetchEvents(
  limit: number,
  sinceIso?: string,
  eventFilter?: string[],
): Promise<PipelineEventRow[]> {
  const supabase = createAdminClient();
  let q = supabase
    .from("pipeline_events")
    .select("id, run_id, event, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  if (eventFilter && eventFilter.length > 0) q = q.in("event", eventFilter);
  const { data, error } = await q;
  if (error) {
    console.error("[admin-data] fetchEvents failed:", error.message);
    return [];
  }
  return (data || []) as PipelineEventRow[];
}

// ===================== RECENT RUNS =====================

export interface RunSummary {
  runId: string;
  startedAt: string;
  /** null gdy run jeszcze trwa lub padł bez run_end. */
  finishedAt: string | null;
  durationMs: number | null;
  countRequested: number | null;
  generated: number;
  rejected: number;
  failed: number;
  aborted: number;
  /** true jeśli mamy `run_end` event. */
  complete: boolean;
}

/**
 * Ostatnie N runów zgrupowanych po run_id. Pobiera ostatnie N×30 eventów
 * (zwykle ~30 events/run wystarcza) i agreguje. Jeśli run jest "starszy"
 * niż okno, dostanie się bez run_start lub bez run_end — zwracamy go i tak,
 * z brakującymi polami jako null.
 */
export async function getRecentRuns(limit = 10): Promise<RunSummary[]> {
  const events = await fetchEvents(limit * 40);
  const byRun = new Map<string, PipelineEventRow[]>();
  for (const ev of events) {
    const arr = byRun.get(ev.run_id) || [];
    arr.push(ev);
    byRun.set(ev.run_id, arr);
  }

  const runs: RunSummary[] = [];
  for (const [runId, evs] of byRun) {
    const start = evs.find((e) => e.event === "run_start");
    const end = evs.find((e) => e.event === "run_end");
    // Najstarszy/najnowszy event w run'ie jako fallback gdy brak start/end.
    const sorted = [...evs].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const startedAt = start?.created_at ?? sorted[0].created_at;
    const finishedAt = end?.created_at ?? null;
    const durationMs =
      typeof end?.payload?.duration_ms === "number"
        ? (end.payload.duration_ms as number)
        : finishedAt
          ? new Date(finishedAt).getTime() - new Date(startedAt).getTime()
          : null;
    runs.push({
      runId,
      startedAt,
      finishedAt,
      durationMs,
      countRequested:
        typeof start?.payload?.count_requested === "number"
          ? (start.payload.count_requested as number)
          : null,
      generated: (end?.payload?.generated as number) ?? 0,
      rejected: (end?.payload?.rejected as number) ?? 0,
      failed: (end?.payload?.failed as number) ?? 0,
      aborted: (end?.payload?.aborted as number) ?? 0,
      complete: !!end,
    });
  }

  return runs
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, limit);
}

// ===================== AGGREGATES =====================

export interface DashboardTotals {
  windowDays: number;
  runs: number;
  generated: number;
  rejected: number;
  failed: number;
  aborted: number;
  costUsd: number;
  avgDurationMs: number | null;
}

export async function getTotals(windowDays = 7): Promise<DashboardTotals> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  // Bounded — przy 3 cronach/dzień × 30 eventów = 90/dzień = 630/tydzień.
  // 5000 z dużym zapasem chroni przed gigantycznym scanem.
  const events = await fetchEvents(5000, since);

  let generated = 0;
  let rejected = 0;
  let failed = 0;
  let aborted = 0;
  let costUsd = 0;
  const durations: number[] = [];
  const runIds = new Set<string>();

  for (const ev of events) {
    runIds.add(ev.run_id);
    if (ev.event === "run_end") {
      generated += (ev.payload?.generated as number) ?? 0;
      rejected += (ev.payload?.rejected as number) ?? 0;
      failed += (ev.payload?.failed as number) ?? 0;
      aborted += (ev.payload?.aborted as number) ?? 0;
      if (typeof ev.payload?.duration_ms === "number") {
        durations.push(ev.payload.duration_ms as number);
      }
    } else if (ev.event === "ai_cost" && typeof ev.payload?.cost_usd === "number") {
      costUsd += ev.payload.cost_usd as number;
    }
  }

  return {
    windowDays,
    runs: runIds.size,
    generated,
    rejected,
    failed,
    aborted,
    costUsd,
    avgDurationMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
  };
}

// ===================== PER-SOURCE BREAKDOWN =====================

export interface SourceBreakdown {
  sourceName: string;
  generated: number;
  rejected: number;
  failed: number;
}

export async function getPerSourceBreakdown(windowDays = 7): Promise<SourceBreakdown[]> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const events = await fetchEvents(5000, since, [
    "article_generated",
    "quality_reject",
    "article_failed",
    "ai_refusal",
    "scrape_skip",
  ]);

  const map = new Map<string, SourceBreakdown>();
  const getRow = (name: string) => {
    let r = map.get(name);
    if (!r) {
      r = { sourceName: name, generated: 0, rejected: 0, failed: 0 };
      map.set(name, r);
    }
    return r;
  };

  for (const ev of events) {
    const source = (ev.payload?.source_name as string) || "(unknown)";
    const row = getRow(source);
    switch (ev.event) {
      case "article_generated":
        row.generated++;
        break;
      case "quality_reject":
        row.rejected++;
        break;
      case "article_failed":
      case "ai_refusal":
      case "scrape_skip":
        row.failed++;
        break;
    }
  }

  return [...map.values()].sort((a, b) => b.generated - a.generated);
}

// ===================== RECENT FAILURES =====================

export interface FailureRow {
  createdAt: string;
  event: string;
  title: string;
  sourceName: string;
  reason: string;
}

export async function getRecentFailures(limit = 20): Promise<FailureRow[]> {
  const events = await fetchEvents(limit, undefined, [
    "quality_reject",
    "article_failed",
    "ai_refusal",
    "scrape_skip",
  ]);
  return events.map((ev) => ({
    createdAt: ev.created_at,
    event: ev.event,
    title: (ev.payload?.title as string) || "(brak tytułu)",
    sourceName: (ev.payload?.source_name as string) || "(unknown)",
    reason: buildReason(ev),
  }));
}

function buildReason(ev: PipelineEventRow): string {
  switch (ev.event) {
    case "quality_reject": {
      const score = ev.payload?.score;
      const issues = ev.payload?.issues;
      const issuesStr = Array.isArray(issues) ? issues.join(", ") : "";
      return `score ${score}/100${issuesStr ? ` — ${issuesStr}` : ""}`;
    }
    case "article_failed":
      return String(ev.payload?.error ?? "exception");
    case "ai_refusal":
      return "AI odmówiło przetworzenia";
    case "scrape_skip":
      return `treść za krótka (${ev.payload?.content_length ?? 0} znaków)`;
    default:
      return "";
  }
}

// ===================== ARTICLES LIST (admin CRUD) =====================

export interface AdminArticleRow {
  id: string;
  title: string;
  slug: string;
  is_published: boolean;
  is_featured: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  thumbnail_url: string | null;
  category: Pick<Category, "id" | "name" | "slug" | "color"> | null;
  tags: Pick<Tag, "id" | "name" | "slug">[];
}

export interface AdminArticlesListResult {
  rows: AdminArticleRow[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/**
 * Lista artykułów dla panelu /admin/artykuly. Service role omija RLS, więc
 * widzimy też drafty (is_published=false). Search po title (ilike, escape'owany),
 * filtr po kategorii i tagu. Paginacja offsetowa — przy ~10k wierszy nadal OK,
 * a UX dashboardu i tak nie potrzebuje cursorów.
 */
export async function getAdminArticlesList(opts: {
  page?: number;
  perPage?: number;
  search?: string;
  categoryId?: string;
  tagId?: string;
} = {}): Promise<AdminArticlesListResult> {
  const supabase = createAdminClient();
  const page = Math.max(1, Math.floor(opts.page ?? 1) || 1);
  const perPage = Math.min(100, Math.max(5, Math.floor(opts.perPage ?? 25) || 25));
  const search = (opts.search ?? "").trim().slice(0, 100);
  const categoryId = opts.categoryId || undefined;
  const tagId = opts.tagId || undefined;

  // Filtr po tagu wymaga pre-fetcha article_ids — schema nie ma denormalized
  // tag column, a PostgREST nie umie nested-where po join'ie po N:M.
  let restrictIds: string[] | null = null;
  if (tagId) {
    const { data: tagJoin, error: tagErr } = await supabase
      .from("article_tags")
      .select("article_id")
      .eq("tag_id", tagId);
    if (tagErr) {
      console.error("[admin-data] tag prefetch failed:", tagErr.message);
      return { rows: [], page, perPage, total: 0, totalPages: 0 };
    }
    restrictIds = (tagJoin || []).map((r) => r.article_id);
    if (restrictIds.length === 0) {
      return { rows: [], page, perPage, total: 0, totalPages: 0 };
    }
  }

  // Count i select muszą mieć identyczne filtry — duplikujemy 3 linijki
  // świadomie, żeby nie walczyć z typami PostgrestFilterBuilder.
  let countQ = supabase.from("articles").select("*", { count: "exact", head: true });
  if (categoryId) countQ = countQ.eq("category_id", categoryId);
  if (restrictIds) countQ = countQ.in("id", restrictIds);
  if (search) countQ = countQ.ilike("title", `%${escapeIlike(search)}%`);
  const { count } = await countQ;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  if (total === 0 || from >= total) {
    return { rows: [], page, perPage, total, totalPages };
  }

  let listQ = supabase
    .from("articles")
    .select("id, title, slug, is_published, is_featured, published_at, created_at, updated_at, thumbnail_url, category:categories(id, name, slug, color)")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (categoryId) listQ = listQ.eq("category_id", categoryId);
  if (restrictIds) listQ = listQ.in("id", restrictIds);
  if (search) listQ = listQ.ilike("title", `%${escapeIlike(search)}%`);
  const { data: listData, error: listErr } = await listQ;
  if (listErr) {
    console.error("[admin-data] getAdminArticlesList failed:", listErr.message);
    return { rows: [], page, perPage, total, totalPages };
  }
  if (!listData || listData.length === 0) {
    return { rows: [], page, perPage, total, totalPages };
  }

  // Doczepiamy tagi w jednym zapytaniu (anti N+1) — analog attachTagsBatch
  // z `data.ts`, ale bez filtra is_published na artykule.
  const ids = listData.map((a) => a.id);
  const { data: tagRows } = await supabase
    .from("article_tags")
    .select("article_id, tag:tags(id, name, slug)")
    .in("article_id", ids);

  type TagJoin = { article_id: string; tag: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | null };
  const tagsByArticle = new Map<string, { id: string; name: string; slug: string }[]>();
  for (const row of (tagRows || []) as unknown as TagJoin[]) {
    if (!row.tag) continue;
    const arr = Array.isArray(row.tag) ? row.tag : [row.tag];
    const existing = tagsByArticle.get(row.article_id) || [];
    existing.push(...arr);
    tagsByArticle.set(row.article_id, existing);
  }

  // PostgREST zwraca `category:categories(...)` jako Category | Category[] | null
  // zależnie od arność join'a. Koercja przez unknown jak w `data.ts`.
  type ListRow = {
    id: string;
    title: string;
    slug: string;
    is_published: boolean;
    is_featured: boolean;
    published_at: string | null;
    created_at: string;
    updated_at: string;
    thumbnail_url: string | null;
    category: Pick<Category, "id" | "name" | "slug" | "color"> | Pick<Category, "id" | "name" | "slug" | "color">[] | null;
  };
  const rows: AdminArticleRow[] = (listData as unknown as ListRow[]).map((a) => {
    const cat = Array.isArray(a.category) ? a.category[0] ?? null : a.category;
    return {
      id: a.id,
      title: a.title,
      slug: a.slug,
      is_published: a.is_published,
      is_featured: a.is_featured,
      published_at: a.published_at,
      created_at: a.created_at,
      updated_at: a.updated_at,
      thumbnail_url: a.thumbnail_url,
      category: cat,
      tags: tagsByArticle.get(a.id) || [],
    };
  });

  return { rows, page, perPage, total, totalPages };
}

/**
 * Lekkie listy kategorii i tagów dla filtrów w panelu — service role,
 * żeby spójnie używać jednego klienta. Brak filtra publish na artykułach,
 * ale same kategorie/tagi i tak są publiczne.
 */
export async function getAdminFilterOptions(): Promise<{
  categories: Pick<Category, "id" | "name" | "slug">[];
  tags: Pick<Tag, "id" | "name" | "slug">[];
}> {
  const supabase = createAdminClient();
  const [cats, tgs] = await Promise.all([
    supabase.from("categories").select("id, name, slug").order("name"),
    supabase.from("tags").select("id, name, slug").order("name").limit(500),
  ]);
  return {
    categories: (cats.data ?? []) as Pick<Category, "id" | "name" | "slug">[],
    tags: (tgs.data ?? []) as Pick<Tag, "id" | "name" | "slug">[],
  };
}

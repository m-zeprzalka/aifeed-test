import { NextRequest } from "next/server";
import { scrapeAllFeeds, selectTopArticles, findRelatedItems, type ScrapedArticle } from "@/lib/scraper/parser";
import { scrapeSourcePage } from "@/lib/scraper/content";
import { generateArticle } from "@/lib/ai/writer";
import { assessArticleQuality, countWords, isLikelyRefusal, QUALITY_PUBLISH_THRESHOLD } from "@/lib/ai/quality";
import { normalizeTagCandidates, selectTags, tagSlug } from "@/lib/ai/tags";
import { getArticleThumbnail } from "@/lib/images/generator";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPopularTags } from "@/lib/data";
import { logPipelineEvent, newRunId } from "@/lib/telemetry";
import { pingIndexNow } from "@/lib/indexnow";
import { safeEqual } from "@/lib/admin-auth";
import { siteConfig, isCategorySlug, type CategorySlug } from "@/config/site";
import type { SupabaseClient } from "@supabase/supabase-js";
import slugify from "slugify";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Vercel Hobby max function duration = 300s. Per-artykuł budget w worst case
// (scrape 15s + AI 120s + thumbnail AI 90s + DB ops) potrafi sięgać ~230s.
// Bez time-budget guard pętla potrafi zostać cięta w połowie iteracji,
// zostawiając stan w nieprzewidywalnym miejscu (insert mógł przejść, ale
// tagi już nie). Po przekroczeniu BUDGET_MS przerywamy pętlę gracefully —
// pozostałe items lądują w `aborted[]`, a ich `scraped_items` NIE są
// oznaczone jako processed (retry w następnym cronie).
//
// Bufor 30s (300 - 270) zostaje na: ostatni insert + IndexNow + response.
const PIPELINE_BUDGET_MS = 270_000;
// Twardy termin dla pojedynczych wywołań AI (artykuł, miniatura) liczony od
// startu runu: 300 s limitu − 15 s na insert, IndexNow i telemetrię końcową.
const AI_DEADLINE_MS = 285_000;

// Budżet tekstu źródeł w prompcie. Główne źródło ~12k znaków (~3k tokenów):
// przy targecie 700-1200 słów stare 6k ucinało bogate materiały w połowie
// (koszt +~$0.003/artykuł). Źródła dodatkowe krócej — uzupełniają fakty.
const MAIN_SOURCE_CHARS = 12_000;
const RELATED_SOURCE_CHARS = 5_000;
const MIN_MAIN_SOURCE_CHARS = 100;
const MIN_RELATED_SOURCE_CHARS = 300;

const QUALITY_FEATURED_THRESHOLD = 80;

type Supabase = SupabaseClient;

/**
 * Generate a unique slug for the article. Prefers a clean, human-readable slug;
 * falls back to a short timestamp suffix only when the base slug collides.
 */
async function buildUniqueSlug(supabase: Supabase, title: string): Promise<string> {
  const base = slugify(title, { lower: true, strict: true, locale: "pl" }).slice(0, 80) || "artykul";

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data } = await supabase.from("articles").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  // Last-resort uniqueness guarantee — base36 timestamp is short enough
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Oznacza URL-e źródeł jako przetworzone (jeden batch upsert). Dedup
 * pipeline'u stoi na `scraped_items.source_url` UNIQUE — oznaczony URL nie
 * wróci w kolejnych runach.
 */
async function markProcessed(supabase: Supabase, items: ScrapedArticle[]): Promise<void> {
  if (items.length === 0) return;
  const { error } = await supabase.from("scraped_items").upsert(
    items.map((item) => ({
      source_url: item.url,
      title: item.title,
      description: item.description,
      source_name: item.sourceName,
      is_processed: true,
    })),
    { onConflict: "source_url" }
  );
  if (error) console.error(`[Pipeline] markProcessed failed: ${error.message}`);
}

/**
 * Tagi artykułu wg dyscypliny z `selectTags` (lib/ai/tags.ts): istniejące
 * linkujemy po id (bez przemianowywania), nowy (maks. 1) tworzymy
 * idempotentnie, a powiązania wstawiamy jednym batchem.
 */
async function attachArticleTags(
  supabase: Supabase,
  articleId: string,
  aiTags: string[],
  catalogSlugs: ReadonlySet<string>
): Promise<{ linked: number; dropped: string[] }> {
  const candidates = normalizeTagCandidates(aiTags);
  if (candidates.length === 0) return { linked: 0, dropped: [] };

  const { data: existingRows, error: lookupError } = await supabase
    .from("tags")
    .select("id, slug")
    .in("slug", candidates.map((c) => c.slug));
  if (lookupError) {
    console.error(`[Tags] lookup failed: ${lookupError.message}`);
    return { linked: 0, dropped: [] };
  }
  const existingBySlug = new Map((existingRows ?? []).map((r: { id: string; slug: string }) => [r.slug, r]));
  const selection = selectTags(candidates, catalogSlugs, existingBySlug);

  const tagIds = selection.existing.map((t) => t.id);
  for (const fresh of selection.create) {
    // `ignoreDuplicates` — równoległy run mógł właśnie utworzyć ten slug;
    // wtedy dociągamy istniejące id zamiast nadpisywać nazwę.
    await supabase.from("tags").upsert({ name: fresh.name, slug: fresh.slug }, { onConflict: "slug", ignoreDuplicates: true });
    const { data: row } = await supabase.from("tags").select("id").eq("slug", fresh.slug).maybeSingle();
    if (row?.id) tagIds.push(row.id);
  }

  if (tagIds.length > 0) {
    const { error } = await supabase.from("article_tags").upsert(
      tagIds.map((tagId) => ({ article_id: articleId, tag_id: tagId })),
      { onConflict: "article_id,tag_id", ignoreDuplicates: true }
    );
    if (error) console.error(`[Tags] link failed: ${error.message}`);
  }
  if (selection.dropped.length > 0) {
    console.warn(`[Tags] Wycięto ${selection.dropped.length} nowych tagów: ${selection.dropped.join(", ")}`);
  }
  return { linked: tagIds.length, dropped: selection.dropped };
}

async function runPipeline(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Fail-closed: brak CRON_SECRET = 401 (nigdy "bypass dla dev").
  // Porównanie stałoczasowe (wspólne z Basic Auth admina).
  if (!cronSecret || !authHeader || !(await safeEqual(authHeader, `Bearer ${cronSecret}`))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runStartedAt = Date.now();
  const runId = newRunId();

  try {
    const supabase = createAdminClient();

    // Step 1: Scrape RSS feeds
    console.log("Scraping RSS feeds...");
    const scrapedItems = await scrapeAllFeeds();
    console.log(`Found ${scrapedItems.length} items`);

    // Step 2: Deduplicate against already-processed items
    const { data: existingItems, error: dedupError } = await supabase
      .from("scraped_items")
      .select("source_url")
      .in(
        "source_url",
        scrapedItems.map((i) => i.url)
      );

    // Błąd dedupe = STOP. Zignorowany błąd oznaczałby pustą listę
    // `existingUrls`, a wtedy cały batch zostałby uznany za nowy i
    // opublikowany DRUGI raz. Lepiej stracić jeden run niż zdublować serwis.
    if (dedupError) {
      await logPipelineEvent(runId, "run_end", {
        generated: 0,
        rejected: 0,
        failed: 0,
        aborted: 0,
        duration_ms: Date.now() - runStartedAt,
        pipeline_error: `dedup query failed: ${dedupError.message}`,
      });
      return Response.json(
        { error: "Dedup query failed — aborting to avoid duplicate publishing", details: dedupError.message, run_id: runId },
        { status: 500 }
      );
    }

    const existingUrls = new Set((existingItems || []).map((i) => i.source_url));
    const newItems = scrapedItems.filter((i) => !existingUrls.has(i.url));
    console.log(`${newItems.length} new items after deduplication`);

    // Step 3: Select top articles (configurable via ?count=N ∈ [1,15], default 4)
    const url = new URL(request.url);
    const count = Math.min(Math.max(parseInt(url.searchParams.get("count") || "4", 10) || 4, 1), 15);
    const topItems = selectTopArticles(newItems, count);

    // Telemetria: zapis startu — dashboard /admin grupuje eventy po `run_id`.
    await logPipelineEvent(runId, "run_start", {
      count_requested: count,
      scraped_total: scrapedItems.length,
      new_after_dedup: newItems.length,
      to_process: topItems.length,
    });

    if (newItems.length === 0) {
      await logPipelineEvent(runId, "run_end", {
        generated: 0,
        rejected: 0,
        failed: 0,
        aborted: 0,
        duration_ms: Date.now() - runStartedAt,
        reason: "no-new-items",
      });
      return Response.json({ message: "No new items to process", generated: 0 });
    }

    // Step 4: Generate articles
    const generated: string[] = [];
    const rejected: string[] = [];
    const failed: { title: string; reason: string }[] = [];
    const aborted: string[] = [];

    // Katalog popularnych tagów — raz na run, przekazywany do promptu, żeby
    // AI wybierało z istniejącej taksonomii zamiast płodzić warianty pisowni.
    // Przez getPopularTags (lib/data), nie surowe RPC: gdy `popular_tags`
    // nie istnieje w bazie (migracja 001), surowe RPC dawało PUSTY katalog —
    // getPopularTags ma paginowany fallback.
    const catalogTags = await getPopularTags(100);
    const existingTags = catalogTags.map((t) => t.name).filter(Boolean);
    const catalogSlugs = new Set(catalogTags.map((t) => t.slug || tagSlug(t.name)));

    // Mapa kategorii slug → id raz na run (wcześniej SELECT na każdy artykuł).
    const { data: categoryRows } = await supabase.from("categories").select("id, slug");
    const categoryIdBySlug = new Map((categoryRows ?? []).map((c: { id: string; slug: string }) => [c.slug, c.id]));

    // Kandydaci do linkowania wewnętrznego — 40 ostatnich opublikowanych
    // artykułów (tytuł + slug). AI wplata 1-3 kontekstowe linki wyłącznie z
    // tej listy; `sanitizeInternalLinks` w writer.ts usuwa wszystko spoza niej
    // (zero halucynowanych 404). Artykuły opublikowane w TYM runie dopisujemy
    // do listy na bieżąco — teksty z jednego cyklu newsowego często się łączą.
    const { data: recentArticleRows } = await supabase
      .from("articles")
      .select("title, slug")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(40);
    const internalLinkCandidates: { title: string; slug: string }[] = (
      recentArticleRows || []
    ).filter((r): r is { title: string; slug: string } => Boolean(r.title && r.slug));

    const deadline = runStartedAt + AI_DEADLINE_MS;

    // URL-e opublikowane w tym runie — po pętli lecą jednym pingiem do
    // IndexNow (fail-soft; Google nie wspiera, Bing/Copilot tak).
    const publishedUrls: string[] = [];

    // URL-e już "zajęte" w tym runie (wybrane tematy + źródła dołączone do
    // syntez) — pula kandydatów do multi-source nie może ich używać ponownie.
    const usedSourceUrls = new Set(topItems.map((t) => t.url));

    // Editorial featured-article gating: at most ONE featured per UTC day, and
    // only when the AI quality score is ≥ 80 (excellent, not just passing).
    const startOfTodayUtc = new Date();
    startOfTodayUtc.setUTCHours(0, 0, 0, 0);
    const { count: featuredToday } = await supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("is_featured", true)
      .gte("published_at", startOfTodayUtc.toISOString());
    let canFeatureThisRun = (featuredToday || 0) === 0;

    for (let i = 0; i < topItems.length; i++) {
      // Time-budget guard — patrz komentarz przy PIPELINE_BUDGET_MS. Items
      // NIEoznaczone jako processed → retry w kolejnym cronie (idempotent dedup
      // po `source_url` na `scraped_items`).
      const elapsed = Date.now() - runStartedAt;
      if (elapsed > PIPELINE_BUDGET_MS) {
        const remaining = topItems.slice(i).map((it) => it.title);
        aborted.push(...remaining);
        console.warn(
          `[Pipeline] Time budget wyczerpany po ${Math.round(elapsed / 1000)}s — przerywam, ${remaining.length} items wraca do kolejki`
        );
        break;
      }

      const item = topItems[i];
      try {
        console.log(`Generating article for: ${item.title}`);

        // JEDNO pobranie strony źródłowej: treść dla AI + og:image/og:site_name
        // dla miniatury (wcześniej dwa osobne żądania do tej samej strony).
        const sourcePage = await scrapeSourcePage(item.url, MAIN_SOURCE_CHARS);
        const sourceContent = sourcePage.text;
        console.log(`[Source content] ${sourceContent.length} chars from ${item.url}`);

        if (sourceContent.length < MIN_MAIN_SOURCE_CHARS) {
          console.warn(`[Pipeline] Skipping "${item.title}" — ${sourcePage.failure ?? "source content too short"}`);
          failed.push({ title: item.title, reason: "source-too-short" });
          await logPipelineEvent(runId, "scrape_skip", {
            title: item.title,
            url: item.url,
            source_name: item.sourceName,
            content_length: sourceContent.length,
            // Przyczyna (http-403, content-type, too-short…) — bez niej nie dało
            // się zdiagnozować np. stałych porażek Spider's Web z Vercela.
            reason: sourcePage.failure,
          });
          // Still mark as processed so we don't retry bad URLs
          await markProcessed(supabase, [item]);
          continue;
        }

        // ===== Multi-source synthesis (information gain) =====
        // Szukamy w świeżej puli doniesień o TYM SAMYM wydarzeniu z innych
        // outletów i dodajemy ich treść do promptu. Artykuł-synteza zawiera
        // więcej niż jakiekolwiek pojedyncze źródło — "information gain",
        // dominujący sygnał jakości po marcowym Core Update 2026.
        const sourceUrls = [item.url];
        const sourceTitles = [item.sourceName];
        const sourceDescriptions = [item.description];
        const mergedItems: ScrapedArticle[] = [];
        let combinedContent = sourceContent;

        const relatedCandidates = findRelatedItems(
          item,
          newItems.filter((n) => !usedSourceUrls.has(n.url)),
          2
        );
        for (const rel of relatedCandidates) {
          const relPage = await scrapeSourcePage(rel.url, RELATED_SOURCE_CHARS);
          // Za krótkie źródło dodatkowe nic nie wnosi — pomijamy bez oznaczania
          // jako processed (może być głównym tematem w kolejnym runie).
          if (relPage.text.length < MIN_RELATED_SOURCE_CHARS) continue;
          combinedContent += `\n\n===== ŹRÓDŁO DODATKOWE (${rel.sourceName}) — "${rel.title}" =====\n${relPage.text}`;
          sourceUrls.push(rel.url);
          sourceTitles.push(rel.sourceName);
          sourceDescriptions.push(rel.description);
          mergedItems.push(rel);
          usedSourceUrls.add(rel.url);
        }
        if (mergedItems.length > 0) {
          console.log(`[Multi-source] "${item.title}" + ${mergedItems.length} źródła: ${mergedItems.map((m) => m.sourceName).join(", ")}`);
        }

        const fallbackCategory: CategorySlug = isCategorySlug(item.category) ? item.category : "modele-ai";
        const article = await generateArticle({
          topic: item.title,
          sourceUrls,
          sourceDescriptions,
          sourceContent: combinedContent,
          fallbackCategory,
          runId,
          existingTags,
          internalLinkCandidates,
          deadline,
        });

        // Validate AI response — reject refusals and garbage
        if (isLikelyRefusal(article.content)) {
          console.warn(`[Pipeline] AI refused for "${item.title}", skipping`);
          failed.push({ title: item.title, reason: "ai-refusal" });
          await logPipelineEvent(runId, "ai_refusal", {
            title: item.title,
            url: item.url,
            source_name: item.sourceName,
            opening: article.content.slice(0, 200),
          });
          await markProcessed(supabase, [item]);
          continue;
        }

        // Quality gate — reject low-quality articles
        const quality = assessArticleQuality(article);
        console.log(`[Quality] "${article.title}" — score: ${quality.score}/100${quality.issues.length > 0 ? `, issues: ${quality.issues.join(", ")}` : ""}`);

        if (quality.score < QUALITY_PUBLISH_THRESHOLD) {
          console.warn(`[Pipeline] Rejecting "${article.title}" — quality score ${quality.score}/100: ${quality.issues.join(", ")}`);
          rejected.push(article.title);
          await logPipelineEvent(runId, "quality_reject", {
            title: article.title,
            url: item.url,
            source_name: item.sourceName,
            score: quality.score,
            issues: quality.issues,
          });
          await markProcessed(supabase, [item]);
          continue;
        }

        const thumbnail = await getArticleThumbnail(
          article.title,
          { sourceUrl: item.url, ogImage: sourcePage.ogImage, siteName: sourcePage.siteName },
          { runId, deadline }
        );

        const slug = await buildUniqueSlug(supabase, article.title);

        // Featured only when this article is excellent AND we haven't featured
        // anything else today yet. We flip the per-run flag eagerly so a second
        // ≥80-score article in the same batch doesn't also get featured.
        const shouldFeature = canFeatureThisRun && quality.score >= QUALITY_FEATURED_THRESHOLD;
        if (shouldFeature) canFeatureThisRun = false;

        // Insert article
        const { data: insertedArticle, error: insertError } = await supabase
          .from("articles")
          .insert({
            title: article.title,
            slug,
            excerpt: article.excerpt,
            content: article.content,
            category_id: categoryIdBySlug.get(article.category) ?? null,
            thumbnail_url: thumbnail.url || null,
            thumbnail_source: thumbnail.source,
            source_urls: sourceUrls,
            source_titles: sourceTitles,
            reading_time: article.reading_time,
            is_featured: shouldFeature,
            is_published: true,
            published_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (insertError || !insertedArticle) {
          console.error(`Failed to insert article: ${insertError?.message}`);
          failed.push({ title: item.title, reason: `insert-failed: ${insertError?.message || "unknown"}` });
          await logPipelineEvent(runId, "article_failed", {
            title: item.title,
            url: item.url,
            source_name: item.sourceName,
            stage: "insert",
            error: insertError?.message || "unknown",
          });
          continue;
        }

        // KOLEJNOŚĆ ZAPISÓW (niezmiennik): INSERT artykułu → NATYCHMIAST
        // oznaczenie źródeł jako przetworzonych → dopiero tagi. Gdy funkcja
        // padnie (wyjątek / ścięcie na 300s) między insertem a tym upsertem,
        // następny cron widziałby URL jako "nowy" i opublikował duplikat.
        // Źródła dołączone do syntezy idą w tym samym batchu — ich treść JEST
        // w opublikowanym artykule; osobny artykuł z tego doniesienia byłby
        // duplikatem. Jeden round-trip zamiast 1 + N.
        await markProcessed(supabase, [item, ...mergedItems]);

        const tagResult = await attachArticleTags(supabase, insertedArticle.id, article.tags, catalogSlugs);

        generated.push(article.title);
        publishedUrls.push(`${siteConfig.url}/artykul/${slug}`);
        // Świeżo opublikowany artykuł staje się kandydatem do linkowania dla
        // kolejnych items w tym samym runie (ten sam cykl newsowy).
        internalLinkCandidates.unshift({ title: article.title, slug });
        console.log(`Generated: ${article.title}`);
        await logPipelineEvent(runId, "article_generated", {
          title: article.title,
          slug,
          url: item.url,
          source_name: item.sourceName,
          category: article.category,
          quality_score: quality.score,
          merged_sources: mergedItems.length,
          is_featured: shouldFeature,
          thumbnail_source: thumbnail.source ?? (thumbnail.url ? "ai-generated" : "none"),
          word_count: countWords(article.content),
          tags_linked: tagResult.linked,
        });
      } catch (error) {
        console.error(`Failed to generate article for "${item.title}":`, error);
        failed.push({ title: item.title, reason: String(error) });
        await logPipelineEvent(runId, "article_failed", {
          title: item.title,
          url: item.url,
          source_name: item.sourceName,
          stage: "exception",
          error: String(error),
        });
      }
    }

    // IndexNow — jeden zbiorczy ping po całym runie. Fail-soft (log-only),
    // timeout 10 s mieści się w buforze budżetu.
    await pingIndexNow(publishedUrls);

    const durationMs = Date.now() - runStartedAt;
    await logPipelineEvent(runId, "run_end", {
      generated: generated.length,
      rejected: rejected.length,
      failed: failed.length,
      aborted: aborted.length,
      duration_ms: durationMs,
    });
    return Response.json({
      message: `Generated ${generated.length} articles${aborted.length > 0 ? ` (${aborted.length} aborted)` : ""}`,
      run_id: runId,
      generated,
      rejected,
      failed,
      aborted,
      scraped: scrapedItems.length,
      new: newItems.length,
      duration_ms: durationMs,
    });
  } catch (error) {
    console.error("Pipeline error:", error);
    await logPipelineEvent(runId, "run_end", {
      generated: 0,
      rejected: 0,
      failed: 0,
      aborted: 0,
      duration_ms: Date.now() - runStartedAt,
      pipeline_error: String(error),
    });
    return Response.json(
      { error: "Pipeline failed", details: String(error), run_id: runId },
      { status: 500 }
    );
  }
}

// Vercel Cron triggers GET requests
export async function GET(request: NextRequest) {
  return runPipeline(request);
}

// Manual triggers via POST also supported
export async function POST(request: NextRequest) {
  return runPipeline(request);
}

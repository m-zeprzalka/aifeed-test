import { NextRequest } from "next/server";
import { scrapeAllFeeds, selectTopArticles } from "@/lib/scraper/parser";
import { scrapeArticleContent } from "@/lib/scraper/content";
import { generateArticle } from "@/lib/ai/writer";
import { assessArticleQuality } from "@/lib/ai/quality";
import { getArticleThumbnail } from "@/lib/images/generator";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPipelineEvent, newRunId } from "@/lib/telemetry";
import { pingIndexNow } from "@/lib/indexnow";
import { siteConfig } from "@/config/site";
import type { SupabaseClient } from "@supabase/supabase-js";
import slugify from "slugify";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Vercel Hobby max function duration = 300s. Per-artykuł budget w worst case
// (scrape 15s + AI 90s + thumbnail og 10s lub AI 90s + DB ops) potrafi sięgać
// 200s. Bez time-budget guard pętla potrafi zostać cięta w połowie iteracji,
// zostawiając stan w nieprzewidywalnym miejscu (insert mógł przejść, ale
// upsert tagów już nie). Po przekroczeniu BUDGET_MS przerywamy pętlę
// gracefully — pozostałe items lądują w `aborted[]` w response, a `scraped_items`
// dla nich NIE są oznaczone jako processed (retry w następnym cronie).
//
// Bufor 30s (300 - 270) zostaje na: ostatni insert + final response stringify
// + serverless cold-finish.
const PIPELINE_BUDGET_MS = 270_000;

/**
 * Generate a unique slug for the article. Prefers a clean, human-readable slug;
 * falls back to a short timestamp suffix only when the base slug collides.
 */
async function buildUniqueSlug(supabase: SupabaseClient, title: string): Promise<string> {
  const base = slugify(title, { lower: true, strict: true, locale: "pl" }).slice(0, 80) || "artykul";

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data } = await supabase.from("articles").select("id").eq("slug", candidate).maybeSingle();
    if (!data) return candidate;
  }
  // Last-resort uniqueness guarantee — base36 timestamp is short enough
  return `${base}-${Date.now().toString(36)}`;
}

async function runPipeline(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

    // Editorial featured-article gating: at most ONE featured per UTC day, and
    // only when the AI quality score is ≥ 80 (excellent, not just passing).
    // Without these guards `is_featured` flips on every cron run and pollutes
    // sitemap priority signals + the "wyróżniony" hero on the home page.
    // Katalog popularnych tagów — raz na run, przekazywany do promptu, żeby
    // AI wybierało z istniejącej taksonomii zamiast płodzić warianty pisowni
    // (root cause rozdrobnienia katalogu: ~73% tagów z 1 artykułem).
    const { data: popularTagRows } = await supabase.rpc("popular_tags", { tag_limit: 60 });
    const existingTags: string[] = Array.isArray(popularTagRows)
      ? popularTagRows.map((t: { name: string }) => t.name).filter(Boolean)
      : [];

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

    // URL-e opublikowane w tym runie — po pętli lecą jednym pingiem do
    // IndexNow (fail-soft; Google nie wspiera, Bing/Copilot tak).
    const publishedUrls: string[] = [];

    const QUALITY_FEATURED_THRESHOLD = 80;
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

        // Scrape full source content for faithful adaptation
        const sourceContent = await scrapeArticleContent(item.url);
        console.log(`[Source content] ${sourceContent.length} chars from ${item.url}`);

        if (sourceContent.length < 100) {
          console.warn(`[Pipeline] Skipping "${item.title}" — source content too short or unreadable`);
          failed.push({ title: item.title, reason: "source-too-short" });
          await logPipelineEvent(runId, "scrape_skip", {
            title: item.title,
            url: item.url,
            source_name: item.sourceName,
            content_length: sourceContent.length,
          });
          // Still mark as processed so we don't retry bad URLs
          await supabase.from("scraped_items").upsert(
            { source_url: item.url, title: item.title, description: item.description, source_name: item.sourceName, is_processed: true },
            { onConflict: "source_url" }
          );
          continue;
        }

        const article = await generateArticle(item.title, [item.url], [item.description], sourceContent, runId, existingTags, internalLinkCandidates);

        // Validate AI response — reject refusals and garbage
        const refusalPatterns = ["nie można przetworzyć", "nie mogę", "brak treści", "brak czytelnej"];
        const isRefusal = refusalPatterns.some((p) => article.content.toLowerCase().includes(p));

        if (isRefusal) {
          console.warn(`[Pipeline] AI refused for "${item.title}", skipping`);
          failed.push({ title: item.title, reason: "ai-refusal" });
          await logPipelineEvent(runId, "ai_refusal", {
            title: item.title,
            url: item.url,
            source_name: item.sourceName,
          });
          await supabase.from("scraped_items").upsert(
            { source_url: item.url, title: item.title, description: item.description, source_name: item.sourceName, is_processed: true },
            { onConflict: "source_url" }
          );
          continue;
        }

        // Quality gate — reject low-quality articles
        const quality = assessArticleQuality(article);
        console.log(`[Quality] "${article.title}" — score: ${quality.score}/100${quality.issues.length > 0 ? `, issues: ${quality.issues.join(", ")}` : ""}`);

        if (quality.score < 50) {
          console.warn(`[Pipeline] Rejecting "${article.title}" — quality score ${quality.score}/100: ${quality.issues.join(", ")}`);
          rejected.push(article.title);
          await logPipelineEvent(runId, "quality_reject", {
            title: article.title,
            url: item.url,
            source_name: item.sourceName,
            score: quality.score,
            issues: quality.issues,
          });
          await supabase.from("scraped_items").upsert(
            { source_url: item.url, title: item.title, description: item.description, source_name: item.sourceName, is_processed: true },
            { onConflict: "source_url" }
          );
          continue;
        }

        // Ensure the original source URL is always in source_urls
        const sourceUrls = [item.url];
        const sourceTitles = [item.sourceName];

        const thumbnail = await getArticleThumbnail(article.title, item.url, runId);

        const slug = await buildUniqueSlug(supabase, article.title);

        // Find category
        const { data: category } = await supabase
          .from("categories")
          .select("id")
          .eq("slug", article.category)
          .maybeSingle();

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
            category_id: category?.id || null,
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

        // Mark source as processed NATYCHMIAST po udanym insercie artykułu —
        // zanim ruszą tagi. Gdy funkcja padnie (wyjątek / ścięcie na 300s)
        // między insertem a tym upsertem, następny cron widziałby URL jako
        // "nowy" i opublikował duplikat. Ta kolejność zwęża okno duplikacji
        // z sekund (pętla tagów) do pojedynczego round-tripu.
        await supabase.from("scraped_items").upsert(
          {
            source_url: item.url,
            title: item.title,
            description: item.description,
            source_name: item.sourceName,
            is_processed: true,
          },
          { onConflict: "source_url" }
        );

        // Twarde egzekwowanie dyscypliny tagów — prompt prosi, kod GWARANTUJE:
        // tagi z katalogu (case-insensitive) przechodzą, spoza katalogu wchodzi
        // maksymalnie JEDEN (nowa encja), łącznie max 5. Bez tego AI potrafiło
        // dorzucić 3 ogólniki ("zarząd", "odejścia") na jeden artykuł i katalog
        // wracał do stanu sprzed konsolidacji.
        const catalogLower = new Set(existingTags.map((t) => t.toLowerCase()));
        const inCatalog = article.tags.filter((t) => catalogLower.has(t.toLowerCase()));
        const outOfCatalog = article.tags.filter((t) => !catalogLower.has(t.toLowerCase()));
        const finalTags = [...inCatalog, ...outOfCatalog.slice(0, 1)].slice(0, 5);
        if (outOfCatalog.length > 1) {
          console.warn(
            `[Tags] Wycięto ${outOfCatalog.length - 1} tagów spoza katalogu: ${outOfCatalog.slice(1).join(", ")}`
          );
        }

        // Handle tags — upserts are independent per tag, run them in parallel.
        await Promise.all(
          finalTags.map(async (tagName) => {
            const tagSlug = slugify(tagName, { lower: true, strict: true, locale: "pl" });

            const { data: tag } = await supabase
              .from("tags")
              .upsert({ name: tagName, slug: tagSlug }, { onConflict: "slug" })
              .select("id")
              .single();

            if (tag) {
              await supabase
                .from("article_tags")
                .upsert(
                  { article_id: insertedArticle.id, tag_id: tag.id },
                  { onConflict: "article_id,tag_id" }
                );
            }
          })
        );

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
          is_featured: shouldFeature,
          thumbnail_source: thumbnail.source ?? (thumbnail.url ? "ai-generated" : "none"),
          word_count: article.content.split(/\s+/).filter(Boolean).length,
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
    // nie liczy się do time budgetu w sposób istotny (timeout 10 s).
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

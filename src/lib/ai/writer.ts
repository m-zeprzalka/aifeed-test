import { buildArticleSystemPrompt, ARTICLE_USER_PROMPT } from "./prompts";
import { sanitizeInternalLinks } from "./internal-links";
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages";
import {
  ArticleRefusalError,
  articleModel,
  claudeClient,
  claudeCostUsd,
  responseText as extractResponseText,
  supportsServerFallback,
} from "./claude";
import { countWords } from "./quality";
import { polishTypography } from "../typography";
import { stripInlineMarkdown } from "../heading-id";
import { logPipelineEvent } from "@/lib/telemetry";
import { siteConfig, type CategorySlug } from "@/config/site";
import { tagSlug } from "./tags";

// Model: Claude Opus 5.5 przez API Anthropic (claude.ts; zmiana przez env
// `CLAUDE_ARTICLE_MODEL`). Thinking jest zawsze włączone (adaptive) — NIE
// wysyłamy parametru `thinking` (`disabled` = 400); głębię ustawia `effort`.
// max_tokens mieści thinking + treść: artykuł to ~3,5k tokenów (maks. 7k
// w 30 dniach na Sonnet 5), 16k to zapas, a nie cel.
const ARTICLE_MAX_TOKENS = 16_000;
// Domyślny effort Opus 5.5 to `medium` — ustawiamy jawnie. `high`: wierna
// adaptacja z zakazem halucynacji to praca wrażliwa na jakość, a adaptive
// thinking i tak myśli krótko przy prostych źródłach.
const ARTICLE_EFFORT = "high" as const;

/**
 * Repair common markdown formatting failures from the LLM before storage.
 * Two symptoms we've seen:
 *   1. Bullet lists collapsed onto one line ("- A - B - C") render as a single
 *      paragraph in react-markdown.
 *   2. Headings/lists missing blank-line separators don't trigger block parsing
 *      in CommonMark, so they render inline with the preceding paragraph.
 * We process line-by-line to avoid regex foot-guns (e.g. inserting blank lines
 * between adjacent items of an already-correct list).
 */
export function normalizeMarkdown(input: string): string {
  const isHeading = (s: string) => /^#{2,6} /.test(s);
  const isListItem = (s: string) => /^- /.test(s);
  const isBlockMarker = (s: string) => isHeading(s) || isListItem(s);

  // Pass 1 — line-level rewrites: bullet style + inline-merged list repair.
  const rawLines = input.replace(/\r\n/g, "\n").split("\n");
  const expanded: string[] = [];
  for (const raw of rawLines) {
    // Normalise `*`/`•` bullets to `-`.
    const line = raw.replace(/^[ \t]*[•*][ \t]+/, "- ");

    // Repair "- a - b - c" merged list. Heuristic: must start with "- ", have
    // ≥2 inline " - " markers, and every produced segment must be ≥ 8 chars
    // (protects prose lines like "- Pierwszy punkt — szczegół" from shredding).
    if (isListItem(line)) {
      const inlineMarkers = (line.match(/ - /g) || []).length;
      if (inlineMarkers >= 2) {
        const parts = line.slice(2).split(/ - /).map((p) => p.trim()).filter(Boolean);
        if (parts.every((p) => p.length >= 8)) {
          for (const p of parts) expanded.push(`- ${p}`);
          continue;
        }
      }
    }
    expanded.push(line);
  }

  // Pass 2 — block-level spacing. Insert blank line BEFORE a heading or the
  // first item of a list when the prev line is non-blank, non-list, non-heading;
  // insert blank line AFTER a heading when the next line is non-blank.
  const out: string[] = [];
  for (let i = 0; i < expanded.length; i++) {
    const cur = expanded[i];
    const prev = out.length > 0 ? out[out.length - 1] : null;
    const isFirstListItem = isListItem(cur) && (prev === null || !isListItem(prev));

    if ((isHeading(cur) || isFirstListItem) && prev !== null && prev !== "" && !isBlockMarker(prev)) {
      out.push("");
    }
    out.push(cur);

    if (isHeading(cur)) {
      const next = expanded[i + 1];
      if (next !== undefined && next !== "" && !isHeading(next)) {
        out.push("");
      }
    }
  }

  // Collapse 3+ blank lines to one.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Robustly extract metadata JSON from the AI response.
 * Tries multiple delimiter patterns, then falls back to finding
 * the last JSON block in the response.
 */
function extractMeta(
  responseText: string
): Partial<GeneratedArticle> & { _content: string } {
  // Strategy 1: Try known delimiter patterns (case-insensitive)
  const delimiterPattern = /^-{3,}\s*META\s*-{3,}$/im;
  const delimiterMatch = responseText.match(delimiterPattern);

  let contentPart: string;
  let metaRaw: string | null = null;

  if (delimiterMatch) {
    const idx = responseText.indexOf(delimiterMatch[0]);
    contentPart = responseText.slice(0, idx).trim();
    metaRaw = responseText.slice(idx + delimiterMatch[0].length).trim();
  } else {
    // Strategy 2: Find the last JSON object with "title" key in the response
    const jsonPattern = /\{[^{}]*"title"\s*:\s*"[^"]+?"[^{}]*\}/g;
    const matches = [...responseText.matchAll(jsonPattern)];

    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      contentPart = responseText.slice(0, lastMatch.index).trim();
      metaRaw = lastMatch[0];
      console.warn("[Writer] META delimiter not found, extracted JSON by pattern match");
    } else {
      console.error("[Writer] No META section and no JSON block found in AI response");
      return { _content: responseText.trim() };
    }
  }

  // Clean up markdown code fences and parse JSON
  const jsonStr = metaRaw
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return { ...parsed, _content: contentPart };
  } catch (e) {
    // Strategy 3: Try to fix common JSON issues (trailing commas, smart quotes)
    try {
      const fixed = jsonStr
        .replace(/,\s*}/g, "}")        // trailing commas
        .replace(/,\s*]/g, "]")        // trailing commas in arrays
        .replace(/[\u201C\u201D]/g, '"') // smart quotes → straight
        .replace(/[\u2018\u2019]/g, "'");
      const parsed = JSON.parse(fixed);
      console.warn("[Writer] META JSON required fixup to parse");
      return { ...parsed, _content: contentPart };
    } catch {
      console.error("[Writer] Failed to parse META JSON:", e);
      console.error("[Writer] Raw META:", jsonStr.slice(0, 500));
      return { _content: contentPart };
    }
  }
}

export interface GeneratedArticle {
  content: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  reading_time: number;
}

export interface GenerateArticleInput {
  /** Tytuł źródła (temat). */
  topic: string;
  /** [główne, ...dodatkowe] — pierwszy URL to obowiązkowy link w treści. */
  sourceUrls: string[];
  sourceDescriptions: string[];
  /** Treść źródła (+ sekcje "ŹRÓDŁO DODATKOWE" przy syntezie). */
  sourceContent: string;
  /** Kategoria feedu RSS — fallback, gdy AI zwróci slug spoza katalogu. */
  fallbackCategory: CategorySlug;
  /** Gdy przekazany, koszt wywołania Claude trafia do `pipeline_events` (`ai_cost`). */
  runId?: string;
  /** Katalog istniejących tagów (dyscyplina słownika — zob. prompts.ts). */
  existingTags?: string[];
  /**
   * Kandydaci do linkowania wewnętrznego (tytuł + slug). AI wplata 1-3 linki;
   * `sanitizeInternalLinks` gwarantuje, że zostają wyłącznie slugi z listy.
   */
  internalLinkCandidates?: { title: string; slug: string }[];
  /**
   * Twardy termin (epoch ms), do którego odpowiedź musi wrócić — budżet
   * funkcji (maxDuration). Timeout żądania i decyzja o retry liczą się od
   * niego; bez tego 2 × 120 s + pauza potrafiły przebić limit 300 s.
   */
  deadline?: number;
}

// Minimalny sensowny czas na wygenerowanie artykułu (thinking + ~1000 słów).
// Poniżej nie zaczynamy płatnego wywołania — ucięte w połowie nic nie daje.
const MIN_GENERATION_MS = 60_000;
const REQUEST_TIMEOUT_MS = 150_000;

// Polski tekst publicystyczny czyta się w tempie ~200 słów/min. Liczone
// z treści, nie z szacunku AI — model zgadywał czas czytania niespójnie.
const WORDS_PER_MINUTE = 200;

/**
 * Kategoria z odpowiedzi AI → slug z katalogu. Model potrafi wymyślić
 * nieistniejącą ("edukacja", 2026-10-26) albo zmienić zapis ("Modele AI");
 * wcześniej taki artykuł lądował z `category_id = NULL` — poza listami
 * kategorii, sekcjami home i breadcrumbem.
 */
const CATEGORY_BY_KEY = new Map<string, CategorySlug>(
  siteConfig.categories.flatMap((c) => [
    [c.slug, c.slug],
    [tagSlug(c.name), c.slug], // "Modele AI" → modele-ai, "Badania i Nauka" → badania
  ])
);

export function normalizeCategory(raw: unknown, fallback: CategorySlug): { category: CategorySlug; valid: boolean } {
  const match = typeof raw === "string" ? CATEGORY_BY_KEY.get(tagSlug(raw)) : undefined;
  return match ? { category: match, valid: true } : { category: fallback, valid: false };
}

/** Excerpt awaryjny, gdy META nie ma `excerpt`: pierwszy akapit bez markdownu. */
function fallbackExcerpt(content: string): string {
  const firstParagraph = content.split(/\n{2,}/).find((p) => p.trim() && !p.startsWith("#")) ?? content;
  const plain = stripInlineMarkdown(firstParagraph.replace(/\s+/g, " ").trim());
  return plain.length > 200 ? `${plain.slice(0, 199).trimEnd()}…` : plain;
}

/** Błąd, którego ponowienie dałoby ten sam wynik (np. ucięcie na max_tokens). */
class NonRetryableError extends Error {}

/**
 * Czy warto ponowić wywołanie w ramach tego samego runu: zerwany strumień,
 * timeout, sieć, 408/409/429/5xx (w tym 529 overloaded). Odmowa, ucięcie
 * i pozostałe 4xx (zły klucz, brak środków, za długi prompt) — nie.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof ArticleRefusalError || error instanceof NonRetryableError) return false;
  if (error instanceof Anthropic.APIError && typeof error.status === "number") {
    return error.status >= 500 || error.status === 408 || error.status === 409 || error.status === 429;
  }
  return true;
}

export async function generateArticle(input: GenerateArticleInput): Promise<GeneratedArticle> {
  const {
    topic,
    sourceUrls,
    sourceDescriptions,
    sourceContent,
    fallbackCategory,
    runId,
    existingTags = [],
    internalLinkCandidates = [],
    deadline = Date.now() + 2 * REQUEST_TIMEOUT_MS,
  } = input;

  const client = claudeClient();
  const model = articleModel();

  const params: BetaMessageStreamParams = {
    model,
    max_tokens: ARTICLE_MAX_TOKENS,
    output_config: { effort: ARTICLE_EFFORT },
    // Serwerowy fallback przy odmowie klasyfikatora (np. tekst o cyberataku
    // na model) — zob. claude.ts. Routing po kategorii odmowy, bez listy modeli.
    ...(supportsServerFallback(model)
      ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
      : {}),
    system: buildArticleSystemPrompt(),
    messages: [
      {
        role: "user",
        content: ARTICLE_USER_PROMPT(topic, sourceUrls, sourceDescriptions, sourceContent, existingTags, internalLinkCandidates),
      },
    ],
  };

  // Streaming: długa odpowiedź (thinking + ~1000 słów) bez ryzyka timeoutu
  // bezczynnego połączenia. Błędy przejściowe PRZED strumieniem (429/5xx/
  // sieć) ponawia SDK (`maxRetries` w claude.ts); zerwany strumień w trakcie
  // (np. `terminated`) — jedna próba tutaj, jeśli do `deadline` zostało dość
  // czasu. Wyjątek wraca do pipeline'u, który NIE oznacza źródła jako
  // przetworzonego (retry w następnym cronie).
  let message: Anthropic.Beta.BetaMessage | null = null;
  let responseText = "";
  let durationMs = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_GENERATION_MS) {
      throw new Error(`Za mało czasu na generację (${Math.round(remaining / 1000)} s do końca budżetu)`);
    }
    const isLastAttempt = attempt === 1 || remaining - REQUEST_TIMEOUT_MS < MIN_GENERATION_MS;
    const startedAt = Date.now();
    try {
      message = await client.beta.messages
        .stream(params, { signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)) })
        .finalMessage();
      durationMs = Date.now() - startedAt;
      responseText = extractResponseText(message.content);
      if (message.stop_reason === "refusal") {
        throw new ArticleRefusalError(message.stop_details?.category ?? null);
      }
      if (message.stop_reason === "max_tokens") {
        throw new NonRetryableError(`Claude: odpowiedź ucięta na max_tokens (${ARTICLE_MAX_TOKENS})`);
      }
      if (responseText.trim()) break;
      if (isLastAttempt) throw new Error("Claude returned an empty completion");
    } catch (e) {
      if (!isRetryable(e) || isLastAttempt) throw e;
    }
    if (isLastAttempt) break;
    console.warn(`[Writer] Claude transient failure (attempt ${attempt + 1}), retrying in 3s...`);
    await new Promise((r) => setTimeout(r, 3_000));
  }

  if (!message || !responseText.trim()) {
    throw new Error("Claude request failed after retry");
  }

  // Token usage + cost — w produkcji idą do `pipeline_events` (dashboard
  // /admin sumuje koszty 7d), w stdout dla local dev. Tokeny thinking są
  // wliczone w `output_tokens` (API nie podaje ich osobno).
  const usage = message.usage;
  const costUsd = claudeCostUsd(usage, model);
  // Model, który faktycznie napisał tekst (inny niż `model` po fallbacku).
  const servedBy = message.model;
  const promptTokens =
    usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  console.log(
    `[AI Cost] ${servedBy} — input: ${promptTokens}, output: ${usage.output_tokens}, ${Math.round(durationMs / 1000)} s, cost: $${costUsd?.toFixed(4) ?? "?"}`
  );
  if (runId) {
    await logPipelineEvent(runId, "ai_cost", {
      type: "article",
      model,
      served_by: servedBy,
      effort: ARTICLE_EFFORT,
      prompt_tokens: promptTokens,
      completion_tokens: usage.output_tokens,
      total_tokens: promptTokens + usage.output_tokens,
      cost_usd: costUsd,
      duration_ms: durationMs,
      stop_reason: message.stop_reason,
      title: topic,
    });
  }

  // Split content and metadata — flexible delimiter matching
  const meta = extractMeta(responseText);
  // Three-step pipeline: normalizeMarkdown handles structural fixes (lists,
  // headings, blank lines), sanitizeInternalLinks enforces the internal-link
  // whitelist (links outside `internalLinkCandidates` become plain text — no
  // hallucinated 404s), polishTypography handles cosmetic Polish rules
  // (NBSP after one-letter prepositions, en/em-dash, „cudzysłowy"). Splitting
  // them keeps each pass deterministic and individually testable.
  const allowedSlugs = new Set(internalLinkCandidates.map((c) => c.slug));
  const content = polishTypography(
    sanitizeInternalLinks(normalizeMarkdown(meta._content), allowedSlugs)
  );
  const excerpt = polishTypography(
    typeof meta.excerpt === "string" && meta.excerpt.trim() ? meta.excerpt.trim() : fallbackExcerpt(content)
  );
  const title = typeof meta.title === "string" && meta.title.trim() ? polishTypography(meta.title.trim()) : topic;

  const { category, valid } = normalizeCategory(meta.category, fallbackCategory);
  if (!valid) {
    console.warn(`[Writer] Kategoria spoza katalogu (${String(meta.category)}) → fallback "${category}"`);
  }

  return {
    content,
    title,
    excerpt,
    category,
    tags: Array.isArray(meta.tags) ? meta.tags.filter((t): t is string => typeof t === "string") : [],
    reading_time: Math.max(1, Math.round(countWords(content) / WORDS_PER_MINUTE)),
  };
}

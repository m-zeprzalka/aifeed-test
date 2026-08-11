import { ARTICLE_SYSTEM_PROMPT, ARTICLE_USER_PROMPT } from "./prompts";
import { sanitizeInternalLinks } from "./internal-links";
import { polishTypography } from "../typography";
import { logPipelineEvent } from "@/lib/telemetry";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const ARTICLE_MODEL = "anthropic/claude-sonnet-4";

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

export async function generateArticle(
  topic: string,
  sourceUrls: string[],
  sourceDescriptions: string[],
  sourceContent: string = "",
  // Opcjonalny — gdy przekazany, logujemy koszt OpenRouter do
  // `pipeline_events` (event: `ai_cost`, type: `article`). Wywoływane z
  // cron route. Brak runId = standalone use (test/skrypt) — pomijamy log.
  runId?: string,
  // Katalog istniejących tagów przekazywany do promptu (dyscyplina
  // słownika — zob. komentarz w prompts.ts).
  existingTags: string[] = [],
  // Kandydaci do linkowania wewnętrznego (tytuł + slug ostatnich artykułów).
  // AI wplata 1-3 kontekstowe linki; sanitizeInternalLinks gwarantuje, że w
  // treści zostają wyłącznie linki do slugów z tej listy (zero wewnętrznych 404).
  internalLinkCandidates: { title: string; slug: string }[] = [],
): Promise<GeneratedArticle> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const requestBody = JSON.stringify({
    model: ARTICLE_MODEL,
    max_tokens: 4096,
    // Bez tego OpenRouter często nie zwraca `usage.total_cost` i telemetria
    // kosztów w /admin loguje undefined.
    usage: { include: true },
    messages: [
      {
        role: "system",
        content: ARTICLE_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: ARTICLE_USER_PROMPT(topic, sourceUrls, sourceDescriptions, sourceContent, existingTags, internalLinkCandidates),
      },
    ],
  });

  // Jedna próba ponowienia przy błędach przejściowych (429/5xx/timeout).
  // Chwilowa czkawka providera nie powinna wyrzucać artykułu z całego runu —
  // bez retry item wraca do kolejki dopiero przy następnym cronie (−6h).
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
          "X-Title": "AiFeed",
        },
        body: requestBody,
        signal: AbortSignal.timeout(90_000), // 90s timeout per article
      });
      const transient = response.status === 429 || response.status >= 500;
      if (!transient || attempt === 1) break;
    } catch (e) {
      if (attempt === 1) throw e;
      response = null;
    }
    console.warn(`[Writer] OpenRouter transient failure (attempt ${attempt + 1}), retrying in 3s...`);
    await new Promise((r) => setTimeout(r, 3_000));
  }

  if (!response) {
    throw new Error("OpenRouter request failed after retry");
  }
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const responseText = data.choices?.[0]?.message?.content || "";

  // Token usage + cost — w produkcji idą do `pipeline_events` (dashboard
  // /admin sumuje koszty 7d), w stdout dla local dev.
  const usage = data.usage;
  if (usage) {
    console.log(`[AI Cost] Tokens — prompt: ${usage.prompt_tokens}, completion: ${usage.completion_tokens}, total: ${usage.total_tokens}`);
  }
  if (data.usage?.total_cost !== undefined) {
    console.log(`[AI Cost] Total cost: $${data.usage.total_cost}`);
  }
  if (runId && usage) {
    await logPipelineEvent(runId, "ai_cost", {
      type: "article",
      model: ARTICLE_MODEL,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      cost_usd: usage.total_cost,
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
  const excerpt = meta.excerpt
    ? polishTypography(meta.excerpt)
    : content.slice(0, 200);
  const title = meta.title ? polishTypography(meta.title) : topic;

  return {
    content,
    title,
    excerpt,
    category: meta.category || "modele-ai",
    tags: meta.tags || [],
    reading_time: meta.reading_time || Math.ceil(content.split(/\s+/).length / 200),
  };
}

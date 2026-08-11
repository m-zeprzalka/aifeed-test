import Parser from "rss-parser";
import { RSS_SOURCES } from "./sources";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "AiFeed/1.0 (AI News Aggregator)",
  },
});

// Word-boundary regex avoids false positives on "said"/"again"/"main" that a
// plain substring match on "ai" would hit. Anchor on `\b` so "ai" alone matches
// only as a whole word; longer tokens (chatgpt, openai, claude) match anywhere.
const AI_KEYWORD_REGEX = new RegExp(
  [
    // Generic
    "\\bai\\b", "\\baml\\b", "\\bml\\b",
    "artificial intelligence", "machine learning", "deep learning",
    "neural network", "neural net",
    // Architectures and techniques
    "\\bllm\\b", "large language model", "transformer", "diffusion model",
    "\\brag\\b", "embedding", "fine[- ]?tun", "\\brlhf\\b", "alignment",
    "reasoning", "agentic", "ai agent", "multimodal", "vision[- ]language",
    "\\bvlm\\b", "\\bmoe\\b", "mixture of experts", "synthetic data",
    "reinforcement learning",
    // Models and products
    "\\bgpt[- ]?\\d?", "chatgpt", "claude", "gemini", "llama", "mistral",
    "qwen", "deepseek", "grok", "phi[- ]\\d", "copilot", "midjourney",
    "stable diffusion", "dall[- ]?e", "\\bsora\\b",
    // Companies and platforms
    "openai", "anthropic", "deepmind", "hugging ?face", "cohere",
    "perplexity", "stability ai", "runway ml",
    // Hardware/infra in AI context
    "\\btpu\\b", "ai chip", "ai accelerator",
  ].join("|"),
  "i"
);

export interface ScrapedArticle {
  title: string;
  description: string;
  url: string;
  sourceName: string;
  category: string;
  publishedAt: Date;
}

export async function scrapeAllFeeds(): Promise<ScrapedArticle[]> {
  const results: ScrapedArticle[] = [];

  const feedPromises = RSS_SOURCES.map(async (source) => {
    try {
      const feed = await parser.parseURL(source.url);
      const items = (feed.items || []).slice(0, 10); // Max 10 per source

      for (const item of items) {
        if (!item.title || !item.link) continue;

        // Skip filter only for sources flagged alwaysRelevant in sources.ts
        // (AI-only research blogs and arXiv cs.AI). Everything else, including
        // mixed-topic company blogs (NVIDIA, Microsoft), goes through the
        // keyword gate below.
        if (!source.alwaysRelevant) {
          const text = `${item.title} ${item.contentSnippet || ""}`;
          if (!AI_KEYWORD_REGEX.test(text)) continue;
        }

        // Walidacja daty z feedu. Nieparsowalny `pubDate` dawał Invalid Date
        // → NaN w scoringu (item nigdy nie wybierany); data z przyszłości
        // (złe zegary wydawcy) dawała freshness > 100 i dominowała selekcję.
        // W obu przypadkach przycinamy do "teraz".
        let publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
        if (Number.isNaN(publishedAt.getTime()) || publishedAt.getTime() > Date.now()) {
          publishedAt = new Date();
        }

        results.push({
          title: item.title,
          description: item.contentSnippet || item.content || "",
          url: item.link,
          sourceName: source.name,
          category: source.category,
          publishedAt,
        });
      }
    } catch (error) {
      console.error(`Failed to scrape ${source.name}:`, error);
    }
  });

  await Promise.allSettled(feedPromises);

  // Sort by date (newest first) and deduplicate by URL
  const seen = new Set<string>();
  return results
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
}

// Stopwordy do porównywania tytułów (EN — feedy są głównie anglojęzyczne;
// tokeny ≤3 znaki odpadają wcześniej, więc krótkie spójniki nie wymagają wpisu).
const TITLE_STOPWORDS = new Set([
  "with", "from", "that", "this", "after", "before", "over", "into", "your",
  "will", "have", "been", "about", "their", "them", "than", "when", "what",
  "says", "could", "would", "should", "there", "here", "more", "most", "just",
  "amid", "against", "during", "while", "these", "those", "other", "some",
]);

/** Znaczące tokeny tytułu — podstawa porównania tematów między feedami. */
export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9ąćęłńóśźż]+/gi, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3 && !TITLE_STOPWORDS.has(t))
  );
}

/**
 * Znajduje w puli newsów doniesienia o TYM SAMYM wydarzeniu z INNYCH źródeł
 * (multi-source synthesis — information gain: artykuł łączący 2-3 outlety
 * zawiera więcej niż jakikolwiek pojedynczy oryginał; marcowy Core Update 2026
 * uczynił information gain dominującym sygnałem jakości).
 *
 * Heurystyka: ≥3 wspólne znaczące tokeny tytułu (≥2, gdy tytuł bazowy jest
 * krótki) — nazwiska/nazwy produktów współdzielone przez outlety piszące
 * o tym samym wydarzeniu. Ten sam outlet jest pomijany (follow-upy tego
 * samego serwisu to zwykle INNE wydarzenia z tą samą nazwą firmy).
 */
export function findRelatedItems(
  item: ScrapedArticle,
  pool: ScrapedArticle[],
  max = 2
): ScrapedArticle[] {
  const base = titleTokens(item.title);
  if (base.size === 0) return [];
  const threshold = base.size <= 5 ? 2 : 3;

  const scored: { candidate: ScrapedArticle; shared: number }[] = [];
  for (const candidate of pool) {
    if (candidate.url === item.url) continue;
    if (candidate.sourceName === item.sourceName) continue;
    let shared = 0;
    for (const token of titleTokens(candidate.title)) {
      if (base.has(token)) shared++;
    }
    if (shared >= threshold) scored.push({ candidate, shared });
  }

  return scored
    .sort((a, b) => b.shared - a.shared)
    .slice(0, max)
    .map((s) => s.candidate);
}

export function selectTopArticles(articles: ScrapedArticle[], count = 10): ScrapedArticle[] {
  // Greedy selection: pick best-scoring article one at a time,
  // applying diversity penalty based on already-selected sources.
  const sourceCount = new Map<string, number>();
  const selected: ScrapedArticle[] = [];
  const used = new Set<number>();

  for (let pick = 0; pick < count && pick < articles.length; pick++) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < articles.length; i++) {
      if (used.has(i)) continue;
      const article = articles[i];
      const hoursOld = (Date.now() - article.publishedAt.getTime()) / 3600000;
      const freshnessScore = Math.max(0, 100 - hoursOld * 2);
      const diversityPenalty = (sourceCount.get(article.sourceName) || 0) * 20;
      const score = freshnessScore - diversityPenalty;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;
    used.add(bestIdx);
    const chosen = articles[bestIdx];
    sourceCount.set(chosen.sourceName, (sourceCount.get(chosen.sourceName) || 0) + 1);
    selected.push(chosen);
  }

  return selected;
}

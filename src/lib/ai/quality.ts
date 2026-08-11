import type { GeneratedArticle } from "./writer";

interface QualityResult {
  score: number;
  issues: string[];
}

/**
 * Scores a generated article on structural quality and completeness.
 * Returns a score 0-100 and a list of issues found.
 * Articles scoring below 50 should be rejected by the pipeline.
 */
export function assessArticleQuality(article: GeneratedArticle): QualityResult {
  const issues: string[] = [];
  let score = 100;

  // --- Content checks ---

  // "Kluczowe wnioski" section is mandatory
  const hasKeyTakeaways = /##\s*(kluczowe|najważniejsze|główne)\s*(wnioski|punkty|informacje)/i.test(
    article.content
  );
  if (!hasKeyTakeaways) {
    score -= 15;
    issues.push("brak sekcji kluczowych wniosków");
  }

  // Source link must be present (markdown link format)
  const hasSourceLink = /\[.+?\]\(https?:\/\/.+?\)/.test(article.content);
  if (!hasSourceLink) {
    score -= 25;
    issues.push("brak linku do źródła");
  }

  // Word count — <100 słów to twarda kara (-35), 100-199 miękka (-20),
  // 200-379 lekka (-10): przy targecie 700-1200 słów (prompt, Sonnet 5)
  // artykuł poniżej ~380 słów to sygnał spłyconego źródła. Lekka kara nie
  // odrzuca sama z siebie (próg 50) — legalnie krótkie newsy przechodzą.
  const wordCount = article.content.split(/\s+/).length;
  if (wordCount < 100) {
    score -= 35;
    issues.push(`za krótki: ${wordCount} słów`);
  } else if (wordCount < 200) {
    score -= 20;
    issues.push(`krótki: ${wordCount} słów`);
  } else if (wordCount < 380) {
    score -= 10;
    issues.push(`płytki: ${wordCount} słów`);
  }

  // At least one ## heading (structural requirement)
  const headingCount = (article.content.match(/^##\s/gm) || []).length;
  if (headingCount === 0) {
    score -= 10;
    issues.push("brak nagłówków sekcji");
  }

  // --- Metadata checks ---

  if (!article.title || article.title.length < 15) {
    score -= 15;
    issues.push("tytuł za krótki lub brak");
  }

  // Detect English titles that slipped past the prompt. Stopword-based heuristic:
  // 2+ unambiguous English function words almost never appear in a Polish title.
  // Heavy penalty pushes it under the 50 threshold so the article is rejected
  // and the pipeline doesn't publish "Jury selection in Musk v. Altman" again.
  if (article.title) {
    const englishStopwords = /\b(the|in|with|and|of|for|to|after|before|on|over|under|is|are|was|were|will|should|could|would|don['’]t|doesn['’]t|isn['’]t|aren['’]t|that|this|these|those|its|it['’]s|just|why|how|when|where|what|who|but)\b/gi;
    const matches = article.title.match(englishStopwords) || [];
    if (matches.length >= 2) {
      score -= 50;
      issues.push(`tytuł po angielsku (${matches.length} słów: ${matches.slice(0, 3).join(", ")})`);
    }
  }

  if (!article.excerpt || article.excerpt.length < 50) {
    score -= 10;
    issues.push("excerpt za krótki lub brak");
  }

  if (!article.tags || article.tags.length < 2) {
    score -= 5;
    issues.push("za mało tagów");
  }

  const validCategories = ["modele-ai", "badania", "biznes", "etyka", "narzedzia", "poradniki"];
  if (!validCategories.includes(article.category)) {
    score -= 10;
    issues.push(`nieznana kategoria: ${article.category}`);
  }

  return { score: Math.max(0, score), issues };
}

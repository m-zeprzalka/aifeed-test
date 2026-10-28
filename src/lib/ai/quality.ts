import type { GeneratedArticle } from "./writer";
import { isCategorySlug } from "@/config/site";

interface QualityResult {
  score: number;
  issues: string[];
}

/** Próg publikacji (pipeline odrzuca poniżej). */
export const QUALITY_PUBLISH_THRESHOLD = 50;

// Granice słów świadome Unicode: ASCII-owe `\b` traktuje polskie litery jak
// separatory, więc "inż." dawałoby angielskie "in".
const wordsPattern = (words: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${words})(?![\\p{L}\\p{N}])`, "giu");

// Słowa funkcyjne, które NIE istnieją po polsku — pewny sygnał angielszczyzny.
// Bez "was" i "but": po polsku to zaimek ("zaprasza was") i rzeczownik (but).
const ENGLISH_ONLY_WORDS = wordsPattern(
  "the|in|with|and|of|for|after|before|over|under|is|are|were|will|should|could|would|can|has|have|from|about|into|your|you|our|don['’]t|doesn['’]t|isn['’]t|aren['’]t|that|this|these|those|its|it['’]s|just|why|how|when|where|what|who|whether"
);
// Słowa poprawne w OBU językach ("to jest…", "on twierdzi…") — same z siebie
// nie przesądzają, liczą się tylko w towarzystwie słowa wyłącznie angielskiego.
const AMBIGUOUS_WORDS = wordsPattern("to|on|we");
// Pewne sygnały polszczyzny: diakrytyki albo polskie słowa funkcyjne, których
// angielski tytuł nie zawiera ("i" — polskie "oraz"; angielskie "I" w tytule
// newsowym jest rzadkie, a i tak przegrywa z progiem 3 słów niżej).
const POLISH_DIACRITICS = /[ąćęłńóśźż]/i;
const POLISH_FUNCTION_WORDS = wordsPattern(
  "i|w|z|ze|na|dla|się|oraz|od|po|czy|nie|jest|są|że|jak|przez|przed|nowy|nowa|nowe|już|także"
);

/**
 * Tytuł, który prześlizgnął się przez prompt po angielsku ("Jury selection
 * in Musk v. Altman"). Heurystyka po słowach funkcyjnych. Polskie tytuły
 * zawierają NAZWY produktów z angielskimi słowami ("Gemini in Chrome",
 * "Claude for Chrome", "State of AI") — dlatego przy sygnale polszczyzny
 * flagujemy dopiero od 3 słów wyłącznie angielskich.
 */
export function englishTitleWords(title: string): string[] {
  const strong = title.match(ENGLISH_ONLY_WORDS) ?? [];
  const ambiguous = title.match(AMBIGUOUS_WORDS) ?? [];
  const looksPolish = POLISH_DIACRITICS.test(title) || POLISH_FUNCTION_WORDS.test(title);
  const english =
    strong.length >= 3 ||
    (!looksPolish && (strong.length >= 2 || (strong.length === 1 && ambiguous.length >= 1)));
  return english ? [...strong, ...ambiguous] : [];
}

/**
 * Odmowa/porażka modelu zamiast artykułu ("Nie mogę przetworzyć…",
 * "Brak treści źródłowej…"). Sprawdzamy WYŁĄCZNIE początek odpowiedzi:
 * dawne `content.includes("nie mogę")` po całej treści odrzucało poprawny
 * artykuł z cytatem typu „Nie mogę tego komentować" — powiedział CEO.
 */
const REFUSAL_PATTERNS = [
  /nie\s+mogę\s+(?:przetworzyć|napisać|zaadaptować|przygotować|wykonać|spełnić|stworzyć)/i,
  /nie\s+można\s+przetworzyć/i,
  /brak\s+(?:czytelnej\s+)?treści(?:\s+źródłowej)?/i,
  /\b(?:i\s+can(?:no|')t|i'm\s+unable|i\s+am\s+unable)\b/i,
];

export function isLikelyRefusal(content: string): boolean {
  const opening = content.slice(0, 400);
  return REFUSAL_PATTERNS.some((pattern) => pattern.test(opening));
}

/**
 * Scores a generated article on structural quality and completeness.
 * Returns a score 0-100 and a list of issues found.
 * Articles scoring below QUALITY_PUBLISH_THRESHOLD are rejected by the pipeline.
 */
export function assessArticleQuality(article: GeneratedArticle): QualityResult {
  const issues: string[] = [];
  let score = 100;

  // --- Content checks ---

  // Sekcja kluczowych wniosków jest obowiązkowa (nagłówek wariantowy —
  // zob. prompts.ts: Kluczowe wnioski / Najważniejsze informacje / …).
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
  const wordCount = countWords(article.content);
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

  // Kara MUSI zepchnąć pod próg nawet artykuł bez innych uwag: przy -50
  // idealny tekst z angielskim tytułem miał równo 50 pkt i PRZECHODZIŁ
  // (pipeline odrzuca `< 50`) — wyłapał to test jednostkowy, 2026-10-28.
  if (article.title) {
    const english = englishTitleWords(article.title);
    if (english.length > 0) {
      score -= 60;
      issues.push(`tytuł po angielsku (${english.length} słów: ${english.slice(0, 3).join(", ")})`);
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

  // writer.ts sprowadza kategorię do katalogu (fallback na kategorię
  // źródła), więc ta kara łapie wyłącznie regresję w tym mechanizmie.
  if (!isCategorySlug(article.category)) {
    score -= 10;
    issues.push(`nieznana kategoria: ${article.category}`);
  }

  return { score: Math.max(0, score), issues };
}

/** Liczba słów treści (markdown liczony jak tekst — wystarczające dla progów). */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

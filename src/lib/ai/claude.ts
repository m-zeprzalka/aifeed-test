import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude API (Anthropic, first-party) — generacja artykułów i okładek AI
 * (`images/claude-image.ts`, code execution). Od 2026-11-11 zamiast OpenRouter
 * (wyczerpane kredyty → 402 na każdym runie od 2026-11-01).
 *
 * Env: `ANTHROPIC_API_KEY` (wymagany), `CLAUDE_ARTICLE_MODEL` (opcjonalny —
 * zmiana modelu bez zmiany kodu, np. `claude-sonnet-5-5` przy cięciu kosztów).
 */

export const DEFAULT_ARTICLE_MODEL = "claude-opus-5-5";

export function articleModel(env: Record<string, string | undefined> = process.env): string {
  return env.CLAUDE_ARTICLE_MODEL?.trim() || DEFAULT_ARTICLE_MODEL;
}

/**
 * Modele, które przyjmują serwerowy `fallbacks: "default"` (beta
 * `server-side-fallback-2026-07-01`): gdy klasyfikator bezpieczeństwa odrzuci
 * żądanie (np. artykuł o ataku na model albo o broni biologicznej), API samo
 * ponawia je na modelu zastępczym w ramach tego samego wywołania. Starszym
 * modelom (np. `claude-sonnet-5`) parametru nie wysyłamy — odrzuciłyby żądanie.
 */
const SERVER_FALLBACK_MODELS: ReadonlySet<string> = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export function supportsServerFallback(model: string): boolean {
  return SERVER_FALLBACK_MODELS.has(model);
}

let client: Anthropic | null = null;

/** Leniwy singleton — instancja Fluid Compute reużywa połączeń między runami. */
export function claudeClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  // maxRetries: SDK sam ponawia 408/409/429/5xx i błędy połączenia (z backoffem)
  // przed rozpoczęciem strumienia; całość i tak ogranicza `signal` z terminem runu.
  client = new Anthropic({ apiKey, maxRetries: 2 });
  return client;
}

/**
 * Cennik $/MTok (platform.claude.com/pricing, stan 2026-11). API nie zwraca
 * kosztu — liczymy go z `usage`. Zapis do cache = 1,25 × input (TTL 5 min).
 * Model spoza tabeli → koszt nieznany (`undefined`), a nie zmyślone zero.
 */
const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
};

interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

function costOf(usage: TokenUsage, model: string): number | undefined {
  const price = PRICING[model];
  if (!price) return undefined;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  return (
    (usage.input_tokens * price.input +
      cacheWrite * price.input * 1.25 +
      cacheRead * price.cacheRead +
      usage.output_tokens * price.output) /
    1_000_000
  );
}

/**
 * Koszt odpowiedzi w USD. Przy serwerowym fallbacku `usage.iterations` ma
 * osobny wpis na każdy model, który pracował (także ten, który odmówił) —
 * każdy liczymy po jego cenie. Bez iteracji: całe `usage` po cenie modelu
 * z żądania.
 */
export function claudeCostUsd(
  usage: (TokenUsage & { iterations?: readonly (Partial<TokenUsage> & { type: string; model?: string | null })[] | null }) | null | undefined,
  requestModel: string
): number | undefined {
  if (!usage) return undefined;
  const iterations = usage.iterations?.filter((it) => it.type === "message" || it.type === "fallback_message");
  if (iterations && iterations.length > 0) {
    let total = 0;
    for (const it of iterations) {
      const cost = costOf(
        {
          input_tokens: it.input_tokens ?? 0,
          output_tokens: it.output_tokens ?? 0,
          cache_creation_input_tokens: it.cache_creation_input_tokens,
          cache_read_input_tokens: it.cache_read_input_tokens,
        },
        it.model || requestModel
      );
      if (cost === undefined) return undefined;
      total += cost;
    }
    return total;
  }
  return costOf(usage, requestModel);
}

/** Tekst odpowiedzi: wszystkie bloki `text` (bloki thinking/fallback pomijamy). */
export function responseText(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

/**
 * Odmowa klasyfikatora (`stop_reason: "refusal"`) — także po wyczerpaniu
 * łańcucha fallbacków. Pipeline traktuje ją jak odmowę AI: źródło oznacza jako
 * przetworzone (ponowienie dałoby tę samą odmowę i ten sam koszt).
 */
export class ArticleRefusalError extends Error {
  constructor(readonly category: string | null) {
    super(`Claude odmówił wygenerowania artykułu (kategoria: ${category ?? "brak"})`);
    this.name = "ArticleRefusalError";
  }
}

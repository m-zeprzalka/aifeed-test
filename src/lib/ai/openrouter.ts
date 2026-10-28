import { siteConfig } from "@/config/site";

/** Wspólne dla generatora artykułów (writer.ts) i miniatur (images/generator.ts). */
export const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export function openRouterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    // Atrybucja aplikacji w panelu OpenRouter.
    "HTTP-Referer": siteConfig.url,
    "X-Title": siteConfig.name,
  };
}

export interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  /** Koszt żądania w USD (Usage Accounting, `usage: { include: true }`). */
  cost?: number;
  /** Nazwa pola ze starszych wersji API — tylko fallback. */
  total_cost?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
}

/**
 * Koszt żądania w USD. OpenRouter zwraca go w `usage.cost` — kod czytał
 * `usage.total_cost`, którego API nie wysyła, więc telemetria (`ai_cost`)
 * i dashboard /admin pokazywały $0 dla każdego artykułu (produkcja do
 * 2026-10-28: 119/119 zdarzeń bez kosztu).
 */
export function openRouterCostUsd(usage: OpenRouterUsage | null | undefined): number | undefined {
  const cost = usage?.cost ?? usage?.total_cost;
  return typeof cost === "number" && Number.isFinite(cost) ? cost : undefined;
}

import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import {
  ArticleRefusalError,
  DEFAULT_ARTICLE_MODEL,
  articleModel,
  claudeCostUsd,
  responseText,
  supportsServerFallback,
} from "./claude";
import { isRetryable } from "./writer";

describe("articleModel", () => {
  it("domyślnie Opus 5.5, nadpisywalny przez CLAUDE_ARTICLE_MODEL", () => {
    expect(DEFAULT_ARTICLE_MODEL).toBe("claude-opus-5-5");
    expect(articleModel({})).toBe("claude-opus-5-5");
    expect(articleModel({ CLAUDE_ARTICLE_MODEL: " claude-sonnet-5-5 " })).toBe("claude-sonnet-5-5");
    expect(articleModel({ CLAUDE_ARTICLE_MODEL: "  " })).toBe("claude-opus-5-5");
  });

  it("serwerowy fallback tylko dla modeli, które go przyjmują", () => {
    expect(supportsServerFallback("claude-opus-5-5")).toBe(true);
    expect(supportsServerFallback("claude-sonnet-5-5")).toBe(true);
    expect(supportsServerFallback("claude-sonnet-5")).toBe(false);
  });
});

describe("claudeCostUsd", () => {
  it("liczy koszt z tokenów wg cennika modelu", () => {
    // Opus 5.5: $4 / $20 za MTok → 10k in + 3,5k out = 0,04 + 0,07.
    expect(claudeCostUsd({ input_tokens: 10_000, output_tokens: 3_500 }, "claude-opus-5-5")).toBeCloseTo(0.11, 6);
    // Sonnet 5.5: $2 / $10.
    expect(claudeCostUsd({ input_tokens: 10_000, output_tokens: 3_500 }, "claude-sonnet-5-5")).toBeCloseTo(0.055, 6);
  });

  it("uwzględnia zapis i odczyt cache", () => {
    const cost = claudeCostUsd(
      { input_tokens: 1_000, output_tokens: 0, cache_creation_input_tokens: 1_000, cache_read_input_tokens: 10_000 },
      "claude-opus-5-5"
    );
    // 1k × $4 + 1k × $5 (1,25×) + 10k × $0,20 = 0,004 + 0,005 + 0,002.
    expect(cost).toBeCloseTo(0.011, 6);
  });

  it("po fallbacku sumuje iteracje po cenie modelu, który pracował", () => {
    const cost = claudeCostUsd(
      {
        input_tokens: 20_000,
        output_tokens: 600,
        iterations: [
          // Odmowa po 100 tokenach na modelu z żądania (model null = model żądania).
          { type: "message", model: null, input_tokens: 10_000, output_tokens: 100 },
          { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 10_000, output_tokens: 500 },
        ],
      },
      "claude-opus-5-5"
    );
    // (10k × 4 + 100 × 20) + (10k × 5 + 500 × 25) = 42 000 + 62 500 → /1e6.
    expect(cost).toBeCloseTo(0.1045, 6);
  });

  it("model spoza cennika albo brak usage → koszt nieznany, nie zero", () => {
    expect(claudeCostUsd({ input_tokens: 1, output_tokens: 1 }, "claude-nowy-model")).toBeUndefined();
    expect(claudeCostUsd(null, "claude-opus-5-5")).toBeUndefined();
  });
});

describe("responseText", () => {
  it("skleja bloki text, pomija thinking i fallback", () => {
    expect(
      responseText([
        { type: "thinking", text: undefined },
        { type: "text", text: "Treść artykułu" },
        { type: "fallback" },
        { type: "text", text: "\n---META---\n{}" },
      ])
    ).toBe("Treść artykułu\n---META---\n{}");
    expect(responseText([])).toBe("");
  });
});

describe("isRetryable", () => {
  const apiError = (status: number) => Anthropic.APIError.generate(status, { error: { message: "x" } }, "x", new Headers());

  it("ponawia przejściowe: 429, 5xx/529, 408, sieć i zerwany strumień", () => {
    expect(isRetryable(apiError(429))).toBe(true);
    expect(isRetryable(apiError(500))).toBe(true);
    expect(isRetryable(apiError(529))).toBe(true);
    expect(isRetryable(apiError(408))).toBe(true);
    expect(isRetryable(new TypeError("terminated"))).toBe(true);
  });

  it("nie ponawia odmowy ani trwałych 4xx (klucz, środki, za długi prompt)", () => {
    expect(isRetryable(new ArticleRefusalError("cyber"))).toBe(false);
    expect(isRetryable(apiError(400))).toBe(false);
    expect(isRetryable(apiError(401))).toBe(false);
    expect(isRetryable(apiError(403))).toBe(false);
    expect(isRetryable(apiError(413))).toBe(false);
  });
});

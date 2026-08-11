import { describe, it, expect } from "vitest";
import { titleTokens, findRelatedItems, type ScrapedArticle } from "./parser";

function item(title: string, sourceName: string, url?: string): ScrapedArticle {
  return {
    title,
    description: "",
    url: url ?? `https://example.com/${encodeURIComponent(title)}`,
    sourceName,
    category: "modele-ai",
    publishedAt: new Date("2026-08-11T10:00:00Z"),
  };
}

describe("titleTokens", () => {
  it("keeps significant tokens, drops short words and stopwords", () => {
    const tokens = titleTokens("OpenAI says Brad Lightcap will leave after eight years");
    expect(tokens.has("openai")).toBe(true);
    expect(tokens.has("lightcap")).toBe(true);
    expect(tokens.has("says")).toBe(false); // stopword
    expect(tokens.has("will")).toBe(false); // stopword
    expect(tokens.has("after")).toBe(false); // stopword
  });

  it("handles Polish diacritics", () => {
    const tokens = titleTokens("Badacze złamali szyfrowanie procesów myślowych");
    expect(tokens.has("złamali")).toBe(true);
    expect(tokens.has("szyfrowanie")).toBe(true);
  });
});

describe("findRelatedItems", () => {
  const base = item("OpenAI COO Brad Lightcap departs company after eight years", "TechCrunch AI");

  it("finds the same story reported by a different outlet", () => {
    const pool = [
      item("Brad Lightcap leaves OpenAI to start something new", "The Verge AI"),
      item("Google releases Gemini 3.2 with video generation", "The Decoder"),
    ];
    const related = findRelatedItems(base, pool);
    expect(related).toHaveLength(1);
    expect(related[0].sourceName).toBe("The Verge AI");
  });

  it("does NOT match a different story that shares only the company name", () => {
    const pool = [
      item("OpenAI raises another seven billion in stock buyback", "VentureBeat AI"),
    ];
    expect(findRelatedItems(base, pool)).toHaveLength(0);
  });

  it("skips candidates from the same source", () => {
    const pool = [
      item("Brad Lightcap exits OpenAI after eight years, memo shows", "TechCrunch AI"),
    ];
    expect(findRelatedItems(base, pool)).toHaveLength(0);
  });

  it("respects the max limit and prefers higher overlap", () => {
    const pool = [
      item("Brad Lightcap leaves OpenAI", "The Verge AI"),
      item("OpenAI COO Brad Lightcap departs after eight years at company", "Wired AI"),
      item("Brad Lightcap departs OpenAI COO role", "Ars Technica"),
    ];
    const related = findRelatedItems(base, pool, 2);
    expect(related).toHaveLength(2);
    expect(related[0].sourceName).toBe("Wired AI"); // największe pokrycie tokenów
  });

  it("skips the base item itself when present in the pool", () => {
    expect(findRelatedItems(base, [base])).toHaveLength(0);
  });
});

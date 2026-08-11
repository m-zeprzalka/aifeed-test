import { describe, it, expect } from "vitest";
import { sanitizeInternalLinks } from "./internal-links";

const allowed = new Set(["gpt-5-premiera", "ai-act-wchodzi-w-zycie"]);

describe("sanitizeInternalLinks", () => {
  it("keeps a relative internal link with an allowed slug", () => {
    const input = "Więcej w tekście o [premierze GPT-5](/artykul/gpt-5-premiera).";
    expect(sanitizeInternalLinks(input, allowed)).toBe(input);
  });

  it("unwraps a relative internal link with an unknown slug", () => {
    const input = "Zobacz [zmyślony artykuł](/artykul/nie-istnieje).";
    expect(sanitizeInternalLinks(input, allowed)).toBe("Zobacz zmyślony artykuł.");
  });

  it("rewrites an absolute site URL to a relative link when the slug is allowed", () => {
    const input = "Pisaliśmy o [AI Act](https://www.aifeed.pl/artykul/ai-act-wchodzi-w-zycie).";
    expect(sanitizeInternalLinks(input, allowed)).toBe(
      "Pisaliśmy o [AI Act](/artykul/ai-act-wchodzi-w-zycie)."
    );
  });

  it("handles the apex domain the same as www", () => {
    const input = "[AI Act](https://aifeed.pl/artykul/ai-act-wchodzi-w-zycie)";
    expect(sanitizeInternalLinks(input, allowed)).toBe("[AI Act](/artykul/ai-act-wchodzi-w-zycie)");
  });

  it("unwraps an absolute site URL with an unknown slug", () => {
    const input = "Zobacz [stary tekst](https://www.aifeed.pl/artykul/halucynacja).";
    expect(sanitizeInternalLinks(input, allowed)).toBe("Zobacz stary tekst.");
  });

  it("unwraps absolute site URLs that are not article links", () => {
    const input = "Na [stronie głównej](https://www.aifeed.pl/) i w [kategorii](https://aifeed.pl/kategoria/biznes).";
    expect(sanitizeInternalLinks(input, allowed)).toBe("Na stronie głównej i w kategorii.");
  });

  it("unwraps other relative links (categories, invented paths)", () => {
    const input = "W [kategorii biznes](/kategoria/biznes) i na [stronie](/zmyslona-strona).";
    expect(sanitizeInternalLinks(input, allowed)).toBe("W kategorii biznes i na stronie.");
  });

  it("leaves external links untouched", () => {
    const input = "Jak podaje [TechCrunch](https://techcrunch.com/2026/08/11/openai/), model zadebiutował.";
    expect(sanitizeInternalLinks(input, allowed)).toBe(input);
  });

  it("leaves images untouched, including internal-looking ones", () => {
    const input = "![wykres](/artykul/nie-istnieje) oraz ![logo](https://cdn.example.com/a.png)";
    expect(sanitizeInternalLinks(input, allowed)).toBe(input);
  });

  it("leaves anchors and mailto untouched", () => {
    const input = "Skocz do [sekcji](#kluczowe-wnioski) lub [napisz](mailto:kontakt@aifeed.pl).";
    expect(sanitizeInternalLinks(input, allowed)).toBe(input);
  });

  it("strips query/hash and trailing slash from the slug before matching", () => {
    const input = "[GPT-5](/artykul/gpt-5-premiera/?utm=x#sekcja)";
    expect(sanitizeInternalLinks(input, allowed)).toBe("[GPT-5](/artykul/gpt-5-premiera)");
  });

  it("removes every internal link when the allowed set is empty", () => {
    const input = "Zobacz [tekst](/artykul/gpt-5-premiera) i [źródło](https://example.com/a).";
    expect(sanitizeInternalLinks(input, new Set())).toBe(
      "Zobacz tekst i [źródło](https://example.com/a)."
    );
  });

  it("handles multiple links in one paragraph independently", () => {
    const input =
      "O [GPT-5](/artykul/gpt-5-premiera), o [fałszywce](/artykul/fake) i o [AI Act](/artykul/ai-act-wchodzi-w-zycie).";
    expect(sanitizeInternalLinks(input, allowed)).toBe(
      "O [GPT-5](/artykul/gpt-5-premiera), o fałszywce i o [AI Act](/artykul/ai-act-wchodzi-w-zycie)."
    );
  });
});

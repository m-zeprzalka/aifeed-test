import { describe, it, expect } from "vitest";
import { escapeIlike, sanitizeTsQuery, pluralize } from "@/lib/search-utils";

describe("escapeIlike", () => {
  it("escapes % character", () => {
    expect(escapeIlike("100%")).toBe("100\\%");
  });

  it("escapes _ character", () => {
    expect(escapeIlike("foo_bar")).toBe("foo\\_bar");
  });

  it("escapes backslash", () => {
    expect(escapeIlike("path\\to")).toBe("path\\\\to");
  });

  it("escapes multiple special characters", () => {
    expect(escapeIlike("50%_off\\deal")).toBe("50\\%\\_off\\\\deal");
  });

  it("leaves normal text unchanged", () => {
    expect(escapeIlike("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(escapeIlike("")).toBe("");
  });

  it("handles Polish characters", () => {
    expect(escapeIlike("sztuczna inteligencja żółć")).toBe("sztuczna inteligencja żółć");
  });
});

describe("sanitizeTsQuery", () => {
  it("strips tsquery metacharacters", () => {
    expect(sanitizeTsQuery("gpt & claude | !bard")).toBe("gpt claude bard");
    expect(sanitizeTsQuery("foo:*(bar)")).toBe("foo bar");
  });

  it("keeps Polish diacritics and digits", () => {
    expect(sanitizeTsQuery("Żółć GPT-5")).toBe("żółć gpt 5");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeTsQuery("  open   ai  ")).toBe("open ai");
  });

  it("returns empty string for punctuation-only input", () => {
    expect(sanitizeTsQuery("&|!()")).toBe("");
  });
});

describe("pluralize (search results)", () => {
  it("returns singular for 1", () => {
    expect(pluralize(1)).toBe("wynik");
  });

  it("returns nominative plural for 2-4", () => {
    expect(pluralize(2)).toBe("wyniki");
    expect(pluralize(3)).toBe("wyniki");
    expect(pluralize(4)).toBe("wyniki");
  });

  it("returns genitive plural for 0 and 5+", () => {
    expect(pluralize(0)).toBe("wyników");
    expect(pluralize(5)).toBe("wyników");
    expect(pluralize(10)).toBe("wyników");
    expect(pluralize(100)).toBe("wyników");
  });

  it("uses paucal form for unit digits 2-4 above 20, but not for teens", () => {
    expect(pluralize(22)).toBe("wyniki");
    expect(pluralize(34)).toBe("wyniki");
    expect(pluralize(12)).toBe("wyników");
    expect(pluralize(14)).toBe("wyników");
    expect(pluralize(25)).toBe("wyników");
  });

  it("accepts custom noun forms", () => {
    const forms = ["artykuł", "artykuły", "artykułów"] as const;
    expect(pluralize(1, forms)).toBe("artykuł");
    expect(pluralize(3, forms)).toBe("artykuły");
    expect(pluralize(12, forms)).toBe("artykułów");
    expect(pluralize(23, forms)).toBe("artykuły");
  });
});

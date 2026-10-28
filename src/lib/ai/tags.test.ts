import { describe, it, expect } from "vitest";
import { normalizeTagCandidates, selectTags, tagSlug } from "./tags";

describe("tagSlug", () => {
  it("transliteruje polskie znaki i normalizuje separatory", () => {
    expect(tagSlug("Bezpieczeństwo AI")).toBe("bezpieczenstwo-ai");
    expect(tagSlug("GPT-5")).toBe("gpt-5");
    expect(tagSlug("GPT 5")).toBe("gpt-5");
  });
});

describe("normalizeTagCandidates", () => {
  it("deduplikuje warianty pisowni po slugu (pierwszy wygrywa)", () => {
    expect(normalizeTagCandidates(["GPT-5", "gpt 5", "OpenAI"])).toEqual([
      { name: "GPT-5", slug: "gpt-5" },
      { name: "OpenAI", slug: "openai" },
    ]);
  });

  it("odrzuca puste, nie-stringi i zdania zamiast encji", () => {
    expect(
      normalizeTagCandidates(["  ", 42, null, "#Claude", "to jest bardzo długi tag który opisuje cały artykuł zamiast encji"])
    ).toEqual([{ name: "Claude", slug: "claude" }]);
  });

  it("toleruje brak tablicy w odpowiedzi AI", () => {
    expect(normalizeTagCandidates(undefined)).toEqual([]);
    expect(normalizeTagCandidates("OpenAI")).toEqual([]);
  });
});

describe("selectTags", () => {
  const catalog = new Set(["openai", "claude", "agenci-ai"]);
  const existing = new Map([
    ["openai", { id: "t-openai" }],
    ["claude", { id: "t-claude" }],
    ["agenci-ai", { id: "t-agenci" }],
    ["legora", { id: "t-legora" }], // w bazie, ale spoza top-100
  ]);

  it("katalog → istniejące w bazie → maks. 1 nowy", () => {
    const result = selectTags(
      normalizeTagCandidates(["Legora", "OpenAI", "Nowy Model X", "Inna Nowość", "agenci AI"]),
      catalog,
      existing
    );
    expect(result.existing.map((t) => t.id)).toEqual(["t-openai", "t-agenci", "t-legora"]);
    expect(result.create).toEqual([{ name: "Nowy Model X", slug: "nowy-model-x" }]);
    expect(result.dropped).toEqual(["Inna Nowość"]);
  });

  it("istniejący tag linkuje po id — nazwa z AI go nie przemianowuje", () => {
    const result = selectTags(normalizeTagCandidates(["openai"]), catalog, existing);
    expect(result.existing).toEqual([{ id: "t-openai", slug: "openai" }]);
    expect(result.create).toEqual([]);
  });

  it("łącznie maks. 5 tagów — nowy wchodzi tylko, gdy jest miejsce", () => {
    const many = new Map(
      ["a1", "a2", "a3", "a4", "a5", "a6"].map((s) => [s, { id: `t-${s}` }] as const)
    );
    const result = selectTags(
      normalizeTagCandidates(["a1", "a2", "a3", "a4", "a5", "a6", "Zupełnie Nowy"]),
      new Set(),
      many
    );
    expect(result.existing).toHaveLength(5);
    expect(result.create).toEqual([]);
    expect(result.dropped).toEqual(["Zupełnie Nowy"]);
  });
});

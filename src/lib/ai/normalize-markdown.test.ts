import { describe, it, expect } from "vitest";
import { normalizeCategory, normalizeMarkdown } from "./writer";

describe("normalizeMarkdown", () => {
  it("splits long inline-merged lists", () => {
    const input = "## Kluczowe wnioski\n- AI dramatycznie zmienia branżę mediów - Firmy inwestują miliardy w nowe modele - Etyczne wyzwania rosną szybciej niż regulacje\n\nDalszy tekst.";
    const out = normalizeMarkdown(input);
    expect(out).toContain("- AI dramatycznie zmienia branżę mediów\n- Firmy inwestują miliardy w nowe modele\n- Etyczne wyzwania rosną szybciej niż regulacje");
  });

  it("leaves well-formed lists untouched", () => {
    const input = "## Sekcja\n\n- Pierwszy punkt z konkretem\n- Drugi punkt z liczbą\n- Trzeci punkt\n\nDalej.";
    expect(normalizeMarkdown(input)).toBe(input);
  });

  it("does not split single bullet line with no inline markers", () => {
    const input = "- Pierwszy punkt o czymś istotnym";
    expect(normalizeMarkdown(input)).toBe("- Pierwszy punkt o czymś istotnym");
  });

  it("inserts blank line before heading", () => {
    const input = "Koniec akapitu.\n## Następna sekcja\nTekst.";
    const out = normalizeMarkdown(input);
    expect(out).toContain("Koniec akapitu.\n\n## Następna sekcja");
    expect(out).toContain("## Następna sekcja\n\nTekst.");
  });

  it("normalizes asterisk and bullet-char list markers to dash", () => {
    const input = "## S\n\n* Punkt A\n• Punkt B\n* Punkt C\n\nEnd.";
    const out = normalizeMarkdown(input);
    expect(out).toMatch(/^- Punkt A$/m);
    expect(out).toMatch(/^- Punkt B$/m);
    expect(out).toMatch(/^- Punkt C$/m);
    expect(out).not.toContain("*");
    expect(out).not.toContain("•");
  });

  it("collapses 3+ blank lines to one", () => {
    const input = "Paragraf 1.\n\n\n\nParagraf 2.";
    expect(normalizeMarkdown(input)).toBe("Paragraf 1.\n\nParagraf 2.");
  });
});

describe("normalizeCategory", () => {
  it("przepuszcza slug z katalogu (także z innym zapisem)", () => {
    expect(normalizeCategory("biznes", "modele-ai")).toEqual({ category: "biznes", valid: true });
    expect(normalizeCategory("  Etyka ", "modele-ai")).toEqual({ category: "etyka", valid: true });
    // Nazwa wyświetlana zamiast sluga (recenzja 2026-10-28).
    expect(normalizeCategory("Modele AI", "biznes")).toEqual({ category: "modele-ai", valid: true });
    expect(normalizeCategory("Badania i Nauka", "biznes")).toEqual({ category: "badania", valid: true });
    expect(normalizeCategory("Narzędzia i Aplikacje", "biznes")).toEqual({ category: "narzedzia", valid: true });
  });

  it("kategoria spoza katalogu → fallback ze źródła RSS (nie NULL w bazie)", () => {
    expect(normalizeCategory("edukacja", "badania")).toEqual({ category: "badania", valid: false });
    expect(normalizeCategory(undefined, "narzedzia")).toEqual({ category: "narzedzia", valid: false });
    expect(normalizeCategory(42, "biznes")).toEqual({ category: "biznes", valid: false });
  });
});

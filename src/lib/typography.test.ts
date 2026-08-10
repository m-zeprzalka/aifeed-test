import { describe, it, expect } from "vitest";
import { polishTypography } from "./typography";

const NBSP = " ";

describe("polishTypography", () => {
  it("inserts NBSP after one-letter prepositions", () => {
    expect(polishTypography("Idziemy w lesie z psem")).toBe(
      `Idziemy w${NBSP}lesie z${NBSP}psem`
    );
  });

  it("does not touch one-letter prepositions inside words", () => {
    expect(polishTypography("fortuna")).toBe("fortuna");
  });

  it("never collapses newlines when applying NBSP rules", () => {
    const input = "Punkt A\n- Punkt B";
    expect(polishTypography(input)).toBe(input);
  });

  it("inserts NBSP between number and unit", () => {
    expect(polishTypography("10 km, 20 zł, 50 %")).toBe(
      `10${NBSP}km, 20${NBSP}zł, 50${NBSP}%`
    );
  });

  it("inserts NBSP before year abbreviation r.", () => {
    expect(polishTypography("20 kwietnia 2026 r. nastąpi premiera")).toBe(
      `20 kwietnia 2026${NBSP}r. nastąpi premiera`
    );
  });

  it("converts numeric ranges to en-dash", () => {
    expect(polishTypography("Lata 2024-2026 były przełomowe")).toBe(
      "Lata 2024–2026 były przełomowe"
    );
  });

  it("converts spaced hyphen between words to em-dash", () => {
    expect(polishTypography("AiFeed - codzienne wiadomości")).toBe(
      "AiFeed — codzienne wiadomości"
    );
  });

  it("converts straight quotes to Polish typographic quotes", () => {
    expect(polishTypography('Powiedział: "to ważne".')).toBe(
      `Powiedział: „to ważne”.`
    );
  });

  it("preserves code blocks verbatim", () => {
    const input = '```ts\nconst x = "test"\n```\nText "tutaj".';
    const out = polishTypography(input);
    expect(out).toContain('```ts\nconst x = "test"\n```');
    expect(out).toContain("„");
    expect(out).toContain("”");
  });

  it("preserves inline code", () => {
    expect(polishTypography("Użyj `npm test` w terminalu")).toBe(
      `Użyj \`npm test\` w${NBSP}terminalu`
    );
  });

  it("does not break covid-19 style identifiers", () => {
    expect(polishTypography("covid-19 affected industries")).toBe(
      "covid-19 affected industries"
    );
  });

  it("is idempotent on already-formatted text", () => {
    const formatted = `5${NBSP}km`;
    expect(polishTypography(formatted)).toBe(formatted);
  });

  it("never rewrites digits inside markdown link destinations", () => {
    const input = "Zobacz [raport 10-15](https://site.com/2024-01-15/report) dziś";
    expect(polishTypography(input)).toBe(
      "Zobacz [raport 10–15](https://site.com/2024-01-15/report) dziś"
    );
  });

  it("never rewrites digits inside bare URLs", () => {
    const input = "Źródło: https://example.com/2023-12-01 oraz tekst 1-2";
    expect(polishTypography(input)).toBe(
      "Źródło: https://example.com/2023-12-01 oraz tekst 1–2"
    );
  });
});

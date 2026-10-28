import { describe, it, expect } from "vitest";
import { normalizeThumbnailUrl } from "./thumbnail-url";

describe("normalizeThumbnailUrl", () => {
  it("dekoduje &amp; z historycznych rekordów", () => {
    expect(
      normalizeThumbnailUrl("https://platform.theverge.com/x.jpg?quality=90&amp;strip=all&amp;w=1200")
    ).toBe("https://platform.theverge.com/x.jpg?quality=90&strip=all&w=1200");
  });

  it("logo serwisu źródłowego zostaje (decyzja właściciela)", () => {
    const arxiv = "https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png";
    expect(normalizeThumbnailUrl(arxiv)).toBe(arxiv);
  });

  it("brak URL-a → null (UI: placeholder, OG: karta marki)", () => {
    expect(normalizeThumbnailUrl(null)).toBeNull();
    expect(normalizeThumbnailUrl("")).toBeNull();
  });
});

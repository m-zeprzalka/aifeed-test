import { describe, it, expect } from "vitest";
import { decodeHtmlEntities } from "./html-entities";

describe("decodeHtmlEntities", () => {
  it("dekoduje encje szesnastkowe, dziesiętne i nazwane", () => {
    expect(decodeHtmlEntities("Spider&#x27;s Web")).toBe("Spider's Web");
    expect(decodeHtmlEntities("A&#8211;B&#8230;")).toBe("A–B…");
    expect(decodeHtmlEntities("&bdquo;Cytat&rdquo; &mdash; &copy;")).toBe("„Cytat” — ©");
  });

  it("dekoduje &amp; w URL-ach (parametry CDN)", () => {
    expect(decodeHtmlEntities("https://x.com/a.jpg?quality=90&amp;strip=all")).toBe("https://x.com/a.jpg?quality=90&strip=all");
  });

  it("nie dekoduje podwójnie (&amp;lt; to dosłowny tekst „&lt;”)", () => {
    expect(decodeHtmlEntities("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
    expect(decodeHtmlEntities("&amp;#39;")).toBe("&#39;");
    expect(decodeHtmlEntities("&#38;lt;")).toBe("&lt;");
    expect(decodeHtmlEntities("&#x26;amp;")).toBe("&amp;");
  });

  it("zostawia nieznane i wadliwe encje bez zmian", () => {
    expect(decodeHtmlEntities("&nieznana; &#0; &#xD800; &#99999999;")).toBe("&nieznana; &#0; &#xD800; &#99999999;");
  });
});

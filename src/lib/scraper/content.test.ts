import { describe, it, expect } from "vitest";
import { extractArticleText, extractOgMeta } from "./content";

const base = new URL("https://spidersweb.pl/2026/10/artykul.html");

describe("extractOgMeta", () => {
  it("czyta og:image i og:site_name niezależnie od kolejności atrybutów, dekodując encje", () => {
    const html = `<head>
      <meta content="Spider&#x27;s Web" property="og:site_name">
      <meta property='og:image' content='https://cdn.example.com/img.jpg?w=1200&amp;crop=1'>
    </head>`;
    expect(extractOgMeta(html, base)).toEqual({
      ogImage: "https://cdn.example.com/img.jpg?w=1200&crop=1",
      siteName: "Spider's Web",
    });
  });

  it("rozwiązuje względne og:image względem URL-a strony", () => {
    const html = `<meta property="og:image" content="/wp-content/uploads/foto.png">`;
    expect(extractOgMeta(html, base).ogImage).toBe("https://spidersweb.pl/wp-content/uploads/foto.png");
  });

  it("preferuje og:image:secure_url, a bez og:image bierze twitter:image (name=)", () => {
    expect(
      extractOgMeta(
        `<meta property="og:image" content="http://a.example.com/x.jpg"><meta property="og:image:secure_url" content="https://a.example.com/x.jpg">`,
        base
      ).ogImage
    ).toBe("https://a.example.com/x.jpg");
    expect(extractOgMeta(`<meta name="twitter:image" content="https://b.example.com/t.jpg">`, base).ogImage).toBe(
      "https://b.example.com/t.jpg"
    );
  });

  it("odrzuca og:image wskazujące na hosty wewnętrzne (SSRF)", () => {
    const html = `<meta property="og:image" content="http://169.254.169.254/latest/meta-data">`;
    expect(extractOgMeta(html, base).ogImage).toBeNull();
    expect(extractOgMeta(`<meta property="og:image" content="javascript:alert(1)">`, base).ogImage).toBeNull();
  });

  it("brak metadanych → null", () => {
    expect(extractOgMeta("<html><head></head></html>", base)).toEqual({ ogImage: null, siteName: null });
  });
});

describe("extractArticleText", () => {
  const paragraph = "Organizowane co roku w Warszawie targi to okazja do obejrzenia sprzętu i rozmów z twórcami. ";

  it("wyciąga treść z <article>, pomija nawigację, skrypty i stopkę", () => {
    const html = `<body><nav>MENU</nav><script>var x=1;</script>
      <article><h2>Nagłówek</h2><p>${paragraph.repeat(3)}</p><footer>STOPKA</footer></article></body>`;
    const { text, failure } = extractArticleText(html);
    expect(failure).toBeNull();
    expect(text).toContain("Nagłówek");
    expect(text).toContain("Organizowane co roku");
    expect(text).not.toMatch(/MENU|STOPKA|var x/);
  });

  it("dekoduje encje numeryczne i nazwane", () => {
    const html = `<article><p>${paragraph.repeat(2)} Cytat: &bdquo;AI&rdquo; &#8211; to&nbsp;przełom&hellip; R&amp;D &#x27;26</p></article>`;
    const { text } = extractArticleText(html);
    expect(text).toContain("Cytat: „AI” – to przełom… R&D '26");
  });

  it("przycina do budżetu znaków z markerem", () => {
    const html = `<article><p>${paragraph.repeat(50)}</p></article>`;
    const { text } = extractArticleText(html, 500);
    expect(text.length).toBeLessThanOrEqual(500 + "\n\n[treść skrócona]".length);
    expect(text.endsWith("[treść skrócona]")).toBe(true);
  });

  it("zwraca przyczynę zamiast treści dla zbyt krótkiej strony i PDF-a", () => {
    expect(extractArticleText("<article><p>Za mało.</p></article>")).toEqual({ text: "", failure: "too-short:8" });
    expect(extractArticleText("%PDF-1.7 binary")).toEqual({ text: "", failure: "binary-pdf" });
  });
});

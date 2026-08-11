export const siteConfig = {
  name: "AiFeed",
  description:
    "Twoje codzienne źródło wiadomości o sztucznej inteligencji, badaniach naukowych i nowościach z branży technologicznej.",
  // Fallback MUSI być wariantem `www` (to on serwuje ruch produkcyjny —
  // apex 301-uje na www). Zły fallback = canonicale wskazujące na redirect
  // w każdym środowisku bez ustawionej zmiennej. Trailing slash zdejmowany,
  // bo wszystkie URL-e budujemy przez konkatenację `${url}/sciezka`.
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://www.aifeed.pl").replace(/\/+$/, ""),
  // Empty until real social profiles exist. Once founded, fill in and they
  // automatically populate JSON-LD `Organization.sameAs` and the `via=`
  // parameter on Twitter/X share intents.
  links: {
    twitter: "",
    github: "",
  },
  // Deep link „Preferred Sources" Google (format udokumentowany w Search
  // Central: google.com/preferences/source?q=<domena>; tylko poziom domeny).
  // Użytkownicy z dodanym źródłem klikają ~2× częściej (dane Google, 2026).
  // Domena celowo hardcoded na produkcyjną — feature ma sens tylko tam.
  preferredSourcesUrl: "https://www.google.com/preferences/source?q=aifeed.pl",
  // Autor i twórca serwisu (decyzja właściciela 2026-08-11: serwis firmowany
  // nazwiskiem — filar 1 SEO / E-E-A-T). Zasila Person JSON-LD (/redakcja,
  // NewsArticle.author, founder w NewsMediaOrganization) i byline artykułów.
  // `sameAs` tylko zweryfikowane, istniejące profile — bez wydmuszek.
  author: {
    name: "Michał Zeprzałka",
    url: "https://www.zeprzalka.com",
    sameAs: [
      "https://www.zeprzalka.com",
      "https://github.com/m-zeprzalka",
      "https://www.facebook.com/michalzeprzalka",
    ],
  },
  categories: [
    { name: "Modele AI", slug: "modele-ai", color: "#6366f1", description: "Premiery, aktualizacje i porównania modeli AI" },
    { name: "Badania i Nauka", slug: "badania", color: "#8b5cf6", description: "Przełomowe badania naukowe i odkrycia w dziedzinie AI" },
    { name: "Biznes i Rynek", slug: "biznes", color: "#06b6d4", description: "AI w biznesie, startupy, inwestycje i rynek technologiczny" },
    { name: "Etyka i Bezpieczeństwo", slug: "etyka", color: "#f59e0b", description: "Regulacje, etyka AI, alignment i bezpieczeństwo systemów AI" },
    { name: "Narzędzia i Aplikacje", slug: "narzedzia", color: "#10b981", description: "Nowe narzędzia, aplikacje i platformy wykorzystujące AI" },
    { name: "Poradniki", slug: "poradniki", color: "#ec4899", description: "Praktyczne tutoriale, przewodniki i porady dotyczące AI" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;

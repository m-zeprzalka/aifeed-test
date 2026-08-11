import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { Header } from "@/components/layout/header";
import { NewsTicker } from "@/components/layout/news-ticker";
import { Footer } from "@/components/layout/footer";
import { ScrollToTop } from "@/components/layout/scroll-to-top";
import { CategoryBar } from "@/components/articles/category-bar";
import { ThemeProvider } from "@/components/theme-provider";
import { siteConfig } from "@/config/site";
import { getCategories, getTickerArticles } from "@/lib/data";
import { jsonLdScript } from "@/lib/jsonld";
import { cn } from "@/lib/utils";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// `latin-ext` adds Polish diacritics (ą, ę, ł, ó, ś, ź, ż). Without it the
// browser silently falls back to a system font for those glyphs, which produces
// inconsistent kerning and weights — easy to miss until a designer notices.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const fontHeading = Plus_Jakarta_Sans({
  variable: "--font-heading",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — Serwis z najnowszymi informacjami o AI`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.name,
  // Redakcja jako całość, nie osoba — `<meta name="author">` dziedziczy na
  // wszystkie strony (w tym artykuły), a nazwisko firmuje serwis (/redakcja,
  // `founder` niżej), nie pojedyncze teksty (decyzja właściciela 2026-08-11).
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  category: "technology",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  // `openGraph.images` and `twitter.images` are intentionally NOT set here.
  // The file-convention route at `app/opengraph-image.tsx` automatically
  // populates both for the root and is inherited by every nested route that
  // doesn't define its own opengraph-image. Setting them manually would
  // duplicate (or override and lose the alt/size/contentType from the file
  // convention). Per-route SEO (kategoria/tag/artykuł/static) follows the
  // same pattern via the helpers in `src/lib/seo.ts`.
  openGraph: {
    type: "website",
    locale: "pl_PL",
    // Relative URL — `metadataBase` (above) prefixes it to the absolute origin.
    // Lets us swap domains in env without touching this file.
    url: "/",
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
  },
  alternates: {
    types: {
      "application/rss+xml": [{ url: "/feed.xml", title: `${siteConfig.name} — RSS` }],
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

// Next.js 13+ separates viewport metadata from `metadata`. Mobile browser
// chrome (Safari URL bar, Android task switcher) follows `theme-color`. Two
// values keyed by `prefers-color-scheme` so the bar matches the user's actual
// rendered theme rather than a single neutral colour. Manual <meta> tags in
// <head> are not needed — Next emits these automatically from this export.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1d2e" },
  ],
};

// Origin Supabase Storage pobrany z env. `null` gdy brak zmiennej (lokalny
// dev bez supabase) — preconnect jest wtedy pomijany w <head> niżej.
const supabaseOrigin = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
})();

// Module-level constant — derived purely from `siteConfig`, no per-request
// state. `sameAs` is intentionally omitted: it should only list verified,
// owned social profiles (none yet). Pointing schema.org at 404s damages
// structured-data trust signals — Google flags it.
//
// `NewsMediaOrganization` (podklasa Organization) + linki do polityk
// redakcyjnych — sygnały E-E-A-T dla wydawcy newsowego. Kotwice wskazują
// realne sekcje na /o-serwisie (strona transparentności); jeśli zmieniasz
// tam `id`, zaktualizuj też te URL-e.
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "NewsMediaOrganization",
  name: siteConfig.name,
  url: siteConfig.url,
  logo: `${siteConfig.url}/icon-512.png`,
  description: siteConfig.description,
  publishingPrinciples: `${siteConfig.url}/o-serwisie#jak-powstaja-teksty`,
  correctionsPolicy: `${siteConfig.url}/o-serwisie#zglos-blad`,
  actionableFeedbackPolicy: `${siteConfig.url}/o-serwisie#zglos-blad`,
  // Imienny założyciel (decyzja 2026-08-11) — ta sama encja co Person na
  // /redakcja i author w NewsArticle. Spójność encji > liczba pól.
  founder: {
    "@type": "Person",
    name: siteConfig.author.name,
    url: `${siteConfig.url}/redakcja`,
    sameAs: siteConfig.author.sameAs,
  },
} as const;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [tickerItems, categories] = await Promise.all([
    // 20 unikatów — marquee renderuje pojedynczy DOM (bez duplikacji), więc
    // im więcej items, tym dłuższy cykl. Ale każdy item to dodatkowy <Link>
    // w SSR HTML i w bundlu wysyłanym do klienta, stąd cap na 20.
    getTickerArticles(20),
    getCategories(),
  ]);

  return (
    <html
      lang="pl"
      className={cn(inter.variable, fontHeading.variable, fontMono.variable, "antialiased")}
      suppressHydrationWarning
    >
      <head>
        {/* Preconnect to Supabase Storage — every article hero image hits this
            host. Saves DNS + TLS handshake on the LCP image. Host pobierany
            z `NEXT_PUBLIC_SUPABASE_URL` (nigdy nie hardcoded — zob. P0-1
            w AUDIT.md). Bez zmiennej preconnect jest pomijany. preconnect
            alone wystarczy w nowoczesnych przeglądarkach (Chrome/Firefox/
            Safari/Edge od ~2017); dns-prefetch fallback ze starszych poradników
            jest dziś zbędny. */}
        {supabaseOrigin && <link rel="preconnect" href={supabaseOrigin} />}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(ORGANIZATION_JSON_LD) }}
        />
      </head>
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        {/* shadcn-style ThemeProvider over next-themes. `attribute="class"`
            adds/removes the `.dark` class on <html>; `defaultTheme="system"`
            respects OS preference until the user toggles; `enableSystem`
            allows the explicit "system" choice; `disableTransitionOnChange`
            prevents jarring color transitions during theme switch. The
            provider injects its own no-FOUC script — no inline script needed.

            All app components live inside it so any descendant can use the
            `useTheme()` hook. Telemetry sits outside so it doesn't depend on
            theme context. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-background"
          >
            Przejdź do treści
          </a>
          <NewsTicker items={tickerItems} />
          <Header />
          <CategoryBar categories={categories} />
          <main id="main-content" className="flex-1">{children}</main>
          <Footer />
          <ScrollToTop />
        </ThemeProvider>
        {/* GA renderowane wyłącznie gdy `NEXT_PUBLIC_GA_ID` jest ustawione
            (Production na Vercelu). Preview/Development env tej zmiennej nie
            mają, więc dev/preview NIE wysyła eventów do produkcyjnego property
            — czyste raporty SEO bez zafałszowania przez testy lokalne. */}
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        )}
        <Analytics />
      </body>
    </html>
  );
}

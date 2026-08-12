import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import type { Article, Category, Tag } from "@/types/database";

/**
 * Centralny helper SEO. Każda funkcja zwraca obiekt `Metadata` gotowy do
 * eksportu z page.tsx. Cała wiedza o brandingowych defaultach (locale,
 * siteName, twitter card type, robots dla 404) jest w tym jednym miejscu —
 * page.tsx-y dostarczają tylko dane dynamiczne (tytuł kategorii, treść
 * artykułu, etc.).
 *
 * Założenia:
 * - `title` ZAWSZE bez sufixu " — AiFeed" / " | AiFeed". Template z root
 *   layoutu (`%s | AiFeed`) sam dokleja brand. Tytuł `"AiFeed"` na child
 *   page produkuje "AiFeed | AiFeed" (duplikacja); pomijamy.
 * - `images` NIE jest ustawiane — file-convention `app/opengraph-image.tsx`
 *   (i jego per-route nadpisania) dziedziczone do nested routes.
 * - `canonical` zawsze relatywny — `metadataBase` w root layoucie prefiksuje
 *   absolutny URL.
 * - `description` ucinane do ~160 znaków na poziomie HTML preview limitu
 *   Google. Funkcja `clampDescription` rozcina po słowie, nie w pół wyrazu.
 */

const DESC_MAX = 160;

function clampDescription(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed.length <= DESC_MAX) return trimmed;
  // Cut at last word boundary before the limit, leave room for ellipsis.
  const slice = trimmed.slice(0, DESC_MAX - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > DESC_MAX * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}

interface BasePageMetadataInput {
  title: string;
  description: string;
  path: string;                 // Bez domeny, np. "/kategoria/badania"
  ogType?: "website" | "article";
  /** Robots noindex+nofollow — używaj dla nieznalezionych zasobów */
  noindex?: boolean;
  /**
   * Konkretny social-share image dla tej strony. Gdy ustawiony, nadpisuje
   * dziedziczony default z `app/opengraph-image.tsx` w `og:image`/`twitter:image`.
   * Dla artykułów: przekazujemy `article.thumbnail_url`. Brak image → strona
   * dziedziczy default brand card z root.
   */
  image?: { url: string; alt?: string };
}

interface ArticlePageMetadataInput extends BasePageMetadataInput {
  ogType: "article";
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
}

/**
 * RSS auto-discovery — `<link rel="alternate" type="application/rss+xml">` w
 * <head>. Musi być w KAŻDYM `alternates` na każdej stronie. Powód: Next.js
 * robi shallow merge metadanych — gdy child ustawia `alternates: { canonical }`,
 * całe `alternates` z root layoutu jest zastępowane (a nie głęboko mergowane).
 * Ustawiając tu jako stałą część `buildPageMetadata`, każda strona zachowuje
 * RSS discovery niezależnie od własnego canonicala.
 */
const RSS_ALTERNATE = {
  "application/rss+xml": [{ url: "/feed.xml", title: `${siteConfig.name} — RSS` }],
};

/**
 * Główny builder. Wrappery niżej przekazują tu wartości specyficzne dla typu
 * strony i nic poza tym.
 */
export function buildPageMetadata(
  input: BasePageMetadataInput | ArticlePageMetadataInput
): Metadata {
  const description = clampDescription(input.description);
  const ogType = input.ogType ?? "website";
  const isArticle = ogType === "article";

  // Każda strona dostaje `og:image`/`twitter:image`. Custom image (np. artykuł
  // z `thumbnail_url`) → konkretne zdjęcie z artykułu. Brak → fallback na
  // `/opengraph-image` (file-convention route generujący default brand card,
  // 1200×630 PNG z gradientem + nazwą serwisu).
  //
  // Ten fallback MUSI być ustawiany ręcznie. Powód: gdy strona ustawia własny
  // `metadata.openGraph` (jak my przez seo.ts), Next.js robi shallow merge i
  // NIE dokleja automatycznie `images` z file-convention `app/opengraph-image.tsx`.
  // Bez tego defaultu strony bez własnego image (home/kategoria/tag/static) nie
  // miałyby żadnego OG preview na social media.
  const fallbackImage = { url: "/opengraph-image", alt: siteConfig.name };
  const chosen = input.image ?? fallbackImage;
  const imageObject = [{
    url: chosen.url,
    width: 1200,
    height: 630,
    alt: chosen.alt ?? input.title,
  }];

  return {
    title: input.title,
    description,
    alternates: {
      canonical: input.path,
      types: RSS_ALTERNATE,
    },
    openGraph: {
      type: ogType,
      locale: "pl_PL",
      url: `${siteConfig.url}${input.path}`,
      title: input.title,
      description,
      siteName: siteConfig.name,
      images: imageObject,
      // Article-specific OG fields. TypeScript narrows by `type`.
      // `article:author` = serwis, nie osoba — spójnie z author:Organization
      // w NewsArticle JSON-LD (nazwisko firmuje serwis, nie artykuły).
      ...(isArticle && {
        publishedTime: (input as ArticlePageMetadataInput).publishedTime,
        modifiedTime: (input as ArticlePageMetadataInput).modifiedTime,
        authors: [siteConfig.url],
        section: (input as ArticlePageMetadataInput).section,
        tags: (input as ArticlePageMetadataInput).tags,
      }),
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description,
      images: [chosen.url],
    },
    ...(input.noindex && {
      robots: { index: false, follow: false },
    }),
  };
}

// ===================== WRAPPERY DLA KAŻDEGO TYPU STRONY =====================

/**
 * Strona główna. `title.absolute` w wywołaniu page.tsx omija template
 * (uniknięcie "AiFeed | AiFeed"). Tu zwracamy zwykły metadata bez tytułu —
 * page.tsx ustawi go wprost przez `title.absolute`.
 */
export function homeMetadata(): Metadata {
  // Home używa `buildPageMetadata` jak wszystkie inne strony — różnica tylko
  // w `title.absolute` (omija template `%s | AiFeed`). Dzięki temu home
  // dziedziczy fallback OG image (default brand card) przez ten sam helper.
  const base = buildPageMetadata({
    title: siteConfig.name,
    description: siteConfig.description,
    path: "/",
    ogType: "website",
  });

  return {
    ...base,
    title: {
      absolute: `${siteConfig.name} — Serwis z najnowszymi informacjami o AI`,
    },
  };
}

export function categoryMetadata(category: Category, page = 1): Metadata {
  // Pagination canonical: page 1 → /kategoria/slug, page N → ?page=N. Każda
  // strona ma własny canonical (Google 2024 — zamiast rel=prev/next).
  const path = page > 1 ? `/kategoria/${category.slug}?page=${page}` : `/kategoria/${category.slug}`;
  const baseDescription = category.description
    ? `${category.description} Najnowsze artykuły z kategorii ${category.name} na ${siteConfig.name}.`
    : `Najnowsze artykuły z kategorii ${category.name} — wiadomości i analizy AI na ${siteConfig.name}.`;

  return buildPageMetadata({
    title: page > 1 ? `${category.name} — strona ${page}` : category.name,
    description: baseDescription,
    path,
    ogType: "website",
  });
}

/**
 * Strony tagów są `noindex, follow`. Katalog tagów tworzy pipeline AI i jest
 * silnie rozdrobniony (w produkcji ~73% tagów ma dokładnie 1 artykuł) — to
 * tysiące thin-content URL-i, które liczebnie przygniatają realne artykuły
 * i wyglądają dla Google jak scaled content abuse. `follow: true` zachowuje
 * tagi jako ścieżki crawlowania do artykułów; z sitemapy są usunięte.
 * Odwrót (przywrócenie indeksacji) ma sens dopiero po skonsolidowaniu
 * katalogu tagów i dodaniu na nie realnej treści.
 */
export function tagMetadata(tag: Tag, page = 1): Metadata {
  // Paginacja jak w `categoryMetadata`: każda strona z własnym canonicalem
  // (?page=N) i tytułem — mimo noindex utrzymujemy poprawne sygnały.
  const path = page > 1 ? `/tag/${tag.slug}?page=${page}` : `/tag/${tag.slug}`;
  const base = buildPageMetadata({
    title: page > 1 ? `#${tag.name} — strona ${page}` : `#${tag.name}`,
    description: `Artykuły oznaczone tagiem #${tag.name} — wiadomości i analizy AI na ${siteConfig.name}.`,
    path,
    ogType: "website",
  });
  return { ...base, robots: { index: false, follow: true } };
}

export function articleMetadata(
  article: Article & { category?: { name: string } | null; tags?: { name: string }[] }
): Metadata {
  return buildPageMetadata({
    title: article.title,
    description: article.excerpt,
    path: `/artykul/${article.slug}`,
    ogType: "article",
    publishedTime: article.published_at || undefined,
    modifiedTime: article.updated_at || article.published_at || undefined,
    section: article.category?.name,
    tags: article.tags?.map((t) => t.name),
    // Social-share image = miniatura artykułu z DB (og:image scrape ze źródła
    // lub AI-generated thumbnail). Brak miniatury → fallback na default brand
    // card z `app/opengraph-image.tsx`.
    image: article.thumbnail_url
      ? { url: article.thumbnail_url, alt: article.title }
      : undefined,
  });
}

export function notFoundMetadata(label: string): Metadata {
  return {
    title: label,
    robots: { index: false, follow: false },
  };
}

/**
 * Statyczne strony informacyjne: /o-serwisie, /polityka-prywatnosci, etc.
 * Tytuł czysty (template z layoutu dokleja brand), `description` clamp'owany,
 * canonical absolutny, RSS discovery zachowane.
 */
export function staticPageMetadata(input: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  return buildPageMetadata({
    title: input.title,
    description: input.description,
    path: input.path,
    ogType: "website",
  });
}

/**
 * Strona wyszukiwarki — `noindex` (cienki content, query-dependent), ale
 * `follow: true` żeby crawler mógł przejść z linków. Zachowuje RSS discovery.
 */
export function searchPageMetadata(): Metadata {
  return {
    title: "Wyszukiwarka",
    description: clampDescription(
      `Przeszukaj artykuły ${siteConfig.name} — wiadomości AI, modele, badania, raporty.`
    ),
    alternates: {
      canonical: "/szukaj",
      types: RSS_ALTERNATE,
    },
    robots: {
      index: false,
      follow: true,
    },
  };
}

// ===================== JSON-LD HELPERS =====================

/**
 * Spójny `CollectionPage` + zagnieżdżony `ItemList` dla list artykułów
 * (kategoria + tag używają tego samego). `numberOfItems` to **całkowita**
 * liczba artykułów w kolekcji (nie tylko w aktualnej slice'ie), co pozwala
 * Google poprawnie pokazać paginację w rich results.
 */
export function buildItemListJsonLd(params: {
  name: string;
  description: string;
  url: string;
  /** Pełna liczba elementów w kolekcji (nie tylko w listElements) */
  totalItems: number;
  /** Items wyświetlone na stronie (max ~20 — Google limit) */
  items: Array<{ slug: string; title: string }>;
  /**
   * Offset pozycji dla paginacji: strona 2 przy pageSize=12 → 12, żeby
   * `position` odzwierciedlało miejsce w CAŁEJ kolekcji, nie restartowało
   * od 1 na każdej stronie.
   */
  startPosition?: number;
}) {
  const offset = params.startPosition ?? 0;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: params.name,
    description: params.description,
    url: params.url,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: params.totalItems,
      itemListElement: params.items.slice(0, 20).map((article, i) => ({
        "@type": "ListItem",
        position: offset + i + 1,
        url: `${siteConfig.url}/artykul/${article.slug}`,
        name: article.title,
      })),
    },
  };
}

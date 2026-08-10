export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  created_at: string;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category_id: string | null;
  thumbnail_url: string | null;
  thumbnail_source: string | null;
  source_urls: string[];
  source_titles: string[];
  reading_time: number;
  is_featured: boolean;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
}

export interface ArticleTag {
  article_id: string;
  tag_id: string;
}

export interface ScrapedItem {
  id: string;
  source_url: string;
  title: string;
  description: string | null;
  source_name: string | null;
  scraped_at: string;
  is_processed: boolean;
}

// Joined type dla frontendu żyje w `src/lib/data.ts` (ArticleWithRelations).
// Dawne warianty (ArticleWithCategory / ArticleFull) i generyczny typ
// `Database` były martwym kodem — klienty Supabase w tym projekcie są
// nietypowane; jeśli kiedyś przejdziemy na `createClient<Database>()`,
// wygeneruj typy przez `supabase gen types typescript` zamiast utrzymywać
// je ręcznie.

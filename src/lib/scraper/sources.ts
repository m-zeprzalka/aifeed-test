// `alwaysRelevant: true` skips the AI-keyword filter in parser.ts. Set ONLY for
// feeds that are by definition AI-only (company AI research blogs, AI sub-feeds,
// arXiv cs.AI). Generic company blogs (NVIDIA's main blog covers gaming/auto/
// datacenter; Microsoft's "AI" feed is largely business announcements) MUST be
// keyword-filtered.

export interface RSSSource {
  name: string;
  url: string;
  category: string;
  alwaysRelevant?: boolean;
}

export const RSS_SOURCES: readonly RSSSource[] = [
  // ===== Główne serwisy technologiczne =====
  {
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    category: "biznes",
  },
  {
    name: "The Verge AI",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    category: "modele-ai",
  },
  {
    name: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/technology-lab",
    category: "badania",
  },
  {
    name: "VentureBeat AI",
    url: "https://venturebeat.com/category/ai/feed/",
    category: "biznes",
  },
  {
    name: "MIT Technology Review",
    url: "https://www.technologyreview.com/feed/",
    category: "badania",
  },
  {
    name: "Wired AI",
    url: "https://www.wired.com/feed/tag/ai/latest/rss",
    category: "modele-ai",
  },
  {
    name: "The Decoder",
    url: "https://the-decoder.com/feed/",
    category: "modele-ai",
  },
  {
    name: "AI News",
    url: "https://www.artificialintelligence-news.com/feed/",
    category: "biznes",
  },
  {
    name: "The Register AI",
    url: "https://www.theregister.com/software/ai_ml/headlines.atom",
    category: "biznes",
    // Sekcja AI/ML, ale Register miewa w niej ogólne teksty enterprise —
    // keyword filter zostaje.
  },
  {
    name: "ZDNet AI",
    url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml",
    category: "narzedzia",
  },
  {
    name: "Simon Willison",
    url: "https://simonwillison.net/atom/everything/",
    category: "narzedzia",
    // Blog osobisty (praktyczne deep-dive'y o LLM) — feed "everything"
    // zawiera też wpisy nie-AI, keyword filter konieczny.
  },

  // ===== Blogi firmowe producentów AI =====
  {
    name: "OpenAI Blog",
    url: "https://openai.com/blog/rss.xml",
    category: "modele-ai",
    alwaysRelevant: true,
  },
  {
    name: "Google AI Blog",
    url: "https://blog.google/technology/ai/rss/",
    category: "modele-ai",
    alwaysRelevant: true,
  },
  {
    name: "Google DeepMind",
    url: "https://deepmind.google/blog/rss.xml",
    category: "badania",
    alwaysRelevant: true,
  },
  {
    name: "Microsoft AI Blog",
    url: "https://blogs.microsoft.com/ai/feed/",
    category: "biznes",
    // No alwaysRelevant — feed mixes corporate AI announcements with generic
    // cloud/business posts. Keyword filter weeds those out.
  },
  {
    name: "NVIDIA AI Blog",
    url: "https://blogs.nvidia.com/feed/",
    category: "modele-ai",
    // No alwaysRelevant — main NVIDIA blog covers GeForce/automotive/datacenter
    // alongside AI. Keyword filter required.
  },
  {
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
    category: "narzedzia",
    alwaysRelevant: true,
  },
  {
    name: "Anthropic Research",
    url: "https://www.anthropic.com/rss.xml",
    category: "badania",
    alwaysRelevant: true,
  },

  // ===== Źródła akademickie =====
  {
    name: "arXiv AI",
    url: "https://rss.arxiv.org/rss/cs.AI",
    category: "badania",
    alwaysRelevant: true,
  },
  {
    name: "MIT News AI",
    url: "https://news.mit.edu/rss/topic/artificial-intelligence2",
    category: "badania",
    alwaysRelevant: true,
  },

  // ===== Polskie źródła =====
  {
    name: "Spider's Web",
    url: "https://spidersweb.pl/feed",
    category: "narzedzia",
  },
  {
    name: "AntyWeb",
    url: "https://antyweb.pl/feed",
    category: "narzedzia",
  },
  {
    name: "Niebezpiecznik",
    url: "https://niebezpiecznik.pl/feed/",
    category: "etyka",
  },

  // ===== Społeczność i agregatory =====
  {
    name: "Hacker News AI",
    url: "https://hnrss.org/newest?q=AI+OR+LLM+OR+GPT+OR+Claude&points=50",
    category: "narzedzia",
  },
];

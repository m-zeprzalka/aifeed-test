import { createAdminClient } from "@/lib/supabase/admin";
import { safeFetch } from "@/lib/scraper/safe-fetch";
import { generateClaudeCover } from "@/lib/images/claude-image";
import type { CategorySlug } from "@/config/site";

export interface ThumbnailResult {
  url: string;
  source: string | null; // null = AI-generated, string = source site attribution
}

/** Kandydat na miniaturę z JEDNEGO pobrania strony źródłowej (`scrapeSourcePage`). */
export interface SourceImageCandidate {
  sourceUrl: string;
  /** og:image już po walidacji SSRF (`validateExternalUrl`) albo null. */
  ogImage: string | null;
  siteName: string | null;
}

export interface ThumbnailOptions {
  /** Gdy przekazany, koszt generacji AI trafia do `pipeline_events`. */
  runId?: string;
  /** Termin budżetu funkcji (epoch ms) — generacja AI nie może go przekroczyć. */
  deadline?: number;
  /** Kategoria artykułu — akcent palety okładki AI (claude-image.ts). */
  category?: CategorySlug;
}

// Okładka Claude to typowo 30–40 s (skrypt Pillow + uruchomienie w sandboxie).
const AI_IMAGE_TIMEOUT_MS = 90_000;
// Poniżej tego czasu nie zaczynamy płatnej generacji — i tak by nie zdążyła.
const MIN_AI_IMAGE_MS = 45_000;

/**
 * Two-step thumbnail strategy:
 * 1. og:image ze źródła (darmowe) — także grafiki stockowe i logo serwisu
 *    (np. arXiv): decyzja właściciela 2026-10-28, zob. ROADMAP D3,
 * 2. okładka rysowana przez Claude (code execution, claude-image.ts) — tylko
 *    gdy źródło nie ma og:image albo obraz nie przechodzi walidacji.
 */
export async function getArticleThumbnail(
  title: string,
  candidate: SourceImageCandidate,
  options: ThumbnailOptions = {},
): Promise<ThumbnailResult> {
  const sourceImage = await pickSourceImage(candidate);
  if (sourceImage) {
    console.log(`[Thumbnail] Using og:image from ${sourceImage.source}`);
    return sourceImage;
  }

  const timeoutMs = Math.min(AI_IMAGE_TIMEOUT_MS, (options.deadline ?? Infinity) - Date.now());
  if (timeoutMs < MIN_AI_IMAGE_MS) {
    console.warn("[Thumbnail] Brak czasu w budżecie na generację AI — artykuł bez miniatury (placeholder)");
    return { url: "", source: null };
  }

  console.log("[Thumbnail] No usable og:image, generating cover with Claude...");
  const cover = await generateClaudeCover({ title, category: options.category, timeoutMs, runId: options.runId });
  const aiUrl = cover ? await uploadToStorage(cover.buffer, cover.format) : null;
  if (aiUrl) {
    console.log("[Thumbnail] AI cover generated and stored in Supabase Storage");
    return { url: aiUrl, source: null };
  }

  // All methods failed — UI handles null thumbnails with the branded placeholder
  console.warn("[Thumbnail] All methods failed, no thumbnail available");
  return { url: "", source: null };
}

// --------------- OG:IMAGE ---------------

/**
 * og:image przechodzi, gdy HEAD przez `safeFetch` (walidacja każdego hopu
 * przekierowania — og:image kontroluje autor strony, to wektor SSRF)
 * potwierdza obraz, a nie tracking pixel.
 */
async function pickSourceImage(candidate: SourceImageCandidate): Promise<ThumbnailResult | null> {
  const { ogImage } = candidate;
  if (!ogImage) return null;

  try {
    const head = await safeFetch(ogImage, { method: "HEAD", timeoutMs: 5_000 });
    if (!head) return null; // odrzucone przez guard (np. redirect do środka)
    if (!head.ok) {
      // Część CDN-ów nie obsługuje HEAD (405) — wtedy ufamy og:image.
      if (head.status !== 405) return null;
    } else {
      const contentType = head.headers.get("content-type") || "";
      if (!contentType.startsWith("image/")) return null;
      const size = parseInt(head.headers.get("content-length") || "0", 10);
      if (size > 0 && size < 5_000) return null; // tracking pixel / ikona
    }
  } catch {
    // Timeout/zerwane połączenie na HEAD — og:image przeszedł walidację
    // SSRF przy ekstrakcji, a UI ma fallback onError; nie przepalamy
    // generacji AI z powodu kaprysu CDN-a.
  }

  const source = candidate.siteName || hostnameLabel(candidate.sourceUrl);
  return { url: ogImage, source };
}

function hostnameLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "źródło";
  }
}

// --------------- SUPABASE STORAGE ---------------

// Bucket tworzony raz na instancję funkcji — nie ma sensu płacić round-tripem
// do Storage przy każdym uploadzie za idempotentny createBucket.
let bucketEnsured = false;

async function uploadToStorage(
  imageBuffer: Buffer,
  format: string
): Promise<string | null> {
  try {
    const supabase = createAdminClient();

    if (!bucketEnsured) {
      // Ensure bucket exists (idempotent — ignores "already exists")
      await supabase.storage
        .createBucket("thumbnails", {
          public: true,
          fileSizeLimit: 10 * 1024 * 1024, // 10 MB
        })
        .catch(() => {});
      bucketEnsured = true;
    }

    const ext = format === "jpeg" ? "jpg" : format;
    const fileName = `ai-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("thumbnails")
      .upload(fileName, imageBuffer, {
        contentType: `image/${format}`,
        upsert: true,
      });

    if (error) {
      console.error("[Thumbnail] Supabase Storage upload error:", error);
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("thumbnails").getPublicUrl(fileName);

    return publicUrl;
  } catch (error) {
    console.error("[Thumbnail] Upload to Storage failed:", error);
    return null;
  }
}

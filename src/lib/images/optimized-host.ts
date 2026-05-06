const SUPABASE_HOSTNAME = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

// Vercel Image Optimization is metered (monthly quota of unique source images).
// The pipeline scrapes thumbnails from many third-party hosts, which exhausts
// the quota fast and returns 402 on `/_next/image?url=...`. We route only our
// own Supabase Storage origin through the optimizer; external URLs are served
// directly via `unoptimized` so they keep working when the quota is hit.
export function shouldOptimize(url: string | null | undefined): boolean {
  if (!url || !SUPABASE_HOSTNAME) return false;
  try {
    return new URL(url).hostname === SUPABASE_HOSTNAME;
  } catch {
    return false;
  }
}

/**
 * Higiena URL-i miniatur w warstwie odczytu (`lib/data.ts`) — historyczne
 * rekordy wyświetlają się poprawnie bez przepisywania bazy.
 *
 * `&amp;` → `&`: dawny scraper og:image zapisywał surową wartość atrybutu
 * HTML, więc parametry CDN (`crop`, `strip`, `w`) szły pod nazwą `amp;crop`
 * i były ignorowane (231 rekordów w produkcji, 2026-10). Pipeline dekoduje
 * encje od 2026-10-28 (`extractOgMeta`).
 *
 * Grafiki stockowe i logo serwisów źródłowych (np. arXiv) zostają —
 * decyzja właściciela 2026-10-28 (ROADMAP D3).
 */
export function normalizeThumbnailUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/&amp;/gi, "&");
}

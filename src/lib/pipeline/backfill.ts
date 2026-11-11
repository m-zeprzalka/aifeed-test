import type { ScrapedArticle } from "@/lib/scraper/parser";

/**
 * Tryb uzupełniania luki (`/api/cron/generate?backfill_from=…&backfill_to=…`),
 * dodany po przestoju 2026-11-01 → 11-11. Bierze z feedów RSS wiadomości
 * opublikowane w oknie dat, których pipeline jeszcze nie przetworzył, i
 * publikuje artykuły z datą ORYGINALNEJ wiadomości (decyzja właściciela
 * 2026-11-11, ROADMAP D5). `updated_at` = chwila wstawienia, więc JSON-LD
 * `dateModified` i sitemapa `lastmod` uczciwie pokazują, kiedy tekst powstał.
 *
 * Dni liczymy w Europe/Warsaw — tak serwis wyświetla daty (lib/dates.ts).
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_BACKFILL_DAYS = 31;
export const DEFAULT_PER_DAY = 9;

const warsawDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dzień kalendarzowy w Europe/Warsaw jako `YYYY-MM-DD`. */
export function warsawDay(date: Date): string {
  return warsawDayFormat.format(date);
}

function isRealDay(day: string): boolean {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === day;
}

export interface BackfillWindow {
  from: string;
  to: string;
  /** Maks. artykułów na dzień (łącznie z już opublikowanymi tego dnia). */
  perDay: number;
}

export type BackfillParse = { ok: true; window: BackfillWindow | null } | { ok: false; error: string };

/** Brak obu parametrów = zwykły run. Okno musi być w przeszłości i ≤ 31 dni. */
export function parseBackfillWindow(params: URLSearchParams, now: Date = new Date()): BackfillParse {
  const from = params.get("backfill_from");
  const to = params.get("backfill_to");
  if (!from && !to) return { ok: true, window: null };
  if (!from || !to || !DAY_RE.test(from) || !DAY_RE.test(to) || !isRealDay(from) || !isRealDay(to)) {
    return { ok: false, error: "backfill_from i backfill_to muszą być datami YYYY-MM-DD" };
  }
  if (from > to) return { ok: false, error: "backfill_from nie może być po backfill_to" };
  if (to >= warsawDay(now)) return { ok: false, error: "backfill_to musi być wcześniejszy niż dzisiejszy dzień" };
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_BACKFILL_DAYS) return { ok: false, error: `okno backfillu maks. ${MAX_BACKFILL_DAYS} dni` };
  const perDayRaw = parseInt(params.get("per_day") ?? "", 10);
  const perDay = Number.isFinite(perDayRaw) ? Math.min(Math.max(perDayRaw, 1), 15) : DEFAULT_PER_DAY;
  return { ok: true, window: { from, to, perDay } };
}

/**
 * Wybór do `count` wiadomości z okna: zawsze dzień z najmniejszą liczbą
 * artykułów (już opublikowane + wybrane w tym runie), dopóki ma kandydatów
 * i nie osiągnął `perDay` — luka wypełnia się równomiernie, a nie od
 * najbogatszego dnia. W obrębie dnia: źródło najrzadziej już wybrane tego
 * dnia, przy remisie najnowsza wiadomość. Deterministyczne.
 */
export function selectBackfillItems(
  items: readonly ScrapedArticle[],
  window: BackfillWindow,
  existingPerDay: ReadonlyMap<string, number>,
  count: number
): ScrapedArticle[] {
  const byDay = new Map<string, ScrapedArticle[]>();
  for (const item of items) {
    const day = warsawDay(item.publishedAt);
    if (day < window.from || day > window.to) continue;
    const list = byDay.get(day) ?? [];
    list.push(item);
    byDay.set(day, list);
  }
  for (const list of byDay.values()) list.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  const days = [...byDay.keys()].sort();

  const selected: ScrapedArticle[] = [];
  const selectedPerDay = new Map<string, number>();
  const sourcesPerDay = new Map<string, Map<string, number>>();
  while (selected.length < count) {
    let bestDay: string | null = null;
    let bestFill = Infinity;
    for (const day of days) {
      if ((byDay.get(day) ?? []).length === 0) continue;
      const fill = (existingPerDay.get(day) ?? 0) + (selectedPerDay.get(day) ?? 0);
      if (fill >= window.perDay) continue;
      if (fill < bestFill) {
        bestFill = fill;
        bestDay = day;
      }
    }
    if (!bestDay) break;

    const list = byDay.get(bestDay)!;
    const sources = sourcesPerDay.get(bestDay) ?? new Map<string, number>();
    let bestIdx = 0;
    let bestSourceCount = Infinity;
    list.forEach((item, i) => {
      const used = sources.get(item.sourceName) ?? 0;
      if (used < bestSourceCount) {
        bestSourceCount = used;
        bestIdx = i;
      }
    });
    const [chosen] = list.splice(bestIdx, 1);
    selected.push(chosen);
    selectedPerDay.set(bestDay, (selectedPerDay.get(bestDay) ?? 0) + 1);
    sources.set(chosen.sourceName, (sources.get(chosen.sourceName) ?? 0) + 1);
    sourcesPerDay.set(bestDay, sources);
  }
  return selected;
}

/**
 * Data publikacji artykułu z backfillu: 15 min po oryginale (redakcja
 * reaguje na wiadomość), ale bez przeskoku na następny dzień i nigdy
 * w przyszłości.
 */
export function backfillPublishedAt(source: Date, now: Date = new Date()): Date {
  const shifted = new Date(source.getTime() + 15 * 60_000);
  const candidate = warsawDay(shifted) === warsawDay(source) ? shifted : source;
  return candidate.getTime() < now.getTime() ? candidate : new Date(now.getTime() - 60_000);
}

export interface LinkPoolEntry {
  title: string;
  slug: string;
  publishedAt: string;
}

/**
 * Kandydaci do linkowania wewnętrznego. Zwykły run (`before = null`): pula
 * od najnowszych. Backfill: tylko artykuły opublikowane PRZED datą tworzonego
 * artykułu — tekst z 3.11 nie może linkować do artykułu z 9.11.
 */
export function linkCandidatesFor(
  pool: readonly LinkPoolEntry[],
  before: Date | null,
  limit = 40
): { title: string; slug: string }[] {
  const eligible = before ? pool.filter((p) => Date.parse(p.publishedAt) < before.getTime()) : pool;
  return [...eligible]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit)
    .map(({ title, slug }) => ({ title, slug }));
}

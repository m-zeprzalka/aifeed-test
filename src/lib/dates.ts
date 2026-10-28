/**
 * Formatowanie dat dla czytelnika w Polsce — ZAWSZE w strefie Europe/Warsaw.
 *
 * Serwer (Vercel) działa w UTC, więc gołe `toLocaleDateString("pl-PL")`
 * pokazywało artykuł opublikowany o 23:30 UTC (00:30/01:30 w Polsce) z datą
 * DNIA POPRZEDNIEGO. `<time dateTime>` dalej niesie surowy ISO dla maszyn.
 */
const TIME_ZONE = "Europe/Warsaw";

const longFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});
const shortFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "long",
});
const yearFormat = new Intl.DateTimeFormat("pl-PL", { timeZone: TIME_ZONE, year: "numeric" });

/** "28 października 2026" — nagłówek artykułu. */
export function formatDateLong(iso: string): string {
  return longFormat.format(new Date(iso));
}

/**
 * "28 października" dla bieżącego roku, z rokiem dla starszych — tekst
 * z 2025 r. nie może wyglądać na tegoroczny (fałszywy sygnał świeżości).
 */
export function formatDateShort(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  return yearFormat.format(date) === yearFormat.format(now)
    ? shortFormat.format(date)
    : longFormat.format(date);
}

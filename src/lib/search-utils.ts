/** Escape special characters for PostgREST ilike (%, _, \). */
export function escapeIlike(input: string): string {
  return input.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/**
 * Sanitize a query for Postgres `to_tsquery` / `.textSearch()`. tsquery
 * meta-characters: `& | ! ( ) : *`. Zostawiamy wyłącznie alfanumeryczne
 * (z polskimi diakrytykami) i spacje — bezpieczne dla wszystkich konfiguracji.
 * Zwraca query string gotowy do podania jako drugi argument
 * `.textSearch(column, query, { type: "websearch" })` lub do złożenia w
 * `term:* & term:*` (prefix matching) w call site'cie.
 */
export function sanitizeTsQuery(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Polish plural form for a count. Defaults to "wynik" forms (search results);
 * pass custom `[one, few, many]` forms for other nouns. Implements the full
 * Polish rule: the paucal form applies to unit digits 2-4 EXCEPT teens
 * (12-14), so 22 → "wyniki" but 12 → "wyników".
 */
export function pluralize(
  count: number,
  forms: readonly [one: string, few: string, many: string] = ["wynik", "wyniki", "wyników"]
): string {
  if (count === 1) return forms[0];
  const units = count % 10;
  const tens = Math.floor(count / 10) % 10;
  if (units >= 2 && units <= 4 && tens !== 1) return forms[1];
  return forms[2];
}

export const SEARCH_QUERY_MAX_LENGTH = 100;

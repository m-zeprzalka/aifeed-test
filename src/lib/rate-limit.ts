/**
 * Rate limiter — in-memory sliding window.
 *
 * STAN: świadoma decyzja MVP. Dla świeżego serwisu bez znanego ruchu
 * (i bez stałego ataku DDoS) per-instance limiter wyłapie głupie boty
 * uderzające z jednego IP. Tego jest wystarczająco — bez dodawania
 * Redisa/Upstash i kolejnej usługi do utrzymania.
 *
 * OGRANICZENIE: Vercel Fluid Compute trzyma kilka instancji równolegle.
 * Każda ma własną `Map`. Atakujący wysyłając ten sam request z 30
 * równoległych połączeń trafi statystycznie w 30 różnych instancji i
 * każda zacznie liczyć od zera. Pełną ochronę da dopiero shared store
 * (Redis/Upstash) — patrz `AUDIT.md` P1-2: zostawione na potem, gdy
 * pojawi się realny ruch albo realny atak.
 *
 * API jest celowo **async** — gdy kiedyś podmienimy implementację na
 * shared store, call sites (`api/newsletter`, `api/search`) nie będą
 * wymagały zmiany sygnatur. `await checkRateLimit(...)` zostaje.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Unix ms timestamp kiedy okno się zresetuje. */
  resetAt: number;
}

// Konfiguracja per-endpoint w jednym miejscu. Zmiana wartości tutaj = zmiana
// w całej aplikacji; call sites podają wyłącznie `kind`.
const LIMITS = {
  newsletter: { limit: 5, windowMs: 60_000 },
  search: { limit: 30, windowMs: 60_000 },
} as const;

export type LimitKind = keyof typeof LIMITS;

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, MemoryEntry>();
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60_000;

// Okresowe czyszczenie wygasłych wpisów. Bez tego store rośnie liniowo
// z liczbą unikalnych (kind, ip) — przy nawet skromnym ruchu i typowym
// czasie życia funkcji Vercel pamięć by nie eksplodowała, ale jawny GC
// jest tańszy niż liczenie na to.
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

/**
 * Sprawdź i zarezerwuj jeden slot rate-limitu dla pary (kind, ip).
 * `allowed: false` ⇒ klient powinien dostać 429.
 *
 * Async dla forward-compatibility z shared store (zob. komentarz na górze
 * pliku). Aktualnie zwraca natychmiast — żaden I/O nie jest wykonywany.
 */
export async function checkRateLimit(
  kind: LimitKind,
  ip: string
): Promise<RateLimitResult> {
  cleanup();
  const { limit, windowMs } = LIMITS[kind];
  const key = `${kind}:${ip}`;
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Wyłącznie do testów: czyści in-memory store między testami, żeby kolejne
 * `it()` nie dziedziczyły stanu po poprzednich. Produkcyjny kod nie wywołuje.
 */
export function _resetMemoryStoreForTests() {
  store.clear();
  lastCleanup = Date.now();
}

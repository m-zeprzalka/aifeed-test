import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, _resetMemoryStoreForTests } from "./rate-limit";

/**
 * Testują WYŁĄCZNIE in-memory fallback — bez `UPSTASH_REDIS_REST_URL`
 * w env, `checkRateLimit` używa lokalnej Mapy. Produkcyjna ścieżka (Upstash)
 * jest weryfikowana smoke-testami w preview deployment, nie tu.
 */
describe("checkRateLimit (in-memory fallback)", () => {
  beforeEach(() => {
    _resetMemoryStoreForTests();
  });

  it("zezwala na zapytania w limicie (newsletter: 5/min)", async () => {
    // Każde wywołanie z innym IP, żeby uniknąć kolizji między testami,
    // jeśli `beforeEach` zawiedzie kiedyś.
    const ip = `t-allow-${Date.now()}`;

    const r1 = await checkRateLimit("newsletter", ip);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(4);

    const r2 = await checkRateLimit("newsletter", ip);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(3);
  });

  it("blokuje po przekroczeniu limitu (newsletter: 5/min, 6. odrzucony)", async () => {
    const ip = `t-block-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit("newsletter", ip);
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkRateLimit("newsletter", ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("izoluje różne IP", async () => {
    const ipA = `t-iso-a-${Date.now()}`;
    const ipB = `t-iso-b-${Date.now()}`;

    // Wyczerp limit dla ipA
    for (let i = 0; i < 5; i++) await checkRateLimit("newsletter", ipA);

    // ipB ma świeży limit
    const r = await checkRateLimit("newsletter", ipB);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it("izoluje różne kind (newsletter vs search)", async () => {
    const ip = `t-kind-${Date.now()}`;

    // Wyczerp newsletter (5 req/min)
    for (let i = 0; i < 5; i++) await checkRateLimit("newsletter", ip);
    const blockedNewsletter = await checkRateLimit("newsletter", ip);
    expect(blockedNewsletter.allowed).toBe(false);

    // Search dla tego samego IP — osobny limit (30/min)
    const search = await checkRateLimit("search", ip);
    expect(search.allowed).toBe(true);
    expect(search.remaining).toBe(29);
  });

  it("`search` pozwala na 30 req/min", async () => {
    const ip = `t-search-${Date.now()}`;
    for (let i = 0; i < 30; i++) {
      const r = await checkRateLimit("search", ip);
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkRateLimit("search", ip);
    expect(blocked.allowed).toBe(false);
  });

  it("zwraca resetAt w przyszłości", async () => {
    const ip = `t-reset-${Date.now()}`;
    const r = await checkRateLimit("search", ip);
    expect(r.resetAt).toBeGreaterThan(Date.now());
  });
});

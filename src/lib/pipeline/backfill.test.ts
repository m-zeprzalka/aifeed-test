import { describe, it, expect } from "vitest";
import {
  backfillPublishedAt,
  linkCandidatesFor,
  parseBackfillWindow,
  selectBackfillItems,
  warsawDay,
  type BackfillWindow,
} from "./backfill";
import type { ScrapedArticle } from "@/lib/scraper/parser";

const NOW = new Date("2026-11-11T20:00:00Z");
const params = (q: string) => new URLSearchParams(q);

function item(url: string, iso: string, sourceName = "Źródło"): ScrapedArticle {
  return { title: url, description: "", url, sourceName, category: "modele-ai", publishedAt: new Date(iso) };
}

describe("warsawDay", () => {
  it("liczy dzień w Europe/Warsaw, nie w UTC", () => {
    expect(warsawDay(new Date("2026-11-02T22:30:00Z"))).toBe("2026-11-02"); // 23:30 CET
    expect(warsawDay(new Date("2026-11-02T23:30:00Z"))).toBe("2026-11-03"); // 00:30 CET
  });
});

describe("parseBackfillWindow", () => {
  it("bez parametrów = zwykły run", () => {
    expect(parseBackfillWindow(params(""), NOW)).toEqual({ ok: true, window: null });
  });

  it("poprawne okno z domyślnym i własnym limitem na dzień", () => {
    expect(parseBackfillWindow(params("backfill_from=2026-11-02&backfill_to=2026-11-10"), NOW)).toEqual({
      ok: true,
      window: { from: "2026-11-02", to: "2026-11-10", perDay: 9 },
    });
    const custom = parseBackfillWindow(params("backfill_from=2026-11-02&backfill_to=2026-11-02&per_day=99"), NOW);
    expect(custom.ok && custom.window?.perDay).toBe(15);
  });

  it("odrzuca złe daty, odwrócone okno, dzisiaj/przyszłość i okno > 31 dni", () => {
    for (const q of [
      "backfill_from=2026-11-02",
      "backfill_from=2026-11-31&backfill_to=2026-12-01",
      "backfill_from=02.11.2026&backfill_to=2026-11-10",
      "backfill_from=2026-11-10&backfill_to=2026-11-02",
      "backfill_from=2026-11-10&backfill_to=2026-11-11",
      "backfill_from=2026-09-01&backfill_to=2026-11-10",
    ]) {
      expect(parseBackfillWindow(params(q), NOW).ok, q).toBe(false);
    }
  });
});

describe("selectBackfillItems", () => {
  const window: BackfillWindow = { from: "2026-11-02", to: "2026-11-04", perDay: 2 };

  it("wypełnia dni równomiernie, pomija spoza okna i respektuje limit na dzień", () => {
    const items = [
      item("a1", "2026-11-02T08:00:00Z"),
      item("a2", "2026-11-02T09:00:00Z"),
      item("a3", "2026-11-02T10:00:00Z"),
      item("b1", "2026-11-03T08:00:00Z"),
      item("c1", "2026-11-04T08:00:00Z"),
      item("x", "2026-11-11T08:00:00Z"),
    ];
    const urls = selectBackfillItems(items, window, new Map(), 10).map((i) => i.url);
    // Każdy dzień po jednym, potem drugi z 2.11; 3.11 i 4.11 nie mają więcej.
    expect(urls).toEqual(["a3", "b1", "c1", "a2"]);
  });

  it("uwzględnia już opublikowane artykuły dnia", () => {
    const items = [item("a1", "2026-11-02T08:00:00Z"), item("b1", "2026-11-03T08:00:00Z")];
    const urls = selectBackfillItems(items, window, new Map([["2026-11-02", 2]]), 10).map((i) => i.url);
    expect(urls).toEqual(["b1"]);
  });

  it("w obrębie dnia preferuje inne źródło niż już wybrane", () => {
    const items = [
      item("v1", "2026-11-02T12:00:00Z", "Verge"),
      item("v2", "2026-11-02T11:00:00Z", "Verge"),
      item("w1", "2026-11-02T08:00:00Z", "Wired"),
    ];
    const urls = selectBackfillItems(items, { ...window, perDay: 3 }, new Map(), 2).map((i) => i.url);
    expect(urls).toEqual(["v1", "w1"]);
  });
});

describe("backfillPublishedAt", () => {
  it("15 min po oryginale, bez przeskoku na kolejny dzień i nigdy w przyszłości", () => {
    expect(backfillPublishedAt(new Date("2026-11-03T08:00:00Z"), NOW).toISOString()).toBe("2026-11-03T08:15:00.000Z");
    // 23:50 CET + 15 min = następny dzień → zostaje oryginalna godzina.
    expect(backfillPublishedAt(new Date("2026-11-03T22:50:00Z"), NOW).toISOString()).toBe("2026-11-03T22:50:00.000Z");
    expect(backfillPublishedAt(new Date("2026-11-11T19:55:00Z"), NOW).getTime()).toBeLessThan(NOW.getTime());
  });
});

describe("linkCandidatesFor", () => {
  const pool = [
    { title: "Nowy", slug: "nowy", publishedAt: "2026-11-11T10:00:00Z" },
    { title: "Stary", slug: "stary", publishedAt: "2026-10-31T10:00:00Z" },
    { title: "Środek", slug: "srodek", publishedAt: "2026-11-05T10:00:00Z" },
  ];

  it("zwykły run: od najnowszych z limitem", () => {
    expect(linkCandidatesFor(pool, null, 2).map((c) => c.slug)).toEqual(["nowy", "srodek"]);
  });

  it("backfill: tylko artykuły starsze niż tworzony (bez linków w przyszłość)", () => {
    expect(linkCandidatesFor(pool, new Date("2026-11-03T08:15:00Z")).map((c) => c.slug)).toEqual(["stary"]);
  });
});

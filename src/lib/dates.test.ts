import { describe, it, expect } from "vitest";
import { formatDateLong, formatDateShort } from "./dates";

describe("formatDateLong", () => {
  it("formatuje pełną polską datę", () => {
    expect(formatDateLong("2026-10-28T11:02:31.013Z")).toBe("28 października 2026");
  });

  it("liczy dzień w strefie Europe/Warsaw, nie UTC", () => {
    // 23:30 UTC 27.10 = 00:30 28.10 w Polsce (CET po zmianie czasu).
    expect(formatDateLong("2026-10-27T23:30:00Z")).toBe("28 października 2026");
    // Lato (CEST, UTC+2): 22:30 UTC 14.08 = 00:30 15.08.
    expect(formatDateLong("2026-08-14T22:30:00Z")).toBe("15 sierpnia 2026");
  });
});

describe("formatDateShort", () => {
  const now = new Date("2026-10-28T12:00:00Z");

  it("pomija rok dla bieżącego roku", () => {
    expect(formatDateShort("2026-04-15T13:08:08Z", now)).toBe("15 kwietnia");
  });

  it("dokleja rok dla starszych artykułów", () => {
    expect(formatDateShort("2025-12-31T10:00:00Z", now)).toBe("31 grudnia 2025");
  });

  it("rok też liczony w strefie Warszawy (sylwester po 23:00 UTC)", () => {
    const newYear = new Date("2027-01-01T12:00:00Z");
    // 23:30 UTC 31.12.2026 = 00:30 1.01.2027 w Polsce → bieżący rok.
    expect(formatDateShort("2026-12-31T23:30:00Z", newYear)).toBe("1 stycznia");
  });
});

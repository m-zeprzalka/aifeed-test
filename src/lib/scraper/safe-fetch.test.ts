import { describe, it, expect } from "vitest";
import { isBlockedHost, validateExternalUrl } from "@/lib/scraper/safe-fetch";

describe("isBlockedHost", () => {
  it("blocks localhost variants", () => {
    expect(isBlockedHost("localhost")).toBe(true);
    expect(isBlockedHost("LOCALHOST")).toBe(true);
    expect(isBlockedHost("api.localhost")).toBe(true);
  });

  it("blocks dotted-quad internal IPs", () => {
    expect(isBlockedHost("127.0.0.1")).toBe(true);
    expect(isBlockedHost("10.0.0.5")).toBe(true);
    expect(isBlockedHost("192.168.1.1")).toBe(true);
    expect(isBlockedHost("172.16.0.1")).toBe(true);
    expect(isBlockedHost("169.254.169.254")).toBe(true);
    expect(isBlockedHost("0.0.0.0")).toBe(true);
  });

  it("blocks exotic IPv4 notations (decimal, hex, octal, shortened)", () => {
    expect(isBlockedHost("2130706433")).toBe(true); // 127.0.0.1 decimal
    expect(isBlockedHost("0x7f000001")).toBe(true); // 127.0.0.1 hex
    expect(isBlockedHost("0177.0.0.1")).toBe(true); // octal
    expect(isBlockedHost("127.1")).toBe(true); // shortened
  });

  it("blocks all IPv6 literals, including IPv4-mapped", () => {
    expect(isBlockedHost("[::1]")).toBe(true);
    expect(isBlockedHost("::1")).toBe(true);
    expect(isBlockedHost("[::ffff:127.0.0.1]")).toBe(true);
    expect(isBlockedHost("[::ffff:a9fe:a9fe]")).toBe(true);
    expect(isBlockedHost("[fc00::1]")).toBe(true);
    expect(isBlockedHost("[fd12:3456::1]")).toBe(true);
    expect(isBlockedHost("[fe80::1]")).toBe(true);
    expect(isBlockedHost("[2001:db8::1]")).toBe(true);
  });

  it("blocks public IPv4 literals too (news sources always use hostnames)", () => {
    expect(isBlockedHost("8.8.8.8")).toBe(true);
  });

  it("allows regular hostnames", () => {
    expect(isBlockedHost("techcrunch.com")).toBe(false);
    expect(isBlockedHost("www.theverge.com")).toBe(false);
    expect(isBlockedHost("cdn0.wp.com")).toBe(false);
    // Domena zaczynająca się cyframi to wciąż legalny hostname
    expect(isBlockedHost("9to5mac.com")).toBe(false);
  });
});

describe("validateExternalUrl", () => {
  it("accepts https and http URLs on public hostnames", () => {
    expect(validateExternalUrl("https://techcrunch.com/a")?.href).toBe("https://techcrunch.com/a");
    expect(validateExternalUrl("http://example.com/")?.href).toBe("http://example.com/");
  });

  it("rejects non-HTTP protocols", () => {
    expect(validateExternalUrl("file:///etc/passwd")).toBeNull();
    expect(validateExternalUrl("ftp://example.com/x")).toBeNull();
    expect(validateExternalUrl("gopher://example.com")).toBeNull();
  });

  it("rejects internal hosts and IP literals", () => {
    expect(validateExternalUrl("http://127.0.0.1/admin")).toBeNull();
    expect(validateExternalUrl("http://169.254.169.254/latest/meta-data/")).toBeNull();
    expect(validateExternalUrl("http://[::ffff:127.0.0.1]/")).toBeNull();
    expect(validateExternalUrl("http://2130706433/")).toBeNull();
  });

  it("resolves relative redirect targets against the base and re-validates", () => {
    const base = validateExternalUrl("https://example.com/a/b")!;
    expect(validateExternalUrl("/next", base)?.href).toBe("https://example.com/next");
    expect(validateExternalUrl("http://10.0.0.5/", base)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(validateExternalUrl("not a url")).toBeNull();
    expect(validateExternalUrl("")).toBeNull();
  });
});

import { describe, it, expect, vi } from "vitest";
import { mailerLiteConfig, subscribeToNewsletter } from "./mailerlite";

const config = { token: "test-token", groupId: "202596465318561030" };

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

function sentBody(fetchImpl: typeof fetch) {
  const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
  return JSON.parse(init.body);
}

describe("mailerLiteConfig", () => {
  it("wymaga tokenu i ID grupy", () => {
    expect(mailerLiteConfig({ MAILERLITE_API_TOKEN: " t ", MAILERLITE_GROUP_ID: "123" })).toEqual({
      token: "t",
      groupId: "123",
    });
    expect(mailerLiteConfig({ MAILERLITE_API_TOKEN: "t" })).toBeNull();
    expect(mailerLiteConfig({})).toBeNull();
  });
});

describe("subscribeToNewsletter", () => {
  it("dodaje do grupy jako aktywnego (bez double opt-in) z tokenem Bearer i IP zapisu", async () => {
    const fetchImpl = mockFetch(201, { data: { status: "active" } });
    await expect(
      subscribeToNewsletter({ email: "ola@example.pl", ip: "203.0.113.7" }, config, fetchImpl)
    ).resolves.toBe("created");

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://connect.mailerlite.com/api/subscribers");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(init.headers["X-Version"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.parse(init.body)).toEqual({
      email: "ola@example.pl",
      groups: ["202596465318561030"],
      status: "active",
      ip_address: "203.0.113.7",
    });
  });

  it("pomija niepoprawne IP (inaczej 422 zablokowałoby zapis) i akceptuje IPv6", async () => {
    const unknownIp = mockFetch(201, {});
    await subscribeToNewsletter({ email: "ola@example.pl", ip: "unknown" }, config, unknownIp);
    expect(sentBody(unknownIp)).not.toHaveProperty("ip_address");

    const ipv6 = mockFetch(201, {});
    await subscribeToNewsletter({ email: "ola@example.pl", ip: "2001:db8::1" }, config, ipv6);
    expect(sentBody(ipv6).ip_address).toBe("2001:db8::1");
  });

  it("adres już istniejący (200, upsert) to nie błąd — bez flagi resubscribe", async () => {
    const fetchImpl = mockFetch(200, { data: { status: "active" } });
    await expect(subscribeToNewsletter({ email: "ola@example.pl" }, config, fetchImpl)).resolves.toBe("existing");
    expect(sentBody(fetchImpl)).not.toHaveProperty("resubscribe");
  });

  it("422 z błędem pola email → invalid-email", async () => {
    const fetchImpl = mockFetch(422, {
      message: "The given data was invalid.",
      errors: { email: ["The email must be a valid email address."] },
    });
    await expect(subscribeToNewsletter({ email: "x@y.z" }, config, fetchImpl)).resolves.toBe("invalid-email");
  });

  it("422 bez błędu e-maila (np. zła grupa), 401, 429, sieć, brak konfiguracji → kontrolowany wynik", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const input = { email: "ola@example.pl" };
    await expect(
      subscribeToNewsletter(
        input,
        config,
        mockFetch(422, { message: "The given data was invalid.", errors: { "groups.0": ["invalid"] } })
      )
    ).resolves.toBe("error");
    await expect(subscribeToNewsletter(input, config, mockFetch(401, { message: "Unauthenticated." }))).resolves.toBe(
      "error"
    );
    await expect(
      subscribeToNewsletter(input, config, mockFetch(429, { message: "Too Many Attempts." }))
    ).resolves.toBe("error");
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(subscribeToNewsletter(input, config, failing)).resolves.toBe("error");
    await expect(subscribeToNewsletter(input, null)).resolves.toBe("not-configured");

    // Logi nie zawierają adresu e-mail (dane osobowe).
    expect(error.mock.calls.flat().join(" ")).not.toContain("ola@example.pl");
    error.mockRestore();
  });
});

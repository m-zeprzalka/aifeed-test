import { describe, it, expect, vi } from "vitest";
import { mailerLiteConfig, subscribeToNewsletter } from "./mailerlite";

const config = { token: "test-token", groupId: "202596465318561030" };

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
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
  it("dodaje do grupy z tokenem Bearer — bez pola status (double opt-in wg ustawień konta) i bez IP", async () => {
    const fetchImpl = mockFetch(201, { data: { status: "unconfirmed" } });
    await expect(subscribeToNewsletter("ola@example.pl", config, fetchImpl)).resolves.toBe("created");

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://connect.mailerlite.com/api/subscribers");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(init.headers["X-Version"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.parse(init.body)).toEqual({ email: "ola@example.pl", groups: ["202596465318561030"] });
  });

  it("nowy adres od razu aktywny → sukces + ostrzeżenie o wyłączonym double opt-in", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      subscribeToNewsletter("ola@example.pl", config, mockFetch(201, { data: { status: "active" } }))
    ).resolves.toBe("created");
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("adres już istniejący (200, upsert) to nie błąd", async () => {
    const fetchImpl = mockFetch(200, { data: { status: "active" } });
    await expect(subscribeToNewsletter("ola@example.pl", config, fetchImpl)).resolves.toBe("existing");
  });

  it("422 z błędem pola email → invalid-email", async () => {
    const fetchImpl = mockFetch(422, {
      message: "The given data was invalid.",
      errors: { email: ["The email must be a valid email address."] },
    });
    await expect(subscribeToNewsletter("x@y.z", config, fetchImpl)).resolves.toBe("invalid-email");
  });

  it("422 bez błędu e-maila (np. zła grupa), 401, 429, sieć, brak konfiguracji → kontrolowany wynik", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      subscribeToNewsletter(
        "ola@example.pl",
        config,
        mockFetch(422, { message: "The given data was invalid.", errors: { "groups.0": ["invalid"] } })
      )
    ).resolves.toBe("error");
    await expect(
      subscribeToNewsletter("ola@example.pl", config, mockFetch(401, { message: "Unauthenticated." }))
    ).resolves.toBe("error");
    await expect(
      subscribeToNewsletter("ola@example.pl", config, mockFetch(429, { message: "Too Many Attempts." }))
    ).resolves.toBe("error");
    const failing = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(subscribeToNewsletter("ola@example.pl", config, failing)).resolves.toBe("error");
    await expect(subscribeToNewsletter("ola@example.pl", null)).resolves.toBe("not-configured");

    // Logi nie zawierają adresu e-mail (dane osobowe).
    expect(error.mock.calls.flat().join(" ")).not.toContain("ola@example.pl");
    error.mockRestore();
  });
});

import { isIP } from "node:net";

/**
 * MailerLite — jedyny system ewidencji newslettera (grupa subskrybentów,
 * wypisy, historia zgód). Nie trzymamy kopii adresów w Supabase:
 * minimalizacja danych (RODO) i jedno źródło prawdy dla wysyłek.
 *
 * API: `POST https://connect.mailerlite.com/api/subscribers` (create/upsert),
 * `Authorization: Bearer <token>`, limit 120 żądań/min na konto.
 *
 * Env: `MAILERLITE_API_TOKEN` (panel → Integrations → API) oraz
 * `MAILERLITE_GROUP_ID` (liczba z adresu grupy:
 * dashboard.mailerlite.com/groups/<ID>).
 */

const API_URL = "https://connect.mailerlite.com/api/subscribers";
/**
 * Wersja API przypięta do daty wdrożenia (nagłówek `X-Version`) — zmiany
 * kontraktu po stronie MailerLite nie wejdą do nas bez naszej wiedzy.
 */
const API_VERSION = "2026-10-28";
const REQUEST_TIMEOUT_MS = 8_000;

export type SubscribeResult =
  /** Nowy subskrybent — od razu aktywny. */
  | "created"
  /**
   * Adres był już w MailerLite: dopisany do grupy. Wypisany zostaje wypisany
   * (bez `resubscribe` API nie przywraca zgody, którą ktoś cofnął).
   */
  | "existing"
  | "invalid-email"
  /** Brak tokenu lub ID grupy w env. */
  | "not-configured"
  /** Sieć, timeout, błąd autoryzacji, limit żądań albo nieznany błąd API. */
  | "error";

export interface MailerLiteConfig {
  token: string;
  groupId: string;
}

export interface SubscribeInput {
  email: string;
  /** IP zapisu — dowód zgody przy zapisie bez potwierdzenia linkiem. */
  ip?: string;
}

export function mailerLiteConfig(env: Record<string, string | undefined> = process.env): MailerLiteConfig | null {
  const token = env.MAILERLITE_API_TOKEN?.trim();
  const groupId = env.MAILERLITE_GROUP_ID?.trim();
  return token && groupId ? { token, groupId } : null;
}

interface MailerLiteResponse {
  message?: string;
  errors?: Record<string, string[]>;
}

/**
 * Zapis bez double opt-in (decyzja właściciela 2026-10-28): jawne
 * `status: "active"` — zachowanie nie zależy od ustawienia konta
 * „Double opt-in for API and integrations". Wiadomość „dziękujemy za zapis"
 * wysyła automatyzacja MailerLite (wyzwalacz: dołączenie do grupy).
 *
 * `ip_address` (tylko poprawny adres — inaczej 422 zablokowałoby zapis)
 * razem z datą zapisu, którą MailerLite zapisuje sam, dokumentuje zgodę.
 *
 * 201 = nowy subskrybent, 200 = istniejący zaktualizowany (upsert nie usuwa
 * pól ani grup), 422 = walidacja (`errors.email` → zły adres).
 */
export async function subscribeToNewsletter(
  { email, ip }: SubscribeInput,
  config: MailerLiteConfig | null = mailerLiteConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<SubscribeResult> {
  if (!config) return "not-configured";

  let res: Response;
  let body: MailerLiteResponse | null;
  try {
    res = await fetchImpl(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Version": API_VERSION,
      },
      body: JSON.stringify({
        email,
        groups: [config.groupId],
        status: "active",
        ...(ip && isIP(ip) ? { ip_address: ip } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    body = (await res.json().catch(() => null)) as MailerLiteResponse | null;
  } catch (error) {
    console.error("[mailerlite] POST /subscribers — błąd sieci:", error);
    return "error";
  }

  if (res.status === 201) return "created";
  if (res.status === 200) return "existing";
  if (res.status === 422 && body?.errors?.email) return "invalid-email";

  // Bez adresu e-mail w logach (dane osobowe) — status, komunikat i nazwy pól.
  console.error(
    `[mailerlite] POST /subscribers — HTTP ${res.status}: ${body?.message ?? "pusta odpowiedź"}` +
      (body?.errors ? ` (pola: ${Object.keys(body.errors).join(", ")})` : "")
  );
  return "error";
}

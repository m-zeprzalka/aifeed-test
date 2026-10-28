/**
 * MailerLite — jedyny system ewidencji newslettera (grupa subskrybentów,
 * double opt-in, wypisy, historia zgód). Nie trzymamy kopii adresów w
 * Supabase: minimalizacja danych (RODO) i jedno źródło prawdy dla wysyłek.
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
  /** Nowy subskrybent — przy włączonym double opt-in czeka na kliknięcie w link. */
  | "created"
  /**
   * Adres był już w MailerLite: został dopisany do grupy, status bez zmian
   * (aktywny zostaje aktywny, niepotwierdzony dostaje ponownie e-mail z linkiem).
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

export function mailerLiteConfig(env: Record<string, string | undefined> = process.env): MailerLiteConfig | null {
  const token = env.MAILERLITE_API_TOKEN?.trim();
  const groupId = env.MAILERLITE_GROUP_ID?.trim();
  return token && groupId ? { token, groupId } : null;
}

interface MailerLiteResponse {
  data?: { status?: string };
  message?: string;
  errors?: Record<string, string[]>;
}

/**
 * Zapis do grupy. Celowo BEZ pola `status`: o double opt-in decyduje
 * ustawienie konta („Double opt-in for API and integrations"), a jawne
 * `status: "unconfirmed"` zdegradowałoby już aktywnego subskrybenta, który
 * wypełni formularz ponownie (przestałby dostawać wydania do czasu
 * kliknięcia). Bez IP: MailerLite sam zapisuje datę i IP potwierdzenia.
 *
 * 201 = nowy subskrybent, 200 = istniejący zaktualizowany (upsert nie usuwa
 * pól ani grup), 422 = walidacja (`errors.email` → zły adres).
 */
export async function subscribeToNewsletter(
  email: string,
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
      body: JSON.stringify({ email, groups: [config.groupId] }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    body = (await res.json().catch(() => null)) as MailerLiteResponse | null;
  } catch (error) {
    console.error("[mailerlite] POST /subscribers — błąd sieci:", error);
    return "error";
  }

  if (res.status === 201) {
    if (body?.data?.status === "active") {
      // Nowy adres od razu aktywny = double opt-in dla API jest wyłączony
      // w ustawieniach konta. Działa, ale bez potwierdzenia adresu.
      console.warn("[mailerlite] nowy subskrybent od razu aktywny — włącz double opt-in for API w Subscribe settings");
    }
    return "created";
  }
  if (res.status === 200) return "existing";
  if (res.status === 422 && body?.errors?.email) return "invalid-email";

  // Bez adresu e-mail w logach (dane osobowe) — status, komunikat i nazwy pól.
  console.error(
    `[mailerlite] POST /subscribers — HTTP ${res.status}: ${body?.message ?? "pusta odpowiedź"}` +
      (body?.errors ? ` (pola: ${Object.keys(body.errors).join(", ")})` : "")
  );
  return "error";
}

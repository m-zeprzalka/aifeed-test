/**
 * Telemetria pipeline'u — zapisuje zdarzenia do `pipeline_events` (Supabase),
 * skąd dashboard `/admin` je czyta i agreguje.
 *
 * KLUCZOWE: ta funkcja **nie może** rzucić błędu w górę. Telemetria padająca
 * w trakcie generacji artykułu nie powinna ubijać pipeline'u — czarne dziury
 * w obserwowalności są mniej kosztowne niż utracone artykuły. Wszystkie
 * błędy log'ujemy do console.error i swallow.
 *
 * Używa `createAdminClient()` (service role) — `pipeline_events` ma RLS
 * service-role-only, więc anon key by nie przeszedł. Wywoływane wyłącznie
 * z server runtime (cron route, writer.ts, generator.ts) — nigdy z client.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "node:crypto";

/**
 * Typy eventów emitowanych przez pipeline. Lista jest soft (string TEXT
 * w DB), ale dashboard używa tych nazw dla agregacji — przy dodawaniu
 * nowego eventu zaktualizuj też `src/lib/admin-data.ts`.
 */
export type PipelineEvent =
  // Lifecycle
  | "run_start"
  | "run_end"
  // Stages per article
  | "scrape_skip"          // content scraper zwrócił < 100 chars
  | "ai_refusal"           // AI zwróciło "nie mogę przetworzyć"
  | "quality_reject"       // quality gate score < 50
  | "article_generated"    // sukces — wstawiono do DB
  | "article_failed"       // wyjątek na dowolnym etapie
  // Cost tracking
  | "ai_cost";             // OpenRouter usage report (article OR image)

/**
 * Generuje unikalne run_id sortowalne czasowo. Format: `${unix_ms}-${hex8}`.
 * Sortowanie po nazwie = sortowanie po czasie startu, kolizji praktycznie brak
 * (8 hex chars = 4 mld możliwości w obrębie tej samej ms).
 */
export function newRunId(): string {
  return `${Date.now()}-${randomBytes(4).toString("hex")}`;
}

/**
 * Zapisz pojedyncze zdarzenie. Bezpieczne do `void`-wywołania (nie wymaga
 * await — fire-and-forget), ale call sites w pipeline _powinny_ awaitować
 * krytyczne (run_start, run_end) żeby zachować kolejność w DB.
 */
export async function logPipelineEvent(
  runId: string,
  event: PipelineEvent,
  payload: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("pipeline_events")
      .insert({ run_id: runId, event, payload });
    if (error) {
      console.error(`[telemetry] insert ${event} failed:`, error.message);
    }
  } catch (e) {
    // Brak admin envs, brak sieci, padnięte RLS — nigdy nie przerywaj pipeline.
    console.error(`[telemetry] ${event} swallowed:`, e);
  }
}

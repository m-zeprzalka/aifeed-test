import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Admin client bypasses RLS — only use server-side in pipeline/cron.
// Lazy singleton: telemetria woła to przy każdym evencie (kilkanaście razy
// na run) — bez cache'a każde wywołanie budowało nowego klienta.
let _adminClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;
  _adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
  return _adminClient;
}

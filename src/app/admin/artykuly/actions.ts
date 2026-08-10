"use server";

/**
 * Server Actions dla panelu /admin/artykuly. Używają service-role klienta.
 *
 * KAŻDA akcja woła `assertAdmin()` na wejściu. Basic Auth w proxy NIE
 * wystarcza: Next wystawia Server Action jako globalny endpoint POST,
 * wywoływalny z dowolnej ścieżki (nagłówek `Next-Action`), więc check
 * `pathname.startsWith("/admin")` w proxy da się ominąć. Przeglądarka po
 * przejściu challenge'u wysyła `Authorization` przy żądaniach w obrębie
 * /admin, więc legalne wywołania przechodzą.
 *
 * Wszystkie akcje zwracają `{ ok, error? }` — łatwo to po stronie klienta
 * sprawdzić bez parsowania wyjątków. Wyjątki z Supabase swallow'ujemy i
 * logujemy do console.
 */

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAdminAuth } from "@/lib/admin-auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function assertAdmin(): Promise<ActionResult | null> {
  const requestHeaders = await headers();
  const result = await checkAdminAuth(requestHeaders.get("authorization"));
  if (result !== "ok") return { ok: false, error: "Brak autoryzacji" };
  return null;
}

export async function deleteArticleAction(id: string): Promise<ActionResult> {
  const denied = await assertAdmin();
  if (denied) return denied;
  if (!id || typeof id !== "string") {
    return { ok: false, error: "Nieprawidłowe id artykułu" };
  }
  const supabase = createAdminClient();
  const { error } = await supabase.from("articles").delete().eq("id", id);
  if (error) {
    console.error("[admin] deleteArticleAction failed:", error.message);
    return { ok: false, error: error.message };
  }
  // article_tags ma ON DELETE CASCADE — joiny sprzątają się same.
  revalidatePath("/admin/artykuly");
  revalidatePath("/");
  return { ok: true };
}

export async function togglePublishedAction(
  id: string,
  next: boolean,
): Promise<ActionResult> {
  const denied = await assertAdmin();
  if (denied) return denied;
  if (!id || typeof id !== "string") {
    return { ok: false, error: "Nieprawidłowe id artykułu" };
  }
  const supabase = createAdminClient();
  // Przy unpublish nie ruszamy published_at — zachowujemy oryginalną datę
  // na wypadek republish, żeby kolejność czasowa miała sens.
  const { error } = await supabase
    .from("articles")
    .update({ is_published: next })
    .eq("id", id);
  if (error) {
    console.error("[admin] togglePublishedAction failed:", error.message);
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/artykuly");
  revalidatePath("/");
  return { ok: true };
}

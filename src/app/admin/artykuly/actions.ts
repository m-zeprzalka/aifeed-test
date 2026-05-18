"use server";

/**
 * Server Actions dla panelu /admin/artykuly. Używają service-role klienta —
 * ścieżka /admin jest chroniona Basic Auth w `src/proxy.ts`, więc każdy kto
 * tu dotrze ma już uprawnienia. Mutacje wołają `revalidatePath` żeby lista
 * po stronie serwera odświeżyła się natychmiast.
 *
 * Wszystkie akcje zwracają `{ ok, error? }` — łatwo to po stronie klienta
 * sprawdzić bez parsowania wyjątków. Wyjątki z Supabase swallow'ujemy i
 * logujemy do console.
 */

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function deleteArticleAction(id: string): Promise<ActionResult> {
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

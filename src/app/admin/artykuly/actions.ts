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

/**
 * Po zmianie widoczności artykułu odświeżamy wszystko, co go pokazuje:
 * jego stronę (inaczej zdjęty tekst wisiał w cache ISR do kolejnej
 * regeneracji), listy i sitemapy. Slug pobieramy PRZED mutacją (delete).
 */
async function articleSlug(id: string): Promise<string | null> {
  const { data } = await createAdminClient().from("articles").select("slug").eq("id", id).maybeSingle();
  return data?.slug ?? null;
}

function revalidateArticleSurfaces(slug: string | null) {
  if (slug) revalidatePath(`/artykul/${slug}`);
  revalidatePath("/admin/artykuly");
  revalidatePath("/");
  revalidatePath("/kategoria/[slug]", "page");
  revalidatePath("/sitemap.xml");
  revalidatePath("/news-sitemap.xml");
  revalidatePath("/feed.xml");
}

export async function deleteArticleAction(id: string): Promise<ActionResult> {
  const denied = await assertAdmin();
  if (denied) return denied;
  if (!id || typeof id !== "string") {
    return { ok: false, error: "Nieprawidłowe id artykułu" };
  }
  const slug = await articleSlug(id);
  const { error } = await createAdminClient().from("articles").delete().eq("id", id);
  if (error) {
    console.error("[admin] deleteArticleAction failed:", error.message);
    return { ok: false, error: error.message };
  }
  // article_tags ma ON DELETE CASCADE — joiny sprzątają się same.
  revalidateArticleSurfaces(slug);
  return { ok: true };
}

export async function togglePublishedAction(
  id: string,
  next: boolean,
): Promise<ActionResult> {
  const denied = await assertAdmin();
  if (denied) return denied;
  // Argumenty Server Action przychodzą z sieci — walidujemy typy, nie ufamy TS.
  if (!id || typeof id !== "string" || typeof next !== "boolean") {
    return { ok: false, error: "Nieprawidłowe parametry" };
  }
  // Przy unpublish nie ruszamy published_at — zachowujemy oryginalną datę
  // na wypadek republish, żeby kolejność czasowa miała sens.
  const { data, error } = await createAdminClient()
    .from("articles")
    .update({ is_published: next })
    .eq("id", id)
    .select("slug")
    .maybeSingle();
  if (error) {
    console.error("[admin] togglePublishedAction failed:", error.message);
    return { ok: false, error: error.message };
  }
  revalidateArticleSurfaces(data?.slug ?? null);
  return { ok: true };
}

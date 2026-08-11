/**
 * Plik weryfikacyjny protokołu IndexNow — zwraca goły klucz z env.
 * `keyLocation` w pingu (src/lib/indexnow.ts) wskazuje na ten URL; wyszukiwarka
 * pobiera go, żeby potwierdzić własność domeny. Brak klucza w env → 404
 * (feature wyłączony, nic nie wycieka).
 *
 * `force-dynamic`: klucz czytany w runtime, więc rotacja zmiennej na Vercelu
 * działa bez rebuilda.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return new Response("Not Found", { status: 404 });

  return new Response(key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

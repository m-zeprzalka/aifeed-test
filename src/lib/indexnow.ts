import { siteConfig } from "@/config/site";

/**
 * IndexNow — natychmiastowe powiadamianie wyszukiwarek (Bing, Seznam, Yandex,
 * Naver; Copilot cytuje wyniki Bing) o nowych URL-ach. Google nie wspiera
 * IndexNow, ale dla serwisu newsowego Bing to darmowy drugi kanał dystrybucji
 * (ROADMAP §3.4).
 *
 * Fail-soft z założenia: brak klucza (env `INDEXNOW_KEY` nieustawiony) lub
 * błąd sieci NIGDY nie wywraca pipeline'u — publikacja artykułów jest ważniejsza
 * niż ping. Klucz musi być też serwowany pod `/indexnow.txt` (route w
 * `src/app/indexnow.txt/route.ts`) — protokół weryfikuje własność domeny przez
 * pobranie pliku z `keyLocation`.
 */
export async function pingIndexNow(urls: string[]): Promise<void> {
  const key = process.env.INDEXNOW_KEY;
  if (!key || urls.length === 0) return;

  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(siteConfig.url).host,
        key,
        keyLocation: `${siteConfig.url}/indexnow.txt`,
        urlList: urls,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    // 200 = przyjęte, 202 = przyjęte (klucz zweryfikowany później).
    if (res.ok) {
      console.log(`[IndexNow] Zgłoszono ${urls.length} URL-i (status ${res.status})`);
    } else {
      const body = await res.text().catch(() => "");
      console.warn(`[IndexNow] Odrzucone: ${res.status} ${body.slice(0, 200)}`);
    }
  } catch (error) {
    console.warn("[IndexNow] Ping nieudany (ignoruję):", error);
  }
}

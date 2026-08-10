"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

type ThumbnailProps = Omit<ImageProps, "onError"> & {
  /**
   * Klasa elementu fallback. Defaultuje do gradientu spójnego z placeholderem
   * używanym dla artykułów bez thumbnail_url — żeby UI nie zmienił się
   * widocznie gdy obrazek z origin'a padnie.
   */
  fallbackClassName?: string;
};

/**
 * Wrapper Next/Image dla obrazków pochodzących z zewnętrznych domen
 * (og:image scrape'owany w pipeline'u). Dwa zadania:
 *
 * 1. `referrerPolicy="no-referrer"` — duża część hot-link blockerów
 *    (WordPress + popularne wtyczki, niektóre CDN-y) decyduje na podstawie
 *    nagłówka Referer. Bez referera serwują ten sam plik bez problemu.
 *    Mobile Chrome czasem wysyła pełniejszy/inny Referer niż desktop,
 *    co tłumaczy dlaczego "problem widać tylko na telefonie".
 * 2. `onError` → fallback na gradient placeholder. Gdy origin mimo wszystko
 *    odrzuci request (403/404/timeout), pokazujemy spójny gradient zamiast
 *    natywnej "broken image" ikony przeglądarki.
 *
 * Używaj tam gdzie `src` może pochodzić z dowolnego origin (article-card,
 * hero w artykule, layouty home). Dla obrazków własnych z `/public` użyj
 * bezpośrednio `next/image`.
 */
/**
 * Optymalizację (`/_next/image` → resize + WebP/AVIF + srcset) włączamy
 * WYŁĄCZNIE dla obrazów z własnego Supabase Storage (miniatury AI):
 * kontrolujemy ich format, więc optymalizator ich nie psuje, a to one są
 * LCP na stronie artykułu. Scrape'owane obrazy z domen zewnętrznych lecą
 * `unoptimized` — historycznie optymalizator Vercela re-enkodował część
 * z nich do pustych/zepsutych plików, stąd ta selektywność.
 */
function isSupabaseStorageUrl(src: ImageProps["src"]): boolean {
  if (typeof src !== "string") return false;
  try {
    const host = new URL(src).hostname;
    const own = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : null;
    return host === own || host.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

export function Thumbnail({
  fallbackClassName = "h-full w-full bg-gradient-to-br from-muted to-muted/50",
  alt,
  ...imageProps
}: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  if (failed || !imageProps.src) {
    return <div className={fallbackClassName} />;
  }
  return (
    <Image
      {...imageProps}
      alt={alt}
      unoptimized={!isSupabaseStorageUrl(imageProps.src)}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

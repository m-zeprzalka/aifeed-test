"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";
import { ImageFallback } from "@/components/ui/image-fallback";

type ThumbnailProps = Omit<ImageProps, "onError">;

/**
 * Wrapper Next/Image dla obrazków pochodzących z zewnętrznych domen
 * (og:image scrape'owany w pipeline'u). Dwa zadania:
 *
 * 1. `referrerPolicy="no-referrer"` — duża część hot-link blockerów
 *    (WordPress + popularne wtyczki, niektóre CDN-y) decyduje na podstawie
 *    nagłówka Referer. Bez referera serwują ten sam plik bez problemu.
 *    Mobile Chrome czasem wysyła pełniejszy/inny Referer niż desktop,
 *    co tłumaczy dlaczego "problem widać tylko na telefonie".
 * 2. `onError` → `ImageFallback` (ten sam markowy placeholder co dla
 *    artykułów bez miniatury). Gdy origin mimo wszystko odrzuci request
 *    (403/404/timeout), UI nie pokazuje ikony "broken image" przeglądarki.
 *
 * Używaj tam gdzie `src` może pochodzić z dowolnego origin (article-card,
 * hero w artykule, layouty home). Dla obrazków własnych z `/public` użyj
 * bezpośrednio `next/image`.
 */
/**
 * Optymalizację (`/_next/image` → resize + WebP + srcset) włączamy WYŁĄCZNIE
 * dla obrazów z NASZEGO Supabase Storage (miniatury AI): kontrolujemy ich
 * format, a to one są LCP na stronie artykułu. Scrape'owane obrazy z domen
 * zewnętrznych lecą `unoptimized` — historycznie optymalizator Vercela
 * re-enkodował część z nich do pustych plików. Ta funkcja musi zgadzać się
 * z `images.remotePatterns` w next.config.ts (whitelist = tylko nasz host).
 */
const OWN_STORAGE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
  } catch {
    return null;
  }
})();

function isOwnStorageUrl(src: ImageProps["src"]): boolean {
  if (typeof src !== "string" || !OWN_STORAGE_HOST) return false;
  try {
    const url = new URL(src);
    return url.hostname === OWN_STORAGE_HOST && url.pathname.startsWith("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

export function Thumbnail({ alt, ...imageProps }: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  if (failed || !imageProps.src) {
    return <ImageFallback />;
  }
  return (
    <Image
      {...imageProps}
      alt={alt}
      unoptimized={!isOwnStorageUrl(imageProps.src)}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

import { cn } from "@/lib/utils";

/**
 * Markowy placeholder dla artykułów bez zdjęcia (brak miniatury w bazie albo
 * obraz, który nie wczytał się u klienta — `Thumbnail` onError). Szary
 * prostokąt wyglądał jak niedoładowana strona. Znak "ai." to ten sam motyw
 * co favicon/logo (brand-icon.tsx).
 *
 * Bez hooków i "use client" — używany i w kartach (RSC), i w `Thumbnail`.
 * Rozmiar znaku skaluje się do kontenera (`@container` + jednostki cqw),
 * więc ten sam komponent działa w miniaturze 96 px i w hero na pół ekranu.
 */
export function ImageFallback({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "@container relative flex h-full w-full items-center justify-center overflow-hidden",
        "bg-gradient-to-br from-primary/15 via-muted to-muted/60",
        className
      )}
    >
      <div className="absolute -right-1/4 -top-1/3 size-3/4 rounded-full bg-primary/10 blur-3xl" />
      <span className="relative font-heading text-[clamp(1.25rem,22cqw,6rem)] font-extrabold leading-none tracking-tighter text-foreground/10 select-none">
        ai<span className="text-primary/35">.</span>
      </span>
    </div>
  );
}

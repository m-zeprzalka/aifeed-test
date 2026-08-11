import { Star, ArrowUpRight } from "lucide-react";
import { siteConfig } from "@/config/site";

/**
 * Dyskretny box „Dodaj AiFeed do ulubionych źródeł Google" (ROADMAP §3.4).
 * Preferred Sources działa po polsku od 04.2026; użytkownicy z dodanym
 * źródłem widzą je częściej w Top Stories/Dla Ciebie i klikają ~2× częściej.
 * Deep link (poziom domeny) w `siteConfig.preferredSourcesUrl`.
 *
 * Celowo bez logotypu Google (bez podszywania się pod ich branding) i bez
 * stanu/dismissa — zero JS, czysty server component.
 */
export function PreferredSourceCard() {
  return (
    <section
      aria-label="Dodaj AiFeed do ulubionych źródeł Google"
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
    >
      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border/50 bg-card/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Star className="size-4" aria-hidden="true" />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">Czytasz nas regularnie?</span>{" "}
            Dodaj {siteConfig.name} do ulubionych źródeł w Google — nasze artykuły będą
            częściej pojawiać się w Twoich wynikach wyszukiwania.
          </p>
        </div>
        <a
          href={siteConfig.preferredSourcesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-border/60 bg-background px-3.5 py-2 text-sm font-medium transition-all duration-300 hover:border-primary/40 hover:text-primary sm:self-auto"
        >
          Dodaj do źródeł
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

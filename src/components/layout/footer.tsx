import Link from "next/link";
import { siteConfig } from "@/config/site";
import { NewsletterForm } from "./newsletter-form";

export function Footer() {
  return (
    <footer className="border-t border-border/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link href="/" className="inline-block mb-3">
              <span className="font-heading text-xl font-extrabold tracking-tight text-foreground">
                aifeed<span className="text-primary">.</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              Codzienne wiadomości ze świata sztucznej inteligencji — modele, badania, narzędzia i analizy rynku w jednym miejscu.
            </p>
          </div>

          {/* Categories */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Kategorie
            </h3>
            <ul className="space-y-2">
              {siteConfig.categories.map((cat) => (
                <li key={cat.slug}>
                  <Link
                    href={`/kategoria/${cat.slug}`}
                    className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                  >
                    {cat.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Links */}
          <div>
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Zasoby
            </h3>
            <ul className="space-y-2">
              <li>
                <Link href="/o-serwisie" className="text-sm text-foreground/70 hover:text-foreground transition-colors">
                  O nas
                </Link>
              </li>
              <li>
                <Link href="/redakcja" className="text-sm text-foreground/70 hover:text-foreground transition-colors">
                  Redakcja
                </Link>
              </li>
              <li>
                <Link
                  href="/feed.xml"
                  className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                >
                  RSS Feed
                </Link>
              </li>
              <li>
                <Link
                  href="/polityka-prywatnosci"
                  className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                >
                  Polityka Prywatności
                </Link>
              </li>
              <li>
                {/* Preferred Sources deep link (ROADMAP §3.4) — zewnętrzny,
                    prowadzi do ustawień źródeł zalogowanego użytkownika Google. */}
                <a
                  href={siteConfig.preferredSourcesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                >
                  Dodaj do źródeł Google
                </a>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div className="overflow-hidden">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Bądź na bieżąco
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Odbieraj najnowsze wieści o AI każdego dnia.
            </p>
            <NewsletterForm variant="compact" />
          </div>
        </div>

        <hr className="my-8 border-border/40" />

        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-muted-foreground/80">
            &copy; <time dateTime={String(new Date().getFullYear())}>{new Date().getFullYear()}</time> {siteConfig.name}. Wszelkie prawa zastrzeżone.
          </p>
          <p className="text-xs text-muted-foreground/80">
            Codzienna porcja AI — szybko i bez szumu.
          </p>
        </div>
      </div>
    </footer>
  );
}

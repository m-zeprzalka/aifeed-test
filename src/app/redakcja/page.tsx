import { Mail, ArrowUpRight, Cpu, PenLine, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { jsonLdScript } from "@/lib/jsonld";
import { staticPageMetadata } from "@/lib/seo";

export const metadata = staticPageMetadata({
  title: "Redakcja",
  description:
    "Poznaj twórcę AiFeed. Serwis, jego kod i proces redakcyjny są autorstwa Michała Zeprzałki — projektanta i full-stack developera z 12-letnim doświadczeniem.",
  path: "/redakcja",
});

// Person JSON-LD — filar 1 SEO (E-E-A-T): imienny, weryfikowalny autor.
// `sameAs` wskazuje realne, istniejące profile (zeprzalka.com, GitHub) —
// spójne z `founder` w NewsMediaOrganization (layout) i `author` w
// NewsArticle (strona artykułu). Jedna encja, trzy konteksty.
const PERSON_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: siteConfig.author.name,
  url: `${siteConfig.url}/redakcja`,
  jobTitle: "Digital Solutions Architect",
  sameAs: siteConfig.author.sameAs,
  worksFor: {
    "@type": "NewsMediaOrganization",
    name: siteConfig.name,
    url: siteConfig.url,
  },
  knowsAbout: [
    "sztuczna inteligencja",
    "modele językowe",
    "projektowanie produktów cyfrowych",
    "full-stack development",
  ],
} as const;

export default function EditorialPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(PERSON_JSON_LD) }}
      />

      {/* Header */}
      <header className="mb-10">
        <p className="mb-3 text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
          Redakcja
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-4">
          Kto tworzy {siteConfig.name}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {siteConfig.name} jest autorskim projektem — serwis, jego kod i cały proces
          redakcyjny zaprojektował i prowadzi jeden człowiek.
        </p>
      </header>

      {/* Author */}
      <section className="mb-10">
        <div className="rounded-xl border border-border/40 bg-card/80 p-6">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-1">
            {siteConfig.author.name}
          </h2>
          <p className="mb-4 text-xs font-mono tracking-wide text-muted-foreground">
            Projektant · Strateg · Full-Stack Developer
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            Digital Solutions Architect z ponad 12-letnim doświadczeniem w projektowaniu
            i budowie rozwiązań internetowych — od architektury informacji i UX, przez
            development, po komunikację wizualną. Pracował przy projektach dla marek
            takich jak Orlen czy Vinci Facilities, a obecnie specjalizuje się w
            rozwiązaniach opartych o sztuczną inteligencję.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            {siteConfig.name} to jego autorska odpowiedź na tempo rozwoju AI: samodzielnie
            zaprojektował serwis, napisał jego kod oraz algorytm selekcji i publikacji
            newsów, a także ustala standardy redakcyjne, dobiera źródła i nadzoruje
            jakość publikowanych tekstów.
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={siteConfig.author.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3.5 py-2 text-sm font-medium transition-all duration-300 hover:border-primary/40 hover:text-primary"
            >
              zeprzalka.com
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
            <a
              href="https://github.com/m-zeprzalka"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3.5 py-2 text-sm font-medium transition-all duration-300 hover:border-primary/40 hover:text-primary"
            >
              GitHub
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      {/* Role split — what the author does vs. what automation does. Spójne z
          opisem procesu na /o-serwisie (strona transparentności). */}
      <section className="mb-10">
        <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
          Podział ról
        </p>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-6">
          Człowiek projektuje, technologia wykonuje
        </h2>
        <ul className="space-y-3">
          {[
            {
              icon: PenLine,
              title: "Autor systemu i standardów",
              text: "Dobór źródeł, zasady wierności oryginałowi, kryteria jakości, styl i struktura tekstów — wszystko to decyzje autora, zakodowane w procesie publikacji.",
            },
            {
              icon: Cpu,
              title: "Automatyczna produkcja tekstów",
              text: "Codzienną selekcję tematów i adaptację artykułów na język polski wykonują modele językowe — w ramach reguł opisanych na stronie o serwisie.",
            },
            {
              icon: ShieldCheck,
              title: "Nadzór i odpowiedzialność",
              text: "Autor monitoruje jakość publikacji, reaguje na zgłoszenia błędów i odpowiada za całość serwisu. Teksty, które nie spełniają standardów, są poprawiane lub wycofywane.",
            },
          ].map((item) => (
            <li key={item.title} className="flex gap-3 rounded-xl border border-border/40 bg-card/80 p-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <item.icon className="size-4" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold mb-1">{item.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
          Szczegółowy opis procesu — od wyboru źródeł po politykę korekt — znajdziesz na
          stronie{" "}
          <Link href="/o-serwisie" className="font-medium text-foreground underline underline-offset-2 hover:text-primary transition-colors">
            o serwisie
          </Link>
          .
        </p>
      </section>

      {/* Contact */}
      <section>
        <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
          Kontakt
        </p>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-4">
          Napisz bezpośrednio
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          Pytania o serwis, propozycje współpracy, zgłoszenia błędów — wszystko trafia
          do autora.
        </p>
        <a
          href="mailto:kontakt@aifeed.pl"
          className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-4 py-2.5 text-sm font-medium transition-all duration-300 hover:border-primary/40 hover:bg-card"
        >
          <Mail className="size-4" />
          kontakt@aifeed.pl
        </a>
      </section>
    </div>
  );
}

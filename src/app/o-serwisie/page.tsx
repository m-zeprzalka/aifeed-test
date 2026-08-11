import { Newspaper, Layers, Rss, Zap, Mail, SearchCheck, FileCheck2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { staticPageMetadata } from "@/lib/seo";

export const metadata = staticPageMetadata({
  title: "O serwisie",
  description:
    "AiFeed to magazyn informacyjny o sztucznej inteligencji po polsku. Poznaj naszą misję, źródła, proces redakcyjny i standardy jakości.",
  path: "/o-serwisie",
});

// Sekcje `#jak-powstaja-teksty`, `#zrodla` i `#zglos-blad` są celami linków
// `publishingPrinciples` / `correctionsPolicy` w JSON-LD NewsMediaOrganization
// (root layout). Zmiana `id` wymaga aktualizacji layout.tsx.

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-10">
        <p className="mb-3 text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
          O serwisie
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-4">
          O serwisie {siteConfig.name}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Polskojęzyczny magazyn informacyjny poświęcony sztucznej inteligencji — modelom,
          badaniom, narzędziom i wpływowi AI na rynek oraz społeczeństwo.
        </p>
      </header>

      {/* Section: Mission */}
      <section className="mb-10">
        <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
          Nasza misja
        </p>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-4">
          Wiedza o AI w przystępnej formie
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          {siteConfig.name} powstał z prostego założenia: tempo rozwoju sztucznej inteligencji jest
          tak szybkie, że trudno za nim nadążyć. Codziennie pojawiają się nowe modele, badania i
          narzędzia — ale większość informacji dostępna jest wyłącznie w języku angielskim,
          rozproszona po dziesiątkach blogów, portali i preprintów.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Naszym celem jest dostarczać czytelnikom wybrane, najważniejsze i najbardziej wartościowe
          informacje ze świata AI w języku polskim — w jednym miejscu, w przejrzystej formie i bez
          zbędnego szumu.
        </p>
      </section>

      {/* Section: What we cover */}
      <section className="mb-10">
        <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
          Tematyka
        </p>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-6">
          O czym piszemy
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {siteConfig.categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/kategoria/${cat.slug}`}
              className="group flex flex-col gap-1 rounded-xl border border-border/40 bg-card/80 p-4 transition-all duration-300 hover:border-primary/30 hover:shadow-sm"
            >
              <h3 className="text-sm font-bold group-hover:text-primary transition-colors">
                {cat.name}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {cat.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Section: How our texts are created — strona transparentności
          (rekomendacja Google "adding information on how your content was
          created" + twardy wymóg AdSense). To celowo NIE jest banner na
          artykułach — proces opisujemy w jednym miejscu, tutaj. */}
      <section id="jak-powstaja-teksty" className="mb-10 scroll-mt-24">
        <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
          Proces redakcyjny
        </p>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-4">
          Jak powstają nasze teksty
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          {siteConfig.name} działa w modelu, który łączy technologię z redakcyjnymi standardami.
          Monitorujemy na bieżąco około 20 starannie wybranych, renomowanych źródeł — serwisy
          technologiczne, blogi badawcze producentów AI i preprinty naukowe. Z tego strumienia
          wybieramy tematy o największej wartości informacyjnej, a teksty w języku polskim
          przygotowujemy z wykorzystaniem modeli językowych — według ścisłych, jawnych zasad:
        </p>
        <ul className="space-y-3 mb-4">
          {[
            {
              icon: SearchCheck,
              title: "Wierność źródłu",
              text: "Każdy tekst powstaje wyłącznie na podstawie treści oryginalnego materiału. Fakty, liczby, daty i cytaty muszą mieć pokrycie w źródle — dodawanie informacji spoza niego jest zabronione na poziomie procesu.",
            },
            {
              icon: FileCheck2,
              title: "Bramka jakości",
              text: "Zanim artykuł trafi na stronę, przechodzi automatyczną kontrolę jakości (struktura, kompletność, obecność linku do źródła, język). Teksty poniżej progu są odrzucane, nie publikowane.",
            },
            {
              icon: Rss,
              title: "Zawsze z linkiem do oryginału",
              text: "Każdy artykuł linkuje do materiału źródłowego już w pierwszych akapitach, a pełną listę źródeł znajdziesz pod tekstem. Zachęcamy do sięgania po oryginały.",
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
        <p className="text-sm text-muted-foreground leading-relaxed">
          Tam, gdzie ma to wartość, dodajemy polski kontekst: co nowość oznacza dla użytkowników
          w Polsce, jak ma się do unijnych regulacji (np. AI Act) i jakie są lokalne odpowiedniki
          opisywanych narzędzi.
        </p>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
          Serwis, jego kod oraz cały proces redakcyjny są autorstwa jednej osoby —{" "}
          <Link href="/redakcja" className="font-medium text-foreground underline underline-offset-2 hover:text-primary transition-colors">
            poznaj redakcję
          </Link>
          .
        </p>
      </section>

      {/* Section: Sources */}
      <section id="zrodla" className="mb-10 scroll-mt-24">
        <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
          Źródła
        </p>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-4">
          Skąd czerpiemy informacje
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          Piszemy wyłącznie na podstawie renomowanych źródeł o ugruntowanej reputacji. Należą do
          nich m.in.: oficjalne blogi OpenAI, Google AI i DeepMind, Anthropic i Hugging Face,
          serwisy MIT Technology Review, TechCrunch, The Verge, Ars Technica, Wired i VentureBeat,
          repozytorium naukowe arXiv, a z polskiego podwórka Spider&apos;s Web, AntyWeb
          i Niebezpiecznik.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Lista jest kuratorowana ręcznie — dodajemy tylko źródła, które same przestrzegają
          standardów rzetelności. Nie korzystamy z anonimowych agregatorów treści ani farm newsów.
        </p>
      </section>

      {/* Stats */}
      <section className="mb-10">
        <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
          W liczbach
        </p>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-6">
          {siteConfig.name} w skrócie
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Newspaper, value: "40+", label: "Artykułów tygodniowo" },
            { icon: Layers, value: `${siteConfig.categories.length}`, label: "Kategorii tematycznych" },
            { icon: Rss, value: "RSS", label: "Otwarty kanał" },
            { icon: Zap, value: "24/7", label: "Codzienne aktualizacje" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="group flex flex-col items-center gap-2.5 rounded-xl border border-border/40 bg-card/80 p-6 text-center transition-all duration-300 hover:border-primary/30 hover:shadow-sm"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary/15">
                <stat.icon className="size-5" />
              </div>
              <p className="text-2xl font-extrabold tracking-tight">{stat.value}</p>
              <p className="text-xs font-mono tracking-wide text-muted-foreground">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Corrections policy + contact — cel `correctionsPolicy` /
          `actionableFeedbackPolicy` w JSON-LD (layout.tsx). */}
      <section id="zglos-blad" className="scroll-mt-24">
        <p className="mb-2 text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
          Standardy i kontakt
        </p>
        <h2 className="text-lg sm:text-xl font-bold tracking-tight mb-4">
          Zauważyłeś błąd? Powiedz nam o tym
        </h2>
        <div className="flex gap-3 rounded-xl border border-border/40 bg-card/80 p-4 mb-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldAlert className="size-4" aria-hidden="true" />
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Zależy nam na rzetelności. Jeśli znajdziesz w artykule błąd merytoryczny, nieaktualną
            informację albo problem z tłumaczeniem — napisz do nas, podając link do tekstu.
            Zgłoszenia weryfikujemy ze źródłem; błędne treści poprawiamy, a teksty, których nie
            da się obronić, wycofujemy z serwisu. Data modyfikacji artykułu zawsze odzwierciedla
            rzeczywistą zmianę treści.
          </p>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          Ten sam adres działa dla propozycji tematów, sugestii nowych źródeł i współpracy.
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

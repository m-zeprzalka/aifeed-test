import { siteConfig } from "@/config/site";
import { staticPageMetadata } from "@/lib/seo";

export const metadata = staticPageMetadata({
  title: "Polityka prywatności",
  description:
    "Polityka prywatności serwisu AiFeed. Dowiedz się, jakie dane zbieramy i jak je przetwarzamy.",
  path: "/polityka-prywatnosci",
});

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-10">
        <p className="mb-3 text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
          Dokumenty prawne
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-4">
          Polityka Prywatności
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Ostatnia aktualizacja:{" "}
          <time dateTime="2026-10-28">28&nbsp;października 2026&nbsp;r.</time>
        </p>
      </header>

      {/* Content */}
      <div className="space-y-10">
        {/* Administrator danych */}
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">
            1. Administrator danych
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Administratorem serwisu jest AiFeed (aifeed.pl). Korzystanie z treści serwisu nie
            wymaga rejestracji ani podawania danych osobowych.
          </p>
        </section>

        {/* Zakres zbieranych danych */}
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">
            2. Zakres zbieranych danych
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Serwis AiFeed nie zbiera danych osobowych użytkowników, z wyjątkiem sytuacji opisanych
            poniżej:
          </p>
          <h3 className="text-sm font-bold mb-2">
            Dane techniczne (automatyczne)
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Podczas korzystania z serwisu zbierane są dane techniczne o wizycie, takie jak: typ
            przeglądarki i urządzenia, system operacyjny, przybliżona lokalizacja (kraj/miasto),
            czas wizyty oraz odwiedzane podstrony. Korzystamy w tym celu z dwóch narzędzi:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc pl-5 mb-4">
            <li>
              <strong>Google Analytics 4</strong> (Google Ireland Ltd.) — statystyki odwiedzin;
              Google Analytics nie przechowuje adresów IP. Narzędzie zapisuje pliki cookies
              (opisane w punkcie 4).
            </li>
            <li>
              <strong>Vercel Web Analytics</strong> (Vercel Inc., hosting serwisu) — zagregowane,
              anonimowe statystyki ruchu, bez plików cookies i bez identyfikowania użytkownika.
            </li>
          </ul>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Dane te służą wyłącznie do celów analitycznych i poprawy jakości serwisu. Serwer
            hostingu może dodatkowo przetwarzać adres IP w logach technicznych w celu zapewnienia
            bezpieczeństwa (np. ochrony przed nadużyciami).
          </p>
          <h3 className="text-sm font-bold mb-2">
            Newsletter (dobrowolne)
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Jedyną sytuacją, w której zbieramy dane osobowe, jest dobrowolny zapis na newsletter.
            Przetwarzamy wyłącznie podany adres e-mail w celu wysyłki informacji o nowych
            artykułach. Listę mailingową prowadzimy w systemie MailerLite (MailerLite Limited,
            Irlandia), który przetwarza adres w naszym imieniu na podstawie umowy powierzenia
            przetwarzania danych. Po zapisie wysyłamy wiadomość z linkiem
            potwierdzającym — bez kliknięcia w link adres nie zostanie aktywowany i nie otrzymasz
            newslettera. Każda wiadomość zawiera link rezygnacji, a usunięcia adresu możesz zażądać
            w każdej chwili pod adresem {siteConfig.contactEmail}.
          </p>
        </section>

        {/* Cel przetwarzania */}
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">
            3. Cel przetwarzania danych
          </h2>
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc pl-5">
            <li>Zapewnienie prawidłowego działania serwisu</li>
            <li>Analiza ruchu i optymalizacja wydajności strony</li>
            <li>Wysyłka newslettera (wyłącznie za zgodą użytkownika)</li>
            <li>Ochrona przed nadużyciami i zapewnienie bezpieczeństwa</li>
          </ul>
        </section>

        {/* Pliki cookies */}
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">
            4. Pliki cookies
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Serwis AiFeed może wykorzystywać pliki cookies w następujących celach:
          </p>
          <h3 className="text-sm font-bold mb-2">
            Pamięć przeglądarki (funkcjonalna)
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Serwis zapisuje w pamięci Twojej przeglądarki (localStorage/sessionStorage) wyłącznie
            preferencje potrzebne do działania interfejsu: wybrany motyw kolorystyczny, ostatnie
            wyszukiwania i pozycję paska kategorii. Te dane nie opuszczają Twojego urządzenia
            i możesz je usunąć, czyszcząc dane witryny w przeglądarce.
          </p>
          <h3 className="text-sm font-bold mb-2">
            Cookies analityczne
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Google Analytics zapisuje pliki cookies (<code>_ga</code>, <code>_ga_*</code>) służące
            do rozróżniania wizyt i zbierania statystyk odwiedzin. Możesz je zablokować lub usunąć
            w ustawieniach przeglądarki albo za pomocą dodatku Google Analytics Opt-out.
          </p>
        </section>

        {/* Prawa użytkownika */}
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">
            5. Prawa użytkownika
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Zgodnie z RODO, każdemu użytkownikowi przysługują następujące prawa:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed list-disc pl-5">
            <li>Prawo dostępu do swoich danych</li>
            <li>Prawo do sprostowania danych</li>
            <li>Prawo do usunięcia danych (&bdquo;prawo do bycia zapomnianym&rdquo;)</li>
            <li>Prawo do ograniczenia przetwarzania</li>
            <li>Prawo do przenoszenia danych</li>
            <li>Prawo do sprzeciwu wobec przetwarzania</li>
            <li>Prawo do cofnięcia zgody w dowolnym momencie</li>
          </ul>
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
            W przypadku subskrypcji newslettera realizacja powyższych praw jest możliwa poprzez
            link rezygnacji w wiadomości e-mail lub kontakt z administratorem.
          </p>
        </section>

        {/* Okres przechowywania */}
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">
            6. Okres przechowywania danych
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Dane analityczne przechowywane są w formie zanonimizowanej. Adresy e-mail subskrybentów
            newslettera przechowywane są do momentu rezygnacji z subskrypcji lub żądania usunięcia
            danych.
          </p>
        </section>

        {/* Bezpieczeństwo */}
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">
            7. Bezpieczeństwo danych
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Stosujemy odpowiednie środki techniczne i organizacyjne w celu ochrony danych przed
            nieautoryzowanym dostępem, utratą lub zniszczeniem. Serwis korzysta z szyfrowanego
            połączenia HTTPS.
          </p>
        </section>

        {/* Kontakt */}
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">
            8. Kontakt
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            W sprawach związanych z ochroną danych osobowych prosimy o kontakt pod adresem
            e-mail: {siteConfig.contactEmail}.
          </p>
        </section>

        {/* Zmiany */}
        <section>
          <h2 className="text-lg font-bold tracking-tight mb-3">
            9. Zmiany w polityce prywatności
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Administrator zastrzega sobie prawo do wprowadzania zmian w niniejszej polityce
            prywatności. O wszelkich istotnych zmianach użytkownicy zostaną poinformowani
            poprzez odpowiedni komunikat na stronie serwisu.
          </p>
        </section>
      </div>
    </div>
  );
}

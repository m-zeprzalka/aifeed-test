# Newsletter (MailerLite) — konfiguracja i szablon potwierdzenia

Newsletter AiFeed działa na **MailerLite** z double opt-in. Przepływ: formularz w stopce → `/api/newsletter` → `POST https://connect.mailerlite.com/api/subscribers` z `{ email, groups: [MAILERLITE_GROUP_ID] }` → MailerLite wysyła e-mail z linkiem potwierdzającym → adres staje się aktywny dopiero po kliknięciu. Kod: `src/lib/newsletter/mailerlite.ts`.

Adresy trzyma **wyłącznie MailerLite** (zgody, potwierdzenia, wypisy) — baza Supabase nie ma tabeli z e-mailami.

## Stan konfiguracji (2026-10-28)

| Element | Stan |
|---|---|
| Grupa „AiFeed — newsletter” | ✅ istnieje, ID `202596465318561030` |
| Token API | ✅ działa (sprawdzone odczytem grupy) |
| `MAILERLITE_API_TOKEN` + `MAILERLITE_GROUP_ID` w Vercel (Production) | ✅ ustawione przy wdrożeniu |
| **Double opt-in dla API** | ⚠️ do włączenia ręcznie w panelu — krok 1 |
| Domena nadawcy `aifeed.pl` (DKIM/SPF/DMARC) | ⚠️ do zrobienia w panelu i DNS — krok 3 |

## Jednorazowa konfiguracja w panelu MailerLite

1. **Double opt-in dla API (wymagane):** Account settings → **Subscribe settings** → przełącz **„Double opt-in for API and integrations”** na ON.
   Kod celowo nie wymusza statusu `unconfirmed`: takie wymuszenie zdegradowałoby już aktywnego subskrybenta, który ponownie wpisze adres w formularz. O double opt-in decyduje więc to ustawienie. Gdy jest wyłączone, nowe adresy od razu stają się aktywne, a w logach Vercela pojawia się ostrzeżenie `[mailerlite] nowy subskrybent od razu aktywny`.
2. **E-mail potwierdzający:** w tym samym miejscu, zakładka z e-mailem potwierdzającym.
   - **Nadawca:** `AiFeed`, adres z domeny aifeed.pl (np. `newsletter@aifeed.pl`). Bez poprawnego nadawcy MailerLite nie wyśle potwierdzenia.
   - **Temat:** „Potwierdź zapis na newsletter AiFeed”.
   - **Treść i wygląd** (Preview → Edit) — wg MailerLite edycja e-maili double opt-in jest dostępna w planach płatnych. Na planie darmowym idzie standardowy e-mail MailerLite w języku konta — działa poprawnie, tylko bez naszego wyglądu.
   - W planie płatnym przenieś treść i styl z `newsletter-potwierdzenie.html`:
     - nagłówek, akapit, trzy punkty „Co znajdziesz…” i stopkę;
     - kolory: akcent `#5b3df7`, tekst `#1c1d2e`, tło `#f3f3f6`;
     - przycisk „Potwierdzam zapis →”.
   - **Przycisk musi być elementem potwierdzenia z edytora MailerLite** — to on niesie unikalny link danego subskrybenta. Jeśli edytor przyjmuje własny HTML, wklej plik i podmień wszystkie 4 wystąpienia `{{LINK_AKTYWACYJNY}}` na znacznik linku potwierdzającego, który podaje edytor.
   - Opcjonalnie: zakładka strony z podziękowaniem — przekierowanie na własny adres zamiast strony MailerLite.
3. **Domena nadawcy:** Account settings → **Domains** → dodaj `aifeed.pl` i wpisz w DNS rekordy podane przez MailerLite (DKIM + SPF/return-path). Dodaj też DMARC: `_dmarc.aifeed.pl TXT "v=DMARC1; p=none; rua=mailto:kontakt@aifeed.pl"` na start. Bez uwierzytelnionej domeny Gmail/Yahoo odrzucają albo spamują wysyłki.
4. **Test po wdrożeniu:** zapis własnym (innym niż już zapisany) adresem w stopce aifeed.pl → e-mail potwierdzający → klik → w grupie status „Active”.

## Zachowanie dla adresów, które już są w MailerLite

Zgodnie z dokumentacją MailerLite (zapis przez API, upsert):

| Status adresu | Co się dzieje |
|---|---|
| aktywny | zostaje aktywny, dopisany do grupy, bez e-maila |
| niepotwierdzony | MailerLite wysyła ponownie e-mail z linkiem |
| wypisany | zostaje wypisany — API nie może przywrócić zgody; potrzebny formularz MailerLite lub kontakt |

Odpowiedź formularza jest we wszystkich przypadkach identyczna — strona nie zdradza, czy adres jest już na liście.

## Podgląd szablonu lokalnie

Otwórz `newsletter-potwierdzenie.html` w przeglądarce — znaczniki `{{LINK_AKTYWACYJNY}}` zostaną jako tekst. MailerLite trzyma własną kopię treści: po zmianie pliku zaktualizuj ją też w panelu.

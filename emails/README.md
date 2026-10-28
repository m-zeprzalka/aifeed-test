# Newsletter (MailerLite) — konfiguracja i szablon wiadomości powitalnej

Newsletter AiFeed działa na **MailerLite**, **bez double opt-in** (decyzja właściciela 2026-10-28).

Przepływ:
1. Formularz w stopce wysyła adres do `/api/newsletter`.
2. Ten wywołuje `POST https://connect.mailerlite.com/api/subscribers` z `{ email, groups: [MAILERLITE_GROUP_ID], status: "active", ip_address }`. Kod: `src/lib/newsletter/mailerlite.ts`.
3. Adres jest od razu aktywny, a formularz pokazuje „Dziękujemy za zapis!”.
4. Automatyzacja MailerLite wysyła wiadomość powitalną z potwierdzeniem zapisu.

Adresy trzyma **wyłącznie MailerLite**: zgody (data + IP zapisu), wypisy i historię. Baza Supabase nie ma tabeli z e-mailami.

## Stan konfiguracji (2026-10-28)

| Element | Stan |
|---|---|
| Grupa „AiFeed — newsletter” | ✅ ID `202596465318561030` |
| Token API + ID grupy w Vercel (Production) | ✅ |
| Zapis od razu aktywny (`status: "active"`) | ✅ w kodzie — niezależny od ustawienia „Double opt-in for API” |
| Automatyzacja z wiadomością powitalną | ⚠️ do utworzenia w panelu (niżej) |
| Domena nadawcy `aifeed.pl` (DKIM/SPF/DMARC) | ⚠️ do zrobienia — DNS domeny jest w Vercelu |
| Skrzynka `kontakt@aifeed.pl` | ⚠️ **nie działa** — domena nie ma rekordów MX (adres jest w polityce prywatności i stopce maili) |

## 1. Domena nadawcy (DKIM, SPF, DMARC)

DNS `aifeed.pl` obsługuje **Vercel** (`ns1/ns2.vercel-dns.com`). Na 2026-10-28 jedyny rekord TXT to weryfikacja Google — nie ma SPF do scalania.

1. MailerLite → **Ustawienia → Domeny → Dodaj domenę** → `aifeed.pl` → **Uwierzytelnij**. MailerLite pokaże rekordy:
   - **DKIM:** CNAME, nazwa `litesrv._domainkey`, wartość z panelu;
   - **SPF:** TXT, nazwa `@`/pusta, wartość w stylu `v=spf1 a mx include:_spf.mlsend.com ?all`.
2. Vercel → zespół *zeprzalka* → **Domains → aifeed.pl → DNS Records → Add**. Dodaj oba rekordy dokładnie z panelu MailerLite. Nazwę wpisz bez `.aifeed.pl` — Vercel dokleja domenę sam.
3. Dodaj DMARC: TXT, nazwa `_dmarc`, wartość `v=DMARC1; p=none`. Gdy zadziała skrzynka w domenie, dopisz `; rua=mailto:kontakt@aifeed.pl`, żeby dostawać raporty.
4. MailerLite → **Sprawdź rekordy DNS**. Zwykle zajmuje to minuty, maksymalnie 24 h.
5. Nadawca w wysyłkach: `AiFeed <newsletter@aifeed.pl>`. Domena jest uwierzytelniona przez DNS, więc ten adres nie potrzebuje skrzynki. **Odpowiedzi (reply-to)** ustaw na adres, który działa.

Rekordy można też dodać z terminala (`npx vercel@latest dns add aifeed.pl <nazwa> <TYP> <wartość>`) — wystarczy podać asystentowi wartości z panelu MailerLite.

## 2. Wiadomość powitalna (automatyzacja)

MailerLite → **Automatyzacje → Utwórz** →
- **Wyzwalacz:** „Subskrybent dołącza do grupy” → grupa **AiFeed — newsletter**.
- **Krok:** E-mail → temat **„Dziękujemy za zapis na newsletter AiFeed”**, nadawca `AiFeed <newsletter@aifeed.pl>`.
- **Treść:** odtwórz `newsletter-powitanie.html` (nagłówek, akapit, przycisk „Czytaj najnowsze wiadomości →” do `https://www.aifeed.pl`, trzy punkty „Co będziesz dostawać”, prośba o dodanie do kontaktów, stopka).
  - Kolory: akcent `#5b3df7`, tekst `#1c1d2e`, tło `#f3f3f6`.
  - Własny HTML (wklejenie całego pliku) to funkcja planów płatnych. Na planie darmowym zbuduj maila z bloków edytora drag & drop.
  - Link wypisu w HTML to znacznik MailerLite `{$unsubscribe}` (już wstawiony w pliku). Edytor drag & drop dodaje stopkę z wypisem sam.
- **Aktywuj** automatyzację.

Wyzwalacz działa tylko przy **dołączeniu** do grupy. Ktoś, kto już jest w grupie i wpisze adres ponownie, nie dostanie drugiej wiadomości.

## 3. Test po konfiguracji

Zapisz się w stopce aifeed.pl adresem, którego jeszcze nie ma w grupie. Sprawdź:
- czy w grupie jest ze statusem „Active”;
- czy przyszła wiadomość powitalna, w głównej skrzynce, a nie w spamie.

## Zachowanie dla adresów, które już są w MailerLite (upsert)

| Status adresu | Co się dzieje |
|---|---|
| aktywny | zostaje aktywny i dopisany do grupy; bez drugiego powitania, jeśli już był w grupie |
| wypisany | **zostaje wypisany** — kod celowo nie wysyła `resubscribe`, żeby nikt nie mógł zapisać z powrotem cudzego adresu, który zrezygnował; powrót przez kontakt lub formularz MailerLite |

Odpowiedź formularza jest we wszystkich przypadkach identyczna — strona nie zdradza, czy adres jest już na liście.

## Ochrona przed nadużyciami

Bez double opt-in każdy może wpisać cudzy adres. Ta osoba dostanie jedno powitanie z linkiem wypisu. Ochrona dziś:
- honeypot (pole niewidoczne dla ludzi);
- limit 5 zapisów na minutę z jednego IP.

Jeśli pojawią się fałszywe zapisy, skargi albo rosnące odbicia: ROADMAP backlog 7.4 (weryfikacja botów — Vercel BotID / Cloudflare Turnstile).

## Podgląd szablonu lokalnie

Otwórz `newsletter-powitanie.html` w przeglądarce — znacznik `{$unsubscribe}` zostanie jako tekst. MailerLite trzyma własną kopię treści: po zmianie pliku zaktualizuj ją też w automatyzacji.

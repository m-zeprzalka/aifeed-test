interface ListingHeaderProps {
  /** Etykieta typu strony nad tytułem, np. "Kategoria" / "Tag". */
  eyebrow: string;
  /** ReactNode, bo tag koloruje prefiks „#" na primary. */
  title: React.ReactNode;
  description?: string;
}

// Wspólny nagłówek listingów (kategoria / tag): eyebrow + h1 + opcjonalny
// opis. Jeden komponent zamiast dwóch kopii tych samych klas — spójna
// typografia na wszystkich stronach zbiorczych.
export function ListingHeader({ eyebrow, title, description }: ListingHeaderProps) {
  return (
    <div className="mb-8 mt-3">
      <span className="mb-2 inline-block text-xs font-mono font-bold uppercase tracking-widest text-muted-foreground">
        {eyebrow}
      </span>
      <h1 className="text-2xl sm:text-3xl font-heading font-extrabold tracking-tight text-balance">
        {title}
      </h1>
      {description && (
        <p className="mt-3 text-lg text-muted-foreground max-w-xl">{description}</p>
      )}
    </div>
  );
}

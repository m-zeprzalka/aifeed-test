"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";

/**
 * Wspólny widok error boundary dla route'ów (`error.tsx`). Bez własnego
 * boundary awaria Supabase renderowała gołą trace'ę Next zamiast strony
 * z drogą ucieczki.
 */
export function RouteError({
  error,
  reset,
  description,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  description: string;
}) {
  // Log w efekcie, nie w renderze — render side-effect odpala się 2× pod
  // StrictMode i jest antywzorcem niezależnie od trybu.
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error(error);
    }
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="mb-4 text-6xl font-heading font-extrabold text-muted-foreground/10 tracking-tighter">
        Błąd
      </p>
      <h1 className="mb-3 text-2xl font-bold font-heading tracking-tight">
        Ups, coś poszło nie tak
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">{description}</p>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Spróbuj ponownie
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-foreground/90 transition-colors"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Strona główna
        </Link>
      </div>
    </div>
  );
}

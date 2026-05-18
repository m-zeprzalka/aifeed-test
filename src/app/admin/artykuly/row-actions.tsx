"use client";

/**
 * Klient akcji rzędu w tabeli /admin/artykuly. Wywołuje Server Actions z
 * `./actions`. Trzymamy logikę tutaj (a nie inline w page.tsx) wyłącznie
 * po to żeby strona pozostała RSC — Server Action wewnątrz `<form>` w RSC
 * też by działał, ale `window.confirm` i stan "pending" wymagają klienta.
 */

import { useState, useTransition } from "react";
import { deleteArticleAction, togglePublishedAction } from "./actions";

export function RowActions({
  id,
  title,
  isPublished,
}: {
  id: string;
  title: string;
  isPublished: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    setError(null);
    startTransition(async () => {
      const res = await togglePublishedAction(id, !isPublished);
      if (!res.ok) setError(res.error);
    });
  };

  const remove = () => {
    setError(null);
    if (!window.confirm(`Na pewno usunąć artykuł?\n\n"${title}"\n\nOperacja jest nieodwracalna — wpisy w article_tags zostaną wyczyszczone cascade.`)) {
      return;
    }
    startTransition(async () => {
      const res = await deleteArticleAction(id);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="rounded border border-border/60 bg-card px-2 py-1 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
        title={isPublished ? "Ukryj z publikacji (draft)" : "Opublikuj"}
      >
        {pending ? "…" : isPublished ? "Ukryj" : "Publikuj"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="rounded border border-destructive/50 bg-destructive/10 px-2 py-1 text-xs font-mono uppercase tracking-wider text-destructive hover:bg-destructive hover:text-white transition-colors disabled:opacity-50"
        title="Usuń trwale"
      >
        Usuń
      </button>
      {error && (
        <span className="ml-2 text-[10px] font-mono text-destructive" title={error}>
          ERR
        </span>
      )}
    </div>
  );
}

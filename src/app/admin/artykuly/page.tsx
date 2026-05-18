import Link from "next/link";
import { getAdminArticlesList, getAdminFilterOptions } from "@/lib/admin-data";
import { RowActions } from "./row-actions";

/**
 * /admin/artykuly — pełen przegląd artykułów (włącznie z draftami).
 * Filtry: search po title, kategoria, tag. Paginacja offsetowa.
 *
 * Strona jest RSC; mutacje przechodzą przez Server Actions w `./actions.ts`
 * wywoływane z `./row-actions.tsx` (client component). Cała trasa /admin
 * chroniona Basic Auth w `src/proxy.ts`.
 */

interface PageProps {
  searchParams: Promise<{ q?: string; cat?: string; tag?: string; page?: string }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminArtykulyPage({ searchParams }: PageProps) {
  const { q, cat, tag, page: pageRaw } = await searchParams;
  const page = Math.max(1, parseInt(pageRaw || "1", 10) || 1);
  const perPage = 25;

  const [{ categories, tags }, list] = await Promise.all([
    getAdminFilterOptions(),
    getAdminArticlesList({ page, perPage, search: q, categoryId: cat, tagId: tag }),
  ]);

  const buildHref = (overrides: Partial<{ q: string; cat: string; tag: string; page: number }>) => {
    const params = new URLSearchParams();
    const merged = { q: q ?? "", cat: cat ?? "", tag: tag ?? "", page, ...overrides };
    if (merged.q) params.set("q", merged.q);
    if (merged.cat) params.set("cat", merged.cat);
    if (merged.tag) params.set("tag", merged.tag);
    if (merged.page && merged.page > 1) params.set("page", String(merged.page));
    const qs = params.toString();
    return qs ? `/admin/artykuly?${qs}` : "/admin/artykuly";
  };

  const hasFilters = Boolean(q || cat || tag);

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-heading font-extrabold tracking-tight mb-1">Artykuły</h1>
        <p className="text-sm text-muted-foreground">
          Pełna lista — także drafty (<code>is_published=false</code>). Łącznie:{" "}
          <span className="font-mono">{list.total}</span>
          {hasFilters && " (wynik filtrowany)"}.
        </p>
      </section>

      {/* Toolbar filtrów — GET form, idempotentny, URL = stan. */}
      <form className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end rounded-lg border border-border/60 bg-card/40 p-3">
        <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Szukaj w tytułach
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="np. agent, alignment, AGI…"
            maxLength={100}
            className="mt-1 w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-sm font-sans text-foreground placeholder:text-muted-foreground focus:border-foreground focus:outline-none"
          />
        </label>
        <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Kategoria
          <select
            name="cat"
            defaultValue={cat ?? ""}
            className="mt-1 w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-sm font-sans text-foreground focus:border-foreground focus:outline-none"
          >
            <option value="">— wszystkie —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Tag
          <select
            name="tag"
            defaultValue={tag ?? ""}
            className="mt-1 w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-sm font-sans text-foreground focus:border-foreground focus:outline-none"
          >
            <option value="">— wszystkie —</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-mono uppercase tracking-widest text-background hover:opacity-90 transition-opacity"
          >
            Filtruj
          </button>
          {hasFilters && (
            <Link
              href="/admin/artykuly"
              className="rounded-md border border-border/60 px-3 py-1.5 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Wyczyść
            </Link>
          )}
        </div>
      </form>

      {/* Tabela */}
      {list.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
          {hasFilters ? "Brak artykułów pasujących do filtrów." : "Brak artykułów w bazie."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Tytuł</th>
                <th className="px-3 py-2 text-left">Kategoria</th>
                <th className="px-3 py-2 text-left">Tagi</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Utworzono</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Akcje</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {list.rows.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30 transition-colors align-top">
                  <td className="px-3 py-2 max-w-[28rem]">
                    <Link
                      href={`/artykul/${a.slug}`}
                      target="_blank"
                      rel="noopener"
                      className="font-medium text-foreground hover:text-primary transition-colors"
                      title={a.title}
                    >
                      {a.title}
                    </Link>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground truncate">
                      /artykul/{a.slug}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {a.category?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {a.tags.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        a.tags.slice(0, 4).map((t) => (
                          <span
                            key={t.id}
                            className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                          >
                            {t.name}
                          </span>
                        ))
                      )}
                      {a.tags.length > 4 && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          +{a.tags.length - 4}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {a.created_at.slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {a.is_published ? (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono uppercase text-primary">
                          opublikowany
                        </span>
                      ) : (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">
                          draft
                        </span>
                      )}
                      {a.is_featured && (
                        <span className="rounded bg-foreground/90 px-1.5 py-0.5 text-[10px] font-mono uppercase text-background">
                          featured
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RowActions id={a.id} title={a.title} isPublished={a.is_published} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginacja */}
      {list.totalPages > 1 && (
        <nav className="flex items-center justify-between text-xs font-mono text-muted-foreground">
          <div>
            Strona <span className="font-bold text-foreground">{list.page}</span> /{" "}
            {list.totalPages} · <span className="text-foreground">{list.total}</span> wpisów
          </div>
          <div className="flex items-center gap-1">
            {list.page > 1 ? (
              <Link
                href={buildHref({ page: list.page - 1 })}
                className="rounded border border-border/60 px-2 py-1 hover:bg-muted hover:text-foreground transition-colors"
              >
                ← Poprzednia
              </Link>
            ) : (
              <span className="rounded border border-border/40 px-2 py-1 opacity-40">← Poprzednia</span>
            )}
            {list.page < list.totalPages ? (
              <Link
                href={buildHref({ page: list.page + 1 })}
                className="rounded border border-border/60 px-2 py-1 hover:bg-muted hover:text-foreground transition-colors"
              >
                Następna →
              </Link>
            ) : (
              <span className="rounded border border-border/40 px-2 py-1 opacity-40">Następna →</span>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

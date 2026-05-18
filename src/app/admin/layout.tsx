import type { Metadata } from "next";
import Link from "next/link";

/**
 * Dashboard `/admin` ma własny layout — NIE chcemy publicznego Headera,
 * Footera, NewsTickera, CategoryBar (zob. root `app/layout.tsx`). Pełen
 * focus na metryki. Strona jest chroniona Basic Auth w `src/proxy.ts`.
 *
 * Layout zostawia `<html>`/`<body>` z root layoutu (App Router składa to
 * automatycznie) — tu dodajemy tylko nakładkę z własną nawigacją admina
 * i bannerem informującym że jesteś poza publicznym UI.
 */
export const metadata: Metadata = {
  title: "Admin · AiFeed",
  // Defense in depth: noindex w HTML + X-Robots-Tag w proxy.ts + Basic Auth.
  robots: { index: false, follow: false, nocache: true },
};

// Force runtime — dashboard zawsze pokazuje świeże dane (revalidate=0).
export const revalidate = 0;
export const dynamic = "force-dynamic";

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <span className="font-heading text-base font-extrabold tracking-tight">
              aifeed<span className="text-primary">.</span>
              <span className="ml-2 rounded-md bg-foreground/90 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest text-background">
                admin
              </span>
            </span>
            <nav className="flex items-center gap-4 text-xs font-mono uppercase tracking-widest">
              <Link href="/admin" className="text-muted-foreground hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <Link href="/admin/artykuly" className="text-muted-foreground hover:text-foreground transition-colors">
                Artykuły
              </Link>
            </nav>
          </div>
          <Link
            href="/"
            className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Serwis
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

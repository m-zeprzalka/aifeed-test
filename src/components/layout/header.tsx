"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Menu, Search, X } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { siteConfig } from "@/config/site";
import { SearchModal } from "./search-modal";
import { cn } from "@/lib/utils";

// Hydration-safe Mac/iOS detection. SSR and first client render use the same
// `getServerSnapshot` value (false → "Ctrl+K"), preventing the mismatch
// warning. After commit, React calls `getMacSnapshot` on the client and
// re-renders if the device is actually a Mac/iOS, swapping the shortcut hint
// to "⌘K". The handler logic itself accepts both metaKey and ctrlKey, so
// functionality is identical regardless — this affects only the UI label.
const noopSubscribe = () => () => {};
const getMacSnapshot = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const getServerSnapshot = () => false;
const getHydratedSnapshot = () => true;

export function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Reference to the hamburger button — used to restore focus when the user
  // closes the menu via ESC. Without this, ESC closes the menu but focus
  // jumps to <body> and the user loses their keyboard position.
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Mac/iOS detection — see explanation at top of file. `noopSubscribe`
  // because we never need to react to changes (platform doesn't change
  // mid-session); we only need React to read it once on client.
  const isMac = useSyncExternalStore(noopSubscribe, getMacSnapshot, getServerSnapshot);
  const searchShortcut = isMac ? "⌘K" : "Ctrl+K";

  // Hydration gate dla aktywnego linku w menu mobilnym — ten sam problem i
  // wzorzec co w CategoryBar (zob. komentarz tam): regeneracja ISR renderuje
  // usePathname() bez ścieżki strony, a React w produkcji nie łata atrybutów
  // przy hydratacji, więc bez wymuszonego diffa aktywny stan zostawałby
  // nieaktywny do końca sesji.
  const hydrated = useSyncExternalStore(noopSubscribe, getHydratedSnapshot, getServerSnapshot);

  // Keydown handler dep'd on both states. Re-binding on each state change is
  // cheap (single addEventListener swap on rare events) and React Compiler
  // memoizes the handler reference automatically. Trying to keep the dep
  // empty by mirroring state to refs (the typical "stale closure" trick)
  // would now break the React 19 `react-hooks/refs` lint rule which
  // disallows ref writes during render.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K — toggle search modal
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
        return;
      }
      // "/" — open search. Skip when typing in any editable context
      // (input/textarea/select/contentEditable), during IME composition,
      // and when modifiers are held (Ctrl+/ etc. to nie nasz skrót).
      if (e.key === "/" && !searchOpen) {
        if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target?.isContentEditable) return;
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      // Escape — close mobile menu (search modal handles its own ESC).
      // Focus is restored to the hamburger trigger so keyboard users don't
      // lose their position; standard pattern for collapsible UI components.
      if (e.key === "Escape" && mobileOpen) {
        setMobileOpen(false);
        hamburgerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen, mobileOpen]);

  // Close mobile menu on route change. Header lives in the root layout, so
  // React state persists across navigation — without this, opening the menu
  // and using browser back/forward would leave it visually open. We use the
  // "store-previous-and-compare" pattern (React docs:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // instead of useEffect to satisfy the React 19 set-state-in-effect rule.
  // The setState calls during render are batched by React and only fire once
  // per pathname change.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  // Logo click handler — when already on home, prevent the no-op route change
  // and smooth-scroll to top instead. Stable identity via useCallback so the
  // <Link> doesn't re-bind on every render (React Compiler likely memoizes
  // anyway, but explicit is cheap insurance).
  const handleLogoClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (pathname === "/") {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [pathname]
  );

  // Standard pill class for mobile menu links — extracted to dedupe across
  // the "Wszystko" link and the categories map below.
  const mobileLinkClass = (active: boolean) =>
    cn(
      "rounded-md px-3 py-2.5 text-sm transition-colors",
      active
        ? "bg-foreground text-background font-bold"
        : "text-muted-foreground font-medium hover:text-foreground hover:bg-muted/50"
    );

  return (
    <>
      {/* `id="site-header"` (semantically correct for the banner landmark)
          and `tabIndex={-1}` (allows focus to land here when skip-link
          targets `#site-header` from inside an article). */}
      <header
        id="site-header"
        tabIndex={-1}
        className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60"
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo — also works as scroll-to-top when already on the home page
              (Next.js skips the route change when href matches current path,
              so we need an explicit handler). */}
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2"
            onClick={handleLogoClick}
          >
            <span className="font-heading text-xl font-extrabold tracking-tight text-foreground">
              aifeed<span className="text-primary">.</span>
            </span>
          </Link>

          {/* Right actions — search trigger, theme toggle, mobile hamburger.
              Desktop nav links removed: "Najnowsze" duplicated the logo (both
              point to /) and "RSS" pushed users into raw XML. RSS discovery
              still works via `<link rel="alternate">` in <head>. Categories
              live in CategoryBar (below header) on desktop and the mobile
              menu (below).

              Wrapper is a plain <div> (not <nav> nor role="toolbar"): these
              are UI controls (toggle search modal, swap theme, open menu),
              not navigation links — they don't take you anywhere. */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label={`Szukaj (${searchShortcut})`}
              title={`Szukaj (${searchShortcut})`}
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Search className="size-4" aria-hidden="true" />
            </button>
            <ThemeToggle />

            <button
              ref={hamburgerRef}
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors md:hidden"
              aria-label={mobileOpen ? "Zamknij menu" : "Otwórz menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
            >
              {mobileOpen ? (
                <X className="size-4" aria-hidden="true" />
              ) : (
                <Menu className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile nav — semantyczny outer landmark zamiast zagnieżdżonego
            `<nav>` w `<div>`. `id="mobile-nav"` dopasowane do `aria-controls`
            na hamburgerze (linkuje przycisk z kontrolowanym landmarkiem).
            `aria-label` rozróżnia ten landmark od innych `<nav>` na stronie
            (CategoryBar ma "Kategorie", Breadcrumbs ma "Ścieżka nawigacji").
            `inert={!mobileOpen}` — gdy menu zamknięte (height 0), wyłącza
            interaktywność: linki nie są focusowalne klawiaturą i znikają z
            drzewa accessibility. Bez tego user mógłby Tab'ować w "niewidoczne"
            linki (visualnie collapsed, semantically still active).
            Animacja grid-rows-[0fr → 1fr] — modern auto-height bez JS,
            wsparcie Chrome 117+ / Firefox 124+ / Safari 17.4+. */}
        <nav
          id="mobile-nav"
          aria-label="Menu mobilne"
          inert={!mobileOpen}
          className={cn(
            "grid md:hidden transition-[grid-template-rows] duration-300 ease-out",
            mobileOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          {/* Inner clip wrapper łączy 3 funkcje: overflow:hidden (clip podczas
              animacji), border-t (separator wizualny pod headerem),
              bg-background (tło zasłaniające content pod menu). */}
          <div className="overflow-hidden border-t border-border/50 bg-background">
            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
              <ul role="list" className="flex flex-col gap-0.5">
                <li>
                  <Link
                    href="/"
                    aria-current={hydrated && pathname === "/" ? "page" : undefined}
                    className={cn("block", mobileLinkClass(hydrated && pathname === "/"))}
                  >
                    Wszystko
                  </Link>
                </li>
                {siteConfig.categories.map((cat) => {
                  const href = `/kategoria/${cat.slug}`;
                  const active = hydrated && pathname === href;
                  return (
                    <li key={cat.slug}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn("block", mobileLinkClass(active))}
                      >
                        {cat.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </nav>
      </header>

      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}

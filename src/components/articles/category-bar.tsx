"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Category } from "@/types/database";
import { cn } from "@/lib/utils";

interface CategoryBarProps {
  categories: Category[];
}

const SCROLL_STORAGE_KEY = "aifeed:category-bar-scroll";

export function CategoryBar({ categories }: CategoryBarProps) {
  const pathname = usePathname();
  const activeSlug = pathname.startsWith("/kategoria/")
    ? pathname.split("/")[2]
    : undefined;
  const isHome = pathname === "/";
  const isHidden = pathname.startsWith("/artykul/");
  const scrollerRef = useRef<HTMLUListElement>(null);

  // Restore scroll position; persist on scroll. sessionStorage throws
  // QuotaExceededError in Safari private mode and SecurityError when
  // disabled by site settings — wrapped so a private-tab user never breaks
  // the bar entirely.
  //
  // Zależność od `isHidden` jest KONIECZNA: layout trzyma komponent
  // zamontowany między nawigacjami, a na `/artykul/*` renderujemy null —
  // efekt z `[]` odpaliłby się raz z `scrollerRef.current === null`
  // (pierwsza strona = artykuł) i listener nigdy by się nie podpiął.
  useEffect(() => {
    if (isHidden) return;
    const el = scrollerRef.current;
    if (!el) return;

    try {
      const saved = sessionStorage.getItem(SCROLL_STORAGE_KEY);
      if (saved) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed)) el.scrollLeft = parsed;
      }
    } catch {
      // sessionStorage unavailable — degrade gracefully, no scroll restore.
    }

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        try {
          sessionStorage.setItem(SCROLL_STORAGE_KEY, String(el.scrollLeft));
        } catch {
          // ignore — scroll position is non-critical
        }
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [isHidden]);

  // Ensure the active pin is visible after navigation. Runs when the active
  // route changes; if the active pin lies outside the scroller's visible area
  // (e.g. session-restored scroll left it off-screen, or the user navigated
  // from "Wszystko" straight to "Poradniki" at the far right), scroll it
  // into the horizontal center. Skips when already visible to avoid
  // overriding useful scroll position the user set themselves.
  //
  // Uses manual `el.scrollTo()` rather than `activeLink.scrollIntoView()` —
  // the latter could trigger page-level vertical scroll if the bar has been
  // scrolled past in the viewport (jumping the page back to the top against
  // the user's intent).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const activeLink = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (!activeLink) return;

    const elRect = el.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const fullyVisible =
      linkRect.left >= elRect.left && linkRect.right <= elRect.right;
    if (fullyVisible) return;

    // Respect prefers-reduced-motion — `scrollTo({ behavior: "smooth" })`
    // honors this in newer browsers, but support varies (Safari notably
    // only added it in 15.4). Detecting + branching is the safe path.
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Centre the pin within the scroller. Math.max(0, …) clamps to start
    // when the active is already near the left edge (target would be
    // negative); the browser already clamps the right end.
    const target =
      activeLink.offsetLeft - (el.clientWidth - activeLink.offsetWidth) / 2;
    el.scrollTo({
      left: Math.max(0, target),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [activeSlug, isHome]);

  // Hidden on single article pages — owner decision: the article surface
  // stays focused on the content. Use nav + aria-current="page" rather than
  // role="tablist"/role="tab" (tabs imply an ARIA-associated tabpanel; these
  // links navigate to a new route, which is nav semantics, not tabs).
  if (isHidden) return null;

  // Pill class helper — keeps active/inactive variants consistent between
  // the "Wszystko" link and the categories map below. Same pattern as
  // `mobileLinkClass` in `header.tsx`. Layout concerns (no-shrink,
  // no-wrap) live on the parent <li>, not here — see comment on the <li>.
  const pillClass = (active: boolean) =>
    cn(
      "rounded-full px-4 py-1.5 text-sm transition-colors",
      active
        ? "bg-foreground text-background font-bold shadow-sm"
        : "text-muted-foreground font-medium hover:text-foreground hover:bg-muted"
    );

  return (
    <nav aria-label="Kategorie" className="border-b border-border/40 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Scrollable track jako `<ul role="list">` — semantyczna lista
            linków. `role="list"` defensywne: Tailwind reset usuwa
            list-style, co w Safari + VoiceOver przesłania natywną rolę listy. */}
        <ul
          ref={scrollerRef}
          role="list"
          className="no-scrollbar flex items-center gap-2 overflow-x-auto py-3"
        >
          {/* `shrink-0 whitespace-nowrap` na `<li>` (nie na <a>!) — `<li>`
              jest tutaj flex itemem (bezpośrednim dzieckiem flex `<ul>`),
              a nie `<a>` w środku. `shrink-0` zapobiega kurczeniu pinów
              poniżej content width na ciasnym viewport (mobile), gdzie
              flex algorithm domyślnie skraca itemy żeby zmieściły się w
              container. `whitespace-nowrap` inherited do potomnego `<a>` —
              chroni dodatkowo przed wrap'em tekstu wewnątrz pinu, gdyby
              kiedyś flex layout się zmienił. */}
          <li className="shrink-0 whitespace-nowrap">
            <Link
              href="/"
              aria-current={isHome ? "page" : undefined}
              className={pillClass(isHome)}
            >
              Wszystko
            </Link>
          </li>
          {categories.map((cat) => {
            const isActive = activeSlug === cat.slug;
            return (
              <li key={cat.slug} className="shrink-0 whitespace-nowrap">
                <Link
                  href={`/kategoria/${cat.slug}`}
                  aria-current={isActive ? "page" : undefined}
                  className={pillClass(isActive)}
                >
                  {cat.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

"use client";

import { useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { useScrollY } from "@/lib/hooks/use-scroll-y";

// useLayoutEffect warns on the server; swap to useEffect during SSR.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function ScrollToTop() {
  const pathname = usePathname();
  const scrollY = useScrollY();
  const visible = scrollY > 400;

  // Flagi sterujące resetem scrolla:
  // - `isFirstRender` — na hydracji NIE resetujemy (przeglądarka właśnie
  //   przywraca pozycję po reloadzie; reset by ją wymazał).
  // - `isPopNavigation` — Wstecz/Dalej (popstate) też NIE resetuje;
  //   przywracanie pozycji przez przeglądarkę/Next ma pierwszeństwo.
  //   Reset dotyczy wyłącznie zwykłych nawigacji (kliknięcia w linki).
  const isFirstRender = useRef(true);
  const isPopNavigation = useRef(false);

  useEffect(() => {
    const onPop = () => {
      isPopNavigation.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Reset scroll SYNCHRONOUSLY before paint on route change so the user never
  // sees the previous page's scroll position applied to the new page. Running
  // in useEffect (after paint) leaves a visible flash — the new page is shown
  // at the old scroll offset and then jumps. Anchor links (URL hash) are
  // honored — the browser scrolls to the target itself, so we skip the reset.
  useIsoLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (isPopNavigation.current) {
      isPopNavigation.current = false;
      return;
    }
    if (window.location.hash) return;

    // `behavior: "instant"` overrides any CSS `scroll-behavior: smooth` for
    // this programmatic jump. A smooth animation on route change looks like
    // the navigation failed.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  const scrollToTop = useCallback(() => {
    // WCAG 2.3.3 — smooth scroll tylko gdy użytkownik nie prosi o mniej ruchu.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }, []);

  return (
    <button
      onClick={scrollToTop}
      aria-label="Wróć na górę"
      // Ukryty przycisk musi wypaść z tab-order i accessibility tree —
      // inaczej klawiaturowy użytkownik tabuje w niewidzialny element.
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={`fixed bottom-5 right-5 z-40 flex size-10 items-center justify-center rounded-full border border-border/60 bg-card/90 backdrop-blur-sm text-muted-foreground shadow-md transition-all duration-300 hover:text-foreground hover:border-primary/40 hover:shadow-lg ${
        visible
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0 pointer-events-none"
      }`}
    >
      <ArrowUp className="size-4" aria-hidden="true" />
    </button>
  );
}

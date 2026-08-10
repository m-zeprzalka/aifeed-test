"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

interface TickerItem {
  title: string;
  slug: string;
}

interface NewsTickerProps {
  items: TickerItem[];
}

const PIXELS_PER_SECOND = 40;

// Snapshot items on first render and never react to prop updates after that.
// Why: the root layout re-fetches on every navigation, so `items` gets a fresh
// reference on each route change. Updating the animation against that risks
// cancelling the WAAPI track and leaving it frozen if the rebuild catches the
// DOM mid-reconciliation (offsetWidth = 0). Trading off in-session freshness
// for a guaranteed always-scrolling marquee.
export function NewsTicker({ items }: NewsTickerProps) {
  const [snapshot] = useState<TickerItem[]>(items);
  const trackRef = useRef<HTMLDivElement>(null);
  const firstListRef = useRef<HTMLUListElement>(null);
  const animationRef = useRef<Animation | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    const firstList = firstListRef.current;
    if (!track || !firstList || snapshot.length === 0) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let pendingFrame = 0;

    // Classic CSS-marquee pattern adapted to WAAPI: track holds two copies
    // of the list side-by-side. Animation translates the entire track from
    // 0 to -firstListWidth — exactly the width of one copy. At progress=1
    // the clone occupies the screen position the original held at progress=0,
    // so when WAAPI iterates back to 0 the visible content is pixel-identical
    // and the loop seam is invisible. No empty-bar gap between cycles.
    //
    // The previous single-list approach used `iterationStart` to start mid-
    // iteration, which made the FIRST frame look correct but still left a
    // visible gap on every subsequent loop (track had to traverse the full
    // viewport width while empty before re-entering). Duplication eliminates
    // that gap entirely.
    const buildAnimation = () => {
      if (cancelled || !track || !firstList) return;
      // Width of ONE copy. `scrollWidth` over `offsetWidth` because the
      // track itself overflows its parent (overflow:hidden) — `offsetWidth`
      // would clip to the parent's visible width.
      const oneListWidth = firstList.scrollWidth;
      if (oneListWidth === 0) return;

      animationRef.current?.cancel();
      const duration = (oneListWidth / PIXELS_PER_SECOND) * 1000;

      animationRef.current = track.animate(
        [
          { transform: "translate3d(0, 0, 0)" },
          { transform: `translate3d(-${oneListWidth}px, 0, 0)` },
        ],
        { duration, iterations: Infinity, easing: "linear" }
      );
    };

    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    fontsReady.then(buildAnimation);

    // Debounced ResizeObserver — coalesces rapid resize events (font load +
    // window resize + dev HMR mogą fire'ować 5-10× w szybkiej serii) do
    // jednego rebuildu na klatkę. Bez tego każdy event cancel'uje i tworzy
    // nową animację, co daje widoczne stuttery. Observe firstList only;
    // clone is identical so its width changes in lockstep.
    const ro = new ResizeObserver(() => {
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = 0;
        buildAnimation();
      });
    });
    ro.observe(firstList);

    // IntersectionObserver — pauzuje WAAPI gdy ticker jest scroll'nięty poza
    // viewport (czyli user przeczytał już górę i jest w połowie strony).
    // Niewielka oszczędność GPU + battery, zerowy wpływ na UX (i tak nie
    // widać). Animation track jest na compositor layer, więc raczej tani —
    // ale to praktyka best-in-class.
    const io = new IntersectionObserver(
      ([entry]) => {
        const anim = animationRef.current;
        if (!anim) return;
        if (entry.isIntersecting) {
          if (document.visibilityState === "visible" && anim.playState !== "running") {
            anim.play();
          }
        } else {
          anim.pause();
        }
      },
      { threshold: 0 }
    );
    io.observe(track);

    // Browsers suspend WAAPI when the tab is hidden; resume on return.
    // pageshow handles bfcache restoration on Safari/Firefox.
    const resume = () => {
      const anim = animationRef.current;
      if (
        document.visibilityState === "visible" &&
        anim &&
        anim.playState !== "running"
      ) {
        anim.play();
      }
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);

    return () => {
      cancelled = true;
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
      animationRef.current?.cancel();
      animationRef.current = null;
    };
  }, [snapshot]);

  // Pause-on-hover is intentional for desktop, but touch devices synthesize
  // `mouseenter` on tap without a reliable matching `mouseleave` once the user
  // navigates away — leaving the marquee frozen across route changes. Gate the
  // handlers on the actual pointer type so phones never pause.
  //
  // Pause-on-focus (WCAG 2.2.2): klawiaturowy użytkownik tabujący po linkach
  // tickera dostaje zatrzymany marquee — bez tego linki fizycznie uciekają
  // spod fokusa. onFocus/onBlur w React bąbelkują (odpowiednik focusin/out).
  const handlePointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    animationRef.current?.pause();
  };
  const handlePointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    animationRef.current?.play();
  };
  const handleFocusIn = () => {
    animationRef.current?.pause();
  };
  const handleFocusOut = (e: React.FocusEvent) => {
    // Wznów tylko gdy fokus faktycznie opuścił ticker (nie przeskok
    // między linkami wewnątrz).
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    animationRef.current?.play();
  };

  if (snapshot.length === 0) return null;

  return (
    <aside
      aria-labelledby="news-ticker-heading"
      className="border-b border-border bg-foreground overflow-hidden p-1"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocusIn}
      onBlur={handleFocusOut}
    >
      {/* Visually-hidden landmark heading. Screen readers can jump to the
          ticker by region; sighted users still see the marquee directly. */}
      <h2 id="news-ticker-heading" className="sr-only">
        Najnowsze artykuły
      </h2>

      {/* Track — flex container holding two copies of the list. WAAPI
          translates this single element; both lists move together. */}
      <div
        ref={trackRef}
        className="flex w-max items-center will-change-transform"
      >
        {/* Authoritative list — semantic, focusable, indexed by crawlers. */}
        <ul
          ref={firstListRef}
          role="list"
          className="flex shrink-0 items-center"
        >
          {snapshot.map((item) => (
            <li
              key={item.slug}
              className="shrink-0 flex items-center whitespace-nowrap"
            >
              <Link
                href={`/artykul/${item.slug}`}
                className="py-1.5 text-xs text-background/70 hover:text-background transition-colors"
              >
                {item.title}
              </Link>
              {/* Trailing bullet on every item — including the last — so the
                  visual flow is continuous when the clone immediately follows
                  the original ("Title20 • Title1 • Title2 …"). Removing the
                  trailing bullet (as the previous design did) would create a
                  visible gap right at the seam between original and clone. */}
              <span
                className="mx-2 text-background/30 text-[8px]"
                aria-hidden="true"
              >
                &bull;
              </span>
            </li>
          ))}
        </ul>

        {/* Visual-only clone — `aria-hidden="true"` removes from the a11y tree
            so screen readers announce 20 items, not 40. Items rendered as
            plain `<span>` (no `<a>`) so the link graph stays single-source —
            crawlers see one set of 20 unique article links per page, matching
            the SEO contract. Marked `inert` to keep clone unreachable by
            keyboard navigation as well. Styling mirrors the original list
            exactly so the seam between original-end and clone-start is
            visually undetectable. */}
        <ul
          role="list"
          aria-hidden="true"
          inert
          className="flex shrink-0 items-center"
        >
          {snapshot.map((item) => (
            <li
              key={`clone-${item.slug}`}
              className="shrink-0 flex items-center whitespace-nowrap"
            >
              <span className="py-1.5 text-xs text-background/70">
                {item.title}
              </span>
              <span className="mx-2 text-background/30 text-[8px]">
                &bull;
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

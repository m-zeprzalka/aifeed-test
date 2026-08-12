import { ImageResponse } from "next/og";

// Jedno źródło prawdy dla wszystkich ikon aplikacji: favicon SVG
// (auto/light/dark), favicon.ico, apple-icon i PWA 192/512. Design = skrót
// typograficznego logo z headera: „ai" w kolorze foreground + kwadratowa
// kropka w primary (kropka w Plus Jakarta Sans jest kwadratowa — to
// autentyczny kształt glifu, identyczny z logo), na tle background.
//
// Ścieżki glifów wyekstrahowane JEDNORAZOWO z PlusJakartaSans-ExtraBold.ttf
// (repo tokotype/PlusJakartaSans, licencja OFL) przez opentype.js:
// `font.getPath("ai.", x, y, 84.7, { kerning: true, letterSpacing: -0.025 })`
// (letterSpacing -0.025em = tracking-tight logo), bbox wycentrowany w
// viewBox 128×128. Dzięki temu w repo nie ma pliku fontu, a glify są
// pixel-identyczne z wordmarkiem — Satori/resvg i przeglądarka dostają
// gotowe outline'y zamiast renderować tekst fallbackowym fontem.
//
// Kolory to DOKŁADNE konwersje tokenów z globals.css (oklch → hex; stare
// stałe #fafafa/#1c1d2e/#5b3df7 w og-image są luźnymi przybliżeniami):
//   light: --background oklch(0.99 0.001 260), --foreground oklch(0.12 0.02 260),
//          --primary oklch(0.50 0.24 270)
//   dark:  --background oklch(0.115 0.018 265), --foreground oklch(0.935 0.008 260),
//          --primary oklch(0.72 0.19 270)
const BRAND_COLORS = {
  light: { bg: "#fbfcfc", fg: "#03060d", dot: "#3646e8" },
  dark: { bg: "#03050b", fg: "#e6eaef", dot: "#7799ff" },
} as const;

const CANVAS = 128;
// Zaokrąglenie kafelka faviconu (~19%). PNG (apple/PWA) renderują full-bleed
// (radius 0) — iOS sam maskuje rogi apple-icon, manifest używa `purpose: "any"`.
const FAVICON_RADIUS = 24;

const AI_PATH =
  "M36.18 96.06L36.18 96.06Q28.72 96.06 24.36 92.5Q20 88.94 20 82.68L20 82.68Q20 76.83 24.07 73.02Q28.13 69.21 36.43 67.85L36.43 67.85L49.22 65.82L49.22 64.55Q49.22 61.92 47.15 60.15Q45.07 58.37 41.51 58.37L41.51 58.37Q38.13 58.37 35.54 60.23Q32.96 62.09 31.77 65.14L31.77 65.14L21.61 60.32Q23.64 54.56 29.19 51.17Q34.74 47.78 42.11 47.78L42.11 47.78Q47.95 47.78 52.44 49.9Q56.93 52.02 59.43 55.78Q61.92 59.55 61.92 64.55L61.92 64.55L61.92 95.04L50.07 95.04L50.07 90.72Q44.82 96.06 36.18 96.06ZM33.13 82.25L33.13 82.25Q33.13 84.37 34.74 85.56Q36.35 86.74 38.72 86.74L38.72 86.74Q43.46 86.74 46.34 83.78Q49.22 80.81 49.22 76.58L49.22 76.58L49.22 75.14L38.72 77Q36.01 77.51 34.57 78.74Q33.13 79.97 33.13 82.25ZM81.83 44.65L69.12 44.65L69.12 31.94L81.83 31.94L81.83 44.65ZM81.83 95.04L69.12 95.04L69.12 48.8L81.83 48.8L81.83 95.04Z";
const DOT_PATH = "M108 95.04L95.3 95.04L95.3 82.34L108 82.34L108 95.04Z";

/** Statyczny wariant SVG o jawnych kolorach (light/dark). */
export function brandIconSvg(theme: "light" | "dark", radius = FAVICON_RADIUS): string {
  const c = BRAND_COLORS[theme];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}">` +
    `<rect width="${CANVAS}" height="${CANVAS}" rx="${radius}" fill="${c.bg}"/>` +
    `<path d="${AI_PATH}" fill="${c.fg}"/>` +
    `<path d="${DOT_PATH}" fill="${c.dot}"/>` +
    `</svg>`
  );
}

/**
 * Wariant „auto": podąża za motywem systemu przez media query wewnątrz SVG
 * (wspierane dla faviconów w Chrome/Firefox/Edge; Safari bierze wariant
 * light — degradacja zgodna z decyzją: domyślnie jasny jak logo).
 * Przełącznik motywu na stronie nadpisuje to dynamicznie — zob.
 * `components/layout/theme-favicon.tsx`.
 */
export function brandIconAutoSvg(): string {
  const l = BRAND_COLORS.light;
  const d = BRAND_COLORS.dark;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}">` +
    `<style>.bg{fill:${l.bg}}.fg{fill:${l.fg}}.dot{fill:${l.dot}}` +
    `@media (prefers-color-scheme:dark){.bg{fill:${d.bg}}.fg{fill:${d.fg}}.dot{fill:${d.dot}}}</style>` +
    `<rect class="bg" width="${CANVAS}" height="${CANVAS}" rx="${FAVICON_RADIUS}"/>` +
    `<path class="fg" d="${AI_PATH}"/>` +
    `<path class="dot" d="${DOT_PATH}"/>` +
    `</svg>`
  );
}

/**
 * Rastrowe ikony (apple-icon, PWA 192/512): ten sam SVG rasteryzowany przez
 * resvg wewnątrz ImageResponse (`<img>` z data URI — Satori nie renderuje tu
 * żadnego tekstu, więc nie potrzebuje pliku fontu). Full bleed, wariant light.
 */
export function renderBrandIcon(size: number) {
  const svg = brandIconSvg("light", 0);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
          width={size}
          height={size}
          alt=""
        />
      </div>
    ),
    { width: size, height: size }
  );
}

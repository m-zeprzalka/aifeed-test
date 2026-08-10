import { ImageResponse } from "next/og";

// Jedno źródło prawdy dla wszystkich rastrowych ikon aplikacji (apple-icon,
// PWA 192/512). Manifest i JSON-LD `Organization.logo` wskazują na te URL-e —
// zanim ten renderer powstał, wskazywały na nieistniejące pliki (404 w
// produkcji, zepsuty install PWA i logo w rich results).
//
// Paleta jak w `app/opengraph-image.tsx` (Satori nie wspiera oklch):
//   --primary: oklch(0.50 0.24 270) ≈ #5b3df7
const COLOR_PRIMARY = "#5b3df7";
const COLOR_TEXT = "#fafafa";

/**
 * Kwadratowa ikona brandowa: skrót wordmarku `aifeed.` — biała litera „a"
 * z kropką na tle primary. Pełny bleed (iOS sam maskuje rogi apple-icon;
 * manifest używa `purpose: "any"`).
 */
export function renderBrandIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: COLOR_PRIMARY,
          color: COLOR_TEXT,
          fontFamily: "system-ui, sans-serif",
          fontSize: Math.round(size * 0.62),
          fontWeight: 800,
          letterSpacing: -Math.round(size * 0.02),
          // Optyczne wyśrodkowanie glifu „a." — kropka dociąża prawą stronę.
          paddingBottom: Math.round(size * 0.06),
        }}
      >
        a.
      </div>
    ),
    { width: size, height: size }
  );
}

"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";

const LINK_ID = "theme-favicon";

// Synchronizuje favicon z AKTYWNYM motywem strony (przełącznik next-themes).
// Statyczny /icon.svg reaguje przez media query tylko na motyw systemu — gdy
// użytkownik wybierze w przełączniku motyw przeciwny do systemowego, favicon
// odjeżdżałby od UI. Po hydratacji doklejamy własny <link rel="icon"> NA
// KOŃCU <head> (przeglądarki biorą ostatni pasujący link, więc wygrywa i z
// auto-linkiem favicon.ico, i z /icon.svg z metadanych) i tylko podmieniamy
// mu href przy zmianie motywu. Celowo nie dotykamy linków renderowanych
// przez React/Next — mutowanie ich węzłów kłóciłoby się z hoistingiem <head>
// w React 19. Safari ignoruje dynamiczną podmianę faviconu do przeładowania
// karty — akceptowalna degradacja (dostaje wariant light jak logo).
export function ThemeFavicon() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;

    let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = LINK_ID;
      link.rel = "icon";
      link.type = "image/svg+xml";
      document.head.appendChild(link);
    }

    const href = resolvedTheme === "dark" ? "/icon-dark.svg" : "/icon-light.svg";
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
  }, [resolvedTheme]);

  return null;
}

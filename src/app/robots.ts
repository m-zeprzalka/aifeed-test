import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // /admin/ jest chronione Basic Auth + noindex w metadata + X-Robots-Tag
      // w proxy — wpis tutaj dorzuca trzecią warstwę (crawler nawet nie
      // próbuje hitować).
      //
      // /szukaj celowo NIE jest disallow'owane: strona ma meta `noindex` i
      // Google musi móc ją scrawlować, żeby ten noindex zobaczyć. Disallow +
      // noindex to sprzeczne sygnały ("Indexed, though blocked by robots.txt").
      // Dawny wpis `/_next/data/` usunięty — to artefakt Pages Routera,
      // App Router serwuje payloady RSC na URL-u strony (`?_rsc=`).
      disallow: ["/api/", "/admin/"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}

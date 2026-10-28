import { notFound } from "next/navigation";
import { isCategorySlug } from "@/config/site";

/**
 * Bramka 404 dla nieznanych kategorii. Musi żyć w LAYOUCIE: strona czyta
 * `searchParams` (paginacja), więc jest dynamiczna, a `loading.tsx` owija ją
 * granicą Suspense — nagłówki 200 lecą do klienta, zanim `notFound()`
 * w page.tsx zdąży ustawić status (soft-404: 200 + noindex). Layout renderuje
 * się PRZED tą granicą, a katalog kategorii jest zamknięty (siteConfig), więc
 * sprawdzenie jest synchroniczne — zero zapytań do bazy.
 */
export default async function CategoryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isCategorySlug(slug)) notFound();
  return children;
}

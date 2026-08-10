"use client";

import { RouteError } from "@/components/ui/route-error";

export default function TagError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      {...props}
      description="Nie udało się załadować artykułów z tego tagu. Spróbuj ponownie lub wróć do strony głównej."
    />
  );
}

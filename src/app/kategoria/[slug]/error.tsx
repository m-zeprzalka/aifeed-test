"use client";

import { RouteError } from "@/components/ui/route-error";

export default function CategoryError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      {...props}
      description="Nie udało się załadować kategorii. Spróbuj ponownie lub wróć do strony głównej."
    />
  );
}

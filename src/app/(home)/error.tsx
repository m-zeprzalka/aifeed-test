"use client";

import { RouteError } from "@/components/ui/route-error";

export default function HomeError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      {...props}
      description="Nie udało się załadować strony głównej. Odśwież lub spróbuj za chwilę."
    />
  );
}

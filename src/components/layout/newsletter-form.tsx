"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";

interface NewsletterFormProps {
  variant?: "default" | "compact";
}

export function NewsletterForm({ variant = "default" }: NewsletterFormProps) {
  const [email, setEmail] = useState("");
  // Honeypot (zob. /api/newsletter) — ludzie go nie widzą i nie wypełniają.
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), website }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.error || "Nie udało się zapisać.");
      }
    } catch {
      setStatus("error");
      setMessage("Wystąpił błąd połączenia.");
    }
  };

  if (status === "success") {
    // Double opt-in: zapis jest aktywny dopiero po kliknięciu w link z maila.
    // green-700/300 zamiast 600/400 — kontrast WCAG AA na tle muted.
    return (
      <div role="status" className="flex items-start gap-2 text-sm text-green-700 dark:text-green-300">
        <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-semibold">Prawie gotowe!</strong> Sprawdź skrzynkę i kliknij link
          potwierdzający — bez tego nie wyślemy Ci newslettera.
        </span>
      </div>
    );
  }

  const isCompact = variant === "compact";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input
          type="email"
          required
          autoComplete="email"
          aria-label="Adres email do newslettera"
          aria-invalid={status === "error"}
          aria-describedby={status === "error" ? "newsletter-error" : "newsletter-consent"}
          placeholder="twoj@email.pl"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") setStatus("idle");
          }}
          className={`min-w-0 flex-1 rounded-lg border bg-card text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all ${
            status === "error"
              ? "border-destructive"
              : "border-border"
          } ${isCompact ? "px-3 py-2" : "px-4 py-2.5"}`}
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className={`shrink-0 rounded-lg bg-foreground font-medium text-background hover:bg-foreground/90 transition-colors disabled:opacity-50 ${
            isCompact ? "px-4 py-2 text-sm" : "px-5 py-2.5 text-sm font-bold"
          }`}
        >
          {status === "loading" ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            "Subskrybuj"
          )}
        </button>
      </div>
      {/* Honeypot — poza ekranem i poza drzewem a11y/tab-order. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="absolute -left-[9999px] h-px w-px opacity-0"
      />
      {status === "error" ? (
        <p id="newsletter-error" role="alert" className="text-xs text-destructive">
          {message}
        </p>
      ) : (
        <p id="newsletter-consent" className="text-[11px] leading-snug text-muted-foreground/80">
          Wyślemy e-mail z linkiem potwierdzającym. Wypiszesz się jednym kliknięciem.{" "}
          <Link href="/polityka-prywatnosci" className="underline underline-offset-2 hover:text-foreground">
            Polityka prywatności
          </Link>
        </p>
      )}
    </form>
  );
}

import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";
import { subscribeToNewsletter } from "@/lib/newsletter/mailerlite";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Zapis na newsletter → MailerLite (od razu aktywny, `lib/newsletter/mailerlite.ts`).
 * Odpowiedź dla "nowy adres" i "adres już na liście" jest identyczna — nie
 * zdradzamy, kto jest subskrybentem.
 */
export async function POST(request: Request) {
  // Limit (5 req/min/IP) jest zdefiniowany centralnie w `LIMITS` w
  // `src/lib/rate-limit.ts` — tu trzymamy tylko typ klucza.
  const ip = clientIp(request);
  const { allowed } = await checkRateLimit("newsletter", ip);
  if (!allowed) {
    return NextResponse.json({ error: "Zbyt wiele prób. Spróbuj za chwilę." }, { status: 429 });
  }

  let payload: { email?: unknown; website?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe żądanie" }, { status: 400 });
  }

  // Honeypot: pole niewidoczne dla ludzi, wypełniane przez boty. Udajemy
  // sukces (bot nie dostaje sygnału), ale niczego nie wysyłamy — fałszywe
  // zapisy to odbicia i skargi na spam, które psują reputację nadawcy.
  if (typeof payload.website === "string" && payload.website.trim() !== "") {
    return NextResponse.json({ success: true });
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Email jest wymagany" }, { status: 400 });
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Nieprawidłowy adres email" }, { status: 400 });
  }

  switch (await subscribeToNewsletter({ email, ip })) {
    case "created":
    case "existing":
      return NextResponse.json({ success: true });
    case "invalid-email":
      return NextResponse.json({ error: "Nieprawidłowy adres email" }, { status: 400 });
    case "not-configured":
      return NextResponse.json({ error: "Zapisy na newsletter ruszają wkrótce." }, { status: 503 });
    case "error":
      return NextResponse.json({ error: "Nie udało się zapisać. Spróbuj ponownie za chwilę." }, { status: 502 });
  }
}

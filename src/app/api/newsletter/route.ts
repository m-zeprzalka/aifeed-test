import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";

    // Limit (5 req/min/IP) jest zdefiniowany centralnie w `LIMITS` w
    // `src/lib/rate-limit.ts` — tu trzymamy tylko typ klucza.
    const { allowed } = await checkRateLimit("newsletter", ip);
    if (!allowed) {
      return NextResponse.json(
        { error: "Zbyt wiele prób. Spróbuj za chwilę." },
        { status: 429 }
      );
    }

    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email jest wymagany" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email.length > 254 || !emailRegex.test(email)) {
      return NextResponse.json({ error: "Nieprawidłowy adres email" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Błąd konfiguracji serwera" }, { status: 500 });
    }

    const supabase = createClient(url, key);

    const { error } = await supabase
      .from("newsletter_subscribers")
      .upsert(
        { email: email.toLowerCase().trim(), subscribed_at: new Date().toISOString() },
        { onConflict: "email" }
      );

    if (error) {
      console.error("[newsletter] Insert failed:", error.message);
      return NextResponse.json({ error: "Nie udało się zapisać. Spróbuj ponownie." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Wystąpił błąd" }, { status: 500 });
  }
}

/**
 * IP klienta dla rate limitera. Na Vercelu `x-forwarded-for` ustawia
 * platforma (nadpisuje wartość od klienta), więc pierwszy wpis jest
 * wiarygodny; `x-real-ip` to fallback dla `next start` za innym proxy.
 */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

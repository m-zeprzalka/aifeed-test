import { renderBrandIcon } from "@/lib/brand-icon";

// File-convention: Next emituje <link rel="apple-touch-icon"> automatycznie.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderBrandIcon(size.width);
}

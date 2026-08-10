/**
 * Strip inline markdown (bold/italic/code/links) from a heading's raw text,
 * leaving plain text. Shared by the TOC (parses raw markdown) and the
 * article renderer (extracts text from React children) so both sides slugify
 * IDENTYCZNY string — inaczej kotwice spisu treści przestają trafiać
 * w nagłówki, gdy LLM wstawi `**bold**` albo link do nagłówka.
 */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) / ![alt](url) → text
    .replace(/`([^`]*)`/g, "$1")               // `code` → code
    .replace(/(\*\*|__)(.*?)\1/g, "$2")        // **bold** → bold
    .replace(/(\*|_)(.*?)\1/g, "$2")           // *italic* → italic
    .trim();
}

/**
 * Produce a stable, URL-safe ID for a Markdown heading.
 * Preserves meaning by transliterating Polish diacritics (ą→a, ś→s, ż→z…)
 * via NFD decomposition + combining-mark strip, then collapses whitespace
 * to `-` and drops any remaining non-alphanumeric characters.
 */
export function slugifyHeading(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

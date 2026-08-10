"use client";

import { useMemo } from "react";
import { slugifyHeading, stripInlineMarkdown } from "@/lib/heading-id";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function extractHeadings(markdown: string): TocItem[] {
  const headings: TocItem[] = [];
  let inCodeFence = false;
  for (const line of markdown.split("\n")) {
    // `## coś` wewnątrz bloku ``` to kod (np. komentarz bash), nie nagłówek.
    if (/^```/.test(line.trim())) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const match = line.match(/^(#{2,3})\s+(.+)/);
    if (match) {
      const level = match[1].length;
      // Strip inline markdown PRZED slugify — renderer po swojej stronie
      // widzi już czysty tekst (React children), więc obie strony muszą
      // slugifikować ten sam string.
      const text = stripInlineMarkdown(match[2].trim());
      headings.push({ id: slugifyHeading(text), text, level });
    }
  }
  return headings;
}

interface TableOfContentsProps {
  content: string;
}

export function TableOfContents({ content }: TableOfContentsProps) {
  const headings = useMemo(() => extractHeadings(content), [content]);

  // Threshold lowered from 3 to 2: a 2-section article still benefits from
  // visible structure ("here's what's covered") and the navigation cost of
  // showing two anchors is essentially zero.
  if (headings.length < 2) return null;

  return (
    <nav aria-label="Spis treści" className="mb-10">
      <h2 id="spis-tresci" className="mb-3 text-[11px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
        Spis treści
      </h2>
      <ol className="space-y-1.5">
        {headings.map((h) => (
          <li key={h.id} className={h.level === 3 ? "pl-4" : ""}>
            <a
              href={`#${h.id}`}
              className="text-sm leading-snug text-muted-foreground hover:text-foreground transition-colors"
            >
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

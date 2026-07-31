import type { ReactNode } from "react";

/**
 * Render the intentionally small Markdown subset supported by Offering Brief.
 * Text remains React text nodes throughout; no HTML is parsed or injected.
 */
export function renderBriefInline(text: string, keyPrefix = "brief"): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_)/g;
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const key = `${keyPrefix}-${index++}`;
    if (match[2] != null || match[3] != null) {
      nodes.push(<strong key={key}>{match[2] ?? match[3]}</strong>);
    } else {
      nodes.push(<em key={key}>{match[4] ?? match[5]}</em>);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/** Plain preview surfaces should not expose Markdown punctuation. */
export function stripBriefFormatting(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1");
}

import type { ReactNode } from "react";

/**
 * Render the intentionally small Markdown subset supported by Offering Brief.
 * Text remains React text nodes throughout; no HTML is parsed or injected.
 */
export function renderBriefInline(text: string, keyPrefix = "brief"): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\+\+([^+\n]+)\+\+|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_)/g;
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const key = `${keyPrefix}-${index++}`;
    if (match[2] != null && match[3] != null) {
      nodes.push(
        <a
          key={key}
          href={match[3]}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-blue-primary underline decoration-blue-primary/35 underline-offset-2 hover:decoration-blue-primary"
        >
          {match[2]}
        </a>
      );
    } else if (match[4] != null || match[5] != null) {
      nodes.push(<strong key={key}>{match[4] ?? match[5]}</strong>);
    } else if (match[6] != null) {
      nodes.push(
        <span key={key} className="underline decoration-1 underline-offset-2">
          {match[6]}
        </span>
      );
    } else if (match[7] != null) {
      nodes.push(<s key={key}>{match[7]}</s>);
    } else {
      nodes.push(<em key={key}>{match[8] ?? match[9]}</em>);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

/** Plain preview surfaces should not expose Markdown punctuation. */
export function stripBriefFormatting(text: string): string {
  return text
    .replace(/\[([^\]\n]+)\]\(https?:\/\/[^\s)]+\)/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\+\+([^+\n]+)\+\+/g, "$1")
    .replace(/~~([^~\n]+)~~/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "");
}

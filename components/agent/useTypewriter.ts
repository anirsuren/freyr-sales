"use client";

import { useEffect, useRef, useState } from "react";

/**
 * THE REVEAL, SHARED BY BOTH AGENT SURFACES.
 *
 * The full agent page has typed its replies out since it shipped; the dock
 * popped whole paragraphs into place, which reads as a page load rather than
 * something answering you (Anir, Jul 30: "when it answers, it quickly, very,
 * very quickly types out the answer like a typewriter — like it does on the
 * agent").
 *
 * A hook rather than a component because the two surfaces RENDER differently:
 * the agent page runs its text through MarkdownText, the dock through
 * renderRich (which also builds entity pills). Both just need to know how much
 * of the string to show right now.
 *
 * Timing matches the agent page exactly — ~140 frames over the whole reply at
 * 14ms — so a long answer takes about as long as a short one and neither
 * crawls.
 */
export function useTypewriter(text: string, active: boolean): string {
  const [n, setN] = useState(active ? 0 : text.length);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!active) {
      setN(text.length);
      return;
    }
    setN(0);
    doneRef.current = false;
  }, [text, active]);

  useEffect(() => {
    if (!active || n >= text.length) return;
    const step = Math.max(2, Math.round(text.length / 140));
    const t = setTimeout(
      () => setN((x) => Math.min(text.length, x + step)),
      14
    );
    return () => clearTimeout(t);
  }, [n, text, active]);

  return active ? text.slice(0, n) : text;
}

/**
 * While the reveal is mid-string the visible slice can end inside a Markdown
 * link ("· [open →](/x"), which flashes raw syntax for a frame. Hide a trailing
 * INCOMPLETE link (and any dangling separator) so a link only ever appears once
 * it is whole.
 */
export function trimStreamingLink(s: string): string {
  const lb = s.lastIndexOf("[");
  if (lb === -1) return s;
  const tail = s.slice(lb);
  if (/^\[[^\]]*$/.test(tail) || /^\[[^\]]*\]\([^)]*$/.test(tail)) {
    return s.slice(0, lb).replace(/\s*[·•–—-]\s*$/, "");
  }
  return s;
}

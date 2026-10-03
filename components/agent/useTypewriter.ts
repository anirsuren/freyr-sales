"use client";

import { useEffect, useState } from "react";

/**
 * THE REVEAL, SHARED BY BOTH AGENT SURFACES.
 *
 * The full agent page has typed its replies out since it shipped; the dock
 * popped whole paragraphs into place, which reads as a page load rather than
 * something answering you (Anir, Jul 30: "when it answers, it quickly, very,
 * very quickly types out the answer like a typewriter — like it does on the
 * agent").
 *
 * A hook rather than a component because each surface owns its own message
 * timing and layout. Both pass the revealed string to the shared response
 * renderer, so tables, links, and entity pills stay the same across views.
 *
 * Only non-streamed answers need a reveal. Use elapsed time rather than a
 * chain of render-dependent timers: a busy tab catches up instead of adding
 * another delay for every letter. Limit Markdown updates to 25 per second.
 */
export function useTypewriter(text: string, active: boolean): string {
  const [reveal, setReveal] = useState({ text, active, n: active ? 0 : text.length });

  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReveal({ text, active, n: text.length });
      return;
    }
    setReveal({ text, active, n: 0 });
    if (!text.length) return;
    const started = performance.now();
    const duration = Math.min(900, Math.max(180, text.length * 0.35));
    let frame = 0, lastPaint = started;
    const tick = (now: number) => {
      const n = Math.min(text.length, Math.ceil(text.length * (now - started) / duration));
      if (now - lastPaint >= 40 || n === text.length) {
        lastPaint = now;
        setReveal({ text, active, n });
      }
      if (n < text.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, active]);

  return active ? text.slice(0, reveal.text === text && reveal.active ? reveal.n : 0) : text;
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

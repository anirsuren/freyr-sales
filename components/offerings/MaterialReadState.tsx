"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Sparkles } from "lucide-react";

/**
 * "HAS THE AI READ IT?" — ANSWERED WHERE THE FILE LIVES.
 *
 * Anir, Aug 13: "once it uploads, the AI reads it. That should be some other
 * progress bar, but it shouldn't be a pop-up. It should be somewhere here,
 * underneath where I just uploaded it."
 *
 * So this sits on the material's own row. While the file is still being read
 * it shows a thin indeterminate bar that is honestly indeterminate — the app
 * cannot know how long a deck takes, so it does not pretend to count. Once
 * text is on file the bar is replaced by the fact: how many words Freyr AI
 * took in. Formats with no text to read say that instead of looking stuck.
 *
 * One shared poller per table would be tidier, but a row-level fetch keeps the
 * component droppable anywhere a material is listed, and it stops the moment
 * the answer settles — so a page of read files makes no requests at all.
 */

type State = "reading" | "read" | "no-text";

export function MaterialReadState({
  offeringId,
  docsPath,
}: {
  offeringId: string;
  docsPath: string;
}) {
  const [state, setState] = useState<State | null>(null);
  const [words, setWords] = useState(0);
  const stop = useRef(false);

  useEffect(() => {
    stop.current = false;
    let timer: ReturnType<typeof setTimeout>;
    // Back off as we go: a small file is read in a second, a long deck takes
    // a few. Nothing here hammers the server while someone leaves a tab open.
    const delays = [0, 1200, 2000, 3000, 5000, 8000, 12000, 20000];
    let attempt = 0;

    async function check() {
      if (stop.current) return;
      try {
        const res = await fetch(
          `/api/offerings/${offeringId}/materials/read-status`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths: [docsPath] }),
          }
        );
        const data = await res.json().catch(() => ({}));
        const entry = data?.status?.[docsPath];
        if (entry && !stop.current) {
          setState(entry.state as State);
          setWords(entry.words || 0);
          // Settled states never change again; stop asking.
          if (entry.state !== "reading") return;
        }
      } catch {
        // A failed poll is not worth surfacing — the file is stored either
        // way, and the next attempt may well answer.
      }
      if (stop.current) return;
      attempt += 1;
      if (attempt >= delays.length) return; // give up quietly, stay on "reading"
      timer = setTimeout(check, delays[attempt]);
    }

    check();
    return () => {
      stop.current = true;
      clearTimeout(timer);
    };
  }, [offeringId, docsPath]);

  if (!state) return null;

  if (state === "read") {
    return (
      <span className="mt-1 flex items-center gap-1.5 text-[10.5px] font-semibold text-success">
        <Check size={11} strokeWidth={3} />
        Freyr AI read {words.toLocaleString()} words
      </span>
    );
  }

  if (state === "no-text") {
    return (
      <span className="mt-1 block text-[10.5px] text-text-tertiary">
        No text inside to read
      </span>
    );
  }

  return (
    <span className="mt-1 block max-w-[220px]">
      <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-blue-primary">
        <Sparkles size={11} strokeWidth={2.4} className="animate-pulse" />
        Freyr AI is reading it…
      </span>
      {/* Indeterminate on purpose: a sweep says "working" without inventing a
          percentage nobody can predict. */}
      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-blue-light">
        <span className="block h-full w-1/3 rounded-full bg-blue-primary reading-sweep" />
      </span>
    </span>
  );
}

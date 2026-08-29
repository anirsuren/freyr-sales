"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileQuestion, Sparkles } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

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

/** "504 KB", "32.4 MB" — the size a person says out loud (Anir, Aug 20: "I
 *  want to see the file size on all these as well"). */
function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(n >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function MaterialReadState({
  offeringId,
  docsPath,
}: {
  offeringId: string;
  docsPath: string;
}) {
  const [state, setState] = useState<State | null>(null);
  const [words, setWords] = useState(0);
  const [bytes, setBytes] = useState<number | null>(null);
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
          if (typeof entry.bytes === "number") setBytes(entry.bytes);
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

  /**
   * THE SENTENCE BECOMES AN ICON (Anir, Aug 28: "this looks so weird… instead
   * of the green text, you can just remove that. I feel like you can just have
   * some sort of icon, and then when I hover over it, you can say that").
   *
   * "Freyr AI read 438 words · 9.8 MB" was a flex row under a file name, so a
   * narrow column broke it wherever a space fell — mid-sentence and then
   * mid-size: "Freyr AI read 438 / words · 9.8 / MB". It is a reassurance you
   * want once, not a sentence you re-read on every row.
   *
   * So: a badge that says READ at a glance, the word count behind it on hover,
   * and the size as the only text — which is the fact people actually scan
   * for, and it is short enough never to wrap.
   */
  if (state === "read") {
    return (
      <span className="mt-1 flex items-center gap-1.5">
        <Tooltip
          label={`Freyr AI read this file — ${words.toLocaleString()} words`}
          side="top"
        >
          <span
            aria-label={`Freyr AI read this file, ${words.toLocaleString()} words`}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[rgba(22,163,74,0.12)] text-success"
          >
            <Check size={10} strokeWidth={3.2} aria-hidden="true" />
          </span>
        </Tooltip>
        {bytes !== null && (
          <span className="whitespace-nowrap text-[10.5px] font-medium text-text-tertiary">
            {fmtBytes(bytes)}
          </span>
        )}
      </span>
    );
  }

  if (state === "no-text") {
    return (
      <span className="mt-1 flex items-center gap-1.5">
        <Tooltip
          label="No readable text inside — stored and downloadable as it is"
          side="top"
        >
          <span
            aria-label="No readable text inside; stored and downloadable as it is"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-surface text-text-tertiary"
          >
            <FileQuestion size={10} strokeWidth={2.4} aria-hidden="true" />
          </span>
        </Tooltip>
        {bytes !== null && (
          <span className="whitespace-nowrap text-[10.5px] font-medium text-text-tertiary">
            {fmtBytes(bytes)}
          </span>
        )}
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

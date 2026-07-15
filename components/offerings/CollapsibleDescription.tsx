"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// Long MPR descriptions (bulleted service scopes) can run very tall — collapse
// them behind a "Show more" so the overview stays compact, but leave short
// descriptions untouched (no toggle). Preserves whitespace/bullets.
export function CollapsibleDescription({
  text,
  className = "",
  threshold = 420,
}: {
  text: string;
  className?: string;
  threshold?: number;
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > threshold;

  if (!long) {
    return (
      <p className={`text-[14px] text-text-secondary leading-relaxed whitespace-pre-line ${className}`}>
        {text}
      </p>
    );
  }

  return (
    <div>
      <div className="relative">
        <p
          className={`text-[14px] text-text-secondary leading-relaxed whitespace-pre-line ${
            open ? "" : "max-h-[9rem] overflow-hidden"
          } ${className}`}
        >
          {text}
        </p>
        {!open && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-blue-primary hover:underline"
      >
        {open ? (
          <>
            Show less <ChevronUp size={14} strokeWidth={2} />
          </>
        ) : (
          <>
            Show more <ChevronDown size={14} strokeWidth={2} />
          </>
        )}
      </button>
    </div>
  );
}

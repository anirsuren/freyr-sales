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
        {/* The fade is a MASK, not a white overlay — a `from-white` gradient
            painted a pale smear across the collapsed text in dark mode. */}
        <p
          className={`text-[14px] text-text-secondary leading-relaxed whitespace-pre-line ${
            open
              ? ""
              : "max-h-[9rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black_72%,transparent_100%)]"
          } ${className}`}
        >
          {text}
        </p>
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

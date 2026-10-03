"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/Avatar";

/** Compact identity preview: overlapping faces fan apart on hover or focus. */
export function AvatarStack({ names, max = 5, avatarClassName = "h-6 w-6 text-[8px]" }: { names: string[]; max?: number; avatarClassName?: string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = names.slice(0, max);
  const hidden = names.length - visible.length;
  return <span className="inline-flex shrink-0 items-center px-1 py-0.5" onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)} onFocusCapture={() => setExpanded(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setExpanded(false); }} aria-label={names.join(", ")}>
    {visible.map((name, index) => <span key={`${name}-${index}`} title={name} className="relative inline-flex rounded-full ring-2 ring-white transition-[margin,transform] duration-200 ease-out motion-reduce:transition-none hover:!z-30 hover:-translate-y-0.5 hover:scale-110" style={{ marginLeft: index ? expanded ? 4 : -7 : 0, zIndex: expanded ? visible.length - index : index + 1 }}><Avatar name={name} className={avatarClassName} /></span>)}
    {hidden > 0 && <span title={names.slice(max).join(", ")} className="ml-1.5 text-[10px] font-semibold tabular-nums text-text-secondary">+{hidden}</span>}
  </span>;
}

"use client";

import { cn } from "@/lib/utils";
import { safeHref } from "@/lib/safeUrl";

// The real LinkedIn logo (Suren supplied the file — no AI-drawn mark) as a
// small icon-link that opens the person's profile. Default: bare inline icon
// with a subtle opacity hover. Pass `label` to render it as a labelled button
// chip (glyph + text) instead — the caller styles the chip via className.
// Renders nothing when there's no URL.
export function LinkedInLink({
  url,
  size = 15,
  label,
  className,
}: {
  url?: string | null;
  size?: number;
  label?: string;
  className?: string;
}) {
  /* Only a real web address becomes a link. Four routes write this field and
     two of them barely check it, so the reader refuses rather than trusting
     the writer — see lib/safeUrl. */
  const href = safeHref(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label="View LinkedIn profile"
      title="LinkedIn"
      className={cn(
        "inline-flex items-center shrink-0 align-middle",
        label ? "gap-1.5" : "justify-center hover:opacity-75 transition-opacity",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/linkedin.webp"
        alt="LinkedIn"
        width={size}
        height={size}
        className="block rounded-[3px]"
        style={{ width: size, height: size }}
      />
      {label && <span>{label}</span>}
    </a>
  );
}

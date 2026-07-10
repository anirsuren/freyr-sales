"use client";

import { cn } from "@/lib/utils";

// The real LinkedIn logo (Suren supplied the file — no AI-drawn mark) as a small
// icon-link that sits right after a person's name and opens their profile.
// Renders nothing when there's no URL.
export function LinkedInLink({
  url,
  size = 15,
  className,
}: {
  url?: string | null;
  size?: number;
  className?: string;
}) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label="View LinkedIn profile"
      title="LinkedIn"
      className={cn(
        "inline-flex items-center justify-center hover:opacity-75 transition-opacity shrink-0 align-middle",
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
    </a>
  );
}

"use client";

import { useState } from "react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { cn } from "@/lib/utils";

/**
 * The company's actual LinkedIn page logo, everywhere on Market Intel (Anir,
 * Aug 11: "if you pull their LinkedIn company thing, that's probably the best
 * profile picture to use"). LinkedIn media URLs can expire, so a load failure
 * quietly falls back to the house generated mark instead of a broken image.
 */
export function MiLogo({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (!logoUrl || broken) {
    return <CompanyLogo name={name} className={className} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={`${name} logo`}
      onError={() => setBroken(true)}
      className={cn(
        "rounded-lg border border-border-light bg-white object-contain",
        className
      )}
    />
  );
}

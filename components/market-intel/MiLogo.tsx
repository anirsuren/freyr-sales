"use client";

import { useEffect, useState } from "react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { isAmplexorLifeSciences, marketIntelLogoUrl } from "@/lib/marketIntelLogo";
import { cn } from "@/lib/utils";

/**
 * The company's logo, everywhere on Market Intel (Anir,
 * Aug 11: "if you pull their LinkedIn company thing, that's probably the best
 * profile picture to use"). Amplexor keeps its own historical mark after its
 * LinkedIn image became ArisGlobal's. LinkedIn media URLs can expire, so a load failure
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
  const resolvedLogo = marketIntelLogoUrl(name, logoUrl);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [resolvedLogo]);
  if (!resolvedLogo || broken) {
    return <CompanyLogo name={name} className={className} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedLogo}
      alt={`${name} logo`}
      onError={() => setBroken(true)}
      className={cn(
        "rounded-lg border border-border-light bg-white",
        isAmplexorLifeSciences(name) ? "object-cover object-[92%_center]" : "object-contain",
        className
      )}
    />
  );
}

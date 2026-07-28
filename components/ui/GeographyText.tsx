import {
  countryOnlyGeography,
  flagForGeography,
} from "@/lib/countryFlags";
import { cn } from "@/lib/utils";

/**
 * A geography's country, with that country's flag in front of it.
 *
 * Anywhere a country appears, a rep should be able to place the account at a
 * glance instead of reading the line (Anir, Jul 25: "we should definitely have
 * some flags everywhere wherever there's a country name"). Cities and trailing
 * prose are dropped at the source by `countryOnlyGeography` (Suren, Jul 27: "we
 * only care about countries, so just remove cities"), so this shows the country
 * and nothing else. When no country can be read — "Unknown", or an empty field
 * — it renders what it was given, so nothing shifts.
 */
export function GeographyText({
  geography,
  className,
  fallback = "—",
}: {
  geography?: string | null;
  className?: string;
  fallback?: string;
}) {
  const country = countryOnlyGeography(geography);
  if (!country) return <>{fallback}</>;

  const flag = flagForGeography(country);
  if (!flag) return <>{country}</>;

  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      {/* The country is already in the text beside it, so the emoji is
          decorative to a screen reader — announcing "United States flag" then
          "United States" is noise. */}
      <span aria-hidden="true" title={country}>
        {flag}
      </span>
      <span>{country}</span>
    </span>
  );
}

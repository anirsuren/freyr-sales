import {
  countryNameForGeography,
  flagForGeography,
} from "@/lib/countryFlags";
import { cn } from "@/lib/utils";

/**
 * A geography string with its country's flag in front of it.
 *
 * Anywhere a country appears, a rep should be able to place the account at a
 * glance instead of reading the line (Anir, Jul 25: "we should definitely have
 * some flags everywhere wherever there's a country name"). When no country can
 * be identified — "Unknown", or an empty field — this renders exactly what it
 * was given, so nothing shifts.
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
  const text = geography?.trim();
  if (!text) return <>{fallback}</>;

  const flag = flagForGeography(text);
  if (!flag) return <>{text}</>;

  const country = countryNameForGeography(text);
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      {/* The country is already in the text beside it, so the emoji is
          decorative to a screen reader — announcing "United States flag" then
          "United States" is noise. */}
      <span aria-hidden="true" title={country || undefined}>
        {flag}
      </span>
      <span>{text}</span>
    </span>
  );
}

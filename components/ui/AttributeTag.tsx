import type { LucideIcon } from "lucide-react";
import { FILTER_PALETTE } from "@/components/offerings/filterPalette";
import { cn } from "@/lib/utils";

/**
 * A colour-coded, icon-carrying tag for an account attribute — industry,
 * geography, customer type, size.
 *
 * Two standing rules meet here: every category chip gets a colour AND an icon,
 * never plain gray; and the same value must read the same colour on every page,
 * or the colour stops meaning anything. So the colour is derived from the value
 * itself rather than from list position — "Biotechnology" is the same blue on
 * the account page, the list row and the report.
 */

/**
 * Stable value → palette index. A tiny FNV-style hash: deterministic across
 * renders, servers and reloads, which a random or position-based pick is not.
 */
function paletteIndexFor(value: string): number {
  let hash = 2166136261;
  const key = value.trim().toLowerCase();
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % FILTER_PALETTE.length;
}

export function attributeColor(value: string): string {
  return FILTER_PALETTE[paletteIndexFor(value)];
}

export function AttributeTag({
  value,
  icon: Icon,
  label,
  prefix,
  className,
  color: explicitColor,
}: {
  value: string;
  icon?: LucideIcon;
  /** Screen-reader context, e.g. "Industry" — the chip alone reads ambiguous. */
  label?: string;
  /** Rendered before the text, e.g. a country flag. */
  prefix?: string | null;
  className?: string;
  /** Semantic colour override. The hash fallback is only for values with no
   *  meaning of their own — hashed colours landed rose on "Small" while the
   *  header badge said the same word in green (Anir: "why is it red there,
   *  but next to the name it's green?"). When a fact HAS a colour system,
   *  pass it in. */
  color?: string;
}) {
  const color = explicitColor || attributeColor(value);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap",
        className
      )}
      // Inline because the palette is a runtime value, not a Tailwind class.
      // 1A ≈ 10% alpha: a tint that stays readable in both themes.
      style={{ color, background: `${color}1A` }}
      title={label ? `${label}: ${value}` : value}
    >
      {label && <span className="sr-only">{label}: </span>}
      {prefix ? (
        <span aria-hidden="true">{prefix}</span>
      ) : (
        Icon && <Icon size={13} strokeWidth={2} aria-hidden="true" />
      )}
      {value}
    </span>
  );
}

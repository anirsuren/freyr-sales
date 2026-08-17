"use client";

import type { CSSProperties } from "react";
import { Sparkles } from "lucide-react";
import { FILTER_PALETTE } from "@/components/offerings/filterPalette";
import { cn } from "@/lib/utils";

/**
 * AN OFFERING, WEARING ITS OWN COLOUR AND ICON.
 *
 * Anir, Aug 16: "if it's tied to an offering, just make sure, for every single
 * element, for example, the offering has to have the color, the icon, etc., to
 * make sure it's completely accurate."
 *
 * The colour is not decoration and it is not invented here: the Offerings page
 * colours an offering by its TYPE, palette-indexed by that type's position with
 * a +3 offset so a type never wears its category's colour. This reproduces that
 * exactly, from the same palette and the same offset, so an offering reads the
 * same colour on a deal row as it does on its own card. Get the offset wrong
 * and the chips are still colourful and still lie.
 *
 * The icon matches too — the same Sparkles the type pill has always carried.
 *
 * An offering that is not in the catalogue (free text off Suren's sheet) has no
 * type to colour by, so it wears the neutral slate slot rather than borrowing
 * someone else's identity.
 */

const UNTYPED = "#475569";

/** type name → colour, keyed exactly as components/offerings/OfferingsBrowser. */
export function offeringTypeColors(
  types: { name: string }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  types.forEach((t, i) => {
    map[t.name] = FILTER_PALETTE[(i + 3) % FILTER_PALETTE.length];
  });
  return map;
}

export function OfferingChip({
  name,
  color,
  size = "sm",
  className,
  title,
}: {
  name: string;
  /** From offeringTypeColors(). Absent means an offering with no type. */
  color?: string;
  size?: "xs" | "sm";
  className?: string;
  title?: string;
}) {
  const accent = color || UNTYPED;
  return (
    <span
      title={title ?? name}
      className={cn(
        "semantic-color-pill inline-flex max-w-full items-center gap-1 rounded-lg font-semibold leading-snug",
        size === "xs" ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-0.5 text-[11.5px]",
        className
      )}
      style={
        {
          "--semantic-color": accent,
          "--semantic-bg": `${accent}14`,
        } as CSSProperties
      }
    >
      <Sparkles
        size={size === "xs" ? 9.5 : 11}
        strokeWidth={2.4}
        aria-hidden="true"
        className="shrink-0"
      />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

"use client";

import type { CSSProperties } from "react";
import {
  Blocks,
  Boxes,
  Compass,
  Cpu,
  Gauge,
  Layers,
  Rocket,
  ShieldCheck,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { FILTER_PALETTE } from "@/components/offerings/filterPalette";
import { cn } from "@/lib/utils";
import { tint } from "@/lib/tint";

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
 * The icon matches too, and it is per-type rather than one shape for all of
 * them (Anir, Aug 28: "Why do they all have the same icon"). It is derived
 * from the COLOUR rather than passed in, which is what makes it consistent
 * for free: the colour already IS the type's identity, so every surface that
 * already draws the right colour now draws the right icon with it, and
 * nothing had to be threaded through thirty call sites to make that true.
 *
 * An offering that is not in the catalogue (free text off Suren's sheet) has no
 * type to colour by, so it wears the neutral slate slot rather than borrowing
 * someone else's identity.
 */

const UNTYPED = "#475569";

/**
 * type name → colour, keyed by master-list position with the same +3 offset
 * the Offerings page uses — minus the palette's one NEUTRAL slot. "Freyr
 * Services" landed exactly on slate, so every GRI chip wore its real type
 * colour and still read as uncoloured (Anir, Aug 17: "that has to be
 * color-coded with the tag and the pill and stuff"). An identity chip must
 * never look gray, so identities draw from the palette without its neutral.
 */
const IDENTITY_PALETTE = FILTER_PALETTE.filter((c) => c !== "#475569");

/**
 * Colour slot → icon, in the same order as the palette, so a type's icon is
 * as stable as its colour and neither needs configuring. The master list is
 * user-editable, so mapping by NAME would break the moment somebody adds a
 * type; mapping by palette position cannot.
 */
const IDENTITY_ICONS: LucideIcon[] = [
  Sparkles,
  Boxes,
  Workflow,
  Cpu,
  Layers,
  Rocket,
  ShieldCheck,
  Gauge,
  Blocks,
  Compass,
];

/** The icon that belongs with a given offering colour. Untyped offerings wear
 *  the neutral slate and keep the neutral spark. */
export function iconForOfferingColor(color?: string): LucideIcon {
  if (!color || color === UNTYPED) return Sparkles;
  const slot = IDENTITY_PALETTE.indexOf(color);
  return slot < 0
    ? Sparkles
    : IDENTITY_ICONS[slot % IDENTITY_ICONS.length];
}

export function offeringTypeColors(
  types: { name: string }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  types.forEach((t, i) => {
    map[t.name] = IDENTITY_PALETTE[(i + 3) % IDENTITY_PALETTE.length];
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
  const Icon = iconForOfferingColor(color);
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
          "--semantic-bg": tint(accent, 8),
        } as CSSProperties
      }
    >
      <Icon
        size={size === "xs" ? 9.5 : 11}
        strokeWidth={2.4}
        aria-hidden="true"
        className="shrink-0"
      />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

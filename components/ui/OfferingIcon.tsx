import {
  Beaker,
  Binoculars,
  BookMarked,
  Braces,
  Compass,
  GitBranch,
  Landmark,
  LibraryBig,
  LineChart,
  Network,
  Orbit,
  PenTool,
  Route,
  Sparkle,
  Microscope,
  Scale,
  Send,
  Stamp,
  Package,
  Layers,
  Globe,
  FileText,
  Tag,
  Boxes,
  ShieldCheck,
  Radar,
  Database,
  Cpu,
  ClipboardCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OFFERING_CATALOGUE_ORDER } from "@/lib/offeringCatalogue";

// A branded mark for an offering — a curated glyph on a deterministic gradient,
// so every offering reads as its own product (Anir, Jul 8: "every offering
// should have its own icon"). Same idea as CompanyLogo, but a product glyph
// instead of initials. Icon + color are hashed from the name, so they're stable
// and distinct across offerings.
const ICONS: LucideIcon[] = [
  Package, Layers, Globe, FileText, Tag, Boxes,
  ShieldCheck, Radar, Database, Cpu, ClipboardCheck, Workflow,
  BookMarked, Beaker, Microscope, Scale, Stamp, Send,
  Binoculars, Braces, Compass, GitBranch, Landmark, LibraryBig,
  LineChart, Network, Orbit, PenTool, Route, Sparkle,
];
// IDENTITY HUES ONLY. Red, green, amber and burnt orange are RESERVED in this
// app for meaning: red is a problem, green is healthy, orange is caution. An
// identity palette that reaches for them paints a perfectly good record in the
// colour of a warning. Anir, Jul 28, on a 90%-fit service rendered in red:
// "Why is it red? You have to understand that red means horrible, red means
// negative... colors like red, green, and yellow are reserved for actually
// signifying something else." Purple, blue, indigo, teal, cyan, sky, pink,
// fuchsia and slate all carry no status meaning, so they are safe here.
const GRADIENTS: [string, string][] = [
  ["#0071E3", "#4AA3FF"], // blue
  ["#5E5CE6", "#8A88FF"], // indigo
  ["#0F9E8E", "#2DD4BF"], // teal
  ["#7C3AED", "#A78BFA"], // violet
  ["#0891B2", "#22D3EE"], // cyan
  ["#4338CA", "#818CF8"], // deep indigo
  ["#0EA5E9", "#7DD3FC"], // sky
  ["#DB2777", "#F472B6"], // pink
  ["#9333EA", "#C084FC"], // purple
  ["#C026D3", "#E879F9"], // fuchsia
];

// Multiplier 71, not 31. Over Freyr's real 29-offering catalogue, 31 collided:
// two offerings landed on the same icon+hue slot. 71 spreads all 29 across 29
// distinct slots and uses all ten hues. Verified against the live catalogue, so
// re-check it if the catalogue grows a lot.
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 71 + s.charCodeAt(i)) >>> 0;
  return h;
}

// The same glyph + hue an offering gets everywhere, exposed so text callouts of
// a service (list columns, tags) can carry its icon and colour instead of
// rendering as plain text (standing rule: category chips are colour + icon).
const CATALOGUE_SLOT = new Map(
  OFFERING_CATALOGUE_ORDER.map((n, i) => [n, i] as const)
);

export function offeringMark(name: string): {
  icon: LucideIcon;
  color: string;
  light: string;
} {
  const key = name || "offering";
  const seeded = CATALOGUE_SLOT.get(key);
  // Seeded offerings walk the icon list one at a time, so no glyph can repeat
  // until the catalogue outgrows ICONS. The hue advances on a coprime stride so
  // neighbours in the list never share a colour either.
  const slot = seeded ?? hash(key) % (ICONS.length * GRADIENTS.length);
  const hueIndex =
    seeded != null ? seeded * 3 : Math.floor(slot / ICONS.length);
  const [a, b] = GRADIENTS[hueIndex % GRADIENTS.length];
  return { icon: ICONS[slot % ICONS.length], color: a, light: b };
}

// An inline service/offering chip: glyph + name in the offering's own colour.
export function ServiceTag({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  if (!name || name === "-")
    return <span className="text-[13px] text-text-tertiary">-</span>;
  const { icon: Icon, color } = offeringMark(name);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2.5 text-[12.5px] font-semibold leading-tight",
        className
      )}
      style={{ backgroundColor: `${color}14`, color }}
    >
      {/* The glyph bubble scales with the chip: callers that shrink the text
          (the pipeline cards, to keep long offering names on one line) would
          otherwise keep a fixed 18px circle that no longer fits the pill. */}
      <span
        className="flex h-[1.45em] w-[1.45em] shrink-0 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: color }}
      >
        <Icon size={11} strokeWidth={2.2} className="h-[0.85em] w-[0.85em]" />
      </span>
      {name}
    </span>
  );
}

export function OfferingIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  // Two independent hashes so icon and color are chosen separately — otherwise
  // offerings that land on the same index look like duplicates.
  const key = name || "offering";
  const Icon = ICONS[hash(key) % ICONS.length];
  const [a, b] = GRADIENTS[hash(`${key}::hue`) % GRADIENTS.length];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-xl text-white shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.25),0_1px_2px_rgba(0,0,0,0.10)]",
        className
      )}
      style={{ backgroundImage: `linear-gradient(135deg, ${a}, ${b})` }}
      aria-hidden="true"
    >
      <Icon className="w-[55%] h-[55%]" strokeWidth={1.9} />
    </span>
  );
}

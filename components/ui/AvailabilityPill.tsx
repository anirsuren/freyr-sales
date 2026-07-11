import { CircleCheck, Clock, CircleHelp, type LucideIcon } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";

// One consistent, colour-coded pill for offering availability — never gray text.
// It also SAYS what the status means (Suren: "what does 'Currently available' /
// 'Oct-26' / 'To be decided' mean?"). A pill = a set status value.

type Kind = "available" | "upcoming" | "tbd";

const STYLE: Record<Kind, { bg: string; color: string; icon: LucideIcon }> = {
  available: { bg: "rgba(52,199,89,0.14)", color: "#1A7A35", icon: CircleCheck },
  upcoming: { bg: "rgba(255,159,10,0.16)", color: "#7A4A00", icon: Clock },
  tbd: { bg: "rgba(79,70,229,0.12)", color: "#4338CA", icon: CircleHelp },
};

function classify(value: string): { kind: Kind; label: string; tip: string } {
  const v = value.trim();
  if (/tbd|to be decided|undecided|not decided|decided/i.test(v))
    return {
      kind: "tbd",
      label: "Timing TBD",
      tip: "Roadmap item — the availability date hasn't been decided yet.",
    };
  if (/current|now|available|live|general availability|\bga\b/i.test(v))
    return {
      kind: "available",
      label: "Available now",
      tip: "Live today — this offering can be sold right now.",
    };
  // Otherwise it's a target date/version, e.g. "Oct-26".
  return {
    kind: "upcoming",
    label: `Available ${v}`,
    tip: `Planned — this offering isn't sellable until ${v}.`,
  };
}

export function AvailabilityPill({
  value,
  size = "md",
}: {
  value?: string | null;
  size?: "sm" | "md";
}) {
  if (!value || !value.trim()) return null;
  const { kind, label, tip } = classify(value);
  const s = STYLE[kind];
  const Icon = s.icon;
  const pad = size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11.5px]";
  return (
    <Tooltip label={tip}>
      <span
        className={`inline-flex items-center gap-1 font-semibold rounded-full cursor-help whitespace-nowrap ${pad}`}
        style={{ background: s.bg, color: s.color }}
      >
        <Icon size={size === "sm" ? 10 : 12} strokeWidth={2.3} />
        {label}
      </span>
    </Tooltip>
  );
}

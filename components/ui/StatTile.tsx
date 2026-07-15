import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// The one stat tile (Anir, Jul 4: "just make them look better, dude").
// Label up top, then the number with its qualifier ON THE SAME LINE — no
// fixed heights, so nothing ever bleeds out of the card.
export function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  color,
  warn = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  color?: string; // accent for the icon badge (defaults to brand blue)
  warn?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
            !color && (warn ? "bg-warning/10 text-warning" : "bg-blue-light text-blue-primary")
          )}
          style={color ? { background: color, color: "#fff" } : undefined}
        >
          <Icon size={15} strokeWidth={1.9} />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary leading-tight">
          {label}
        </span>
      </div>
      <p className="flex items-baseline gap-1.5 flex-wrap">
        <span
          className={cn(
            "font-bold leading-none tnum tracking-[-0.01em]",
            value.length > 12 ? "text-[17px]" : "text-[24px]",
            warn ? "text-warning" : "text-text-primary"
          )}
        >
          {value}
        </span>
        {sub && (
          <span className="text-[12px] text-text-tertiary leading-none">
            {sub}
          </span>
        )}
      </p>
    </Card>
  );
}

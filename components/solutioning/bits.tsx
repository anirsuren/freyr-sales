import {
  CalendarDays,
  FileText,
  Presentation,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { RequestStatus, SolutioningKind } from "@/lib/solutioning";

/**
 * ONE VOCABULARY FOR THE WHOLE MODULE — every chip is colour + icon (standing
 * rule: never plain gray), and the three colours are identity, never status.
 */
export const KIND_META: Record<
  SolutioningKind,
  { label: string; plural: string; color: string; icon: LucideIcon }
> = {
  submission: {
    label: "Submission",
    plural: "Submissions",
    color: "#0071E3",
    icon: FileText,
  },
  presentation: {
    label: "Presentation",
    plural: "Presentations",
    color: "#7C3AED",
    icon: Presentation,
  },
  meeting: {
    label: "Meeting",
    plural: "Meetings",
    color: "#0D9488",
    icon: CalendarDays,
  },
};

/**
 * Suren's three statuses, exactly: "request initiated, then work in progress,
 * and then completed. That's all." The colours ARE status here, so they may
 * say what status colours mean everywhere in this app: blue is waiting its
 * turn, violet is being worked, green is done.
 */
export const STATUS_META: Record<
  RequestStatus,
  { label: string; color: string }
> = {
  initiated: { label: "Request initiated", color: "#0071E3" },
  /* SOL-013's Assigned: leads are chosen, work has not started. Its own state
     because "leads picked" and "somebody is writing" are different answers to
     "where is this?". */
  assigned: { label: "Assigned", color: "#0891B2" },
  in_progress: { label: "Work in progress", color: "#6D28D9" },
  completed: { label: "Completed", color: "#1A7A35" },
  /* Discontinued, and kept (SOL-033: cancelled records stay in history rather
     than being deleted). Red is a status colour here, which is what it is for. */
  cancelled: { label: "Cancelled", color: "#B42318" },
};

export function KindChip({
  kind,
  size = "md",
  className,
  iconOnly = false,
}: {
  kind: SolutioningKind;
  size?: "sm" | "md";
  className?: string;
  /**
   * DROP THE WORD, KEEP THE MARK (Suren, Aug 28: "you don't have to say
   * submission or presentation here etc, it's already the column header. Show
   * the icon / colour though").
   *
   * In a table filtered to one kind, every row repeating that kind's name
   * under a header of the same name is a column of noise — but the coloured
   * mark still earns its place, because it is how the row reads as a
   * submission at a glance and it stays consistent with the same chip
   * everywhere else. The name survives as the accessible label.
   */
  iconOnly?: boolean;
}) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <span
      style={
        {
          "--semantic-color": meta.color,
          "--semantic-bg": `${meta.color}1A`,
        } as CSSProperties
      }
      title={iconOnly ? meta.label : undefined}
      aria-label={iconOnly ? meta.label : undefined}
      className={cn(
        "semantic-color-pill inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold",
        iconOnly
          ? size === "sm"
            ? "px-1.5 py-1"
            : "px-2 py-1.5"
          : size === "sm"
            ? "px-2 py-0.5 text-[10.5px]"
            : "px-2.5 py-1 text-[11.5px]",
        className
      )}
    >
      <Icon size={size === "sm" ? 11 : 12.5} strokeWidth={2.2} />
      {!iconOnly && meta.label}
    </span>
  );
}

export function StatusPill({
  status,
  size = "md",
  className,
}: {
  status: RequestStatus;
  size?: "sm" | "md";
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      style={
        {
          "--semantic-color": meta.color,
          "--semantic-bg": `${meta.color}17`,
        } as CSSProperties
      }
      className={cn(
        "semantic-color-pill inline-flex items-center whitespace-nowrap rounded-full font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11.5px]",
        className
      )}
    >
      {meta.label}
    </span>
  );
}

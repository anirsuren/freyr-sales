import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/Tooltip";

export function Avatar({
  name,
  className,
  tooltip,
}: {
  name: string;
  className?: string;
  // When set, hovering the avatar explains who it is (e.g. "Owner: Suren Dheen").
  // Pass `true` to use the name itself; pass a string for a custom label.
  tooltip?: string | boolean;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const badge = (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-blue-light text-blue-primary font-semibold shrink-0",
        className
      )}
    >
      {initials}
    </span>
  );
  if (!tooltip) return badge;
  return <Tooltip label={tooltip === true ? name : tooltip}>{badge}</Tooltip>;
}

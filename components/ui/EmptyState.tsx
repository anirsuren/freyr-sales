import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-14 px-6",
        className
      )}
    >
      <span className="flex items-center justify-center w-12 h-12 rounded-full bg-surface text-text-tertiary mb-4 border border-border-light">
        <Icon size={22} strokeWidth={1.5} />
      </span>
      <p className="text-[15px] font-medium text-text-primary">{title}</p>
      {description && (
        <p className="text-[13px] text-text-secondary mt-1 max-w-[340px] leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

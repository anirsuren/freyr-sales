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
      <span className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-b from-white to-surface text-text-tertiary mb-4 border border-border-light shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <Icon size={24} strokeWidth={1.5} />
      </span>
      <p className="text-[16px] font-semibold text-text-primary tracking-[-0.01em]">
        {title}
      </p>
      {description && (
        <p className="text-[13px] text-text-secondary mt-1 max-w-[340px] leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

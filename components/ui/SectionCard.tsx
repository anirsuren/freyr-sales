import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// A titled panel: an icon + a header band with a divider, then the body.
// Gives every section a clear top and clear edges so the eye can tell where
// one section ends and the next begins (Anir: "can't tell what is what / where
// each section ends") — without a harsh black outline.
export function SectionCard({
  title,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "bg-white border border-border rounded-xl shadow-card overflow-hidden",
        className
      )}
    >
      <header className="flex items-center gap-2 px-5 py-3 bg-surface/70 border-b border-border-light">
        {Icon && (
          <span className="w-6 h-6 rounded-md bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
            <Icon size={13} strokeWidth={2} />
          </span>
        )}
        <h2 className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-text-secondary">
          {title}
        </h2>
        {action && <div className="ml-auto">{action}</div>}
      </header>
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

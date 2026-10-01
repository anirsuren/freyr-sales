import type { ComponentType, ReactNode } from "react";

/**
 * THE EMPTY BOX EVERY RECORD TAB USES (Anir, Sep 28: "I like the box for
 * solution requests better, but I want the header on the left and the button
 * on the right. Same thing goes for all other things like that").
 *
 * It goes INSIDE the section card, under that card's own title, so a tab with
 * nothing in it keeps its title on the left and its message centred in a
 * dashed box. The generic EmptyState floats with its own padding and reads
 * off-centre next to boxed sections (Anir, Oct 1: "this doesnt look
 * centered").
 */
export function DashedEmpty({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  /** The one line under the title: what fills this, and from where. */
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-dashed border-border-light bg-surface/30 px-6 py-12 text-center ${className ?? ""}`}
    >
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-light/40 text-blue-primary">
        <Icon size={19} strokeWidth={1.9} />
      </div>
      <h3 className="mt-4 text-[15px] font-semibold text-text-primary">{title}</h3>
      {children && (
        <p className="mx-auto mt-1 max-w-lg text-[12.5px] leading-5 text-text-secondary">{children}</p>
      )}
      {action && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

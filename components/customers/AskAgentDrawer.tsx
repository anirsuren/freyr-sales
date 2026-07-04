"use client";

import { useEffect, type ReactNode } from "react";
import { Sparkles, X } from "lucide-react";

// The Ask Agent slide-over (Anir, Jul 3): "the ask agent should always be
// there — if I open it, it should pop up on the right side." It rides over
// the right edge of the page instead of living in a tab, so it's reachable
// from ANY tab without hiding the account you're working. The page stays
// visible behind a light backdrop; Esc or the X closes it.
export function AskAgentDrawer({
  open,
  onClose,
  company,
  actions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  company: string;
  // Quick actions pinned under the header (e.g. Analyze the customer).
  actions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="Ask the agent">
      {/* light backdrop — the page stays readable behind it */}
      <div
        className="absolute inset-0 bg-black/15 backdrop-in"
        onClick={onClose}
      />
      <div className="drawer-in absolute inset-y-0 right-0 w-full sm:w-[440px] bg-white border-l border-border-light shadow-[-8px_0_40px_rgba(0,0,0,0.10)] flex flex-col">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border-light shrink-0">
          <span className="w-8 h-8 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0">
            <Sparkles size={16} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold text-text-primary leading-tight">
              Ask the agent
            </h2>
            <p className="text-[12px] text-text-tertiary truncate">{company}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close the agent"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors shrink-0"
          >
            <X size={17} strokeWidth={1.9} />
          </button>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border-light bg-surface/50 shrink-0">
            {actions}
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

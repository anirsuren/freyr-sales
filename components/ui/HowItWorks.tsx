"use client";

import { useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

// A quiet "How this works" affordance (Anir, Jul 8: "that section is annoying —
// put the info next to the title, and open a little pop-up on click"). Keeps the
// explanation one tap away without eating vertical space on the page.
export function HowItWorks({
  title = "How this works",
  label = "How this works",
  children,
}: {
  title?: string;
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-md border border-border text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
      >
        <HelpCircle size={15} strokeWidth={1.7} />
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <div className="text-[13.5px] text-text-secondary leading-relaxed space-y-3">
          {children}
        </div>
      </Modal>
    </>
  );
}

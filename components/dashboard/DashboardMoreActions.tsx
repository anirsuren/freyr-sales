"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

export function DashboardMoreActions({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-label="More dashboard actions"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface"
      >
        <MoreHorizontal size={17} strokeWidth={1.8} />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("[data-dashboard-menu-close]")) setOpen(false);
            }}
            className="absolute right-0 z-50 mt-2 flex w-[220px] flex-col gap-1.5 rounded-lg border border-border-light bg-white p-2 shadow-card [&>button]:w-full [&>button]:justify-start"
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

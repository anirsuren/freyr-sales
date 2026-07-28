"use client";

import Link from "next/link";
import { useState } from "react";
import { SlidersHorizontal, ChevronDown, Layers, Package, Users } from "lucide-react";

// The three master-list pages were three big header buttons eating the row
// (Suren, Jul 8: "those buttons take up unnecessary space"). Folded into one
// compact "Manage" menu — the stat tiles below still deep-link to the lists.
const LINKS = [
  { href: "/offerings/offering-categories", label: "Offering categories", icon: Layers, color: "#7C3AED" },
  { href: "/offerings/offering-types", label: "Offering types", icon: Package, color: "#0071E3" },
  { href: "/offerings/customer-types", label: "Customer types", icon: Users, color: "#0891B2" },
];

export function OfferingsManageMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 text-[14px] font-semibold rounded-md px-3.5 py-2.5 bg-white border border-border text-text-primary hover:bg-surface transition-colors"
      >
        <SlidersHorizontal size={15} strokeWidth={1.8} />
        Manage
        <ChevronDown size={14} strokeWidth={2} className="opacity-70" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 mt-1.5 z-50 w-56 rounded-xl border border-border-light bg-white shadow-[0_16px_48px_rgba(0,0,0,0.16)] p-1.5"
          >
            <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Master lists
            </p>
            {LINKS.map((l) => {
              const LIcon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] text-text-primary hover:bg-surface transition-colors"
                >
                  <span
                    className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ background: `${l.color}14`, color: l.color }}
                  >
                    <LIcon size={13} strokeWidth={2} />
                  </span>
                  {l.label}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

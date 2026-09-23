"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Rocket, Check, Search, X, Building2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { cn } from "@/lib/utils";

// The two primary offering actions (from Suren's approved layout): start a
// pitch with this offering, or mark it as one a customer is using — right from
// the offering page. `extra` holds the admin buttons so all actions sit on one
// line (Anir: save space).
//
// The customer picker used to be a raw <select> in a row that pushed the page
// down when it opened (Suren, Jul 27: "this is outdated as fuck"). It's now the
// same searchable, logo-per-row list the command palette uses, anchored as a
// popover so nothing below it moves.
export function OfferingActions({
  offeringId,
  offeringName,
  customers,
  extra,
  commercialActionsEnabled = true,
  pitchActionEnabled = true,
}: {
  offeringId: string;
  offeringName: string;
  customers: { id: string; name: string; assigned: boolean }[];
  extra?: ReactNode;
  commercialActionsEnabled?: boolean;
  pitchActionEnabled?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [assignedIds, setAssignedIds] = useState(
    () => new Set(customers.filter((customer) => customer.assigned).map((customer) => customer.id))
  );
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers;
  }, [customers, query]);

  useEffect(() => {
    setAssignedIds(new Set(customers.filter((customer) => customer.assigned).map((customer) => customer.id)));
  }, [customers]);

  // Click-away + Escape close, same as every other popover in the app.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * PUT THE KEYBOARD BACK WHERE IT WAS (found Aug 16, tabbing through the
   * app's dialogs). This popover carries role="dialog" and takes focus into
   * its search box on open, but nothing gave the focus back on close, so
   * Escape — or picking a customer — dropped the caret onto <body>. A keyboard
   * user who opened this, changed their mind, and pressed Escape had to tab
   * from the top of the page again. The shared Modal has done this since it
   * was written; this hand-rolled one just never matched it.
   */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      searchRef.current?.focus();
      return;
    }
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    if (el && document.contains(el)) el.focus();
  }, [open]);

  // Keep the keyboard cursor inside the filtered list.
  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function close() {
    setOpen(false);
    setQuery("");
    setCursor(0);
  }

  async function toggleCustomer(id: string) {
    if (!id || busyIds.has(id)) return;
    const wasAssigned = assignedIds.has(id);
    const nextAssigned = !wasAssigned;
    setAssignedIds((current) => {
      const next = new Set(current);
      if (nextAssigned) next.add(id);
      else next.delete(id);
      return next;
    });
    setBusyIds((current) => new Set(current).add(id));
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setOfferingInUse: { offeringId, on: nextAssigned },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const name = customers.find((c) => c.id === id)?.name || "the customer";
        toast(
          nextAssigned
            ? `Added ${offeringName} to ${name}.`
            : `Removed ${offeringName} from ${name}.`
        );
        router.refresh();
      } else {
        throw new Error(data.error || "Couldn't update it.");
      }
    } catch (caught) {
      setAssignedIds((current) => {
        const next = new Set(current);
        if (wasAssigned) next.add(id);
        else next.delete(id);
        return next;
      });
      toast(caught instanceof Error ? caught.message : "Couldn't update it.", "error");
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = matches[cursor];
      if (row) void toggleCustomer(row.id);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 lg:items-end">
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {commercialActionsEnabled && (
          <>
            {pitchActionEnabled && (
              <Link
                href="/intake"
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,113,227,0.20)] transition-all hover:bg-blue-hover hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
              >
                <Rocket size={14} strokeWidth={2} />
                Use in a pitch
              </Link>
            )}

            {/* Anchored, not inline — opening it must never move the page. */}
            <div ref={wrapRef} className="relative">
              <button
                type="button"
                onClick={() => (open ? close() : setOpen(true))}
                aria-haspopup="dialog"
                aria-expanded={open}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-[13px] font-semibold transition-colors",
                  open
                    ? "border-blue-subtle bg-blue-light text-blue-primary"
                    : "border-border bg-white text-text-primary hover:bg-surface"
                )}
              >
                <Building2 size={14} strokeWidth={2} />
                Customers
                {assignedIds.size > 0 && (
                  <span className="tnum rounded-full bg-blue-light px-1.5 py-0.5 text-[10px] text-blue-primary">
                    {assignedIds.size}
                  </span>
                )}
              </button>

              {open && (
                <div
                  role="dialog"
                  aria-label="Choose customers using this offering"
                  className="hovercard-in absolute right-0 top-full z-40 mt-2 w-[320px] overflow-hidden rounded-xl border border-border-light bg-white text-left shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]"
                >
                      <div className="flex items-center gap-2 border-b border-border-light px-3">
                        <Search size={15} strokeWidth={1.8} className="shrink-0 text-text-tertiary" />
                        <input
                          ref={searchRef}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={onSearchKey}
                          placeholder="Search customers…"
                          aria-label="Search customers"
                          className="menu-in h-11 flex-1 bg-transparent text-[13.5px] text-text-primary outline-none placeholder:text-text-tertiary focus:shadow-none"
                        />
                        <button
                          type="button"
                          onClick={close}
                          aria-label="Close customer picker"
                          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface hover:text-text-primary"
                        >
                          <X size={14} strokeWidth={2} />
                        </button>
                      </div>

                      <div
                        ref={listRef}
                        role="group"
                        aria-label="Customers"
                        className="max-h-[248px] overflow-y-auto p-1.5"
                      >
                        {matches.length === 0 ? (
                          <p className="px-2.5 py-6 text-center text-[12.5px] text-text-secondary">
                            No customer matches “{query.trim()}”.
                          </p>
                        ) : (
                          matches.map((c, i) => {
                            const on = assignedIds.has(c.id);
                            const saving = busyIds.has(c.id);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                disabled={saving}
                                data-row={i}
                                onMouseEnter={() => setCursor(i)}
                                onClick={() => void toggleCustomer(c.id)}
                                className={cn(
                                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors disabled:opacity-55",
                                  on
                                    ? "bg-blue-light"
                                    : i === cursor
                                      ? "bg-surface"
                                      : "hover:bg-surface"
                                )}
                              >
                                <CompanyLogo name={c.name} className="h-7 w-7 shrink-0 text-[9px]" />
                                <span
                                  className={cn(
                                    "min-w-0 flex-1 break-words text-[13px] leading-snug",
                                    on
                                      ? "font-semibold text-blue-primary"
                                      : "text-text-primary"
                                  )}
                                >
                                  {c.name}
                                </span>
                                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", on ? "border-blue-primary bg-blue-primary text-white" : "border-border-light bg-white")}>
                                  {on && <Check size={13} strokeWidth={2.8} />}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                      <p className="border-t border-border-light bg-surface/60 px-3 py-2 text-[11px] text-text-secondary">
                        Check a customer to add this offering. Uncheck one to remove it.
                      </p>
                </div>
              )}
            </div>
          </>
        )}
        {extra}
      </div>
    </div>
  );
}

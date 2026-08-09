"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Rocket, Plus, Check, Search, X, Building2 } from "lucide-react";
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
}: {
  offeringId: string;
  offeringName: string;
  customers: { id: string; name: string }[];
  extra?: ReactNode;
  commercialActionsEnabled?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState("");
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? customers.filter((c) => c.name.toLowerCase().includes(q)) : customers;
  }, [customers, query]);

  // Click-away + Escape close, same as every other popover in the app.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
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
    setPicked("");
    setAdded("");
    setCursor(0);
  }

  async function add(id = picked) {
    if (!id || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addOfferingInUse: offeringId }),
      });
      const data = await res.json();
      if (data.ok) {
        const name = customers.find((c) => c.id === id)?.name || "the customer";
        // Two-part feedback: the toast people already expect, plus a visible
        // confirmation inside the popover before it closes itself.
        setAdded(name);
        toast(`Added ${offeringName} to ${name}: see it on their Offerings tab.`);
        router.refresh();
        window.setTimeout(close, 1600);
      } else {
        toast(data.error || "Couldn't add it.", "error");
      }
    } catch {
      toast("Couldn't add it.", "error");
    } finally {
      setBusy(false);
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
      // Enter picks the highlighted row; Enter again on a picked row adds it.
      if (row && row.id === picked) add(row.id);
      else if (row) setPicked(row.id);
    }
  }

  const pickedName = customers.find((c) => c.id === picked)?.name || "";

  return (
    <div className="flex flex-col items-stretch gap-2 lg:items-end">
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        {commercialActionsEnabled && (
          <>
            <Link
              href="/intake"
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,113,227,0.20)] transition-all hover:bg-blue-hover hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
            >
              <Rocket size={14} strokeWidth={2} />
              Use in a pitch
            </Link>

            {/* Anchored, not inline — opening it must never move the page. */}
            <div ref={wrapRef} className="relative">
              <button
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
                {open ? <X size={14} strokeWidth={2} /> : <Plus size={14} strokeWidth={2} />}
                Add to a customer
              </button>

              {open && (
                <div
                  role="dialog"
                  aria-label="Add this offering to a customer"
                  className="hovercard-in absolute right-0 top-full z-40 mt-2 w-[320px] overflow-hidden rounded-xl border border-border-light bg-white text-left shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]"
                >
                  {added ? (
                    <div className="flex items-center gap-2.5 px-4 py-5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(52,199,89,0.14)] text-[#1A7A35]">
                        <Check size={16} strokeWidth={2.6} />
                      </span>
                      <p className="text-[13px] leading-snug text-text-primary">
                        Added to <span className="font-semibold">{added}</span>. It&apos;s on
                        their Offerings tab now.
                      </p>
                    </div>
                  ) : (
                    <>
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
                      </div>

                      <div
                        ref={listRef}
                        role="listbox"
                        aria-label="Customers"
                        className="max-h-[248px] overflow-y-auto p-1.5"
                      >
                        {matches.length === 0 ? (
                          <p className="px-2.5 py-6 text-center text-[12.5px] text-text-secondary">
                            No customer matches “{query.trim()}”.
                          </p>
                        ) : (
                          matches.map((c, i) => {
                            const on = c.id === picked;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                role="option"
                                aria-selected={on}
                                data-row={i}
                                onMouseEnter={() => setCursor(i)}
                                onClick={() => setPicked(on ? "" : c.id)}
                                className={cn(
                                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
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
                                {on && (
                                  <Check
                                    size={15}
                                    strokeWidth={2.6}
                                    className="shrink-0 text-blue-primary"
                                  />
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>

                      <div className="flex items-center gap-2 border-t border-border-light bg-surface/60 px-3 py-2.5">
                        <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-text-secondary">
                          {pickedName ? (
                            <>
                              Adding to{" "}
                              <span className="font-semibold text-text-primary">
                                {pickedName}
                              </span>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <Building2 size={12} strokeWidth={1.9} />
                              Pick a customer first
                            </span>
                          )}
                        </span>
                        <button
                          onClick={() => add()}
                          disabled={!picked || busy}
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors",
                            picked && !busy
                              ? "bg-blue-primary text-white shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:bg-blue-hover"
                              : // A real disabled state, not a washed-out blue.
                                "cursor-not-allowed border border-border-light bg-white text-text-tertiary"
                          )}
                        >
                          <Check size={14} strokeWidth={2.2} />
                          {busy ? "Adding…" : "Add"}
                        </button>
                      </div>
                    </>
                  )}
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

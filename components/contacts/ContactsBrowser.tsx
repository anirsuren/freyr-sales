"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Download, UserSearch, CheckSquare, Square, X, Mail } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { toCSV, downloadCSV } from "@/lib/csv";
import { cn } from "@/lib/utils";

export interface ContactRow {
  id: string;
  name: string;
  title: string;
  company: string;
  role: string;
  email: string;
}

export function ContactsBrowser({ rows }: { rows: ContactRow[] }) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [sort, setSort] = useState("name");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleSel(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const roles = useMemo(
    () => Array.from(new Set(rows.map((r) => r.role).filter(Boolean))),
    [rows]
  );

  const view = useMemo(() => {
    let v = rows.filter(
      (r) =>
        (role === "all" || r.role === role) &&
        (!q ||
          r.name.toLowerCase().includes(q.toLowerCase()) ||
          r.title.toLowerCase().includes(q.toLowerCase()) ||
          r.company.toLowerCase().includes(q.toLowerCase()))
    );
    v = [...v].sort((a, b) =>
      sort === "company"
        ? a.company.localeCompare(b.company)
        : a.name.localeCompare(b.name)
    );
    return v;
  }, [rows, q, role, sort]);

  function rowsToCsv(list: ContactRow[]) {
    // Email is the whole point of a contact export (outreach lists) and shows on
    // every card — it was missing from the CSV, so add it.
    return toCSV(
      ["Name", "Title", "Company", "Role", "Email"],
      list.map((r) => [r.name, r.title, r.company, r.role, r.email])
    );
  }
  function exportCsv() {
    downloadCSV("freyr-contacts.csv", rowsToCsv(view));
  }
  function exportSelected() {
    const list = view.filter((r) => selected.has(r.id));
    if (!list.length) return;
    downloadCSV("freyr-contacts-selected.csv", rowsToCsv(list));
    toast(`Exported ${list.length} contact${list.length === 1 ? "" : "s"}`);
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative sm:max-w-[320px] w-full">
          <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search contacts…" className="pl-9" />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="text-[13px] bg-surface border border-border rounded-md px-3 py-2 outline-none focus:border-blue-primary"
        >
          <option value="all">All roles</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="text-[13px] bg-surface border border-border rounded-md px-3 py-2 outline-none focus:border-blue-primary"
        >
          <option value="name">Name A–Z</option>
          <option value="company">Company A–Z</option>
        </select>
        <div className="sm:ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              setSelectMode((m) => !m);
              setSelected(new Set());
            }}
            className={cn(
              "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-md border transition-colors",
              selectMode
                ? "border-blue-primary bg-blue-light text-blue-primary"
                : "border-border text-text-secondary hover:bg-surface"
            )}
          >
            <CheckSquare size={15} strokeWidth={1.8} />
            {selectMode ? "Done" : "Select"}
          </button>
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 text-[13px] font-medium px-3 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
          >
            <Download size={16} strokeWidth={1.5} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-2.5 rounded-lg border border-blue-primary bg-blue-light">
          <span className="text-[13px] font-semibold text-blue-primary tnum">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={exportSelected}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
            >
              <Download size={15} strokeWidth={1.8} />
              Export selected
            </button>
            <button
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className="text-text-tertiary hover:text-text-primary"
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      )}

      {view.length > 0 && (
        <p className="text-[13px] text-text-secondary mb-4 tnum">
          Showing <span className="font-semibold text-text-primary">{view.length}</span> of{" "}
          <span className="font-semibold text-text-primary">{rows.length}</span>{" "}
          {rows.length === 1 ? "contact" : "contacts"}
        </p>
      )}

      {view.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={UserSearch}
            title="No contacts match"
            description="Try a different search or role filter."
            action={
              q || role !== "all" ? (
                <button
                  onClick={() => {
                    setQ("");
                    setRole("all");
                  }}
                  className="text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
          {view.map((c) => {
            const isSel = selected.has(c.id);
            const body = (
              <Card
                className={cn(
                  "transition-all duration-200 h-full",
                  isSel
                    ? "border-blue-primary ring-1 ring-blue-primary"
                    : "hover:border-blue-subtle hover:-translate-y-0.5 hover:shadow-card"
                )}
              >
                <div className="flex items-center gap-3 mb-3">
                  {selectMode && (
                    <span className="text-blue-primary shrink-0">
                      {isSel ? (
                        <CheckSquare size={18} strokeWidth={1.8} />
                      ) : (
                        <Square size={18} strokeWidth={1.8} className="text-text-tertiary" />
                      )}
                    </span>
                  )}
                  <Avatar name={c.name} className="w-10 h-10 text-[14px]" />
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-text-primary truncate">{c.name}</p>
                    <p className="text-[13px] text-text-secondary truncate">{c.title}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-text-secondary truncate">{c.company}</span>
                  {c.role && (
                    <Badge label={c.role} bg="rgba(0,113,227,0.10)" color="#0040A0" className="!normal-case tracking-normal shrink-0" />
                  )}
                </div>
                {c.email && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border-light text-[12px] text-text-tertiary">
                    <Mail size={12} strokeWidth={1.6} className="shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </div>
                )}
              </Card>
            );
            return selectMode ? (
              <button
                key={c.id}
                onClick={() => toggleSel(c.id)}
                aria-pressed={isSel}
                aria-label={`Select ${c.name}`}
                className="block text-left w-full"
              >
                {body}
              </button>
            ) : (
              <Link key={c.id} href={`/contacts/${c.id}`} className="block">
                {body}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

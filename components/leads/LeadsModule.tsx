"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Field, Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  isOpenLead,
  leadAgeDays,
  leadSourceColor,
  leadStatusColor,
  type Lead,
  type LeadsState,
} from "@/lib/leadsShared";

/**
 * THE LEADS ROOM (Suren, Aug 25): the thousands that come in, before the
 * hundreds that become deals. "There will be thousands of leads… out of those
 * only hundreds can be your opportunities. That is why you want to keep
 * something as a lead — so that you don't discuss those 3000 items, you
 * discuss only the opportunity."
 *
 * The page is built around the two questions a lead list is actually for: what
 * came in that nobody has touched, and what is going stale. Everything else is
 * a filter.
 *
 * A lead is qualified with a MEETING or a PRESENTATION and never a submission
 * — his rule — so the row's action is "Request a meeting or presentation",
 * which hands off to Solutioning with the lead already named.
 */

type CustomerOption = { id: string; name: string };

const BLANK = {
  id: "",
  name: "",
  company: "",
  title: "",
  email: "",
  phone: "",
  country: "",
  source: "Website",
  interest: "",
  status: "New",
  owner: "",
  note: "",
  customerId: "",
  disqualifiedReason: "",
};

type Draft = typeof BLANK;

export function LeadsModule({
  state: initial,
  live,
  members,
  customers,
  canWrite,
}: {
  state: LeadsState;
  live: boolean;
  members: string[];
  customers: CustomerOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState(initial);
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [sort, setSort] = useState<"newest" | "oldest" | "stalest">("newest");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null);

  const leads = state.leads;
  const open = leads.filter(isOpenLead);
  const untouched = open.filter((l) => l.status === "New");
  /* "Going stale" is the finding a lead list exists to produce: nobody has
     moved this in three weeks and it is still open. Amber, never red — a
     quiet lead is a nudge, not a failure. */
  const stale = open.filter((l) => leadAgeDays(l) >= 21);
  const converted = leads.filter((l) => l.status === "Converted");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = leads.filter((l) => {
      if (statuses.length && !statuses.includes(l.status)) return false;
      if (sources.length && !sources.includes(l.source)) return false;
      if (owners.length && !owners.includes(l.owner ?? "__none")) return false;
      if (!q) return true;
      return [l.ref, l.name, l.company, l.email ?? "", l.interest ?? "", l.title ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    return rows.sort((a, b) => {
      if (sort === "stalest") return leadAgeDays(b) - leadAgeDays(a);
      const at = Date.parse(a.createdAt) || 0;
      const bt = Date.parse(b.createdAt) || 0;
      return sort === "oldest" ? at - bt : bt - at;
    });
  }, [leads, query, statuses, sources, owners, sort]);

  async function post(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        return false;
      }
      if (data.state) setState(data.state);
      toast(success);
      router.refresh();
      return true;
    } catch {
      toast("That didn't save.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openEditor(lead?: Lead) {
    setEditing(
      lead
        ? {
            ...BLANK,
            ...Object.fromEntries(
              Object.entries(lead).map(([k, v]) => [k, v ?? ""])
            ),
          } as Draft
        : { ...BLANK }
    );
  }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim() && !editing.company.trim()) {
      toast("A lead needs at least a person or a company name.", "error");
      return;
    }
    const ok = await post(
      { op: "save", lead: { ...editing, id: editing.id || undefined } },
      editing.id ? "Lead updated." : "Lead added."
    );
    if (ok) setEditing(null);
  }

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Everything that came in before it is a deal. Qualify with a meeting or a presentation; when it turns real, it becomes an opportunity."
        action={
          live && canWrite ? (
            <button
              type="button"
              onClick={() => openEditor()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Plus size={15} strokeWidth={2.4} /> New lead
            </button>
          ) : (
            <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11px] font-semibold text-blue-primary">
              Sample leads. Switch to Real mode to work the live list
            </span>
          )
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Users}
          label="Open leads"
          value={String(open.length)}
          sub={open.length === 0 ? "nothing waiting" : "not yet qualified or dropped"}
        />
        <StatTile
          icon={UserPlus}
          label="Nobody has touched"
          value={String(untouched.length)}
          color="#0071E3"
          warn={untouched.length > 0}
          sub="still sitting at New"
        />
        <StatTile
          icon={Clock3}
          label="Going stale"
          value={String(stale.length)}
          color="#B45309"
          warn={stale.length > 0}
          sub="open, untouched 21+ days"
        />
        <StatTile
          icon={CheckCircle2}
          label="Became opportunities"
          value={String(converted.length)}
          color="#16A34A"
          sub={
            leads.length
              ? `${Math.round((converted.length / leads.length) * 100)}% of every lead`
              : "none yet"
          }
        />
      </div>

      <PageToolbar
        query={query}
        onQuery={setQuery}
        placeholder="Search leads by name, company or what they asked about"
        searchAriaLabel="Search leads"
        onClearAll={() => {
          setStatuses([]);
          setSources([]);
          setOwners([]);
        }}
        groups={[
          {
            key: "status",
            label: "Status",
            values: statuses,
            onChange: setStatuses,
            options: LEAD_STATUSES.map((s) => ({
              value: s,
              label: s,
              color: leadStatusColor(s),
            })),
          },
          {
            key: "source",
            label: "Source",
            values: sources,
            onChange: setSources,
            options: LEAD_SOURCES.map((s) => ({
              value: s,
              label: s,
              color: leadSourceColor(s),
            })),
          },
          {
            key: "owner",
            label: "Owner",
            values: owners,
            onChange: setOwners,
            options: [
              { value: "__none", label: "Unassigned", color: "#8E98A8" },
              ...[...new Set(leads.map((l) => l.owner).filter(Boolean))].map(
                (o) => ({ value: o as string, label: o as string, color: "#0071E3" })
              ),
            ],
          },
        ]}
        sort={
          <ColorSelect
            value={sort}
            onChange={(v) => setSort(v as typeof sort)}
            ariaLabel="Sort leads"
            minWidth={160}
            dense
            collapsible={false}
            options={[
              { value: "newest", label: "Newest first", color: "#0071E3" },
              { value: "oldest", label: "Oldest first", color: "#8E98A8" },
              /* The stale list is the reason to open this page in the
                 morning, so it is one click away, not a mental sort. */
              { value: "stalest", label: "Stalest first", color: "#B45309" },
            ]}
          />
        }
      />

      {shown.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={leads.length === 0 ? "No leads yet" : "Nothing matches those filters"}
          description={
            leads.length === 0
              ? "A lead is anyone who came in before there is a deal: a demo request from the website, a card from a conference, a referral. Add the first one and qualify it with a meeting."
              : "Clear a filter to see the rest."
          }
        />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border-light bg-white shadow-card">
          <table className="w-full min-w-[1080px] text-left">
            <thead>
              <tr className="border-b border-border-light bg-surface/40 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-2.5">
                <th className="w-[9%]">Ref</th>
                <th className="w-[19%]">Who</th>
                <th className="w-[17%]">Company</th>
                <th className="w-[12%]">Source</th>
                <th className="w-[12%]">Status</th>
                <th className="w-[14%]">Owner</th>
                <th className="w-[10%]">Last moved</th>
                <th className="w-[7%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {shown.map((lead) => {
                const age = leadAgeDays(lead);
                const isStale = isOpenLead(lead) && age >= 21;
                return (
                  <tr
                    key={lead.id}
                    data-lead-row={lead.id}
                    className="group transition-colors hover:bg-blue-light/25"
                  >
                    <td className="px-4 py-2.5 text-[12px] font-semibold tnum text-text-tertiary">
                      {lead.ref}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => openEditor(lead)}
                        className="flex items-center gap-2 text-left"
                      >
                        <Avatar
                          name={lead.name || lead.company}
                          initialsOnly
                          className="h-7 w-7 shrink-0 text-[9px]"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-text-primary group-hover:text-blue-primary">
                            {lead.name || "—"}
                          </span>
                          {lead.title && (
                            <span className="block truncate text-[11.5px] text-text-secondary">
                              {lead.title}
                            </span>
                          )}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 text-[12.5px] text-text-secondary">
                        <CompanyLogo name={lead.company} className="h-6 w-6 shrink-0" />
                        <span className="truncate">{lead.company || "—"}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
                        style={{
                          background: `${leadSourceColor(lead.source)}18`,
                          color: leadSourceColor(lead.source),
                        }}
                      >
                        {lead.source}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
                        style={{
                          background: `${leadStatusColor(lead.status)}18`,
                          color: leadStatusColor(lead.status),
                        }}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {lead.owner ? (
                        <span className="flex items-center gap-1.5 text-[12.5px] text-text-secondary">
                          <Avatar name={lead.owner} className="h-5 w-5 shrink-0 text-[8px]" />
                          <span className="truncate">{lead.owner}</span>
                        </span>
                      ) : (
                        <span className="text-[12px] text-text-tertiary">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[12px] tnum">
                      <span className={cn(isStale && "font-semibold text-[color:#B45309]")}>
                        {age === 0 ? "Today" : age === 1 ? "Yesterday" : `${age}d ago`}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1">
                        {/* A lead is qualified with a meeting or a
                            presentation, never a submission (his rule). This
                            hands the lead straight to Solutioning. */}
                        <Link
                          href={`/solutioning?new=1&lead=${encodeURIComponent(lead.ref)}&company=${encodeURIComponent(lead.company)}`}
                          title="Request a meeting or a presentation for this lead"
                          className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                        >
                          <ArrowRight size={14} strokeWidth={2.2} />
                        </Link>
                        {live && canWrite && (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(lead)}
                            title="Delete this lead"
                            className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-[rgba(220,38,38,0.08)] hover:text-[color:#DC2626]"
                          >
                            <Trash2 size={14} strokeWidth={2.2} />
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? `Edit ${editing.name || editing.company}` : "New lead"}
          size="wide"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Person">
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Who got in touch"
              />
            </Field>
            <Field label="Company">
              <Input
                value={editing.company}
                onChange={(e) => setEditing({ ...editing, company: e.target.value })}
                placeholder="Their organisation"
                list="freyr-lead-companies"
              />
              <datalist id="freyr-lead-companies">
                {customers.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Job title">
              <Input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </Field>
            <Field label="Country">
              <Input
                value={editing.country}
                onChange={(e) => setEditing({ ...editing, country: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
            </Field>
            <Field label="Source">
              <ColorSelect
                value={editing.source}
                ariaLabel="Lead source"
                className="w-full"
                collapsible={false}
                dense
                onChange={(v) => setEditing({ ...editing, source: v })}
                options={LEAD_SOURCES.map((s) => ({
                  value: s,
                  label: s,
                  color: leadSourceColor(s),
                }))}
              />
            </Field>
            <Field label="Status">
              <ColorSelect
                value={editing.status}
                ariaLabel="Lead status"
                className="w-full"
                collapsible={false}
                dense
                onChange={(v) => setEditing({ ...editing, status: v })}
                options={LEAD_STATUSES.map((s) => ({
                  value: s,
                  label: s,
                  color: leadStatusColor(s),
                }))}
              />
            </Field>
            <Field label="Owner">
              <ColorSelect
                value={editing.owner}
                ariaLabel="Lead owner"
                className="w-full"
                collapsible={false}
                dense
                onChange={(v) => setEditing({ ...editing, owner: v })}
                options={[
                  { value: "", label: "Unassigned", color: "#8E98A8" },
                  ...members.map((m) => ({ value: m, label: m, color: "#0071E3" })),
                ]}
              />
            </Field>
            <div className="col-span-2">
              <Field label="What they asked about">
                <Textarea
                  rows={2}
                  value={editing.interest}
                  onChange={(e) =>
                    setEditing({ ...editing, interest: e.target.value })
                  }
                  placeholder="Asked for a Freya.Label demo through the website"
                />
              </Field>
            </div>
            {editing.status === "Disqualified" && (
              <div className="col-span-2">
                <Field label="Why it was dropped">
                  <Input
                    value={editing.disqualifiedReason}
                    onChange={(e) =>
                      setEditing({ ...editing, disqualifiedReason: e.target.value })
                    }
                    placeholder="No budget this financial year"
                  />
                </Field>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={save}
              className="rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {editing.id ? "Save changes" : "Add lead"}
            </button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await post({ op: "delete", id: confirmDelete.id }, "Lead deleted.");
          setConfirmDelete(null);
        }}
        title="Delete this lead?"
        body={
          confirmDelete
            ? `${confirmDelete.name || confirmDelete.company} (${confirmDelete.ref}) goes for good. If they simply went quiet, set the status to Disqualified instead so the history stays.`
            : ""
        }
        confirmLabel="Delete lead"
      />
    </div>
  );
}

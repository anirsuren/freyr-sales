"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Pencil,
  Clock3,
  Plus,
  Download,
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
import { cn, formatDate } from "@/lib/utils";
import { downloadCSV, toCSV } from "@/lib/csv";
import { PinnableTable } from "@/components/ui/PinnableTable";
import { PriorityLabel, PriorityTooltip } from "@/components/ui/SearchPriority";
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
  /** Which lead is folded open. Same mechanic as every other list here. */
  const [openRow, setOpenRow] = useState<string | null>(null);

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

  /** The list as it is filtered and sorted right now, not the whole store —
   *  exporting something other than what is on screen is a lie. */
  function exportCsv() {
    downloadCSV(
      `freyr-leads-${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(
        ["Ref", "Name", "Title", "Company", "Source", "Status", "Owner",
         "Email", "Phone", "Country", "Asked about", "Came in", "Last moved"],
        shown.map((l) => [
          l.ref, l.name, l.title ?? "", l.company, l.source, l.status,
          l.owner ?? "", l.email ?? "", l.phone ?? "", l.country ?? "",
          l.interest ?? "", l.createdAt.slice(0, 10), l.updatedAt.slice(0, 10),
        ])
      )
    );
    toast(`${shown.length} ${shown.length === 1 ? "lead" : "leads"} exported.`);
  }

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
        display={
          /* EXPORT, LIKE CUSTOMERS AND CONTACTS ALREADY HAVE. A list people
             work from is a list they take into a meeting; every other roster
             in this app lets you take it with you. */
          <PriorityTooltip label="Export CSV">
            <button
              type="button"
              onClick={exportCsv}
              aria-label="Export CSV"
              className="flex items-center rounded-md border border-border px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface"
            >
              <Download size={16} strokeWidth={1.5} />
              <PriorityLabel>Export CSV</PriorityLabel>
            </button>
          </PriorityTooltip>
        }
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
        <div className="mt-4 overflow-hidden rounded-xl border border-border-light bg-white shadow-card">
          {/* The header row stays put while you scroll, the same as Team and
              Solutioning (Anir, Aug 9: "there should be an option to pin the
              row headers and the column headers if I want"). */}
          <PinnableTable id="leads-table">
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
                <th className="w-[9%] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {shown.map((lead) => {
                const age = leadAgeDays(lead);
                const isStale = isOpenLead(lead) && age >= 21;
                const open = openRow === lead.id;
                return (
                  <Fragment key={lead.id}>
                    {/* THE ROW FOLDS OPEN, like every other list in this app
                        (Anir, Aug 25: "should be a dropdown bro — didn't I
                        specifically say it has to be consistent with every
                        other thing and every other page"). The first cut
                        opened a modal and put a bare arrow in Actions that
                        jumped to Solutioning, so clicking a lead took you to
                        a different module entirely. Clicking a lead now opens
                        the lead; the handoff is a named button inside. */}
                    <tr
                      data-lead-row={lead.id}
                      onClick={() => setOpenRow(open ? null : lead.id)}
                      aria-expanded={open}
                      className={cn(
                        "cursor-pointer transition-colors",
                        open
                          ? "bg-surface [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                          : "hover:bg-surface"
                      )}
                    >
                      <td className="px-4 py-2.5 text-[12px] font-semibold tnum text-text-tertiary">
                        {lead.ref}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <Avatar
                            name={lead.name || lead.company}
                            initialsOnly
                            className="h-7 w-7 shrink-0 text-[9px]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-text-primary">
                              {lead.name || "—"}
                            </span>
                            {lead.title && (
                              <span className="block truncate text-[11.5px] text-text-secondary">
                                {lead.title}
                              </span>
                            )}
                          </span>
                        </span>
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
                        {/* Same cluster the pipeline row uses: the tools, then
                            the chevron that says the row opens. */}
                        <span className="flex items-center justify-end gap-1">
                          {live && canWrite && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditor(lead);
                                }}
                                title="Edit this lead"
                                className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                              >
                                <Pencil size={13} strokeWidth={2.2} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDelete(lead);
                                }}
                                title="Delete this lead"
                                className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-[rgba(220,38,38,0.08)] hover:text-[color:#DC2626]"
                              >
                                <Trash2 size={13} strokeWidth={2.2} />
                              </button>
                            </>
                          )}
                          <ChevronDown
                            size={15}
                            strokeWidth={2.2}
                            aria-hidden="true"
                            className={cn(
                              "text-text-tertiary transition-transform",
                              open && "rotate-180 text-blue-primary"
                            )}
                          />
                        </span>
                      </td>
                    </tr>

                    {open && (
                      <tr className="!border-t-0 bg-surface">
                        <td
                          colSpan={8}
                          className="pb-4 pl-7 pr-4 pt-1 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                        >
                          <div className="tab-panel overflow-hidden rounded-xl border border-border-light bg-white p-4">
                            {lead.interest && (
                              <p className="text-[13px] text-text-primary">
                                {lead.interest}
                              </p>
                            )}
                            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-4">
                              {[
                                ["Email", lead.email],
                                ["Phone", lead.phone],
                                ["Country", lead.country],
                                ["Came in", formatDate(lead.createdAt)],
                              ].map(([label, value]) => (
                                <span key={label as string}>
                                  <span className="block text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                                    {label}
                                  </span>
                                  {label === "Email" && value ? (
                                    <a
                                      href={`mailto:${value}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-[12.5px] font-semibold text-blue-primary hover:underline"
                                    >
                                      {value}
                                    </a>
                                  ) : (
                                    <span className="text-[12.5px] font-semibold text-text-primary">
                                      {value || "—"}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>

                            {lead.status === "Disqualified" && lead.disqualifiedReason && (
                              <p className="mt-3 rounded-lg bg-[rgba(180,83,9,0.08)] px-3 py-2 text-[12.5px] font-semibold text-[color:#B45309]">
                                Dropped: {lead.disqualifiedReason}
                              </p>
                            )}

                            {lead.status === "Converted" && (
                              <p className="mt-3 rounded-lg bg-[rgba(22,163,74,0.08)] px-3 py-2 text-[12.5px] font-semibold text-[color:#16A34A]">
                                This lead became an opportunity. The deal is the
                                record from here.
                              </p>
                            )}

                            {/* A LEAD IS QUALIFIED WITH A MEETING OR A
                                PRESENTATION, NEVER A SUBMISSION (Suren, Aug 25:
                                "at the lead level I do a meeting and
                                presentation, not at the contact level"). Named
                                buttons, so nothing jumps you to another module
                                without saying so first. */}
                            <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-border-light pt-3.5">
                              <Link
                                href={`/solutioning?new=1&lead=${encodeURIComponent(lead.ref)}&company=${encodeURIComponent(lead.company)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-1.5 text-[12.5px] font-semibold text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light"
                              >
                                <ClipboardList size={13} strokeWidth={2.2} />
                                Request a meeting or a presentation
                              </Link>
                              {live && canWrite && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditor(lead);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                                >
                                  <Pencil size={13} strokeWidth={2.2} /> Edit this lead
                                </button>
                              )}
                              <span className="ml-auto text-[11.5px] text-text-tertiary">
                                Last moved by {lead.updatedBy} ·{" "}
                                {formatDate(lead.updatedAt)}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </PinnableTable>
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

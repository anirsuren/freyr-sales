"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  countryOptions,
  dialOptions,
  joinPhone,
  splitPhone,
} from "@/lib/countries";
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

import { NewRequestDialog } from "@/components/solutioning/SolutioningModule";

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
  /* The person chose "Not on the list. Type it", so keep the text box open
     even while the name is still empty. Never saved. */
  companyOther: false,
  /* The dialling code lives beside the number rather than inside it, so
     choosing a country can set the code before any digits are typed. A phone
     with no number is still no phone: `phone` stays empty until there are
     digits, and this only drives the picker. */
  dialCode: "",
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
  /** The lead a solutioning request is being raised for — the dialog opens
   *  HERE (Anir, Aug 27: "it takes me to another place, which is super
   *  annoying... just leave me there and just give me the pop-up"). */
  const [requestingFor, setRequestingFor] = useState<Lead | null>(null);
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
  /* NOTHING ON SCREEN, NOTHING TO EXPORT (Anir, Aug 14, on the Reports
     button doing exactly this): it stayed live on an empty page and handed
     back a spreadsheet holding one row of headings. Reports learned that;
     this did not. `shown` is the FILTERED list, so this also covers having
     filtered everything away. */
  const nothingToExport = shown.length === 0;

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
    /* type="email" is on the box, but nothing in this dialog is a form, so the
       browser never validates it — "not-an-email" saved happily and sat in the
       record until somebody tried to write to it. Optional, but if it is filled
       in it has to be an address. Same test the session form uses. */
    const email = editing.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast("Enter a valid email address, or leave it empty.", "error");
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
          canWrite ? (
            <button
              type="button"
              onClick={() => openEditor()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Plus size={15} strokeWidth={2.4} /> New lead
            </button>
          ) : (
            /* THE SHIELD IN THE TOP BAR ALREADY SAYS THIS (Anir, Sep 1: "I don't
               want you to say that... I want there to be somewhere on the page
               where, depending on the role I have... I should see an icon.
               When I hover over the icon, it shows me exactly what I can do").

               A pill announcing what you CANNOT do is a permanent apology
               taking header space on every page a view-only account opens, and
               it repeats what the access shield answers on hover. The mock
               notice stays — that one tells you the DATA is not real, which
               nothing else says. */
            live ? null : (
              <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11px] font-semibold text-blue-primary">
                Sample leads. Switch to Real mode to work the live list
              </span>
            )
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

      {/* The toolbar needs air under the stat tiles (Anir, Aug 26: "the search
          bar is touching the cards"). Every other list page spaces this row;
          these three called PageToolbar bare and it sat flush against the
          tiles above it. */}
      <PageToolbar
        className="mt-4"
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
              disabled={nothingToExport}
              title={
                nothingToExport
                  ? "Nothing to export yet: no leads are showing."
                  : undefined
              }
              className="flex items-center rounded-md border border-border px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
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
                <th className="w-[11%] whitespace-nowrap">Ref</th>
                <th className="w-[18%]">Who</th>
                <th className="w-[16%]">Company</th>
                <th className="w-[12%]">Source</th>
                <th className="w-[12%]">Status</th>
                <th className="w-[14%]">Owner</th>
                <th className="w-[10%]">Last moved</th>
                <th className="w-[9%] text-left">Actions</th>
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
                      {/* LEAD-0006 IS ONE WORD (Anir, Aug 26: "the ref has to
                          be on one line"). At 9% the column was narrow enough
                          to break the reference across two lines, which made
                          every row in the table taller than it needed to be. */}
                      <td className="whitespace-nowrap px-4 py-2.5 text-[12px] font-semibold tnum text-text-tertiary">
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
                        <span className="flex items-center justify-start gap-1">
                          {canWrite && (
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
                                className="rounded-md p-1.5 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
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
                              {/* MOCK CAN DO THIS TOO (Anir, Aug 26: "all the
                                  same functionality (add, edit etc.) should be
                                  on mock mode, but it shouldn't affect real
                                  data"). This was hidden in Mock back when
                                  Solutioning refused every create there. It
                                  does not any more — mock writes land on the
                                  mock row and cannot reach real data — so the
                                  guard outlived its reason and was just a
                                  missing feature in the mode built for trying
                                  features out. */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRequestingFor(lead);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-1.5 text-[12.5px] font-semibold text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light"
                              >
                                <ClipboardList size={13} strokeWidth={2.2} />
                                Request a meeting or a presentation
                              </button>
                              {/* No second edit button — the pencil already
                                  lives in the Actions column (Anir, Aug 27). */}
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

      {requestingFor && (
        <NewRequestDialog
          room="requests"
          customers={customers}
          opportunities={[]}
          members={members}
          prefillCustomerId={null}
          prefillOpportunityId={null}
          prefillCompany={requestingFor.company || null}
          prefillLead={requestingFor.ref || null}
          onClose={() => setRequestingFor(null)}
          onCreate={async (input) => {
            try {
              const res = await fetch("/api/solutioning", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ op: "create", type: "request", ...input }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok || !data.request) {
                toast(data.error || "That did not save.", "error");
                return false;
              }
              /* Raised from HERE, and you STAY here (Anir, Aug 27: "just
                 leave me there and just give me the pop-up"). The toast
                 carries the ref so the request is findable when wanted. */
              toast(`${data.request.ref} raised for ${requestingFor.company}.`);
              setRequestingFor(null);
              return true;
            } catch {
              toast("That did not save.", "error");
              return false;
            }
          }}
        />
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? `Edit ${editing.name || editing.company}` : "New lead"}
          /* ONE SIZE FOR EVERY FORM DIALOG (Anir, Aug 26: "all the pop-ups,
             let's just make it a set size"). These were "wide" (640px), which
             is too narrow for a two-column form — the fields stacked and the
             dialog came out tall and thin. "workflow" is 980px, the width the
             Solutioning request dialog already uses, and the floor below stops
             a short form collapsing into a strip. */
          size="workflow"
        >
          <div className="grid min-h-[420px] grid-cols-2 content-start gap-3">
            <Field label="Person">
              {/* THE CAP THE SERVER ALREADY KEEPS, said out loud. lib/leads
                  trims a name to 120 characters on the way in, so a longer one
                  was accepted, saved short, and nobody was told — paste a job
                  title into the name box and half of it vanishes on save.
                  Declaring it here stops the typing at the same place the
                  server would have cut it. */}
              <Input
                value={editing.name}
                maxLength={120}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Who got in touch"
              />
            </Field>
            <Field label="Company">
              {/* THE ACCOUNT, WITH ITS OWN LOGO (Anir, Aug 26: "Company:
                  you're not doing that either" — on the picker showing no
                  logos). This was an <input list> wearing a datalist, which
                  renders as the browser's grey autocomplete and looks nothing
                  like the rest of the app. Same control and same escape hatch
                  as the opportunity form: pick one of ours, or say it is not
                  on the list and type it. */}
              {(() => {
                const known = customers.find((c) => c.name === editing.company);
                const typing = editing.companyOther || (!!editing.company && !known);
                if (typing)
                  return (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={editing.company}
                        onChange={(e) =>
                          setEditing({ ...editing, company: e.target.value, companyOther: true })
                        }
                        placeholder="Their organisation"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({ ...editing, company: "", companyOther: false })
                        }
                        className="shrink-0 cursor-pointer rounded-lg border border-border-light bg-white px-2 py-2 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                      >
                        Pick from list
                      </button>
                    </div>
                  );
                return (
                  <ColorSelect
                    value={editing.company}
                    ariaLabel="Company"
                    className="w-full"
                    collapsible={false}
                    fill
                    onChange={(v) => {
                      if (v === "__other") {
                        setEditing({ ...editing, company: "", companyOther: true });
                        return;
                      }
                      setEditing({ ...editing, company: v, companyOther: false });
                    }}
                    options={[
                      { value: "", label: "Their organisation", color: "#C7CDD6" },
                      {
                        value: "__other",
                        label: "Not on the list. Type it",
                        color: "#8E98A8",
                      },
                      ...customers.map((c) => ({
                        value: c.name,
                        label: c.name,
                        logoName: c.name,
                      })),
                    ]}
                  />
                );
              })()}
            </Field>
            <Field label="Job title">
              {/* EVERY EMPTY BOX SAYS WHAT GOES IN IT (Anir, Aug 26: "I need
                  placeholders on all of em tbh"). A blank field with only a
                  label above it makes you guess the format. */}
              <Input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="Head of Regulatory Affairs"
              />
            </Field>
            <Field label="Country">
              {/* "Countries should just be like a flag" (Anir, Aug 26). The
                  flag rides in the option label, so the trigger shows it too. */}
              <ColorSelect
                value={editing.country}
                ariaLabel="Country"
                className="w-full"
                collapsible={false}
                fill
                onChange={(v) => {
                  const hit = dialOptions().find((d) => d.label.endsWith(v));
                  const parsed = splitPhone(editing.phone);
                  const dial = editing.dialCode || parsed.dial;
                  /* Choosing a country fills the dialling code, unless one is
                     already set. */
                  const nextDial = dial || hit?.value || "";
                  setEditing({
                    ...editing,
                    country: v,
                    dialCode: nextDial,
                    phone: joinPhone(nextDial, parsed.number),
                  });
                }}
                options={[
                  { value: "", label: "Pick a country", color: "#C7CDD6" },
                  ...countryOptions(),
                ]}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={editing.email}
                maxLength={200}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                placeholder="name@company.com"
              />
            </Field>
            <Field label="Phone">
              {/* A dialling code beside the number, not one free-text box
                  (Anir, Aug 26: "For phone, it's obviously gonna be different,
                  like countries and stuff"). Stored as one string, so nothing
                  downstream has to know it was entered in two parts. */}
              {(() => {
                const parsed = splitPhone(editing.phone);
                const dial = editing.dialCode || parsed.dial;
                const number = parsed.number;
                return (
                  <div className="flex items-center gap-1.5">
                    <ColorSelect
                      value={dial}
                      ariaLabel="Country dialling code"
                      collapsible={false}
                      minWidth={104}
                      triggerLabel={dial || "Code"}
                      onChange={(v) =>
                        setEditing({ ...editing, dialCode: v, phone: joinPhone(v, number) })
                      }
                      options={[
                        { value: "", label: "Code", color: "#C7CDD6" },
                        ...dialOptions(),
                      ]}
                    />
                    <Input
                      value={number}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          dialCode: dial,
                          phone: joinPhone(dial, e.target.value),
                        })
                      }
                      placeholder="20 7946 0000"
                      aria-label="Phone number"
                    />
                  </div>
                );
              })()}
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
                fill
                options={[
                  { value: "", label: "Unassigned", color: "#8E98A8" },
                  /* The person's own face, not a blue dot for everybody
                     (Anir, Aug 26: "Owner: you're not even showing the
                     profile pictures"). */
                  ...members.map((m) => ({ value: m, label: m, avatarName: m })),
                ]}
              />
            </Field>
            <div className="col-span-2">
              <Field label="What they asked about">
                <Textarea
                  rows={2}
                  value={editing.interest}
                  maxLength={500}
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

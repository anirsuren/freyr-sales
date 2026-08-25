"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Briefcase,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  ClipboardList,
  FileText,
  Hammer,
  Inbox,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { ColorSelect, MultiColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { PinnableTable } from "@/components/ui/PinnableTable";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { RoleTag } from "@/components/ui/RoleTag";
import { cn } from "@/lib/utils";
import { stampedAt } from "@/lib/performanceShared";
import {
  solutioningPeople,
  SUBMISSION_TYPES,
  type SolutioningKind,
  type SolutioningState,
  type SolutionRequest,
} from "@/lib/solutioning";
import { KIND_META, KindChip, STATUS_META, StatusPill } from "./bits";

/**
 * THE SOLUTIONING ROOM (Suren, Aug 24). Sales creates requests here or from a
 * customer page; the Solutions team lives here — "he'll come to the
 * solutioning module and then he'll see all the requests."
 */

type CustomerOption = { id: string; name: string };
type OpportunityOption = {
  id: string;
  label: string;
  customer: string;
  customerId: string | null;
};

const KIND_ORDER: SolutioningKind[] = ["submission", "presentation", "meeting"];

export function SolutioningModule({
  state: initial,
  live,
  meRole,
  members,
  memberRoles,
  customers,
  opportunities,
}: {
  state: SolutioningState;
  live: boolean;
  meRole: string;
  members: string[];
  memberRoles: Record<string, string>;
  customers: CustomerOption[];
  opportunities: OpportunityOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const search = useSearchParams();
  const [state, setState] = useState(initial);
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [customerPick, setCustomerPick] = useState<string[]>([]);
  const [sort, setSort] = useState<"newest" | "needed">("newest");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  /** Rows folded open. A Set, like every other expandable table here. */
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  /** The fulfiller side of the flow: Solutions picks up; managers and admins
   *  can too, so a request is never stranded when the team is out. */
  const fulfiller =
    meRole === "solutions" || meRole === "manager" || meRole === "admin";

  /* The customer page's "Request solutioning" button lands here with the
     account already chosen — the dialog opens itself, prefilled. */
  useEffect(() => {
    if (search.get("new") === "1") setCreating(true);
    // Reading once on mount is the point; the dialog owns the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = state.requests.filter((r) => {
      if (kinds.length && !kinds.includes(r.kind)) return false;
      if (statuses.length && !statuses.includes(r.status)) return false;
      if (owners.length) {
        const owner = r.owner ?? "__none";
        if (!owners.includes(owner)) return false;
      }
      if (customerPick.length && !customerPick.includes(r.customer)) return false;
      if (q) {
        const hay = [
          r.ref,
          r.title,
          r.customer,
          r.subtype ?? "",
          r.requestedBy,
          r.owner ?? "",
          ...r.opportunityLabels,
          ...r.contactNames,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return [...rows].sort((a, b) => {
      if (sort === "needed") {
        // Deadlines first, soonest first; the undated sink to the bottom.
        const an = a.neededBy ?? "9999-12-31";
        const bn = b.neededBy ?? "9999-12-31";
        if (an !== bn) return an < bn ? -1 : 1;
      }
      return a.requestedAt < b.requestedAt ? 1 : -1;
    });
  }, [state.requests, query, kinds, statuses, owners, customerPick, sort]);

  const open = state.requests.filter((r) => r.status !== "completed");
  const unclaimed = state.requests.filter(
    (r) => r.status === "initiated" && !r.owner
  );
  const inProgress = state.requests.filter((r) => r.status === "in_progress");
  const completed = state.requests.filter((r) => r.status === "completed");
  const people = solutioningPeople(state).slice(0, 8);

  async function post(body: Record<string, unknown>, doing: string) {
    setBusy(doing);
    try {
      const res = await fetch("/api/solutioning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        return null;
      }
      if (data.state) setState(data.state);
      return data;
    } catch {
      toast("That didn't save.", "error");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const ownerOptions: ColorOption[] = [
    { value: "__none", label: "Nobody yet", color: "#64748B", icon: CircleDashed },
    ...[...new Set(state.requests.map((r) => r.owner).filter(Boolean))].map(
      (o) => ({ value: o as string, label: o as string, avatarName: o as string })
    ),
  ];

  return (
    <div>
      <PageHeader
        title="Solutioning"
        subtitle="Presentations, submissions and meetings. Sales asks, the Solutions team builds, and whoever asked closes it."
        action={
          live ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Plus size={15} strokeWidth={2.4} /> New request
            </button>
          ) : (
            <span className="rounded-full bg-[rgba(0,113,227,0.08)] px-2.5 py-1 text-[11px] font-semibold text-blue-primary">
              Sample requests. Switch to Real mode to work the live list
            </span>
          )
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={ClipboardList}
          label="Open requests"
          value={String(open.length)}
          sub={open.length === 0 ? "nothing in flight" : "being asked for or built"}
        />
        <StatTile
          icon={Inbox}
          label="Waiting to be picked up"
          value={String(unclaimed.length)}
          color="#0071E3"
          warn={unclaimed.length > 0}
          sub={
            unclaimed.length > 0
              ? "nobody owns these yet"
              : "everything has an owner"
          }
        />
        <StatTile
          icon={Hammer}
          label="In progress"
          value={String(inProgress.length)}
          color="#6D28D9"
          sub="picked up and being built"
        />
        <StatTile
          icon={ShieldCheck}
          label="Completed"
          value={String(completed.length)}
          color="#1A7A35"
          sub="closed by the requester"
        />
      </div>

      <div className="mt-4">
        <PageToolbar
          query={query}
          onQuery={setQuery}
          placeholder="Search requests, customers, people…"
          searchAriaLabel="Search solutioning requests"
          onClearAll={() => {
            setQuery("");
            setKinds([]);
            setStatuses([]);
            setOwners([]);
            setCustomerPick([]);
          }}
          groups={[
            {
              key: "kind",
              label: "Type",
              values: kinds,
              onChange: setKinds,
              options: KIND_ORDER.map((k) => ({
                value: k,
                label: KIND_META[k].label,
                color: KIND_META[k].color,
              })),
            },
            {
              key: "status",
              label: "Status",
              values: statuses,
              onChange: setStatuses,
              options: (
                ["initiated", "in_progress", "completed"] as const
              ).map((s) => ({
                value: s,
                label: STATUS_META[s].label,
                color: STATUS_META[s].color,
              })),
            },
            {
              key: "owner",
              label: "Owner",
              values: owners,
              onChange: setOwners,
              options: ownerOptions,
            },
            {
              key: "customer",
              label: "Customer",
              values: customerPick,
              onChange: setCustomerPick,
              options: [
                ...new Set(state.requests.map((r) => r.customer).filter(Boolean)),
              ].map((c) => ({ value: c, label: c, logoName: c })),
            },
          ]}
          sort={
            <ColorSelect
              value={sort}
              onChange={(v) => setSort(v as "newest" | "needed")}
              ariaLabel="Sort requests"
              minWidth={150}
              options={[
                { value: "newest", label: "Newest first", color: "#0071E3", icon: Sparkles },
                { value: "needed", label: "By needed-by date", color: "#C2410C", icon: CalendarClock },
              ]}
            />
          }
        />
      </div>

      <p className="mb-3 text-[13px] text-text-secondary">
        Showing <b className="text-text-primary tnum">{shown.length}</b> of{" "}
        <b className="text-text-primary tnum">{state.requests.length}</b> requests
      </p>

      {state.requests.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={ClipboardList}
            title="No requests yet."
            description="Ask for a presentation, a submission or a meeting. The Solutions team picks it up from here, and you close it when it's delivered."
            action={
              live ? (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Plus size={14} strokeWidth={2.4} /> New request
                </button>
              ) : undefined
            }
          />
        </Card>
      ) : shown.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={ClipboardList}
            title="No requests match these filters."
            description="Try a different type, status or search term."
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <PinnableTable id="solutioning-requests">
            <table className="w-full min-w-[1100px] table-fixed border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border-light text-left text-[12.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary [&>th]:whitespace-nowrap">
                  <th className="w-[24%] px-4 py-2.5">Request</th>
                  <th className="w-[14%] px-4 py-2.5">Customer</th>
                  <th className="w-[16%] px-4 py-2.5">Against</th>
                  <th className="w-[14%] px-4 py-2.5">Requested by</th>
                  <th className="w-[10%] px-4 py-2.5">Needed by</th>
                  <th className="w-[12%] px-4 py-2.5">Owner</th>
                  <th className="w-[10%] px-4 py-2.5">Status</th>
                  {/* The fold column. Unlabelled, like every other table whose
                      last column is the chevron. */}
                  <th className="w-[44px] px-2 py-2.5" aria-label="Expand" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <RequestRow
                    key={r.id}
                    request={r}
                    live={live}
                    fulfiller={fulfiller}
                    busy={busy === r.id}
                    open={openIds.has(r.id)}
                    onToggle={() =>
                      setOpenIds((current) => {
                        const next = new Set(current);
                        if (next.has(r.id)) next.delete(r.id);
                        else next.add(r.id);
                        return next;
                      })
                    }
                    onPickUp={() => post({ op: "pick-up", requestId: r.id }, r.id)}
                  />
                ))}
              </tbody>
            </table>
          </PinnableTable>
        </Card>
      )}

      {people.length > 0 && (
        <Card className="mt-4 p-5">
          {/* "When I click on Ravi... how many presentations has he done, how
              many submissions, how many meetings" — the boss view, small and
              honest. Requester + owner + document workers all count, exactly
              as Suren counts them, so one delivered deck can appear under
              several people on purpose. */}
          <p className="text-[13px] font-semibold text-text-primary">
            Who is doing the work
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4">
            {people.map((p) => (
              <div
                key={p.person}
                className="flex items-center gap-2.5 rounded-xl border border-border-light bg-white p-3"
              >
                <Avatar name={p.person} className="h-9 w-9 shrink-0 text-[11px]" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-semibold text-text-primary">
                      {p.person}
                    </span>
                    <RoleTag role={memberRoles[p.person]} size="sm" />
                  </span>
                  <span className="mt-0.5 block text-[11px] text-text-secondary tnum">
                    {p.requested} requested · {p.owned} picked up · {p.workedDocs}{" "}
                    worked
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {creating && (
        <NewRequestDialog
          onClose={() => {
            setCreating(false);
            if (search.get("new") === "1") router.replace("/solutioning");
          }}
          customers={customers}
          opportunities={opportunities}
          members={members}
          prefillCustomerId={search.get("customer")}
          prefillOpportunityId={search.get("opportunity")}
          onCreate={async (input) => {
            const data = await post({ op: "create", ...input }, "create");
            if (data?.request) {
              toast(`${data.request.ref} created.`);
              setCreating(false);
              router.push(`/solutioning/${data.request.id}`);
            }
            return !!data;
          }}
        />
      )}
    </div>
  );
}

function RequestRow({
  request: r,
  live,
  fulfiller,
  busy,
  open,
  onToggle,
  onPickUp,
}: {
  request: SolutionRequest;
  live: boolean;
  fulfiller: boolean;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onPickUp: () => void;
}) {
  const overdue =
    r.neededBy && r.status !== "completed"
      ? r.neededBy < new Date().toISOString().slice(0, 10)
      : false;
  const against =
    r.opportunityLabels.length + r.contactNames.length === 0
      ? null
      : [
          r.opportunityLabels.length > 0
            ? `${r.opportunityLabels.length} ${r.opportunityLabels.length === 1 ? "opportunity" : "opportunities"}`
            : null,
          r.contactNames.length > 0
            ? `${r.contactNames.length} ${r.contactNames.length === 1 ? "contact" : "contacts"}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ");
  return (
    <>
    {/* THE WHOLE ROW IS THE TOGGLE (Anir, Aug 24: "when I click on it, it
        doesn't even work"). A 28px chevron was the only live surface on a
        70px row — clicking anywhere else did nothing, which reads as broken.
        Same split as the goal and team tables now: the row folds the
        breakdown, the NAME navigates (stopPropagation), and so do the pick-up
        button and the chevron itself. */}
    <tr
      onClick={onToggle}
      className="group cursor-pointer border-b border-border-light align-middle transition-colors last:border-0 hover:bg-[var(--surface)]"
    >
      <td className="px-4 py-3.5">
        <Link
          href={`/solutioning/${r.id}`}
          onClick={(e) => e.stopPropagation()}
          className="block min-w-0 rounded-lg -m-1.5 p-1.5 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <span className="whitespace-nowrap text-[11px] font-bold text-text-tertiary tnum">
              {r.ref}
            </span>
            <KindChip kind={r.kind} size="sm" />
            {r.subtype && (
              <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                {r.subtype}
              </span>
            )}
          </span>
          <span className="mt-1 flex items-center gap-1 text-[13.5px] font-semibold text-text-primary group-hover:text-blue-primary">
            <span className="min-w-0 break-words">{r.title}</span>
            <ChevronRight
              size={13}
              strokeWidth={2.2}
              className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
            />
          </span>
        </Link>
      </td>
      <td className="px-4 py-3.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <CompanyLogo name={r.customer} className="h-5 w-5 shrink-0 text-[7px]" />
          <span className="min-w-0 break-words text-[12.5px] text-text-primary">
            {r.customer}
          </span>
        </span>
      </td>
      <td className="px-4 py-3.5">
        {against ? (
          <span className="text-[12px] text-text-secondary">{against}</span>
        ) : (
          <span className="text-[12px] text-text-tertiary">
            the customer itself
          </span>
        )}
      </td>
      <td className="px-4 py-3.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar name={r.requestedBy} className="h-5 w-5 shrink-0 text-[7px]" />
          <span className="min-w-0">
            <span className="block truncate text-[12px] text-text-primary">
              {r.requestedBy}
            </span>
            <span className="block text-[10.5px] text-text-tertiary">
              {r.requestedAt.slice(0, 10)}
            </span>
          </span>
        </span>
      </td>
      <td className="px-4 py-3.5">
        {r.neededBy ? (
          <span
            className={cn(
              "text-[12px] tnum",
              overdue ? "font-bold text-[color:#DC2626]" : "text-text-secondary"
            )}
          >
            {r.neededBy}
            {overdue ? " · overdue" : ""}
          </span>
        ) : (
          <span className="text-[12px] text-text-tertiary">-</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        {r.owner ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar name={r.owner} className="h-5 w-5 shrink-0 text-[7px]" />
            <span className="min-w-0 break-words text-[12px] text-text-primary">
              {r.owner}
            </span>
          </span>
        ) : live && fulfiller && r.status !== "completed" ? (
          <button
            type="button"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onPickUp();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-blue-subtle bg-blue-light px-2.5 py-1 text-[11.5px] font-semibold text-blue-primary transition-colors hover:bg-blue-subtle/60 disabled:opacity-50"
          >
            Pick it up
          </button>
        ) : (
          <span className="text-[12px] text-text-tertiary">nobody yet</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        <StatusPill status={r.status} size="sm" />
      </td>
      <td className="px-2 py-3.5">
        {/* THE DROPDOWN EVERY OTHER TABLE HAS (Anir, Aug 24: "you have a
            table, it looks fine, but there should definitely be a dropdown,
            just like all the other things you do"). The name navigates; the
            chevron folds the breakdown open in place, same split as the
            Opportunities and goal tables. */}
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Show the breakdown for ${r.ref}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface hover:text-blue-primary"
        >
          <ChevronDown
            size={15}
            strokeWidth={2.2}
            className={cn("transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </td>
    </tr>
    {open && (
      /* THE SAME OPEN-ROW AS OPPORTUNITIES (Anir, Aug 25: "this Solutioning
         page is so ugly... look at all of the other tables where you did it
         and just do the same thing, because the separations are bad. You're
         not doing anything that you're doing on the other one").

         He was right and the diff was the whole answer. This panel was a bare
         four-column grid on a 40%-opacity grey: nothing said where the open
         row began, nothing said where one fact ended and the next started, and
         four equal columns gave the request's own words the same weight as a
         document count. The deal table has solved all three — a blue rail down
         the left edge so the open row is unmistakably one block, a white card
         floating on full grey, and substance first with the quiet facts in a
         ruled-off rail. Same bones here, same order. */
      <tr className="!border-t-0 bg-surface">
        {/* max-w-0 on the cell so the panel can never stretch the table —
            the same trap the claim table hit on Aug 23. */}
        <td
          colSpan={8}
          className="max-w-0 pb-4 pl-7 pr-4 pt-1 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
        >
          <div className="tab-panel overflow-hidden rounded-xl border border-border-light bg-white">
            <div className="grid grid-cols-1 gap-x-10 gap-y-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_260px]">
              {/* WHAT THEY ACTUALLY ASKED FOR leads, at the width a sentence
                  needs. It is the only thing on this panel written by a
                  person; everything else is a count or a name. */}
              <div className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                  What they asked for
                </span>
                {r.details ? (
                  <p className="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-text-primary">
                    {r.details}
                  </p>
                ) : (
                  <p className="mt-1.5 text-[12.5px] text-text-tertiary">
                    No details written on the request.
                  </p>
                )}
                {r.kind === "meeting" && r.meetingAt && (
                  <p className="mt-2.5 text-[12.5px] text-text-secondary">
                    Meeting on{" "}
                    <b className="tnum text-text-primary">{stampedAt(r.meetingAt)}</b>
                  </p>
                )}
              </div>

              {/* The quiet rail: who and what it is against, and what has been
                  built so far. Ruled off, exactly like the deal panel's. */}
              <div className="min-w-0 space-y-3.5 sm:border-l sm:border-border-light sm:pl-8">
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                    Against
                  </span>
                  {r.opportunityLabels.length + r.contactNames.length === 0 ? (
                    <p className="mt-1.5 text-[12.5px] text-text-tertiary">
                      The customer itself
                    </p>
                  ) : (
                    <div className="mt-1.5 space-y-1.5">
                      {r.opportunityLabels.map((label) => (
                        <p
                          key={label}
                          className="flex items-start gap-1.5 text-[12.5px] text-text-secondary"
                        >
                          <Briefcase
                            size={13}
                            strokeWidth={2}
                            aria-hidden="true"
                            className="mt-0.5 shrink-0 text-text-tertiary"
                          />
                          <span className="min-w-0">{label}</span>
                        </p>
                      ))}
                      {r.contactNames.map((name) => (
                        <p
                          key={name}
                          className="flex items-center gap-1.5 text-[12.5px] text-text-secondary"
                        >
                          <Avatar
                            name={name}
                            className="h-[18px] w-[18px] shrink-0 text-[7px]"
                          />
                          {name}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                    Documents
                  </span>
                  {r.docs.length === 0 ? (
                    <p className="mt-1.5 text-[12.5px] text-text-tertiary">
                      Nothing added yet
                    </p>
                  ) : (
                    <div className="mt-1.5 space-y-1">
                      {DOC_TAB_WORDS.map(([key, word]) => {
                        const n = r.docs.filter((d) => d.category === key).length;
                        if (n === 0) return null;
                        return (
                          <p
                            key={key}
                            className="text-[12.5px] text-text-secondary tnum"
                          >
                            {n} {word}
                            {n === 1 ? "" : "s"}
                          </p>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* THE STORY GETS THE FULL WIDTH UNDER A DIVIDER, the same place
                the deal panel puts its activities strip. */}
            <div className="border-t border-border-light bg-surface/50 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                <div className="min-w-0">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                    Latest activity
                  </span>
                  <div className="mt-1.5 space-y-1.5">
                    {r.activity.length === 0 ? (
                      <p className="text-[12.5px] text-text-tertiary">
                        Nothing has happened on this yet.
                      </p>
                    ) : (
                      [...r.activity]
                        .slice(-3)
                        .reverse()
                        .map((a, i) => (
                          <p
                            key={`${a.at}-${i}`}
                            className="flex items-center gap-1.5 text-[12.5px] text-text-secondary"
                          >
                            <Avatar
                              name={a.by}
                              className="h-[18px] w-[18px] shrink-0 text-[7px]"
                            />
                            <span className="min-w-0 truncate">{a.what}</span>
                          </p>
                        ))
                    )}
                  </div>
                </div>
                <Link
                  href={`/solutioning/${r.id}`}
                  className="inline-flex shrink-0 items-center gap-1 self-end rounded-lg border border-border-light bg-white px-2.5 py-1.5 text-[12px] font-semibold text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light"
                >
                  Open the full request
                  <ChevronRight size={12} strokeWidth={2.4} />
                </Link>
              </div>
            </div>
          </div>
        </td>
      </tr>
    )}
    </>
  );
}

/** The drill-down's plain words for the four tabs. */
const DOC_TAB_WORDS: [import("@/lib/solutioning").DocCategory, string][] = [
  ["customer", "customer document"],
  ["working", "working document"],
  ["final", "final deliverable"],
  ["analysis", "analysis document"],
];

/* ------------------------------------------------------------- creation */

function NewRequestDialog({
  onClose,
  onCreate,
  customers,
  opportunities,
  members,
  prefillCustomerId,
  prefillOpportunityId,
}: {
  onClose: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<boolean>;
  customers: CustomerOption[];
  opportunities: OpportunityOption[];
  members: string[];
  prefillCustomerId: string | null;
  prefillOpportunityId: string | null;
}) {
  const [kind, setKind] = useState<SolutioningKind | null>(null);
  const [title, setTitle] = useState("");
  const [subtype, setSubtype] = useState("RFP");
  const [presType, setPresType] = useState("");
  const [customerId, setCustomerId] = useState(prefillCustomerId ?? "");
  const [oppIds, setOppIds] = useState<string[]>(
    prefillOpportunityId ? [prefillOpportunityId] : []
  );
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [contacts, setContacts] = useState<
    { id: string; name: string; title: string | null }[]
  >([]);
  const [neededBy, setNeededBy] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [attendees, setAttendees] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  const customer = customers.find((c) => c.id === customerId) ?? null;

  /* Contacts belong to the chosen account, so they load when it is chosen —
     "leads new list is not required" (Suren): these ARE the leads. */
  useEffect(() => {
    setContactIds([]);
    setContacts([]);
    if (!customerId) return;
    let cancelled = false;
    fetch(`/api/solutioning?contactsFor=${encodeURIComponent(customerId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && Array.isArray(d?.contacts)) setContacts(d.contacts);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const customerOpps = opportunities.filter(
    (o) =>
      (o.customerId && o.customerId === customerId) ||
      (customer && o.customer === customer.name)
  );

  const canSave =
    !!kind &&
    title.trim().length > 0 &&
    !!customer &&
    (kind !== "meeting" || true);

  return (
    <Modal
      open
      onClose={onClose}
      title={kind ? `Request a ${KIND_META[kind].label.toLowerCase()}` : "What do you need?"}
      size="workflow"
    >
      {!kind ? (
        /* THE FIRST QUESTION IS THE ONLY QUESTION ON SCREEN. Three big tiles,
           because the kind decides every field that follows. */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {KIND_ORDER.map((k) => {
            const meta = KIND_META[k];
            const Icon = meta.icon;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className="group flex flex-col items-start gap-2.5 rounded-xl border border-border-light bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-card"
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ background: `${meta.color}14`, color: meta.color }}
                >
                  <Icon size={19} strokeWidth={1.9} />
                </span>
                <span className="text-[14px] font-semibold text-text-primary group-hover:text-blue-primary">
                  {meta.label}
                </span>
                <span className="text-[12px] leading-snug text-text-secondary">
                  {k === "submission"
                    ? "An RFP, RFI or proposal to prepare and send"
                    : k === "presentation"
                      ? "A deck to build and deliver, like an RFP defense"
                      : "An external meeting with the customer to arrange"}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[12px] font-semibold text-text-primary">
                What is it called?
              </span>
              <input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  kind === "submission"
                    ? "RFP response — global labeling"
                    : kind === "presentation"
                      ? "RFP defense deck"
                      : "Technical deep-dive with the RA team"
                }
                className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
              />
            </label>
            {kind === "submission" && (
              <label className="block">
                <span className="text-[12px] font-semibold text-text-primary">
                  Submission type
                </span>
                <div className="mt-1.5">
                  <ColorSelect
                    value={subtype}
                    onChange={setSubtype}
                    ariaLabel="Submission type"
                    minWidth={160}
                    options={SUBMISSION_TYPES.map((t, i) => ({
                      value: t,
                      label: t,
                      color: ["#0071E3", "#0D9488", "#7C3AED", "#64748B"][i],
                      icon: FileText,
                    }))}
                  />
                </div>
              </label>
            )}
            {kind === "presentation" && (
              <label className="block">
                <span className="text-[12px] font-semibold text-text-primary">
                  Presentation type
                </span>
                <input
                  value={presType}
                  onChange={(e) => setPresType(e.target.value)}
                  placeholder="RFP defense, capabilities overview…"
                  className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
                />
              </label>
            )}
            {kind === "meeting" && (
              <label className="block">
                <span className="text-[12px] font-semibold text-text-primary">
                  When is the meeting?
                </span>
                <input
                  type="datetime-local"
                  value={meetingAt}
                  onChange={(e) => setMeetingAt(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
                />
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[12px] font-semibold text-text-primary">
                Which customer?
              </span>
              <div className="mt-1.5">
                <ColorSelect
                  value={customerId}
                  onChange={setCustomerId}
                  ariaLabel="Customer"
                  minWidth={220}
                  searchable
                  options={[
                    ...(customerId
                      ? []
                      : [
                          {
                            value: "",
                            label: "Pick the account",
                            color: "#64748B",
                            icon: CircleDashed,
                          },
                        ]),
                    ...customers.map((c) => ({
                      value: c.id,
                      label: c.name,
                      logoName: c.name,
                    })),
                  ]}
                />
              </div>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-text-primary">
                Needed by
              </span>
              <input
                type="date"
                value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
              />
            </label>
          </div>

          {/* Against one or MORE opportunities, or one or more contacts —
              his exact multiplicity, both optional: a request can be about
              the account itself. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[12px] font-semibold text-text-primary">
                Against which opportunities?
              </span>
              <div className="mt-1.5">
                <MultiColorSelect
                  values={oppIds}
                  onChange={setOppIds}
                  ariaLabel="Opportunities this is against"
                  minWidth={220}
                  allLabel={
                    customer
                      ? customerOpps.length
                        ? "Pick opportunities"
                        : "No opportunities on this account"
                      : "Pick the customer first"
                  }
                  allIcon={ClipboardList}
                  allColor="#0071E3"
                  options={customerOpps.map((o) => ({
                    value: o.id,
                    label: o.label,
                    color: "#0071E3",
                  }))}
                />
              </div>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-text-primary">
                Against which contacts?
              </span>
              <div className="mt-1.5">
                <MultiColorSelect
                  values={contactIds}
                  onChange={setContactIds}
                  ariaLabel="Contacts this is against"
                  minWidth={220}
                  allLabel={
                    customer
                      ? contacts.length
                        ? "Pick contacts"
                        : "No contacts on this account"
                      : "Pick the customer first"
                  }
                  allIcon={CircleDashed}
                  allColor="#0D9488"
                  options={contacts.map((c) => ({
                    value: c.id,
                    label: c.title ? `${c.name} · ${c.title}` : c.name,
                    avatarName: c.name,
                  }))}
                />
              </div>
            </label>
          </div>

          {kind === "meeting" && (
            <label className="block">
              <span className="text-[12px] font-semibold text-text-primary">
                Who is attending from Freyr?
              </span>
              <div className="mt-1.5">
                <MultiColorSelect
                  values={attendees}
                  onChange={setAttendees}
                  ariaLabel="Attendees"
                  minWidth={220}
                  allLabel="Pick attendees"
                  allIcon={CalendarDays}
                  allColor="#0D9488"
                  options={members.map((m) => ({
                    value: m,
                    label: m,
                    avatarName: m,
                  }))}
                />
              </div>
            </label>
          )}

          <label className="block">
            <span className="text-[12px] font-semibold text-text-primary">
              What does the Solutions team need to know?
            </span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              placeholder="Scope, context, links — whatever helps them start."
              className="mt-1.5 w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
            />
          </label>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setKind(null)}
              className="rounded-lg border border-border-light bg-white px-4 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canSave || saving}
              onClick={async () => {
                if (!kind || !customer) return;
                setSaving(true);
                const ok = await onCreate({
                  kind,
                  subtype:
                    kind === "submission"
                      ? subtype
                      : kind === "presentation"
                        ? presType.trim() || undefined
                        : undefined,
                  title: title.trim(),
                  details: details.trim() || undefined,
                  customerId: customer.id,
                  customer: customer.name,
                  opportunityIds: oppIds,
                  opportunityLabels: oppIds
                    .map(
                      (id) => opportunities.find((o) => o.id === id)?.label ?? ""
                    )
                    .filter(Boolean),
                  contactIds,
                  contactNames: contactIds
                    .map((id) => contacts.find((c) => c.id === id)?.name ?? "")
                    .filter(Boolean),
                  neededBy: neededBy || undefined,
                  meetingAt: meetingAt || undefined,
                  attendees: attendees.length ? attendees : undefined,
                });
                if (!ok) setSaving(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} strokeWidth={2.4} />
              {saving ? "Creating…" : "Create the request"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

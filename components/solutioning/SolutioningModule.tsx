"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlarmClock,
  ArrowLeft,
  ArrowUpRight,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  ClipboardList,
  File,
  FileSpreadsheet,
  FileText,
  Inbox,
  Loader2,
  PanelsTopLeft,
  Plus,
  Presentation,
  Rows3,
  Sparkles,
  Timer,
  Trash2,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SolutioningTabs } from "@/components/solutioning/SolutioningTabs";
import { StatTile } from "@/components/ui/StatTile";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { ColorSelect, MultiColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { PinnableTable } from "@/components/ui/PinnableTable";
import { Avatar } from "@/components/ui/Avatar";
import { timelineMark } from "@/components/solutioning/RequestDetail";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";
import { useStoredView } from "@/lib/useStoredView";
import { stampedAt } from "@/lib/performanceShared";
import {
  SUBMISSION_TYPES,
  type SolutioningKind,
  type SolutioningState,
  type SolutionRequest,
} from "@/lib/solutioning";
import { KIND_META, KindChip, STATUS_META, StatusPill } from "./bits";

/**
 * THE SOLUTIONING ROOM (Suren, Aug 24). Sales creates requests here or from a
 * customer page; the Solutioning team lives here — "he'll come to the
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

/** What each room is, in the words that belong on its own page. */
const ROOM_META: Record<
  "requests" | "submissions" | "presentations",
  {
    title: string;
    subtitle: string;
    empty: string;
    newLabel: string;
    /** What one row is called, for the "showing x of y" line. */
    noun: string;
    /** The same word as a column heading. */
    rowNoun: string;
  }
> = {
  /* SOLUTION REQUESTS, in the company's own words (Suren, Aug 28: "now you
     should call it as solution request not request — they call it solution
     request"). The record is still a request; what changed is that the app
     now says it the way the floor says it. */
  requests: {
    title: "Solution requests",
    subtitle:
      "What sales has asked the Solutioning team for: a submission, a presentation or a meeting.",
    empty: "No solution requests yet.",
    newLabel: "New solution request",
    noun: "solution requests",
    rowNoun: "Solution request",
  },
  submissions: {
    title: "Submissions",
    subtitle: "RFI, RFP and proposal submissions being put together.",
    empty: "No submissions yet.",
    newLabel: "New submission",
    noun: "submissions",
    rowNoun: "Submission",
  },
  presentations: {
    title: "Presentations",
    subtitle: "Decks and RFP defences being built for a customer.",
    empty: "No presentations yet.",
    newLabel: "New presentation",
    noun: "presentations",
    rowNoun: "Presentation",
  },
};

export function SolutioningModule({
  state: initial,
  room = "requests",
  meRole,
  members,
  customers,
  opportunities,
  canCreate,
}: {
  state: SolutioningState;
  /**
   * WHICH ROOM (Anir, Aug 26: "under solutioning the three things, like
   * goals"). Requests is everything people asked for; the other two narrow to
   * the work of that kind.
   */
  room?: "requests" | "submissions" | "presentations";
  meRole: string;
  /**
   * MAY THEY RAISE ONE (Suren, Aug 29: "owner can create, member can edit").
   * Both of these buttons rendered for anybody who could open the room, and
   * the server accepted, so a member could start requests the map gives them
   * no create on.
   */
  canCreate: boolean;
  members: string[];
  customers: CustomerOption[];
  opportunities: OpportunityOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    ref: string;
  } | null>(null);
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
  /* TABLE OR SPLIT, THE SAME CONTROL AS ADMIN AND THE GOAL MASTER (Anir,
     Aug 30: "you probably want to have the table and the split view too on all
     the solutioning ones"). The table answers "what is in this room" across
     everything; the split answers "everything about THIS request" without
     folding a row open and losing the list. Remembered per room, because the
     right way to read submissions is not necessarily the right way to read
     meetings-in-waiting. */
  const [view, pickView] = useStoredView<"table" | "split">(
    `freyr.solutioning.${room}.view`,
    "table",
    ["table", "split"] as const
  );
  const [pickedId, setPickedId] = useState<string | null>(null);

  /** The fulfiller side of the flow: Solutions picks up; managers and admins
   *  can too, so a request is never stranded when the team is out. */
  const fulfiller =
    meRole === "sol_member" || meRole === "bd_owner" || meRole === "admin";

  /* The customer page's "Request solutioning" button lands here with the
     account already chosen — the dialog opens itself, prefilled. */
  useEffect(() => {
    /* Only in Real mode: every create is refused in Mock, so opening the
       dialog from a deep link there hands somebody a form that cannot be
       submitted (Anir, Aug 26, arriving from a lead in Mock: "this button
       doesn't work"). */
    if (search.get("new") === "1") setCreating(true);
    // Reading once on mount is the point; the dialog owns the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Everything this room holds, before any search or filter — the denominator
     of "showing x of y". */
  const inRoom = useMemo(
    () =>
      state.requests.filter((r) => {
        const itemType = r.type ?? "request";
        if (room === "requests") return itemType === "request";
        if (room === "submissions") return itemType === "submission";
        return itemType === "presentation";
      }),
    [state.requests, room]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = state.requests.filter((r) => {
      /* THE ROOM IS THE OBJECT, not a filter on one (Suren, Aug 26: "request
         is a separate object, and submissions is another object"). Requests
         are what sales asked for; the other two rooms hold the work itself,
         whether or not a request prompted it. */
      const itemType = r.type ?? "request";
      if (room === "requests" && itemType !== "request") return false;
      if (room === "submissions" && itemType !== "submission") return false;
      if (room === "presentations" && itemType !== "presentation") return false;
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
  }, [state.requests, query, kinds, statuses, owners, customerPick, sort, room]);

  /** What the split is standing on. Null means the first row on screen, so
   *  the right pane is never empty while the left has something in it — and a
   *  filter that hides your pick moves you to the top rather than blanking. */
  const picked = shown.find((r) => r.id === pickedId) ?? shown[0] ?? null;

  /* Every row on screen is the same kind, so the chip drops its word and keeps
     its mark. Computed from what is on screen, not from the tab, so a mixed
     room keeps its labels. */
  const oneKind =
    shown.length > 0 && new Set(shown.map((r) => r.kind)).size === 1;

  /* COUNT THE ROOM YOU ARE IN, not the whole store — the same correction Anir
     made about the sentence directly under these tiles ("Submissions read
     'Showing 2 of 9 requests' — the 9 was every item in Solutioning"). The
     sentence was fixed and the tiles above it were not, so the Submissions
     room announced "OPEN REQUESTS 6" over a list of one submission, and named
     a longest-waiting record that is not even in this room. A number that
     disagrees with the list under it is worse than no number. */
  const open = inRoom.filter((r) => r.status !== "completed");
  const unclaimed = inRoom.filter((r) => r.status === "initiated" && !r.owner);
  const completed = inRoom.filter((r) => r.status === "completed");

  /**
   * TURNAROUND — the only analysis he asked this module for (Suren, Aug 25):
   * "the requests are coming in; if the requests are not fulfilled by a certain
   * timeline then I know they are all backed up and they are not doing the
   * right thing. And if a submission start date was this and you have not done
   * a submission till some point in time, that means your average submission
   * time in an RFP situation is acceptable. So I can get those analysis —
   * that's all I need to know. I don't have to go into any other details."
   *
   * Two numbers, deliberately: how long a closed request took on average, and
   * how long the oldest open one has been sitting. The second is the one that
   * catches a backlog, because an average made only of finished work hides a
   * queue nobody has touched.
   */
  const DAY = 86_400_000;
  const daysBetween = (from?: string, to?: string) => {
    const a = Date.parse(from ?? "");
    const b = to ? Date.parse(to) : Date.now();
    return Number.isFinite(a) && Number.isFinite(b)
      ? Math.max(0, Math.round((b - a) / DAY))
      : null;
  };
  const turnarounds = completed
    .map((r) => daysBetween(r.requestedAt, r.completedAt))
    .filter((d): d is number => d !== null);
  const avgTurnaround = turnarounds.length
    ? Math.round(turnarounds.reduce((s, d) => s + d, 0) / turnarounds.length)
    : null;
  const openAges = open
    .map((r) => ({ r, days: daysBetween(r.requestedAt) }))
    .filter((x): x is { r: SolutionRequest; days: number } => x.days !== null)
    .sort((a, b) => b.days - a.days);
  const oldestOpen = openAges[0] ?? null;

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
      /* The page's own server data backs the counters and the tiles, so it is
         re-read after every action (Anir, Aug 28: "I had to keep reloading
         whenever I added something new"). */
      router.refresh();
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
      {/* THE THREE ROOMS AS A SELECTOR (Anir, Aug 27: "we need the ability to
          switch between requests, submissions and presentations... look at
          what you did for the goals page. It should be the exact same
          thing"). Same PageTabs the Performance and Market Intel pages use;
          the room's title and subtitle now come from the strip, so the old
          PageHeader would say the page name twice. */}
      <SolutioningTabs
        active={room}
        action={
          /* MOCK IS FULLY WORKABLE (Anir, Aug 26: "I should be able to add and
             edit — it's mock mode, so I want to see all functionality"). Mock
             and Real are separate rows in the store, so nothing written here
             can reach the live workspace, and the banner across the top
             already says which mode you are in. */
          canCreate ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Plus size={15} strokeWidth={2.4} /> {ROOM_META[room].newLabel}
            </button>
          ) : null
        }
      >

      {/* FOUR TILES, MAXIMUM, AND EVERY LABEL ON ONE LINE (Anir, Aug 26: "you
          can have six things at the top, and they all have to be perfectly
          aligned with the same number of lines… you have to have a maximum of
          four").

          Six tiles squeezed each one to ~200px, which wrapped "Waiting to be
          picked up" and "Average turnaround" onto two lines while the other
          four stayed on one — so the row lost its baseline. At four the tiles
          are twice as wide and every label fits on a single line.

          In progress and Completed came out rather than the turnaround pair:
          both are one click away on the Status filter, while "how long is this
          taking" and "what has been sitting longest" are the two questions
          Suren actually asked this module for and are not derivable from the
          list at a glance. */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={ClipboardList}
          label={`Open ${ROOM_META[room].noun}`}
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
          icon={Timer}
          label="Average turnaround"
          value={avgTurnaround === null ? "—" : `${avgTurnaround}d`}
          color="#0F766E"
          sub={
            avgTurnaround === null
              ? "nothing closed yet"
              : `across ${turnarounds.length} closed`
          }
        />
        <StatTile
          icon={AlarmClock}
          /* AMBER, NOT RED: a request that has been waiting a while is a nudge
             for the queue, not somebody's failure. */
          label="Longest waiting"
          value={oldestOpen ? `${oldestOpen.days}d` : "—"}
          color="#B45309"
          warn={!!oldestOpen && oldestOpen.days >= 14}
          sub={oldestOpen ? oldestOpen.r.ref : "nothing open"}
        />
      </div>

      <div className="mt-4">
        <PageToolbar
          query={query}
          onQuery={setQuery}
          /* The room's own noun, like the tiles and the count under it. */
          placeholder={`Search ${ROOM_META[room].noun}, customers, people…`}
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
          view={
            <span
              role="group"
              aria-label="How to show this room"
              className="flex shrink-0 items-center gap-0.5 rounded-full bg-surface p-0.5"
            >
              {(
                [
                  { key: "table", label: "Table", icon: Rows3 },
                  { key: "split", label: "Split", icon: PanelsTopLeft },
                ] as const
              ).map((o) => {
                const Icon = o.icon;
                const on = view === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => pickView(o.key)}
                    aria-pressed={on}
                    className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold transition-all",
                      on
                        ? "bg-white text-text-primary shadow-sm"
                        : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
                    {o.label}
                  </button>
                );
              })}
            </span>
          }
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

      {/* THE ROW DOES NOT REPEAT THE COLUMN HEADER (Suren, Aug 28: "you
          don't have to say submission or presentation here etc, it's already
          the column header. Show the icon / colour though"). Computed from
          what is actually on screen rather than from the tab, so a room that
          mixes kinds keeps its labels. */}
      {/* COUNT THE ROOM YOU ARE IN, not the whole store. Submissions read
          "Showing 2 of 9 requests" — the 9 was every item in Solutioning, and
          the word was wrong twice over. */}
      <p className="mb-3 text-[13px] text-text-secondary">
        Showing <b className="text-text-primary tnum">{shown.length}</b> of{" "}
        <b className="text-text-primary tnum">{inRoom.length}</b>{" "}
        {ROOM_META[room].noun}
      </p>

      {/* NO BOX AROUND AN EMPTY STATE (Anir, Aug 26: "for Solutioning you have
          this box, but then for Leads and Revenue Accruals you don't have the
          box… remove the box for Solutioning"). Every other list in this app
          draws the empty state bare; only this one framed it, so the same
          "nothing here yet" looked like two different things depending on
          which page you were on. */}
      {state.requests.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={ROOM_META[room].empty}
          description="Ask for a presentation, a submission or a meeting. The Solutioning team picks it up from here, and you close it when it's delivered."
          action={
            canCreate ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Plus size={14} strokeWidth={2.4} /> {ROOM_META[room].newLabel}
              </button>
            ) : null
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={`Nothing in ${ROOM_META[room].title.toLowerCase()} matches these filters.`}
          description="Try a different type, status or search term."
        />
      ) : view === "split" ? (
        /* LEFT: THE ROOM AS A RUNNING LIST. RIGHT: THE ONE YOU PICKED.
           The same shape as User groups, Team members and the Goal Master, and
           the right pane is the very panel the row's fold draws, so the two
           readings of a request cannot drift apart. */
        <div
          key="split"
          className="tab-panel grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]"
        >
          <div className="max-h-[720px] overflow-y-auto rounded-xl border border-border-light bg-white">
            {shown.map((r) => {
              const on = picked?.id === r.id;
              const meta = KIND_META[r.kind];
              const overdue =
                r.neededBy && r.status !== "completed"
                  ? r.neededBy < new Date().toISOString().slice(0, 10)
                  : false;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setPickedId(r.id)}
                  aria-current={on ? "true" : undefined}
                  title={r.title}
                  style={{
                    ["--kind-accent" as string]: meta.color,
                    backgroundColor: on ? `${meta.color}14` : undefined,
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-2.5 border-b border-border-light px-3 py-2.5 text-left transition-colors last:border-b-0",
                    on
                      ? "[box-shadow:inset_3px_0_0_0_var(--kind-accent)]"
                      : "hover:bg-surface"
                  )}
                >
                  <CompanyLogo
                    name={r.customer}
                    className="mt-0.5 h-7 w-7 shrink-0 text-[9px]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary tnum">
                        {r.ref}
                      </span>
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold"
                        style={{ color: meta.color, background: `${meta.color}1A` }}
                      >
                        {meta.label}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] font-semibold text-text-primary">
                      {r.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-text-tertiary">
                      <span className="min-w-0 truncate">{r.customer}</span>
                      {overdue && (
                        <span className="shrink-0 font-bold text-[color:#DC2626]">
                          overdue
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div
            key={picked?.id ?? "none"}
            className="tab-panel min-w-0 overflow-hidden rounded-xl border border-border-light bg-white"
          >
            {picked ? (
              <>
                {/* The header the fold does not need, because in the table the
                    row above it is the header. */}
                <div className="flex flex-wrap items-center gap-2.5 border-b border-border-light bg-surface px-4 py-3">
                  <CompanyLogo
                    name={picked.customer}
                    className="h-8 w-8 shrink-0 text-[10px]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-tertiary tnum">
                        {picked.ref}
                      </span>
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                        style={{
                          color: KIND_META[picked.kind].color,
                          background: `${KIND_META[picked.kind].color}1A`,
                        }}
                      >
                        {KIND_META[picked.kind].label}
                      </span>
                      <StatusPill status={picked.status} />
                    </span>
                    <span className="mt-0.5 block truncate text-[14px] font-semibold text-text-primary">
                      {picked.title}
                    </span>
                  </span>
                  {/* THE SAME ACTIONS THE TABLE HAS (Anir, Sep 1: "this goes
                      for all the pages, but on split view I need to have all
                      the same functionality that there is on table view").

                      Split had the open-in-full arrow and nothing else, so
                      switching layout quietly took Delete away — the same
                      record, the same person, a different answer depending on
                      a view toggle. Same rule as the table row: an admin, or
                      whoever raised it while nothing has started. */}
                  <span className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/solutioning/${picked.id}${room === "requests" ? "" : `?tab=${room}`}`}
                      title="Open the full request"
                      aria-label={`Open ${picked.ref} in full`}
                      className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                    >
                      <ArrowUpRight size={15} strokeWidth={2.2} />
                    </Link>
                    {(meRole === "admin" || picked.status === "initiated") && (
                      <button
                        type="button"
                        title={`Delete ${picked.ref}`}
                        aria-label={`Delete ${picked.ref}`}
                        onClick={() =>
                          setConfirmDelete({ id: picked.id, ref: picked.ref })
                        }
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-error/70 transition-colors hover:bg-red-50 hover:text-error"
                      >
                        <Trash2 size={15} strokeWidth={2.2} />
                      </button>
                    )}
                  </span>
                </div>
                <RequestPanel r={picked} room={room} />
              </>
            ) : (
              <p className="px-2 py-10 text-center text-[12.5px] text-text-secondary">
                Pick a request on the left.
              </p>
            )}
          </div>
        </div>
      ) : (
        <Card key="table" className="tab-panel p-0 overflow-hidden">
          <PinnableTable id="solutioning-requests">
            <table className="w-full min-w-[1100px] table-fixed border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border-light text-left text-[12.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary [&>th]:whitespace-nowrap">
                  {/* THE ROOM'S OWN WORD (Suren, Aug 26: "I don't need to see
                      the request in submissions. Submissions are submission
                      presentations"). The column said "Request" in every room,
                      so a list of submissions read as a list of requests. */}
                  <th className="w-[24%] px-4 py-2.5">
                    {ROOM_META[room].rowNoun}
                  </th>
                  <th className="w-[14%] px-4 py-2.5">Customer</th>
                  <th className="w-[16%] px-4 py-2.5">Against</th>
                  <th className="w-[14%] px-4 py-2.5">
                    {room === "requests" ? "Requested by" : "Raised by"}
                  </th>
                  <th className="w-[10%] px-4 py-2.5">Needed by</th>
                  <th className="w-[12%] px-4 py-2.5">Owner</th>
                  <th className="w-[10%] px-4 py-2.5">Status</th>
                  {/* AN ACTIONS COLUMN, NAMED AND LEFT-ALIGNED (Anir, Aug 31:
                      "you need an actions column at the end... and make sure
                      it's aligned properly since you always fuck that up").

                      It was an unlabelled 44px sliver, so the two controls in
                      it read as icons floating off the end of Status rather
                      than as a column with a job. Header and cells both start
                      at the left edge, which is the standing rule for this
                      column everywhere in the app. */}
                  <th className="w-[110px] px-4 py-2.5 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <RequestRow
                    key={r.id}
                    request={r}
                    fulfiller={fulfiller}
                    hideKindLabel={oneKind}
                    room={room}
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
                    /* THE SAME RULE THE ROUTE APPLIES: an admin, or the person
                       who raised it while nothing has started. Anyone else has
                       Cancel on the record instead — cancelling keeps the
                       history, deleting does not. */
                    onDelete={
                      meRole === "admin" || r.status === "initiated"
                        ? () => setConfirmDelete({ id: r.id, ref: r.ref })
                        : undefined
                    }
                  />
                ))}
              </tbody>
            </table>
          </PinnableTable>
        </Card>
      )}

      {/* The "People on these requests" roster card lived here until Anir
          removed it (Aug 27: "remove this... remove this too") — the person
          rollups still exist on each person's own profile page. */}
      </SolutioningTabs>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete)
            void post({ op: "delete", requestId: confirmDelete.id }, confirmDelete.id);
          setConfirmDelete(null);
        }}
        title={`Delete ${confirmDelete?.ref}?`}
        body={
          <>
            This removes <b>{confirmDelete?.ref}</b> and its documents for
            everyone. If the work simply stopped, cancel it instead — a
            cancelled record stays in history.
          </>
        }
        confirmLabel="Delete it"
      />
      {creating && (
        <NewRequestDialog
          room={room}
          onClose={() => {
            setCreating(false);
            if (search.get("new") === "1") router.replace("/solutioning");
          }}
          customers={customers}
          opportunities={opportunities}
          members={members}
          prefillCustomerId={search.get("customer")}
          prefillOpportunityId={search.get("opportunity")}
          prefillCompany={search.get("company")}
          prefillLead={search.get("lead")}
          onCreate={async (input) => {
            /* The room decides WHAT gets made: a request in Requests, the work
               itself in the other two. */
            const data = await post(
              {
                op: "create",
                type:
                  room === "submissions"
                    ? "submission"
                    : room === "presentations"
                      ? "presentation"
                      : "request",
                ...input,
              },
              "create"
            );
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
  fulfiller,
  busy,
  open,
  onToggle,
  onPickUp,
  onDelete,
  hideKindLabel = false,
  room,
}: {
  request: SolutionRequest;
  fulfiller: boolean;
  /** The room this row is being read in — it travels with the record link so
   *  the sidebar can keep the right sub-item lit on the detail page. */
  room: "requests" | "submissions" | "presentations";
  /** Every row in view is the same kind, so the header already said it. */
  hideKindLabel?: boolean;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onPickUp: () => void;
  /** Absent when this person may not delete this row — see the note above. */
  onDelete?: () => void;
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
      aria-expanded={open}
      /* THE RAIL RUNS THE WHOLE WAY (Anir, Aug 25: "the blue thing has to
         extend all the way"). The deal table lights the OPEN row itself — same
         tint, same 3px rail — so the row and the panel under it read as one
         block instead of a panel floating below an untouched row. */
      className={cn(
        "group cursor-pointer align-middle transition-colors",
        /* NO RULE ACROSS AN OPEN ROW (Anir, Aug 26: "there's a line... on the
           left side, there's a line separation for that blue line I was
           talking about"). The row's own border-b painted a 1px line straight
           through the 3px rail, so the rail arrived at the panel in two
           pieces. While the row is open the panel below IS the rest of the
           block, and its card already separates it from the next row. */
        open
          ? "bg-surface [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
          : "border-b border-border-light last:border-0 hover:bg-[var(--surface)]"
      )}
    >
      <td className="px-4 py-3.5">
        {/* THE LINK IS THE WORDS, NOT THE CELL (Anir, Aug 27: "when I click
            on the actual thing, it can open up the page. Otherwise, when I
            just click anywhere else, it should open the dropdown").

            It was `block`, which stretches a link across the whole REQUEST
            column — so the empty space beside a short title navigated away
            when he meant to fold the row open. inline-block w-fit gives the
            link exactly the width of its own two lines and hands every pixel
            beside them back to the row's toggle. */}
        <Link
          href={`/solutioning/${r.id}${room === "requests" ? "" : `?tab=${room}`}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-block w-fit max-w-full min-w-0 rounded-lg -m-1.5 p-1.5 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <span className="whitespace-nowrap text-[11px] font-bold text-text-tertiary tnum">
              {r.ref}
            </span>
            <KindChip kind={r.kind} size="sm" iconOnly={hideKindLabel} />
            {r.subtype && (
              <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                {r.subtype}
              </span>
            )}
          </span>
          {/* NO HOVER ARROW BESIDE THE TITLE (Anir, Aug 26: "there's an arrow
              here that feels like a screenshot, I don't want that, it looks
              weird"). It floated mid-sentence next to a wrapped title and read
              as a stray glyph. The whole row is already a link and the title
              already turns blue, which is the affordance. */}
          <span className="mt-1 block break-words text-[13.5px] font-semibold text-text-primary group-hover:text-blue-primary">
            {r.title}
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
        ) : fulfiller && r.status !== "completed" ? (
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
      <td className="px-4 py-3.5">
        <span className="flex items-center justify-start gap-0.5">
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
        {/* OPEN THE WHOLE REQUEST, ON THE ROW. Beside the chevron, because
            these are the two things you can do to a request from a list: look
            at it here, or go to it. */}
        <Link
          href={`/solutioning/${r.id}${room === "requests" ? "" : `?tab=${room}`}`}
          title="Open the full request"
          aria-label={`Open ${r.ref} in full`}
          onClick={(e) => e.stopPropagation()}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
        >
          <ArrowUpRight size={15} strokeWidth={2.2} />
        </Link>
        {/* RED, AND IT ASKS FIRST — the standing rule for every delete in the
            app. Only drawn for the people the route would actually let
            through, so it is never a button whose only output is an error. */}
        {onDelete && (
          <button
            type="button"
            disabled={busy}
            title={`Delete ${r.ref}`}
            aria-label={`Delete ${r.ref}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-error/70 transition-colors hover:bg-red-50 hover:text-error"
          >
            <Trash2 size={15} strokeWidth={2.2} />
          </button>
        )}
        </span>
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
            <RequestPanel r={r} room={room} />
          </div>
        </td>
      </tr>
    )}
    </>
  );
}


/**
 * EVERYTHING ABOUT ONE REQUEST, IN A PANEL.
 *
 * Extracted so the row's fold and the split view's right pane are the same
 * thing rather than two drawings of it (Anir, Aug 30: "you probably want to
 * have the table and the split view too on all the solutioning ones").
 */
function RequestPanel({
  r,
  room,
}: {
  r: SolutionRequest;
  room: "requests" | "submissions" | "presentations";
  /**
   * RENDER THE FORM WITHOUT ITS OWN FRAME.
   *
   * Anir, Aug 31: "You can't open up a new pop-up... when I click Add to
   * Submissions, it should keep the same exact pop-up. That size of the pop-up
   * stays the same."
   *
   * Opened from Solutioning this IS the dialog. Opened from inside the deal's
   * Edit screen it is a PAGE of that dialog, so it must not bring a second
   * frame — one modal, one size, one close button.
   */
  chromeless?: boolean;
  onBack?: () => void;
}) {
  return (
    <div className="relative grid grid-cols-1 gap-x-10 gap-y-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_300px]">
      {/* NO ARROW IN HERE. It used to hang off this panel's top-right
          corner, which in a table row lands beside "Latest activity" and reads
          as if it opens the activity list (Anir, Aug 30: "you keep putting the
          arrow in the wrong spot, not on activities, should be on the ROW").
          The row owns it now, next to the chevron that opens this panel — the
          two controls that act on the request sit together. */}
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

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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

              {/* THE FACTS STACK ON THE LEFT, THE STORY OWNS THE RIGHT
                  (Anir, Aug 27: "if there's like a million steps, how is this
                  gonna look good?... activities should take up the entire
                  right side, where you see that vertical line. Move the
                  against and the documents to the left"). Against and
                  Documents sit under the request's own words; the activity
                  timeline gets the ruled-off rail full-height, scrolling on
                  its own when the story gets long. */}
              <div className="min-w-0 sm:border-l sm:border-border-light sm:pl-6">
                {/* THE HEADING SCROLLS WITH ITS LIST (Anir, Aug 28: "also the
                    'latest activity' I don't want it to be sticky"). It sat
                    OUTSIDE the scrolling box, so it held still while the
                    events moved under it — sticky in effect even without the
                    class. Inside the box it behaves like a heading again. */}
                <div className="max-h-[320px] overflow-y-auto pr-1">
                  <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                    Latest activity
                  </span>
                  <div className="mt-2">
                  {/* A TIMELINE, WITH ITS CLOCK (Anir, Aug 27: "I need
                      times and date and also I need latest activity like a
                      timeline"). Three bare avatar lines said what happened
                      but not when, and nothing connected them. Same marks
                      and spine as the request page's own timeline —
                      timelineMark is shared, not copied — with the date AND
                      the time on every entry. */}
                  <ul className="mt-2">
                    {r.activity.length === 0 ? (
                      <li className="text-[12.5px] text-text-tertiary">
                        Nothing has happened on this yet.
                      </li>
                    ) : (
                      /* Every step, newest first — the rail scrolls, so a
                         million-step story stays a rail, not a wall. */
                      [...r.activity]
                        .reverse()
                        .map((a, i, arr) => {
                          const mark = timelineMark(a.what);
                          const MarkIcon = mark.icon;
                          return (
                            <li
                              key={`${a.at}-${i}`}
                              className={cn(
                                "relative pl-8",
                                i < arr.length - 1 && "pb-3"
                              )}
                            >
                              {i < arr.length - 1 && (
                                <span
                                  aria-hidden="true"
                                  className="absolute bottom-0 left-[10px] top-[24px] w-[2px] bg-border-light"
                                />
                              )}
                              <span
                                aria-hidden="true"
                                className="absolute left-0 top-0 flex h-[22px] w-[22px] items-center justify-center rounded-full"
                                style={{ background: `${mark.color}1A`, color: mark.color }}
                              >
                                <MarkIcon size={11} strokeWidth={2.4} />
                              </span>
                              <p className="text-[12.5px] leading-[22px] text-text-primary">
                                {a.what}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-text-tertiary">
                                <Avatar
                                  name={a.by}
                                  className="h-[14px] w-[14px] shrink-0 text-[6px]"
                                />
                                <span className="min-w-0 truncate">{a.by}</span>
                                <span className="whitespace-nowrap tnum">
                                  · {formatDate(a.at)} ·{" "}
                                  {new Date(a.at).toLocaleTimeString([], {
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </p>
                            </li>
                          );
                        })
                    )}
                  </ul>
                  </div>
                </div>
              </div>
    </div>
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

/**
 * WHAT KIND OF FILE THIS IS, AT A GLANCE.
 *
 * Suren, Aug 31: "An RFP template is nothing but a list of questions. That
 * could be a Word document, a PDF, Excel, PowerPoint. It could be anything."
 * Four formats landing on one request is the normal case here, not the edge
 * one, so each carries its own colour and its own icon rather than four
 * identical rows somebody has to read filenames to tell apart.
 */
const DOC_KINDS: { match: RegExp; color: string; icon: LucideIcon }[] = [
  { match: /\.pdf$/i, color: "#C4342B", icon: FileText },
  { match: /\.(docx?|rtf|txt)$/i, color: "#2B579A", icon: FileText },
  { match: /\.(xlsx?|csv)$/i, color: "#1D6F42", icon: FileSpreadsheet },
  { match: /\.(pptx?|key)$/i, color: "#D24726", icon: Presentation },
];

function docKind(name: string): { color: string; icon: LucideIcon } {
  /* Blue, not grey, for anything else: grey reads as disabled, and a zip he
     just attached is not disabled. */
  return (
    DOC_KINDS.find((k) => k.match.test(name)) ?? {
      color: "#0071E3",
      icon: File,
    }
  );
}

/** What the picker will take, said in the file dialog itself so the OS greys
 *  out anything that would only fail on the way up. */
const DOC_ACCEPT =
  ".pdf,.doc,.docx,.rtf,.txt,.xls,.xlsx,.csv,.ppt,.pptx,.key,.zip";

/** A file the requester has picked, on its way up or already there. */
type StagedDoc = {
  /** Local only: the React key, and the handle for taking a row back off. */
  key: string;
  name: string;
  size: number;
  status: "uploading" | "done" | "error";
  docsPath?: string;
  fileName?: string;
  error?: string;
};

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Exported so the Leads page can raise a request IN PLACE (Anir, Aug 27:
 *  "it takes me to another place... just leave me there and just give me
 *  the pop-up"). */
export function NewRequestDialog({
  onClose,
  onCreate,
  customers,
  opportunities,
  members,
  prefillCustomerId,
  prefillOpportunityId,
  prefillCompany,
  prefillLead,
  room,
  chromeless = false,
  onBack,
}: {
  onClose: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<boolean>;
  customers: CustomerOption[];
  opportunities: OpportunityOption[];
  members: string[];
  prefillCustomerId: string | null;
  prefillOpportunityId: string | null;
  /** A company NAME, from a lead that may have no account yet. */
  prefillCompany: string | null;
  /** LEAD-0001, so the request records where it came from. */
  prefillLead: string | null;
  /** Which room opened this. In Submissions and Presentations the dialog
   *  makes THE WORK ITSELF, in the room's own words — no kind chooser and
   *  no "request" language (Suren, Aug 27: "I'm creating a new submission.
   *  Why are you saying 'request a submission'?"). */
  room: "requests" | "submissions" | "presentations";
  /**
   * RENDER WITHOUT ITS OWN FRAME (Anir, Aug 31: "You can't open up a new
   * pop-up... it should keep the same exact pop-up. That size of the pop-up
   * stays the same"). On its own this IS the dialog; inside the deal's Edit
   * screen it is a page of that one.
   */
  chromeless?: boolean;
  onBack?: () => void;
}) {
  const directKind: SolutioningKind | null =
    room === "submissions"
      ? "submission"
      : room === "presentations"
        ? "presentation"
        : null;
  const [kind, setKind] = useState<SolutioningKind | null>(directKind);
  const [title, setTitle] = useState("");
  const [subtype, setSubtype] = useState("RFP");
  const [presType, setPresType] = useState("");
  /**
   * ARRIVING FROM A LEAD (Suren, Aug 25: a request can be raised "at the
   * customer level, or at the lead level, or at the opportunity level").
   *
   * A lead usually has no account yet — that is what makes it a lead — so the
   * company arrives as a NAME rather than an id. If an account of that name
   * already exists it is selected; if not, the picker stays empty and the lead
   * is written into the details instead of being silently dropped.
   */
  const matchedByName = prefillCompany
    ? (customers.find(
        (c) => c.name.trim().toLowerCase() === prefillCompany.trim().toLowerCase()
      )?.id ?? "")
    : "";
  const [customerId, setCustomerId] = useState(
    prefillCustomerId ?? matchedByName
  );
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
  const [details, setDetails] = useState(
    prefillLead
      ? `From lead ${prefillLead}${prefillCompany ? ` · ${prefillCompany}` : ""}.`
      : ""
  );
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState<StagedDoc[]>([]);
  const [dragging, setDragging] = useState(false);

  /**
   * MAKING THE MISSING THING WITHOUT LEAVING THE FORM.
   *
   * Anir, Sep 1: "I don't even want to change anything. I don't want to leave
   * this page at all. I literally want to create the opportunity within this
   * popup... same-size popup... and then the second I press Create Contact —
   * or even if I just go back — I'll be on the same exact screen with all my
   * data saved."
   *
   * So this is a second PAGE of this dialog, not a second dialog and not a
   * navigation. Everything typed so far lives in the state above, and that
   * state belongs to THIS component — which keeps rendering the whole time.
   * Swapping what is drawn inside it cannot touch it, so Back is free and
   * Create returns you to a form that never emptied.
   */
  const [sub, setSub] = useState<null | "opportunity" | "contact">(null);
  /* Made here, so it can be picked here — the fresh record is merged into the
     list the picker reads rather than waiting for the page to refetch. */
  const [newOpps, setNewOpps] = useState<OpportunityOption[]>([]);
  const [subName, setSubName] = useState("");
  const [subExtra, setSubExtra] = useState("");
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  const customer = customers.find((c) => c.id === customerId) ?? null;

  /**
   * THE FILE GOES UP WHILE HE IS STILL TYPING.
   *
   * Uploading on pick rather than on submit means a 40MB RFP is already in
   * storage by the time he reaches the Create button, and a file that will not
   * upload says so while there is still something to be done about it — rather
   * than failing at the end, on the click that was supposed to be the easy one.
   *
   * Nothing is attached to anything yet: these come back as draft paths, and
   * the create call points the new request at them. Close the dialog instead
   * and they are simply never referenced.
   */
  async function stageFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    for (const file of picked) {
      const key = `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`;
      setDocs((cur) => [
        ...cur,
        { key, name: file.name, size: file.size, status: "uploading" },
      ]);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/solutioning/upload?draft=1", {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.docsPath)
          throw new Error(data?.error || "That file did not upload.");
        setDocs((cur) =>
          cur.map((d) =>
            d.key === key
              ? {
                  ...d,
                  status: "done",
                  docsPath: data.docsPath as string,
                  fileName: (data.fileName as string) ?? d.name,
                }
              : d
          )
        );
      } catch (e) {
        setDocs((cur) =>
          cur.map((d) =>
            d.key === key
              ? {
                  ...d,
                  status: "error",
                  error:
                    e instanceof Error ? e.message : "That file did not upload.",
                }
              : d
          )
        );
      }
    }
  }

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

  const customerOpps = [...opportunities, ...newOpps].filter(
    (o) =>
      (o.customerId && o.customerId === customerId) ||
      (customer && o.customer === customer.name)
  );

  /** Create the opportunity or the contact, select it, and come straight back. */
  async function createSub() {
    if (!subName.trim() || !customer) return;
    setSubBusy(true);
    setSubError(null);
    try {
      if (sub === "opportunity") {
        const res = await fetch("/api/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            op: "add",
            name: subName.trim(),
            customer: customer.name,
            ...(customerId ? { customerId } : {}),
            ...(subExtra.trim()
              ? { value: Number(subExtra.replace(/[^0-9.]/g, "")) || 0 }
              : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.opportunity) {
          setSubError(data?.error || "That did not save.");
          setSubBusy(false);
          return;
        }
        const made = data.opportunity as { id: string; name?: string };
        setNewOpps((cur) => [
          ...cur,
          {
            id: made.id,
            label: made.name || subName.trim(),
            customer: customer.name,
            customerId: customerId || null,
          },
        ]);
        setOppIds((cur) => [...cur, made.id]);
      } else {
        const res = await fetch(
          `/api/customers/${encodeURIComponent(customerId)}/contacts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              full_name: subName.trim(),
              ...(subExtra.trim() ? { job_title: subExtra.trim() } : {}),
            }),
          }
        );
        const data = await res.json().catch(() => ({}));
        const made = data?.contact ?? data;
        if (!res.ok || !made?.id) {
          setSubError(data?.error || "That did not save.");
          setSubBusy(false);
          return;
        }
        setContacts((cur) => [
          ...cur,
          {
            id: made.id,
            name: made.full_name || subName.trim(),
            title: made.job_title ?? subExtra.trim() ?? null,
          },
        ]);
        setContactIds((cur) => [...cur, made.id]);
      }
      setSubBusy(false);
      setSubName("");
      setSubExtra("");
      setSub(null);
    } catch {
      setSubError("That did not save.");
      setSubBusy(false);
    }
  }

  /* A file still on its way up has no path yet, so creating now would drop it.
     Wait the two seconds rather than lose the document he just chose. */
  const uploading = docs.some((d) => d.status === "uploading");

  const canSave =
    !!kind && title.trim().length > 0 && !!customer && !uploading;

  return (
    <FrameOrNot
      chromeless={chromeless}
      onClose={onClose}
      title={
        directKind
          ? `New ${KIND_META[directKind].label.toLowerCase()}`
          : kind
            ? `Request a ${KIND_META[kind].label.toLowerCase()}`
            : "What do you need?"
      }
      onBack={onBack}
    >
      {/* ONE SIZE THE WHOLE WAY THROUGH (Anir, Aug 25: "when I click on
          Solutioning New Request, I don't know why this is so small. Keep the
          pop-up consistent the whole way in terms of dimensions"). Step one is
          three tiles and step two is a full form, so the dialog used to snap
          from a strip to a page between two clicks.

          THE FIX FOR THAT WAS WORSE THAN THE PROBLEM (Anir, Aug 26: "this is
          ugly, I think it should be at the top or something"). Holding a 460px
          floor and centring three tiles in it bought a consistent height by
          floating the cards in a field of white.

          So the floor came down to a guard against a thin strip, the tiles sit
          at the top, and step one gained the thing a first-time requester
          actually needs: what happens to the request after they send it. Step
          one is now ~410px against step two's ~520 — the dialog grows a little
          as you go deeper, which is what a dialog is supposed to do, and it no
          longer snaps from a strip to a page. */}
      <div className="flex min-h-[380px] flex-col">
      {sub ? (
        /* A PAGE OF THIS DIALOG. Same frame, same width, a back arrow where
           the form was — and the form itself is still mounted behind this,
           holding every word already typed. */
        <div className="flex flex-1 flex-col">
          <button
            type="button"
            onClick={() => {
              setSub(null);
              setSubError(null);
            }}
            className="mb-3 inline-flex w-fit cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-text-secondary transition-colors hover:text-blue-primary"
          >
            <ArrowLeft size={15} strokeWidth={2.2} />
            Back to the request
          </button>
          <p className="mb-1 text-[14px] font-semibold text-text-primary">
            {sub === "opportunity"
              ? "New opportunity"
              : "New contact"}
          </p>
          <p className="mb-4 text-[12.5px] text-text-secondary">
            For <b>{customer?.name}</b>. It is picked for you the moment it
            exists, and nothing you have typed is lost.
          </p>
          <label className="block">
            <span className="text-[12px] font-semibold text-text-primary">
              {sub === "opportunity" ? "What is the deal called?" : "Their name"}
            </span>
            <input
              autoFocus
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              placeholder={
                sub === "opportunity"
                  ? `e.g. GRI — ${customer?.name ?? ""}`
                  : "First and last name"
              }
              className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
            />
          </label>
          <label className="mt-3 block">
            <span className="text-[12px] font-semibold text-text-primary">
              {sub === "opportunity" ? "Value" : "Job title"}
              <span className="ml-1.5 font-normal text-text-secondary">
                optional
              </span>
            </span>
            <input
              value={subExtra}
              onChange={(e) => setSubExtra(e.target.value)}
              placeholder={
                sub === "opportunity" ? "What it is worth" : "What they do there"
              }
              className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
            />
          </label>
          <div className="mt-auto flex items-center justify-between gap-3 pt-5">
            <span className="min-w-0 text-[12.5px] text-error">{subError}</span>
            <button
              type="button"
              disabled={!subName.trim() || subBusy}
              onClick={createSub}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} strokeWidth={2.4} />
              {subBusy
                ? "Creating…"
                : sub === "opportunity"
                  ? "Create the opportunity"
                  : "Create the contact"}
            </button>
          </div>
        </div>
      ) : !kind ? (
        /* THE FIRST QUESTION IS THE ONLY QUESTION ON SCREEN. Three big tiles,
           because the kind decides every field that follows. */
        <div className="flex flex-1 flex-col">
        {/* SAY THAT A CHOICE IS REQUIRED (Anir, Aug 26: "here it's kind of not
            clear, but the user needs to select one"). Three cards with a quiet
            hover read as decoration; nothing said one of them had to be
            picked before anything else happened. */}
        <p className="mb-3 text-[13px] font-semibold text-text-primary">
          Choose one to continue.
          <span className="ml-1.5 font-normal text-text-secondary">
            What you pick decides every field you fill in next.
          </span>
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {KIND_ORDER.map((k) => {
            const meta = KIND_META[k];
            const Icon = meta.icon;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className="group flex cursor-pointer flex-col items-start gap-2.5 rounded-xl border-2 border-border-light bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-blue-primary hover:shadow-card focus-visible:border-blue-primary focus-visible:outline-none"
              >
                <span className="flex w-full items-start justify-between gap-2">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-lg"
                    style={{ background: `${meta.color}14`, color: meta.color }}
                  >
                    <Icon size={19} strokeWidth={1.9} />
                  </span>
                  {/* A RADIO, because "pick exactly one of these" is what a
                      radio has always meant. Empty until you hover it, filled
                      the moment you do, so the card says out loud that it is a
                      choice rather than a panel. */}
                  <span
                    aria-hidden="true"
                    className="mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 border-border-light transition-colors group-hover:border-blue-primary"
                  >
                    <span className="h-2 w-2 rounded-full bg-blue-primary opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
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
                {/* And the outcome of clicking, spelled out. */}
                <span className="mt-auto flex items-center gap-1 pt-1.5 text-[11.5px] font-semibold text-text-tertiary transition-colors group-hover:text-blue-primary">
                  Choose this
                  <ChevronRight size={12} strokeWidth={2.4} />
                </span>
              </button>
            );
          })}
        </div>

        {/* AND THE REST OF THE BOX EARNS ITS KEEP. Holding a 460px floor so the
            dialog does not snap between steps left three cards sitting above a
            field of white (Anir, Aug 26: "this is ugly"). Rather than choose
            between a snapping dialog and a half-empty one, the space explains
            the flow the request is about to enter — which is the one thing
            somebody opening this for the first time does not know. */}
        <div className="mt-6 rounded-xl border border-border-light bg-surface/50 p-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            {directKind ? "What happens after you create it" : "What happens after you send it"}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(directKind
              ? [
                  ["1", "You create it", "It starts as yours: you own the work from the first minute."],
                  ["2", "You build it", "Customer documents, analysis, working drafts and the final deliverables all live on it."],
                  ["3", "You complete it", "Marking it completed finishes the work, and closes its request if it came from one."],
                ]
              : [
                  ["1", "You raise it", "Say what you need and who it is for. It lands in the Solutioning team's queue straight away."],
                  ["2", "Solutions takes it up", "Whoever takes it owns it, and builds the documents against your request."],
                  ["3", "You close it", "The requester decides when it is done, not the person who built it."],
                ]
            ).map(([n, head, body]) => (
              <div key={n} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-light text-[11px] font-bold text-blue-primary">
                  {n}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-text-primary">
                    {head}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-text-secondary">
                    {body}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
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
                {/* A DATE, NOT A TIMESTAMP (Anir, Aug 26: "remove this, I
                    don't know why you added this time here"). datetime-local
                    made the browser draw an hour, minute and AM/PM column
                    beside the calendar, and nothing downstream needed a time:
                    the request is raised days ahead and the hour gets settled
                    in the invite, not here. */}
                <input
                  type="date"
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
                  inlineDescription
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
                    /* HOW MUCH IS BEHIND EACH ACCOUNT, BEFORE IT IS PICKED
                       (Suren, Aug 28: "if I click on a company and I want to
                       see how many deals before even clicking, so do that
                       there and everywhere else this could be helpful where
                       the next step is dependent on the first dropdown having
                       data"). The deal picker below is filtered by this one. */
                    ...customers.map((c) => {
                      const deals = opportunities.filter(
                        (o) => o.customerId === c.id || o.customer === c.name
                      ).length;
                      return {
                        value: c.id,
                        label: c.name,
                        logoName: c.name,
                        description: deals
                          ? `${deals} ${deals === 1 ? "deal" : "deals"}`
                          : "no deals",
                        descriptionAccent: deals > 0,
                      };
                    }),
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
                  /* Only once an account is chosen: an opportunity has to
                     belong to somebody. */
                  createLabel={customer ? "Create a new opportunity" : undefined}
                  onCreate={customer ? () => setSub("opportunity") : undefined}
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
                  createLabel={customer ? "Create a new contact" : undefined}
                  onCreate={customer ? () => setSub("contact") : undefined}
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
              What does the Solutioning team need to know?
            </span>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              placeholder="Scope, context, links — whatever helps them start."
              className="mt-1.5 w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
            />
          </label>

          {/* THE DOCUMENTS THAT COME WITH IT.
              
              Suren, Aug 31: "If someone is putting a request, I am putting a
              request for, let's say, an RFP. If they upload, where will that
              RFP be saved?" — and then, plainly: "I should have the option to
              upload documents related to this request."

              It used to have no answer here. The request was created empty and
              the file had to be added afterwards from the detail page, which
              meant the one document the whole request is ABOUT arrived last.
              Now it goes on at the same moment as the title, and lands on the
              record as a Customer document. */}
          <div>
            <span className="text-[12px] font-semibold text-text-primary">
              Documents
              <span className="ml-1.5 font-normal text-text-secondary">
                The RFP, the questionnaire, whatever they sent you.
              </span>
            </span>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void stageFiles(e.dataTransfer.files);
              }}
              className={cn(
                "mt-1.5 rounded-lg border border-dashed transition-colors",
                dragging
                  ? "border-blue-primary bg-blue-light/50"
                  : "border-border-light bg-surface/40"
              )}
            >
              <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
                  <UploadCloud size={16} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold text-text-primary">
                    Choose files, or drop them here
                  </span>
                  {/* His four formats, named. "It could be anything" is true of
                      the storage, but a requester still wants to know before
                      he drags. */}
                  <span className="block text-[11.5px] text-text-secondary">
                    Word, PDF, Excel, PowerPoint — as many as you need.
                  </span>
                </span>
                <input
                  type="file"
                  multiple
                  accept={DOC_ACCEPT}
                  className="sr-only"
                  onChange={(e) => {
                    void stageFiles(e.target.files);
                    /* Clear it, or picking the same file twice in a row does
                       nothing at all. */
                    e.target.value = "";
                  }}
                />
              </label>

              {docs.length > 0 && (
                /* A FIXED SHELF THAT FILLS UP, rather than one that grows. A
                   list that stretches the dialog with every file walks the
                   Create button down the screen under his cursor. */
                <div className="max-h-[126px] overflow-y-auto border-t border-border-light/70 px-2 py-1">
                  {docs.map((d) => {
                    const meta = docKind(d.name);
                    const Icon = meta.icon;
                    return (
                      <div
                        key={d.key}
                        className="flex items-center gap-2.5 px-1.5 py-1.5"
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                          style={{
                            background: `${meta.color}14`,
                            color: meta.color,
                          }}
                        >
                          <Icon size={13} strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium text-text-primary">
                            {d.name}
                          </span>
                          <span
                            className={cn(
                              "block text-[11px]",
                              d.status === "error"
                                ? "text-error"
                                : "text-text-tertiary"
                            )}
                          >
                            {d.status === "error"
                              ? d.error
                              : d.status === "uploading"
                                ? "Uploading…"
                                : fileSize(d.size)}
                          </span>
                        </span>
                        {d.status === "uploading" && (
                          <Loader2
                            size={14}
                            aria-label="Uploading"
                            className="shrink-0 animate-spin text-blue-primary"
                          />
                        )}
                        {d.status === "done" && (
                          <Check
                            size={14}
                            strokeWidth={2.6}
                            aria-label="Uploaded"
                            className="shrink-0 text-success"
                          />
                        )}
                        {/* Acts directly, and only ever on a file that is not
                            attached to anything yet: there is no record to
                            confirm against until he presses Create. */}
                        <button
                          type="button"
                          aria-label={`Remove ${d.name}`}
                          onClick={() =>
                            setDocs((cur) => cur.filter((x) => x.key !== d.key))
                          }
                          className="shrink-0 cursor-pointer rounded p-1 text-error/70 transition-colors hover:bg-red-50 hover:text-error"
                        >
                          <Trash2 size={13} strokeWidth={2} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

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
                  /* Only the ones that actually landed. A row that failed is
                     still on screen saying so, and carrying it here would put
                     a document on the request with nothing behind it. */
                  documents: docs
                    .filter((d) => d.status === "done" && d.docsPath)
                    .map((d) => ({
                      name: d.name,
                      docsPath: d.docsPath,
                      fileName: d.fileName ?? d.name,
                    })),
                });
                if (!ok) setSaving(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} strokeWidth={2.4} />
              {uploading
                ? "Uploading…"
                : saving
                ? "Creating…"
                : directKind
                  ? `Create the ${KIND_META[directKind].label.toLowerCase()}`
                  : "Create the request"}
            </button>
          </div>
        </div>
      )}
      </div>
    </FrameOrNot>
  );
}

/**
 * THE SAME CONTENT, WITH OR WITHOUT A DIALOG AROUND IT.
 *
 * A form that only knows how to be a modal can only ever be opened as one. On
 * its own this is the dialog; inside another dialog it is a page of it, and a
 * page must not drag a second frame and a second close button along with it.
 */
function FrameOrNot({
  chromeless,
  onClose,
  title,
  onBack,
  children,
}: {
  chromeless: boolean;
  onClose: () => void;
  title: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  if (!chromeless)
    return (
      <Modal open onClose={onClose} title={title} size="workflow">
        {children}
      </Modal>
    );
  return (
    <div>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex w-fit cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-text-secondary transition-colors hover:text-blue-primary"
        >
          <ArrowLeft size={15} strokeWidth={2.2} />
          Back
        </button>
      )}
      {children}
    </div>
  );
}

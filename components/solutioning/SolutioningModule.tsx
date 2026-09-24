"use client";

import { uploadWithProgress } from "@/lib/uploadWithProgress";
import { UploadProgress } from "@/components/ui/UploadProgress";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withCommas } from "@/lib/currency";
import { expandMoneyShorthand } from "@/lib/moneyShorthand";
import { ViewSelect } from "@/components/ui/ViewSelect";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { addMockModePrefix, isMockModePath } from "@/lib/modeUrl";
import {
  AlarmClock,
  ArrowLeft,
  ArrowUpRight,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleDashed,
  CircleDot,
  ClipboardList,
  File,
  FileSpreadsheet,
  FileText,
  Inbox,
  Loader2,
  ListChecks,
  PanelsTopLeft,
  Plus,
  Presentation,
  Rows3,
  Send,
  Timer,
  Trash2,
  UploadCloud,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SolutioningTabs } from "@/components/solutioning/SolutioningTabs";
import { StatTile } from "@/components/ui/StatTile";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { ColorSelect, MultiColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { PinnableTable } from "@/components/ui/PinnableTable";
import { Avatar } from "@/components/ui/Avatar";
import { DocumentPeek } from "@/components/ui/DocumentPeek";
import { MaterialPeek } from "@/components/offerings/MaterialPeek";
import { timelineMark } from "@/components/solutioning/RequestDetail";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Modal } from "@/components/ui/Modal";
import { OptionalMark } from "@/components/ui/RequiredMark";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import {cn, formatDate, todayISO} from "@/lib/utils";
import { useStoredView } from "@/lib/useStoredView";
import { stampedAt } from "@/lib/performanceShared";
import {
  SUBMISSION_TYPES,
  type SolutioningKind,
  type SolutionDoc,
  type SolutioningState,
  type SolutionRequest,
  chronologicalActivity,
} from "@/lib/solutioning";
import { KIND_META, KindChip, STATUS_META, StatusPill } from "./bits";
import { tint } from "@/lib/tint";
import { DateText } from "@/components/ui/DateText";
import { repSlug } from "@/lib/team";
import { companyDestination } from "@/lib/companyDestination";
import { formatFromFilename, type OfferingMaterial } from "@/lib/offeringMaterials";

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
const REQUEST_ROW_BATCH = 80;

const SOLUTION_STATUS_DISPLAY: Record<
  string,
  { color: string; icon: LucideIcon }
> = {
  ...Object.fromEntries(
    Object.values(STATUS_META).map(({ label, color, icon }) => [label, { color, icon }])
  ),
  Delayed: { color: "var(--ink-orange)", icon: AlarmClock },
  Drafted: { color: "var(--ink-violet)", icon: FileText },
  "Submitted to BD": { color: "var(--ink-teal-deep)", icon: Send },
  "Submitted to customer": { color: "var(--ink-green)", icon: Send },
};

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
    title: "All solutioning requests",
    subtitle:
      "What sales has asked the Solutioning team for: a submission, a presentation or a meeting.",
    empty: "No solutioning requests yet.",
    newLabel: "New solutioning request",
    noun: "solutioning requests",
    rowNoun: "Solutioning request",
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
  meName,
  limitToOwn,
  members,
  customers,
  opportunities,
  canCreate,
  canAssign,
}: {
  state: SolutioningState;
  /**
   * WHICH ROOM (Anir, Aug 26: "under solutioning the three things, like
   * goals"). Requests is everything people asked for; the other two narrow to
   * the work of that kind.
   */
  room?: "requests" | "submissions" | "presentations";
  meRole: string;
  meName: string;
  /** Solutioning members receive work; their queue contains only their work. */
  limitToOwn: boolean;
  /**
   * MAY THEY RAISE ONE (Suren, Aug 29: "owner can create, member can edit").
   * Both of these buttons rendered for anybody who could open the room, and
   * the server accepted, so a member could start requests the map gives them
   * no create on.
   */
  canCreate: boolean;
  canAssign: boolean;
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
  /* PICKING UP WORK IS A COMMITMENT, SO IT ASKS (Anir, Sep 6: "I just pressed
     'Pick it up' on accident. I didn't know it wouldn't ask me for any
     confirmation. That's a problem"). It writes your name onto somebody
     else's request as the person doing it, and the row it sits in is a click
     target itself — an easy button to catch on the way past. Not destructive,
     so it is the ordinary dialog rather than the red one. */
  const [confirmPickUp, setConfirmPickUp] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const search = useSearchParams();
  const [state, setState] = useState(initial);
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [assignment, setAssignment] = useState<"all" | "assigned" | "unassigned">("all");
  const [customerPick, setCustomerPick] = useState<string[]>([]);
  const [requestedByPick, setRequestedByPick] = useState<string[]>([]);
  const [assigneePick, setAssigneePick] = useState<string[]>([]);
  const [opportunityPick, setOpportunityPick] = useState<string[]>([]);
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [groupBy, setGroupBy] = useState("none");
  const [shutGroups, setShutGroups] = useState<string[]>([]);
  const groupLabel = useCallback(
    (r: SolutionRequest) =>
      groupBy === "customer"
        ? r.customer
        : groupBy === "owner"
          ? r.owner || "Unassigned"
          : groupBy === "status"
            ? solutionStatusLabel(
                r,
                !!r.neededBy &&
                  !["completed", "cancelled"].includes(r.status) &&
                  r.neededBy < todayISO(),
              )
            : "",
    [groupBy],
  );

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
  const fulfiller = canAssign;

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
        if (limitToOwn && r.owner !== meName) return false;
        if (room === "requests") return itemType === "request";
        if (room === "submissions") return itemType === "submission";
        return itemType === "presentation";
      }),
    [state.requests, room, limitToOwn, meName]
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
      if (limitToOwn && r.owner !== meName) return false;
      if (kinds.length && !kinds.includes(r.kind)) return false;
      const delayed =
        Boolean(r.neededBy) &&
        r.status !== "completed" &&
        String(r.neededBy) < todayISO();
      if (statuses.length && !statuses.includes(solutionStatusLabel(r, delayed)))
        return false;
      if (owners.length) {
        const owner = r.owner ?? "__none";
        if (!owners.includes(owner)) return false;
      }
      if (assignment === "assigned" && !r.owner) return false;
      if (assignment === "unassigned" && r.owner) return false;
      if (customerPick.length && !customerPick.includes(r.customer)) return false;
      if (requestedByPick.length && !requestedByPick.includes(r.requestedBy)) return false;
      if (assigneePick.length && !assigneePick.includes(r.completedBy || r.owner || "")) return false;
      if (opportunityPick.length && !r.opportunityIds.some(id => opportunityPick.includes(id))) return false;
      if (dueFrom && (!r.neededBy || r.neededBy < dueFrom)) return false;
      if (dueTo && (!r.neededBy || r.neededBy > dueTo)) return false;
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
      const groupOrder = groupLabel(a).localeCompare(groupLabel(b));
      if (groupOrder) return groupOrder;
      if (sort === "needed") {
        // Deadlines first, soonest first; the undated sink to the bottom.
        const an = a.neededBy ?? "9999-12-31";
        const bn = b.neededBy ?? "9999-12-31";
        if (an !== bn) return an < bn ? -1 : 1;
      }
      return a.requestedAt < b.requestedAt ? 1 : -1;
    });
  }, [state.requests, query, kinds, statuses, owners, assignment, customerPick, sort, room, requestedByPick, assigneePick, opportunityPick, dueFrom, dueTo, groupLabel, limitToOwn, meName]);

  /* DO NOT MOUNT 443 FULL TABLE ROWS BEFORE SOMEBODY SCROLLS TO THEM.
   *
   * Each request row contains linked people, account marks, status pills and
   * controls. Mounting the whole mock workspace produced more than 15,000 DOM
   * nodes and made an ordinary trackpad gesture repaint work that was dozens of
   * screens away. Keep a generous runway, then append the next batch before the
   * reader reaches it. This preserves one continuous list and every matching
   * result while making the first and most common part of the list inexpensive. */
  const [renderLimit, setRenderLimit] = useState(REQUEST_ROW_BATCH);
  const loadMoreRef = useRef<HTMLTableRowElement>(null);
  const groupedLoadMoreRef = useRef<HTMLDivElement>(null);
  const renderedRows = useMemo(
    () => shown.slice(0, renderLimit),
    [shown, renderLimit]
  );
  const shownGroupLabels = useMemo(
    () => groupBy === "none" ? [] : [...new Set(shown.map(groupLabel))],
    [shown, groupBy, groupLabel]
  );
  const groupTotals = useMemo(() => {
    const totals = new Map<string, number>();
    if (groupBy === "none") return totals;
    shown.forEach((request) => {
      const label = groupLabel(request);
      totals.set(label, (totals.get(label) ?? 0) + 1);
    });
    return totals;
  }, [shown, groupBy, groupLabel]);
  const renderedGroups = useMemo(() => {
    const groups = new Map<string, SolutionRequest[]>();
    renderedRows.forEach((request) => {
      const label = groupLabel(request);
      const rows = groups.get(label) ?? [];
      rows.push(request);
      groups.set(label, rows);
    });
    return [...groups.entries()];
  }, [renderedRows, groupLabel]);
  const anyGroupOpen = shownGroupLabels.some((label) => !shutGroups.includes(label));

  useEffect(() => {
    setRenderLimit(REQUEST_ROW_BATCH);
  }, [shown]);

  useEffect(() => {
    setShutGroups([]);
  }, [groupBy]);

  useEffect(() => {
    const marker = groupBy === "none" ? loadMoreRef.current : groupedLoadMoreRef.current;
    if (!marker || renderLimit >= shown.length) return;
    const page = document.getElementById("main-content");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setRenderLimit((current) =>
          Math.min(current + REQUEST_ROW_BATCH, shown.length)
        );
      },
      { root: page, rootMargin: "1200px 0px", threshold: 0 }
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [renderLimit, shown.length, groupBy]);

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

  const requestTableHead = (
    <thead>
      <tr className="border-b border-border-light text-left text-[12.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary [&>th]:whitespace-nowrap">
        <th className="w-[340px] px-4 py-2.5">{ROOM_META[room].rowNoun}</th>
        <th className="w-[140px] px-4 py-2.5">Request type</th>
        <th className="w-[185px] px-4 py-2.5">Opportunity ID</th>
        <th className="w-[185px] px-4 py-2.5">Customer</th>
        <th className="w-[175px] px-4 py-2.5">BD member</th>
        <th className="w-[175px] px-4 py-2.5">Solutioning owner</th>
        <th className="w-[175px] px-4 py-2.5">Prepared by</th>
        <th className="w-[125px] px-4 py-2.5">Requested</th>
        <th className="w-[125px] px-4 py-2.5">Due</th>
        <th className="w-[125px] px-4 py-2.5">Submitted</th>
        <th className="w-[160px] px-4 py-2.5">Solution status</th>
        <th className="w-[110px] px-4 py-2.5 text-left">Actions</th>
      </tr>
    </thead>
  );

  const renderRequestRow = (request: SolutionRequest) => (
    <RequestRow
      key={request.id}
      request={request}
      fulfiller={fulfiller}
      hideKindLabel={oneKind}
      room={room}
      busy={busy === request.id}
      open={openIds.has(request.id)}
      onToggle={() =>
        setOpenIds((current) => {
          const next = new Set(current);
          if (next.has(request.id)) next.delete(request.id);
          else next.add(request.id);
          return next;
        })
      }
      onPickUp={() =>
        setConfirmPickUp({ id: request.id, label: `${request.ref} · ${request.title}` })
      }
      onDelete={
        meRole === "admin" || request.status === "initiated"
          ? () => setConfirmDelete({ id: request.id, ref: request.ref })
          : undefined
      }
    />
  );

  const groupMark = (label: string) => {
    if (groupBy === "owner") {
      return label === "Unassigned" ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-text-tertiary">
          <CircleDashed size={16} strokeWidth={2} />
        </span>
      ) : (
        <Avatar name={label} className="h-8 w-8 shrink-0 text-[10px]" />
      );
    }
    if (groupBy === "customer") {
      return <CompanyLogo name={label} className="h-8 w-8 shrink-0 text-[9px]" />;
    }
    const statusMeta = SOLUTION_STATUS_DISPLAY[label] ?? {
      color: "var(--text-tertiary)",
      icon: CircleDot,
    };
    const StatusIcon = statusMeta.icon;
    return (
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ color: statusMeta.color, background: tint(statusMeta.color, 10) }}
      >
        <StatusIcon size={15} strokeWidth={2.1} />
      </span>
    );
  };

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
          color="var(--ink-bright-blue)"
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
          color="var(--ink-teal-deep)"
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
          color="var(--ink-amber)"
          warn={!!oldestOpen && oldestOpen.days >= 14}
          sub={oldestOpen ? oldestOpen.r.ref : "nothing open"}
        />
      </div>

      <div className="mt-4">
        <PageToolbar
          singleRow
          query={query}
          onQuery={setQuery}
          /* The room's own noun, like the tiles and the count under it. */
          placeholder={`Search ${ROOM_META[room].noun}, customers, people…`}
          searchAriaLabel="Search solutioning requests"
          filterAriaLabel="Filter solutioning requests"
          onClearAll={() => {
            setQuery("");
            setKinds([]);
            setStatuses([]);
            setOwners([]);
            setAssignment("all");
            setCustomerPick([]);
            setRequestedByPick([]); setAssigneePick([]); setOpportunityPick([]);
            setDueFrom(""); setDueTo("");
            setGroupBy("none");
          }}
          filtersAfter={<>
            <ColorSelect
              value={groupBy}
              onChange={setGroupBy}
              ariaLabel="Group requests"
              options={[
                { value: "none", label: "No grouping", color: "#64748B", icon: Rows3 },
                { value: "customer", label: "By customer", color: "var(--ink-violet-soft)", icon: Building2 },
                { value: "owner", label: "By owner", color: "var(--ink-teal-deep)", icon: UserRound },
                { value: "status", label: "By status", color: "var(--ink-orange)", icon: ListChecks },
              ]}
            />
          </>}
          groups={[
            ...(room === "requests" ? [
              {key:"kind",label:"Request type",values:kinds,onChange:setKinds,options:KIND_ORDER.map(value => ({value,label:KIND_META[value].plural,color:KIND_META[value].color}))},
              {key:"assignment",label:"Assignment",values:assignment === "all" ? [] : [assignment],onChange:(values: string[]) => setAssignment((values.at(-1) as typeof assignment) ?? "all"),options:[{value:"unassigned",label:"Unassigned"},{value:"assigned",label:"Assigned"}]},
            ] : []),
            {
              key: "due",
              label: "Due date",
              values: [dueFrom, dueTo].filter(Boolean),
              onChange: (values: string[]) => {
                if (values.length === 0) { setDueFrom(""); setDueTo(""); }
              },
              options: [],
              content: (
                <div className="space-y-3">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                    From
                    <input aria-label="Due from" type="date" value={dueFrom} onChange={e => setDueFrom(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-light bg-white px-2.5 text-[12.5px] text-text-primary" />
                  </label>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                    Through
                    <input aria-label="Due through" type="date" min={dueFrom || undefined} value={dueTo} onChange={e => setDueTo(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-border-light bg-white px-2.5 text-[12.5px] text-text-primary" />
                  </label>
                </div>
              ),
            },
            {key:"requester",label:"BD member",values:requestedByPick,onChange:setRequestedByPick,options:[...new Set(state.requests.map(r => r.requestedBy))].map(value => ({value,label:value,avatarName:value}))},
            {key:"assignee",label:"Prepared by",values:assigneePick,onChange:setAssigneePick,options:members.map(value => ({value,label:value,avatarName:value}))},
            {key:"opportunity",label:"Opportunity",values:opportunityPick,onChange:setOpportunityPick,options:opportunities.map(o => ({value:o.id,label:o.label}))},
            {
              key: "status",
              label: "Status",
              values: statuses,
              onChange: setStatuses,
              options: [
                { value: "Request initiated", label: "Request initiated", color: STATUS_META.initiated.color },
                { value: "Assigned", label: "Assigned", color: STATUS_META.assigned.color },
                { value: "Work in progress", label: "Work in progress", color: STATUS_META.in_progress.color },
                { value: "Delayed", label: "Delayed", color: "var(--status-red)" },
                { value: "Drafted", label: "Drafted", color: "var(--ink-violet-soft)" },
                { value: "Submitted to BD", label: "Submitted to BD", color: "var(--ink-teal-deep)" },
                { value: "Submitted to customer", label: "Submitted to customer", color: "var(--ink-green)" },
                { value: "Completed", label: "Completed", color: STATUS_META.completed.color },
                { value: "Cancelled", label: "Cancelled", color: STATUS_META.cancelled.color },
              ],
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
              ].map((c) => {
                const accountId = state.requests.find((r) => r.customer === c && r.customerId)?.customerId;
                return { value: c, label: c, logoName: c, href: accountId ? `/customers/${accountId}` : undefined };
              }),
            },
          ]}
          view={
            <ViewSelect
              value={view}
              onChange={pickView}
              tileValue="table"
              tableValue="split"
              tileLabel="Table"
              tableLabel="Split"
              tileIcon={Rows3}
              tableIcon={PanelsTopLeft}
              menuOnly
            />
          }
          display={
            groupBy !== "none" && shownGroupLabels.length > 0 ? (
              <button
                type="button"
                aria-label={anyGroupOpen ? "Collapse every request group" : "Expand every request group"}
                onClick={() => setShutGroups(anyGroupOpen ? shownGroupLabels : [])}
                className="inline-flex h-10 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-border-light bg-white px-3 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
              >
                {anyGroupOpen ? (
                  <ChevronsDownUp size={14} strokeWidth={2.2} />
                ) : (
                  <ChevronsUpDown size={14} strokeWidth={2.2} />
                )}
                {anyGroupOpen ? "Close all" : "Open all"}
              </button>
            ) : null
          }
          sort={
            <ColorSelect
              value={sort}
              onChange={(v) => setSort(v as "newest" | "needed")}
              ariaLabel="Sort requests"
              minWidth={150}
              options={[
                { value: "newest", label: "By newest", color: "var(--ink-bright-blue)", icon: CalendarDays },
                { value: "needed", label: "By needed-by date", color: "var(--ink-orange)", icon: CalendarClock },
              ]}
            />
          }
        />
      </div>

      {/* Result counts belong to the results, not in the control row. The old
          “443 of 443 shown” sat between Sort and View and looked like another
          control while adding no information. Keep the toolbar intact and
          report a count here only when search or filters actually narrow it. */}
      {shown.length !== inRoom.length && (
        <p
          className="mt-2 px-1 text-[11.5px] font-medium text-text-secondary"
          aria-live="polite"
        >
          <b className="text-text-primary tnum">{shown.length}</b>{" "}
          {shown.length === 1 ? "result" : "results"} matching the current view
        </p>
      )}

      {/* THE ROW DOES NOT REPEAT THE COLUMN HEADER (Suren, Aug 28: "you
          don't have to say submission or presentation here etc, it's already
          the column header. Show the icon / colour though"). Computed from
          what is actually on screen rather than from the tab, so a room that
          mixes kinds keeps its labels. */}
      {/* COUNT THE ROOM YOU ARE IN, not the whole store. Submissions read
          "Showing 2 of 9 requests" — the 9 was every item in Solutioning, and
          the word was wrong twice over. */}
      {/* NO BOX AROUND AN EMPTY STATE (Anir, Aug 26: "for Solutioning you have
          this box, but then for Leads and Revenue Accruals you don't have the
          box… remove the box for Solutioning"). Every other list in this app
          draws the empty state bare; only this one framed it, so the same
          "nothing here yet" looked like two different things depending on
          which page you were on. */}
      {/* THE ROOM'S OWN COUNT DECIDES WHICH EMPTY STATE. This read the whole
          store, so a room with nothing in it while another room had something
          said "No solution requests match these filters. Clear the search
          box…" with no filter set (Sep 7 test loop: one detached submission
          in the store, the requests room told me to clear filters). Same
          rule as the "Showing x of y" line above it. */}
      {inRoom.length === 0 ? (
        <EmptyState
          icon={
            room === "submissions"
              ? FileSpreadsheet
              : room === "presentations"
                ? Presentation
                : ClipboardList
          }
          title={ROOM_META[room].empty}
          description="Ask for a presentation, a submission or a meeting. The Solutioning team picks it up from here, and you close it when it's delivered."
          className="py-10"
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={`No ${ROOM_META[room].noun} match these filters.`}
          description="Clear the search box, or pick a different type, status or owner."
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
            {shown.map((r, index) => {
              const on = picked?.id === r.id;
              const meta = KIND_META[r.kind];
              const label = groupLabel(r);
              const startsGroup = groupBy !== "none" && (
                index === 0 || groupLabel(shown[index - 1]) !== label
              );
              const groupClosed = groupBy !== "none" && shutGroups.includes(label);
              const overdue =
                r.neededBy && r.status !== "completed"
                  ? r.neededBy < todayISO()
                  : false;
              return (
                <Fragment key={r.id}>
                {startsGroup && (
                  <button
                    type="button"
                    aria-expanded={!groupClosed}
                    onClick={() =>
                      setShutGroups((current) =>
                        groupClosed
                          ? current.filter((item) => item !== label)
                          : [...current, label]
                      )
                    }
                    className="flex w-full items-center gap-2 border-b border-border-light bg-surface/80 px-3 py-2.5 text-left transition-colors hover:bg-blue-light/40"
                  >
                    {groupClosed ? (
                      <ChevronRight size={14} strokeWidth={2.2} className="shrink-0 text-text-tertiary" />
                    ) : (
                      <ChevronDown size={14} strokeWidth={2.2} className="shrink-0 text-text-tertiary" />
                    )}
                    {groupMark(label)}
                    <span className="min-w-0 max-w-[150px] truncate text-[12.5px] font-semibold text-text-primary">
                      {label}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium text-text-tertiary tnum">
                      {groupTotals.get(label) ?? 0}
                    </span>
                    <span className="min-w-0 flex-1" />
                  </button>
                )}
                {!groupClosed && (
                <button
                  type="button"
                  onClick={() => setPickedId(r.id)}
                  aria-current={on ? "true" : undefined}
                  title={r.title}
                  style={{
                    ["--kind-accent" as string]: meta.color,
                    backgroundColor: on ? tint(meta.color, 8) : undefined,
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
                        style={{ color: meta.color, background: tint(meta.color, 10) }}
                      >
                        {meta.label}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] font-semibold text-text-primary">
                      {r.title}
                    </span>
                    {r.subtype && (
                      <span className="mt-0.5 block truncate text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                        {r.subtype}
                      </span>
                    )}
                    <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-text-tertiary">
                      <span className="min-w-0 truncate">{r.customer}</span>
                      {overdue && (
                        <span className="shrink-0 font-bold text-[color:var(--status-red)]">
                          overdue
                        </span>
                      )}
                    </span>
                  </span>
                </button>
                )}
                </Fragment>
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
                          background: tint(KIND_META[picked.kind].color, 10),
                        }}
                      >
                        {KIND_META[picked.kind].label}
                      </span>
                      <StatusPill status={picked.status} />
                    </span>
                    <span className="mt-0.5 block truncate text-[14px] font-semibold text-text-primary">
                      {picked.title}
                    </span>
                    {picked.subtype && (
                      <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                        {picked.subtype}
                      </span>
                    )}
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
                      target="_blank"
                      rel="noopener noreferrer"
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
                <RequestPanel r={picked} />
              </>
            ) : (
              <p className="px-2 py-10 text-center text-[12.5px] text-text-secondary">
                Pick a request on the left.
              </p>
            )}
          </div>
        </div>
      ) : groupBy !== "none" ? (
        <PinnableTable key={`${room}-groups`} id="solutioning-request-groups" wrapperClassName="tab-panel">
          <div className="min-w-[2020px] space-y-3">
            {renderedGroups.map(([label, requests]) => {
              const closed = shutGroups.includes(label);
              return (
                <Card key={label} className="overflow-hidden p-0">
                  <button
                    type="button"
                    aria-expanded={!closed}
                    onClick={() =>
                      setShutGroups((current) =>
                        closed
                          ? current.filter((item) => item !== label)
                          : [...current, label]
                      )
                    }
                    className={cn(
                      "flex w-full items-center gap-3 bg-surface/70 px-4 py-3 text-left transition-colors hover:bg-blue-light/35",
                      !closed && "border-b border-border-light"
                    )}
                  >
                    <span className="inline-flex max-w-[calc(100vw-330px)] items-center gap-3">
                      {closed ? (
                        <ChevronRight size={16} strokeWidth={2.2} className="shrink-0 text-text-tertiary" />
                      ) : (
                        <ChevronDown size={16} strokeWidth={2.2} className="shrink-0 text-text-tertiary" />
                      )}
                      {groupMark(label)}
                      <span className="min-w-0 max-w-[320px] truncate text-[14px] font-semibold text-text-primary">
                        {label}
                      </span>
                      <span className="shrink-0 text-[12px] font-medium text-text-secondary tnum">
                        {groupTotals.get(label) ?? requests.length}{" "}
                        {(groupTotals.get(label) ?? requests.length) === 1 ? "request" : "requests"}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1" />
                  </button>
                  {!closed && (
                    <table className="w-full table-fixed border-collapse text-[13px]">
                      {requestTableHead}
                      <tbody>{requests.map(renderRequestRow)}</tbody>
                    </table>
                  )}
                </Card>
              );
            })}
            {renderLimit < shown.length && (
              <div ref={groupedLoadMoreRef} className="h-px" aria-hidden="true" />
            )}
          </div>
        </PinnableTable>
      ) : (
        <Card key="table" className="tab-panel overflow-hidden p-0">
          <PinnableTable key={`${room}-table`} id="solutioning-requests">
            <table className="w-full min-w-[2020px] table-fixed border-collapse text-[13px]">
              {requestTableHead}
              <tbody>
                {renderedRows.map(renderRequestRow)}
                {renderLimit < shown.length && (
                  <tr ref={loadMoreRef} aria-hidden="true">
                    <td colSpan={12} className="h-px p-0" />
                  </tr>
                )}
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
        open={confirmPickUp !== null}
        onClose={() => setConfirmPickUp(null)}
        onConfirm={() => {
          if (confirmPickUp)
            void post({ op: "pick-up", requestId: confirmPickUp.id }, confirmPickUp.id);
          setConfirmPickUp(null);
        }}
        tone="primary"
        title="Take this on?"
        body={
          <>
            You become the person doing <b>{confirmPickUp?.label}</b>, and
            whoever asked for it sees your name on it.
          </>
        }
        detail="You can hand it back afterwards if it turns out to be somebody else's."
        confirmLabel="Yes, I'll take it"
      />

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
            <b>{confirmDelete?.ref}</b> and its documents go, for everyone. If
            the work simply stopped, cancel it instead. A cancelled record
            stays in the list where people can still read it.
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
              const detailHref = `/solutioning/${data.request.id}`;
              router.push(isMockModePath(window.location.pathname) ? addMockModePrefix(detailHref) : detailHref);
            }
            return !!data;
          }}
        />
      )}
    </div>
  );
}

function solutionStatusLabel(r: SolutionRequest, overdue: boolean): string {
  if (overdue) return "Delayed";
  if (r.deliverableStatus === "Draft") return "Drafted";
  if (
    r.deliverableStatus === "Ready for review" ||
    r.deliverableStatus === "Finalized"
  ) {
    return "Submitted to BD";
  }
  if (r.deliverableStatus === "Submitted to customer") {
    return "Submitted to customer";
  }
  return STATUS_META[r.status].label;
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
  const requestHref = `/solutioning/${r.id}${room === "requests" ? "" : `?tab=${room}`}`;
  const overdue =
    r.neededBy && r.status !== "completed"
      ? r.neededBy < todayISO()
      : false;
  const statusLabel = solutionStatusLabel(r, overdue);
  const statusMeta = SOLUTION_STATUS_DISPLAY[statusLabel] ?? {
    color: "var(--text-tertiary)",
    icon: CircleDot,
  };
  const StatusIcon = statusMeta.icon;
  const preparedBy = r.completedBy || r.owner || "Not started";
  return (
    <>
    {/* The request title opens the full page. Only the chevron in Actions
        toggles the inline breakdown; empty cells are not hidden controls. */}
    <tr
      /* THE RAIL RUNS THE WHOLE WAY (Anir, Aug 25: "the blue thing has to
         extend all the way"). The deal table lights the OPEN row itself — same
         tint, same 3px rail — so the row and the panel under it read as one
         block instead of a panel floating below an untouched row. */
      className={cn(
        "group align-middle transition-colors",
        /* NO RULE ACROSS AN OPEN ROW (Anir, Aug 26: "there's a line... on the
           left side, there's a line separation for that blue line I was
           talking about"). The row's own border-b painted a 1px line straight
           through the 3px rail, so the rail arrived at the panel in two
           pieces. While the row is open the panel below IS the rest of the
           block, and its card already separates it from the next row. */
        open
          ? "bg-surface [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
          : "border-b border-border-light last:border-0"
      )}
    >
      <td className="w-[340px] px-4 py-3">
        <span className="block whitespace-nowrap text-[10.5px] font-bold text-text-tertiary tnum">{r.ref}</span>
        <Link
          href={requestHref}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 block w-fit max-w-full line-clamp-2 text-[13px] font-semibold text-text-primary transition-colors hover:text-blue-primary hover:underline"
        >
          {r.title}
        </Link>
        <Link
          href={requestHref}
          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-primary hover:underline"
        >
          <FileText size={12} strokeWidth={2} />
          {visibleRequestDocs(r).length} {visibleRequestDocs(r).length === 1 ? "document" : "documents"}
        </Link>
      </td>
      <td className="px-4 py-3.5">
        <KindChip kind={r.kind} size="sm" iconOnly={hideKindLabel} />
        {r.subtype && (
          <span className="mt-1.5 block text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            {r.subtype}
          </span>
        )}
      </td>
      <td className="px-4 py-3.5">
        {r.opportunityIds.length === 1 ? (
          <Link
            href={`/opportunities/${r.opportunityIds[0]}`}
            onClick={(event) => event.stopPropagation()}
            className="inline-block max-w-full text-[12px] text-text-secondary transition-colors hover:text-blue-primary hover:underline"
          >
            <span className="block font-semibold text-text-primary">
              {r.opportunityIds[0]}
            </span>
            {r.opportunityLabels[0] && (
              <span className="mt-0.5 block line-clamp-1 text-[10.5px] text-text-tertiary">
                {r.opportunityLabels[0]}
              </span>
            )}
          </Link>
        ) : r.opportunityIds.length > 1 ? (
          <span className="text-[12px] text-text-secondary">
            {r.opportunityIds.length} opportunities
          </span>
        ) : (
          <span className="text-[12px] text-text-tertiary">Not linked</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        {r.customer.trim() ? (
          <Link
            href={companyDestination(r.customer, r.customerId)}
            onClick={(event) => event.stopPropagation()}
            className="group/customer inline-flex min-w-0 items-center gap-1.5"
          >
            <CompanyLogo name={r.customer} className="h-5 w-5 shrink-0 text-[7px]" />
            <span className="min-w-0 break-words text-[12.5px] text-text-primary transition-colors group-hover/customer:text-blue-primary group-hover/customer:underline">
              {r.customer}
            </span>
          </Link>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5">
            <CompanyLogo name={r.customer} className="h-5 w-5 shrink-0 text-[7px]" />
            <span className="min-w-0 break-words text-[12.5px] text-text-primary">{r.customer}</span>
          </span>
        )}
      </td>
      <td className="px-4 py-3.5">
        <Link
          href={`/analytics/reps/${repSlug(r.requestedBy)}`}
          onClick={(event) => event.stopPropagation()}
          className="group/person inline-flex max-w-full min-w-0 items-center gap-1.5"
        >
          <Avatar name={r.requestedBy} className="h-5 w-5 shrink-0 text-[7px]" />
          <span className="block truncate text-[12px] text-text-primary transition-colors group-hover/person:text-blue-primary group-hover/person:underline">
            {r.requestedBy}
          </span>
        </Link>
      </td>
      <td className="px-4 py-3.5">
        {r.owner ? (
          <Link
            href={`/analytics/reps/${repSlug(r.owner)}`}
            onClick={(event) => event.stopPropagation()}
            className="group/person inline-flex max-w-full min-w-0 items-center gap-1.5"
          >
            <Avatar name={r.owner} className="h-5 w-5 shrink-0 text-[7px]" />
            <span className="min-w-0 break-words text-[12px] text-text-primary transition-colors group-hover/person:text-blue-primary group-hover/person:underline">
              {r.owner}
            </span>
          </Link>
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
        {preparedBy === "Not started" ? (
          <span className="text-[12px] text-text-tertiary">Not started</span>
        ) : (
          <Link
            href={`/analytics/reps/${repSlug(preparedBy)}`}
            onClick={(event) => event.stopPropagation()}
            className="group/person inline-flex max-w-full min-w-0 items-center gap-1.5"
          >
            <Avatar name={preparedBy} className="h-5 w-5 shrink-0 text-[7px]" />
            <span className="truncate text-[12px] text-text-primary transition-colors group-hover/person:text-blue-primary group-hover/person:underline">
              {preparedBy}
            </span>
          </Link>
        )}
      </td>
      <td className="px-4 py-3.5 text-[12px] text-text-secondary tnum">
        <DateText value={r.requestedAt} />
      </td>
      <td className="px-4 py-3.5">
        {r.neededBy ? (
          <span className={cn("text-[12px] tnum", overdue ? "font-bold text-[color:var(--status-red)]" : "text-text-secondary")}>
            <span className="block whitespace-nowrap"><DateText value={r.neededBy} /></span>
            {overdue && <span className="block">overdue</span>}
          </span>
        ) : (
          <span className="text-[12px] text-text-tertiary">-</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-[12px] text-text-secondary tnum">
        {r.completedAt ? <DateText value={r.completedAt} /> : <span className="text-text-tertiary">-</span>}
      </td>
      <td className="px-4 py-3.5">
        <span
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ color: statusMeta.color, background: tint(statusMeta.color, 10) }}
        >
          <StatusIcon size={12} strokeWidth={2.2} aria-hidden="true" />
          {statusLabel}
        </span>
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
          target="_blank"
          rel="noopener noreferrer"
          href={requestHref}
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
          colSpan={12}
          className="max-w-0 pb-4 pl-7 pr-4 pt-1 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
        >
          <div className="tab-panel sticky left-0 w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border-light bg-white sm:w-[calc(100vw-290px)]">
            <RequestPanel r={r} />
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
const requestDocumentDownloadUrl = (requestId: string, docId: string) =>
  `/api/solutioning/download?requestId=${encodeURIComponent(
    requestId
  )}&docId=${encodeURIComponent(docId)}`;

/** Give compact request documents the exact hover-preview surface used by
 * Sales Materials. The solutioning route supplies the rendered document; the
 * material shape only carries the file identity and format that preview uses. */
const requestDocumentAsMaterial = (doc: SolutionDoc): OfferingMaterial => ({
  id: doc.id,
  kind: formatFromFilename(doc.fileName || doc.name),
  label: doc.name,
  url: doc.url ?? "",
  ...(doc.docsPath ? { docsPath: doc.docsPath } : {}),
});

/** The list preview must expose the same shelves as the full record. */
const visibleRequestDocs = (request: SolutionRequest) =>
  request.type === "request"
    ? request.docs.filter(
        (doc) => doc.category === "customer" || doc.category === "analysis"
      )
    : request.docs;

function RequestPanel({
  r,
}: {
  r: SolutionRequest;
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
  const [viewingDocument, setViewingDocument] = useState<SolutionDoc | null>(null);
  const documents = visibleRequestDocs(r);
  const activity = chronologicalActivity(r);
  return (
    <>
    <div className="grid w-full grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
              What they asked for
            </span>
            <p className={cn(
              "mt-1.5 max-w-[76ch] text-[13px] leading-relaxed",
              r.details ? "text-text-primary" : "text-text-tertiary"
            )}>
              {r.details || "No brief has been added."}
            </p>
          </div>
          {r.kind === "meeting" && r.meetingAt && (
            <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-secondary tnum">
              {stampedAt(r.meetingAt)}
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-3 rounded-lg border border-border-light bg-surface/45 px-3.5 py-3 sm:grid-cols-3">
          <div className="min-w-0">
            <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">Customer</span>
            {r.customer.trim() ? (
              <Link href={companyDestination(r.customer, r.customerId)} className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-text-primary hover:text-blue-primary hover:underline">
                <CompanyLogo name={r.customer} className="h-[18px] w-[18px] shrink-0 text-[6px]" />
                <span className="truncate">{r.customer}</span>
              </Link>
            ) : (
              <p className="mt-1.5 text-[12px] text-text-tertiary">Not linked</p>
            )}
          </div>
          <div className="min-w-0">
            <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">Opportunity</span>
            {r.opportunityLabels.length === 0 ? (
              <p className="mt-1.5 text-[12px] text-text-tertiary">Not linked</p>
            ) : (
              <div className="mt-1.5 space-y-1">
                {r.opportunityLabels.slice(0, 2).map((label, index) => {
                  const opportunityId = r.opportunityIds.length === r.opportunityLabels.length ? r.opportunityIds[index] : undefined;
                  const content = <><Briefcase size={12} strokeWidth={2} className="shrink-0 text-text-tertiary" /><span className="truncate">{label}</span></>;
                  return opportunityId ? (
                    <Link key={`${opportunityId}-${label}`} href={`/opportunities/${opportunityId}`} className="flex min-w-0 items-center gap-1.5 text-[12px] font-semibold text-text-primary hover:text-blue-primary hover:underline">{content}</Link>
                  ) : (
                    <p key={label} className="flex min-w-0 items-center gap-1.5 text-[12px] text-text-secondary">{content}</p>
                  );
                })}
                {r.opportunityLabels.length > 2 && <p className="text-[11px] text-text-tertiary">+{r.opportunityLabels.length - 2} more</p>}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <span className="block text-[9.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">Contacts</span>
            {r.contactNames.length === 0 ? (
              <p className="mt-1.5 text-[12px] text-text-tertiary">None linked</p>
            ) : (
              <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px] text-text-primary">
                <span className="flex shrink-0 -space-x-1.5">
                  {r.contactNames.slice(0, 3).map((name) => (
                    <Avatar key={name} name={name} className="h-[20px] w-[20px] border-2 border-white text-[7px]" />
                  ))}
                </span>
                <span className="truncate font-medium">{r.contactNames.slice(0, 2).join(", ")}</span>
                {r.contactNames.length > 2 && <span className="shrink-0 text-text-tertiary">+{r.contactNames.length - 2}</span>}
              </div>
            )}
          </div>
        </div>

        <section className="mt-3 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
              Documents ({documents.length})
            </span>
          </div>
          {documents.length === 0 ? (
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-border-light px-3 py-2.5 text-[12px] text-text-tertiary">
              <FileText size={15} strokeWidth={1.9} /> No documents yet
            </div>
          ) : (
            <div className="mt-1.5 overflow-hidden rounded-lg border border-border-light bg-white">
              <table className="w-full table-fixed border-collapse text-left">
                <colgroup>
                  <col />
                  <col className="w-[72px]" />
                  <col className="w-[180px]" />
                  <col className="w-[64px]" />
                </colgroup>
                <thead className="border-b border-border-light bg-surface/70 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  <tr>
                    <th className="px-3 py-2">Document</th>
                    <th className="px-3 py-2">Version</th>
                    <th className="px-3 py-2">Assigned to</th>
                    <th className="px-3 py-2">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
              {documents.slice(0, 3).map((doc) => {
                const isFile = Boolean(doc.docsPath || doc.ref);
                const previewPage = `/solutioning/${encodeURIComponent(r.id)}/documents/${encodeURIComponent(doc.id)}`;
                const kind = docKind(doc.fileName ?? doc.name);
                const DocIcon = kind.icon;
                return (
                  <tr key={doc.id} className="transition-colors hover:bg-blue-light/20">
                    <td className="min-w-0 px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ color: kind.color, background: tint(kind.color, 10) }}>
                          <DocIcon size={14} strokeWidth={2} />
                        </span>
                        <MaterialPeek
                          material={requestDocumentAsMaterial(doc)}
                          previewUrl={isFile ? `${previewPage}?embed=1` : null}
                        >
                          <button
                            type="button"
                            disabled={!isFile}
                            onClick={() => isFile && setViewingDocument(doc)}
                            className="min-w-0 truncate text-left text-[12px] font-semibold text-text-primary enabled:hover:text-blue-primary enabled:hover:underline disabled:cursor-default"
                          >
                            {doc.name}
                          </button>
                        </MaterialPeek>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-medium text-text-secondary tnum">
                      v{doc.version}
                    </td>
                    <td className="px-3 py-2.5">
                      {doc.assignedTo ? (
                        <span className="flex min-w-0 items-center gap-2" title={doc.assignedTo}>
                          <Avatar name={doc.assignedTo} className="h-6 w-6 shrink-0 text-[8px]" />
                          <span className="truncate text-[11.5px] font-medium text-text-primary">
                            {doc.assignedTo}
                          </span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                          <CircleDashed size={13} strokeWidth={2} className="shrink-0" />
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {isFile ? (
                        <Link href={previewPage} target="_blank" rel="noopener noreferrer" aria-label={`Open ${doc.name} on its own page`} className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-blue-light hover:text-blue-primary">
                          <ArrowUpRight size={13} strokeWidth={2.2} />
                        </Link>
                      ) : doc.url ? (
                        <a href={doc.url} target="_blank" rel="noreferrer" aria-label={`Open ${doc.name}`} className="flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary hover:bg-blue-light hover:text-blue-primary">
                          <ArrowUpRight size={13} strokeWidth={2.2} />
                        </a>
                      ) : (
                        <span className="text-[11px] text-text-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {documents.length > 3 && (
                <tr>
                  <td colSpan={4} className="px-3 py-2 text-[11px] font-medium text-text-tertiary">
                    +{documents.length - 3} more on the full record
                  </td>
                </tr>
              )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <aside className="self-start rounded-xl border border-border-light bg-surface/45 p-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
            <Timer size={14} strokeWidth={2} className="text-blue-primary" /> Recent activity
          </span>
          <span className="text-[11px] text-text-tertiary">{activity.length}</span>
        </div>
        {activity.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-center">
            <p className="text-[12px] font-medium text-text-secondary">No activity yet</p>
            <p className="mt-1 text-[11px] text-text-tertiary">Changes will appear here.</p>
          </div>
        ) : (
          <ol className="mt-3">
            {activity.slice(0, 3).map((a, index, shown) => {
              const mark = timelineMark(a.what);
              const MarkIcon = mark.icon;
              return (
                <li key={`${a.at}-${index}`} className="relative pl-9 pb-4 last:pb-0">
                  {index < shown.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[12px] top-[26px] bottom-0 w-[2px] rounded bg-border-light"
                    />
                  )}
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ background: tint(mark.color, 10), color: mark.color }}
                  >
                    <MarkIcon size={12} strokeWidth={2.3} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[12px] font-medium leading-[17px] text-text-primary">{a.what}</p>
                    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[10.5px] text-text-tertiary">
                      <Avatar name={a.by} className="h-[14px] w-[14px] shrink-0 text-[6px]" />
                      <span className="min-w-0 truncate">{a.by}</span>
                      <span className="shrink-0 tnum">· <DateText value={a.at} /></span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {activity.length > 3 && (
          <p className="mt-2 border-t border-border-light pt-2 text-[11px] text-text-tertiary">
            {activity.length - 3} earlier {activity.length - 3 === 1 ? "update" : "updates"} on the full record
          </p>
        )}
      </aside>
    </div>
    {viewingDocument && (
      <DocumentPeek
        name={viewingDocument.name}
        fileName={viewingDocument.fileName ?? viewingDocument.name}
        contextName={r.customer || "This request"}
        previewUrl={`${requestDocumentDownloadUrl(r.id, viewingDocument.id)}&view=1`}
        serverPreviewUrl={`/api/solutioning/preview?requestId=${encodeURIComponent(
          r.id
        )}&docId=${encodeURIComponent(viewingDocument.id)}`}
        downloadUrl={requestDocumentDownloadUrl(r.id, viewingDocument.id)}
        onClose={() => setViewingDocument(null)}
      />
    )}
    </>
  );
}

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
      color: "var(--ink-bright-blue)",
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
  percent?: number;
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
  prefillLeadName,
  prefillLeadInterest,
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
  /** Person on the lead, shown throughout the request flow. */
  prefillLeadName?: string | null;
  /** Existing lead context is shown, but never substitutes for the required brief. */
  prefillLeadInterest?: string | null;
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
   * already exists it is selected; otherwise the company name is selected as
   * a lead-only option, without creating a customer account.
   */
  const sourceOpportunity = prefillOpportunityId
    ? opportunities.find((o) => o.id === prefillOpportunityId)
    : undefined;
  const sourceCompany = prefillCompany?.trim() || sourceOpportunity?.customer.trim() || "";
  const sourceContext = sourceOpportunity
    ? {
        label: "For this opportunity",
        name: sourceOpportunity.label,
        company: sourceOpportunity.label.toLowerCase().includes(sourceCompany.toLowerCase()) ? "" : sourceCompany,
        logoName: sourceCompany,
      }
    : prefillLead
      ? { label: "For this lead", name: prefillLeadName?.trim() || "This lead", company: sourceCompany, logoName: "", avatarName: prefillLeadName?.trim() || undefined }
    : prefillCustomerId && sourceCompany
      ? { label: "For this customer", name: sourceCompany, company: "", logoName: sourceCompany }
      : null;
  const matchedByName = sourceCompany
    ? (customers.find(
        (c) => c.name.trim().toLowerCase() === sourceCompany.toLowerCase()
      )?.id ?? "")
    : "";
  // Leads and imported opportunities can name a company without a Customer
  // record. Keep that name selectable without inventing an account.
  const sourceCustomerId = (prefillOpportunityId || prefillLead) && sourceCompany && !matchedByName &&
    !customers.some((c) => c.id === prefillCustomerId)
    ? `source-company:${prefillOpportunityId || prefillLead}`
    : "";
  const customerOptions = sourceCustomerId
    ? [{ id: sourceCustomerId, name: sourceCompany }, ...customers]
    : customers;
  const [customerId, setCustomerId] = useState(
    (prefillCustomerId && customers.some((c) => c.id === prefillCustomerId)
      ? prefillCustomerId
      : matchedByName || sourceCustomerId)
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
  const leadContext = prefillLead
    ? `For ${prefillLeadName?.trim() || "this lead"}${sourceCompany ? ` at ${sourceCompany}` : ""}.`
    : "";
  const [details, setDetails] = useState("");
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
  /* WHAT A NEW DEAL MUST CARRY (Suren, Sep 1, enforced in the opportunities
     route): estimated TCV, a confidence level and an expected signing date.
     This mini-form asked for a name and a free-text "Value" and sent neither
     of the other two, so "Create the opportunity" could only ever come back
     refused (Anir, Sep 6: "this didn't work... all the data is not there, so
     this can't be a real opportunity"). */
  const [subTcv, setSubTcv] = useState("");
  const [subConfidence, setSubConfidence] = useState("50");
  const [subSignDate, setSubSignDate] = useState("");
  const [subBusy, setSubBusy] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  const customer = customerOptions.find((c) => c.id === customerId) ?? null;

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
        { key, name: file.name, size: file.size, status: "uploading", percent: 0 },
      ]);
      try {
        const data = await uploadWithProgress<{
          docsPath?: string;
          fileName?: string;
        }>("/api/solutioning/upload?draft=1", file, (percent) =>
          setDocs((cur) =>
            cur.map((d) => (d.key === key ? { ...d, percent } : d))
          )
        );
        if (!data?.docsPath)
          throw new Error("That file did not upload.");
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
    if (!customerId || customerId === sourceCustomerId) return;
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
  }, [customerId, sourceCustomerId]);

  const customerOpps = [...opportunities, ...newOpps].filter(
    (o) =>
      (o.customerId && o.customerId === customerId) ||
      (customer && o.customer.trim().toLowerCase() === customer.name.trim().toLowerCase())
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
            /* `estimatedTcv` is the mandatory money field, not the legacy
               `value` column this used to send — the route validates the
               former and never saw the latter. */
            estimatedTcv: Number(subTcv.replace(/[^0-9.]/g, "")) || 0,
            lines: [
              {
                confidence: Number(subConfidence) || 0,
                estSignDate: subSignDate,
              },
            ],
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

  /**
   * WHY THE BUTTON IS WAITING, SAID OUT LOUD.
   *
   * Found in the loop, Sep 6: a needed-by date in the past left Create enabled
   * and blue, and pressing it did nothing at all — the browser refused the
   * value on the input's own `min`, the click went nowhere, and the dialog sat
   * there with no message. Press-then-silence is the shape Anir has told me to
   * stop building; the contracts dialog already does it the other way round,
   * with the reason beside the button and the button waiting.
   *
   * Same rule the input enforces, said in words: a request cannot be needed
   * before today.
   */
  /* EACH DATE OWNS ITS OWN COMPLAINT, so the words can sit under the field
     they are about rather than in the dialog's far corner (Anir, Sep 7). */
  const neededByProblem =
    neededBy && neededBy < todayISO()
      ? "That date has already passed. Pick today or later."
      : null;
  const meetingProblem =
    meetingAt && meetingAt.slice(0, 10) < todayISO()
      ? "That meeting is in the past. Pick today or later."
      : null;
  const dateProblem = neededByProblem ?? meetingProblem;
  const canSave =
    !!kind &&
    title.trim().length > 0 &&
    (kind !== "submission" || subtype.trim().length > 0) &&
    !!customer &&
    !!neededBy &&
    details.trim().length > 0 &&
    !uploading &&
    !dateProblem;

  /**
   * WHY THE BUTTON IS WAITING (Anir, Sep 4: "don't make it like u can press
   * the button and then it throws error. just dont let them click in the
   * first place and give reason").
   *
   * It waited, correctly, and said nothing — a half-filled form looked like a
   * broken button. The date problems already had their own sentences under
   * their own fields; the three missing-field cases had none. Named one at a
   * time, in the order somebody fills the form.
   */
  const savingProblem: string | null = uploading
    ? "Wait for the files to finish."
    : !kind
      ? "Pick what you need."
      : !title.trim()
        ? "Give it a title."
        : kind === "submission" && !subtype.trim()
          ? "Pick a submission type."
        : !customer
          ? "Say which account it is for."
          : !neededBy
            ? "Pick a due date."
            : !details.trim()
              ? "Say what the Solutioning team needs to know."
              : dateProblem
                ? dateProblem
                : null;

  return (
    <FrameOrNot
      chromeless={chromeless}
      onClose={onClose}
      context={sourceContext}
      title={
        directKind
          ? `New ${KIND_META[directKind].label.toLowerCase()}`
          : kind
            ? `Request a ${KIND_META[kind].label.toLowerCase()}`
            : "What do you need?"
      }
      onBack={onBack}
      stepBack={!directKind && kind && !sub ? () => setKind(null) : undefined}
    >
      {/* All steps share a fixed frame; longer forms scroll inside it. */}
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
          {/* THE ACCOUNT'S OWN MARK, AND ITS NAME IN THE TITLE (Anir, Sep 6:
              "just say 'New Opportunity for Takeda' and put the profile
              picture of Takeda"). The old subtitle explained the mechanics of
              the form back to the reader, which he called AI slop — one plain
              line about what this IS replaces it. */}
          <div className="mb-1 flex items-center gap-2">
            <CompanyLogo
              name={customer?.name ?? ""}
              className="h-6 w-6 shrink-0 text-[8px]"
            />
            <p className="text-[14px] font-semibold text-text-primary">
              {sub === "opportunity" ? "New opportunity" : "New contact"} for{" "}
              {customer?.name}
            </p>
          </div>
          <p className="mb-4 text-[12.5px] text-text-secondary">
            {sub === "opportunity"
              ? "It joins this request as soon as you create it."
              : "They join this request as soon as you create them."}
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
          {sub === "opportunity" ? (
            /* THE THREE FIELDS A DEAL CANNOT BE SAVED WITHOUT. The old form
               asked for a free-text "Value" — which is why a person could type
               "Test" into a money box (Anir: "why is the value a letter?") —
               and omitted confidence and the signing date entirely, so every
               submit was refused by the route. */
            <>
              <label className="mt-3 block">
                <span className="text-[12px] font-semibold text-text-primary">
                  Estimated TCV <span className="text-error">*</span>
                </span>
                <span className="relative mt-1.5 flex items-center">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 text-[13px] font-semibold text-text-tertiary"
                  >
                    $
                  </span>
                  <input
                    value={withCommas(subTcv)}
                    inputMode="numeric"
                    onChange={(e) =>
                      setSubTcv(
                        expandMoneyShorthand(e.target.value, { integer: true })
                      )
                    }
                    placeholder="0"
                    className="h-10 w-full rounded-lg border border-border-light bg-white pl-7 pr-3 text-[13px] tnum outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
                  />
                </span>
              </label>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[12px] font-semibold text-text-primary">
                    Confidence <span className="text-error">*</span>
                  </span>
                  <span className="relative mt-1.5 flex items-center">
                    <input
                      value={subConfidence}
                      inputMode="numeric"
                      onChange={(e) =>
                        setSubConfidence(
                          e.target.value.replace(/[^0-9]/g, "").slice(0, 3)
                        )
                      }
                      placeholder="50"
                      className="h-10 w-full rounded-lg border border-border-light bg-white px-3 pr-7 text-[13px] tnum outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 text-[13px] font-semibold text-text-tertiary"
                    >
                      %
                    </span>
                  </span>
                </label>
                <label className="block">
                  <span className="text-[12px] font-semibold text-text-primary">
                    Expected to sign <span className="text-error">*</span>
                  </span>
                  <input
                    type="date"
                    value={subSignDate}
                    onChange={(e) => setSubSignDate(e.target.value)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
                  />
                </label>
              </div>
            </>
          ) : (
            <label className="mt-3 block">
              <span className="text-[12px] font-semibold text-text-primary">
                Job title
                <span className="ml-1.5 font-normal text-text-secondary">
                  optional
                </span>
              </span>
              <input
                value={subExtra}
                onChange={(e) => setSubExtra(e.target.value)}
                placeholder="What they do there"
                className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
              />
            </label>
          )}
          <div className="mt-auto flex items-center justify-between gap-3 pt-5">
            <span className="min-w-0 text-[12.5px] text-error">{subError}</span>
            <button
              type="button"
              disabled={
                !subName.trim() ||
                subBusy ||
                (sub === "opportunity" &&
                  (!subTcv.trim() || !subConfidence.trim() || !subSignDate))
              }
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
                    style={{ background: tint(meta.color, 8), color: meta.color }}
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
                  ["2", "Solutions takes it up", "Whoever takes it owns it, and builds the documents you asked for."],
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
                Title <span className="text-error">*</span>
              </span>
              <input
                autoFocus
                value={title}
                maxLength={200}
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
                  Submission type <span className="text-error">*</span>
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
                      color: ["var(--ink-bright-blue)", "#0D9488", "var(--ink-violet-soft)", "#64748B"][i],
                      icon: FileText,
                    }))}
                  />
                </div>
              </label>
            )}
            {kind === "presentation" && (
              <label className="block">
                <span className="text-[12px] font-semibold text-text-primary">
                  Presentation type<OptionalMark />
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
                  When is the meeting?<OptionalMark />
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
                  min={todayISO()}
                  onChange={(e) => setMeetingAt(e.target.value)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
                />
                <span
                  aria-live="polite"
                  className="mt-1 block h-[16px] text-[12px] font-semibold leading-4 text-[color:var(--ink-orange)]"
                >
                  {meetingProblem}
                </span>
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="block">
              <span className="text-[12px] font-semibold text-text-primary">
                {prefillLead ? "Company / customer" : "Customer"} <span className="text-error">*</span>
              </span>
              <div className="mt-1.5">
                {sourceOpportunity ? (
                  <div className="flex h-10 items-center gap-2 rounded-lg border border-border-light bg-surface px-3 text-[13px] font-medium text-text-primary">
                    <CompanyLogo name={sourceCompany} className="h-5 w-5 shrink-0 text-[7px]" />
                    <span className="truncate">{sourceCompany}</span>
                  </div>
                ) : (
                <ColorSelect
                  value={customerId}
                  onChange={(nextCustomerId) => {
                    if (nextCustomerId !== customerId) setOppIds([]);
                    setCustomerId(nextCustomerId);
                  }}
                  ariaLabel="Customer"
                  compactTrigger
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
                    ...customerOptions.map((c) => {
                      const deals = opportunities.filter(
                        (o) => o.customerId === c.id || o.customer === c.name
                      ).length;
                      return {
                        value: c.id,
                        label: c.name,
                        logoName: c.name,
                        /* A picker names records, and the name is often not
                           enough to be sure (Anir, Sep 7). The arrow opens
                           the account in a new tab; the form stays put. */
                        href: c.id === sourceCustomerId ? undefined : `/customers/${c.id}`,
                        description: deals
                          ? `${deals} ${deals === 1 ? "deal" : "deals"}`
                          : "no deals",
                        descriptionAccent: deals > 0,
                      };
                    }),
                  ]}
                />
                )}
              </div>
              {prefillLead && customerId === sourceCustomerId && <p className="mt-1 text-[11px] text-text-secondary">From this lead; no customer account is created.</p>}
            </div>
            <div className="block">
              <span className="text-[12px] font-semibold text-text-primary">
                Opportunity
                {!sourceOpportunity && <span className="ml-1 font-normal text-text-tertiary">Optional</span>}
              </span>
              <div className="mt-1.5">
                {sourceOpportunity ? (
                  <div className="flex h-10 items-center gap-2 rounded-lg border border-border-light bg-surface px-3 text-[13px] font-medium text-text-primary">
                    <Briefcase size={16} className="shrink-0 text-blue-primary" aria-hidden="true" />
                    <span className="truncate" title={sourceOpportunity.label}>{sourceOpportunity.label}</span>
                  </div>
                ) : (
                <MultiColorSelect
                  values={oppIds}
                  onChange={setOppIds}
                  ariaLabel="Deals this is for"
                  minWidth={220}
                  allLabel={
                    customer
                      ? customerOpps.length
                        ? "Pick associated opportunities"
                        : customerId === sourceCustomerId
                          ? "No opportunities linked to this company"
                          : "No opportunities on this account"
                      : "Pick the customer first"
                  }
                  allIcon={ClipboardList}
                  allColor="var(--ink-bright-blue)"
                  options={customerOpps.map((o) => ({
                    value: o.id,
                    label: o.label,
                    color: "var(--ink-bright-blue)",
                    href: `/opportunities/${o.id}`,
                  }))}
                  /* Only once an account is chosen: an opportunity has to
                     belong to somebody. */
                  createLabel={customer ? "Create a new opportunity" : undefined}
                  onCreate={customer ? () => setSub("opportunity") : undefined}
                />
                )}
              </div>
            </div>
          </div>

          {/* Request date is generated by the system, but it must still be
              visible in the form. Hiding it made the requested field look
              absent even though the API was recording it. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[12px] font-semibold text-text-primary">
                Request date <span className="text-error">*</span>
              </span>
              <span className="mt-1.5 flex h-10 w-full items-center gap-2 rounded-lg border border-border-light bg-surface/60 px-3 text-[13px] text-text-primary">
                <CalendarDays size={15} className="shrink-0 text-blue-primary" />
                <span className="font-medium tnum">{formatDate(todayISO())}</span>
                <span className="ml-auto text-[11.5px] text-text-tertiary">
                  Generated automatically
                </span>
              </span>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-text-primary">
                Due date <span className="text-error">*</span>
              </span>
              <input
                type="date"
                value={neededBy}
                /* The past is not offered (Anir, Sep 6: "when I request it,
                   the needed date should always be in the future"). The
                   server refuses it too, for anything that bypasses the
                   picker. */
                min={todayISO()}
                onChange={(e) => setNeededBy(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
              />
              {/* Keep the validation line reserved so an error does not
                  change the dimensions of the dialog. */}
              <span
                aria-live="polite"
                className="mt-1 block h-[16px] text-[12px] font-semibold leading-4 text-[color:var(--ink-orange)]"
              >
                {neededByProblem}
              </span>
            </label>
          </div>

          {/* A request may have one or more customer contacts. The field is
              optional, but uses the business name from the specification. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="block">
              <span className="text-[12px] font-semibold text-text-primary">
                {prefillLead && customerId === sourceCustomerId && prefillLeadName ? "Lead contact" : "Customer POC"}
                {!(prefillLead && customerId === sourceCustomerId && prefillLeadName) && <span className="ml-1 font-normal text-text-tertiary">Optional</span>}
              </span>
              <div className="mt-1.5 flex items-center gap-2">
                {prefillLead && customerId === sourceCustomerId && prefillLeadName ? (
                  <div className="flex h-10 items-center gap-2 rounded-lg border border-border-light bg-surface px-3 text-[13px] font-medium text-text-primary">
                    <Avatar name={prefillLeadName} className="h-5 w-5 shrink-0 text-[7px]" />
                    <span>{prefillLeadName}</span>
                    <span className="text-[11px] font-normal text-text-tertiary">From this lead</span>
                  </div>
                ) : <>
                <MultiColorSelect
                  values={contactIds}
                  onChange={setContactIds}
                  ariaLabel="Contacts this is for"
                  minWidth={220}
                  clearLabel="Clear selected contacts"
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
                    href: `/contacts/${c.id}`,
                  }))}
                  createLabel={customer ? "Create a new contact" : undefined}
                  onCreate={customer ? () => setSub("contact") : undefined}
                />
                {contactIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setContactIds([])}
                    aria-label="Clear selected customer contacts"
                    className="shrink-0 text-[12px] font-medium text-blue-primary hover:text-blue-hover"
                  >
                    Clear
                  </button>
                )}
                </>}
              </div>
            </div>
            <div className="hidden sm:block" aria-hidden="true" />
          </div>

          {kind === "meeting" && (
            <div className="rounded-xl border border-border-light bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold text-text-primary">
                    Attending from Freyr<OptionalMark />
                  </p>
                  <p className="mt-0.5 text-[12px] text-text-secondary">Add the teammates who will join the meeting.</p>
                </div>
                <MultiColorSelect
                  values={attendees}
                  onChange={setAttendees}
                  ariaLabel="Freyr attendees"
                  minWidth={168}
                  allLabel="Add people"
                  fixedTriggerLabel="Add people"
                  allIcon={Plus}
                  allColor="var(--ink-bright-blue)"
                  options={members.map((m) => ({
                    value: m,
                    label: m,
                    avatarName: m,
                  }))}
                />
              </div>
              <div className="mt-4 flex min-h-28 flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed border-border-light bg-surface/45 p-4 text-center">
                {attendees.length === 0 ? (
                  <p className="text-[12.5px] text-text-secondary">No one added yet</p>
                ) : (
                  attendees.map((name) => (
                    <span key={name} className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 py-1 pl-1 pr-2 text-[12.5px] font-medium text-text-primary">
                      <Avatar name={name} className="h-6 w-6 shrink-0 text-[8px]" />
                      {name}
                      <button
                        type="button"
                        aria-label={`Remove ${name} from attendees`}
                        onClick={() => setAttendees((current) => current.filter((person) => person !== name))}
                        className="rounded-full p-0.5 text-text-tertiary hover:bg-white hover:text-text-primary"
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-[12px] font-semibold text-text-primary">
              What does the Solutioning team need to know?{" "}
              <span className="text-error">*</span>
            </span>
            {leadContext && <span className="mt-1 block text-[12px] text-text-secondary">{leadContext} {prefillLeadInterest ? `They asked about: ${prefillLeadInterest.trim()} ` : ""}Add the actual scope and expected outcome below.</span>}
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              placeholder="What is needed, why, and for when? Include the audience, scope, and any useful links."
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
              Documents<OptionalMark />
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
                            background: tint(meta.color, 8),
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
                              : fileSize(d.size)}
                          </span>
                          {/* The bar, not the word (Anir, Sep 6). */}
                          {d.status === "uploading" && (
                            <UploadProgress percent={d.percent ?? 0} className="mt-1.5" />
                          )}
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

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={() => setKind(null)}
              className="rounded-lg border border-border-light bg-white px-4 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              Back
            </button>
            <div className="flex min-h-9 flex-wrap items-center justify-end gap-3">
              <p className="text-right text-[12.5px] font-semibold text-[color:var(--ink-orange)]">
                {savingProblem}
              </p>
              <button
                type="button"
                disabled={!canSave || saving}
                onClick={async () => {
                if (!kind || !customer) return;
                setSaving(true);
                /* Ids and names travel as pairs, so the request page can link
                   each name to its own record: a deal made in this form, or one
                   no longer on this account, used to shift every later name
                   onto the wrong id. */
                const pickedDeals = oppIds.flatMap((id) => customerOpps.filter((o) => o.id === id).slice(0, 1));
                const pickedContacts = contactIds.flatMap((id) => contacts.filter((c) => c.id === id).slice(0, 1));
                const ok = await onCreate({
                  kind,
                  subtype:
                    kind === "submission"
                      ? subtype
                      : kind === "presentation"
                        ? presType.trim() || undefined
                        : undefined,
                  title: title.trim(),
                  details: details.trim(),
                  leadRef: prefillLead || undefined,
                  leadName: prefillLeadName?.trim() || undefined,
                  customerId: customer.id === sourceCustomerId ? undefined : customer.id,
                  customer: customer.name,
                  opportunityIds: pickedDeals.map((o) => o.id),
                  opportunityLabels: pickedDeals.map((o) => o.label),
                  contactIds: pickedContacts.map((c) => c.id),
                  contactNames: prefillLead && customerId === sourceCustomerId && prefillLeadName
                    ? [prefillLeadName.trim()]
                    : pickedContacts.map((c) => c.name),
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
  context,
  onBack,
  stepBack,
  children,
}: {
  chromeless: boolean;
  onClose: () => void;
  title: string;
  context?: { label: string; name: string; company: string; logoName: string; avatarName?: string } | null;
  onBack?: () => void;
  stepBack?: () => void;
  children: React.ReactNode;
}) {
  // A minimum height alone still lets longer panels resize the dialog.
  if (!chromeless)
    return (
      <Modal
        open
        onClose={onClose}
        onBack={stepBack}
        title={title}
        titleAfter={context ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[12px] font-medium text-blue-primary" title={`${context.label}: ${context.name}${context.company ? ` · ${context.company}` : ""}`}>
            {context.avatarName
              ? <Avatar name={context.avatarName} className="h-6 w-6 shrink-0 text-[8px]" />
              : <CompanyLogo name={context.logoName} className="h-6 w-6 rounded-md text-[8px]" />}
            <span className="shrink-0">{context.label}:</span>
            <span className="truncate font-semibold">{context.name}</span>
            {context.company && <span className="hidden shrink-0 text-text-secondary sm:inline">· {context.company}</span>}
          </span>
        ) : undefined}
        size="workflow"
        dialogClassName="h-[min(720px,calc(100dvh-4rem))]"
      >
        {children}
      </Modal>
    );
  return (
    <div>
      {(stepBack || onBack) && (
        <button
          type="button"
          onClick={stepBack || onBack}
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

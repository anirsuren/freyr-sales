"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  Flag,
  Pencil,
  Hand,
  CircleDashed,
  ExternalLink,
  FileText,
  History,
  Link2,
  ListChecks,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  UserRound,
  type LucideIcon,
  MessageSquare,
  ArrowUpRight,
} from "lucide-react";
import { Textarea } from "@/components/ui/Textarea";
import { Field, Input } from "@/components/ui/Input";
import { SmartBack } from "@/components/ui/BackButton";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import {
  OverflowMenu,
  OVERFLOW_ITEM,
  OVERFLOW_ITEM_DANGER,
} from "@/components/ui/OverflowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";
import { stampedAt } from "@/lib/performanceShared";
import type {
  DocCategory,
  SolutionDoc,
  SolutionRequest,
} from "@/lib/solutioning";
import { KIND_META, KindChip, StatusPill } from "./bits";
import {
  DELIVERABLE_STATUSES,
  REQUEST_PRIORITIES,
} from "@/lib/solutioning";

/* Priority is the one place a red/amber/green scale IS the meaning — it is a
   ranking of urgency, not an identity. */
const PRIORITY_TONE: Record<string, string> = {
  High: "#B42318",
  Medium: "#B54708",
  Low: "var(--ink-teal-deep)",
};

/* The deliverable's own six states, walking from not-started to out-the-door.
   Cancelled is the only red: it is the one that ends the work. */
const DELIVERABLE_TONE: Record<string, string> = {
  Draft: "#64748B",
  "In progress": "var(--ink-violet)",
  "Ready for review": "var(--ink-bright-blue)",
  Finalized: "var(--ink-green)",
  "Submitted to customer": "var(--ink-teal-deep)",
  Cancelled: "#B42318",
};
import { NeededByTimeline } from "@/components/solutioning/NeededByTimeline";
import { MaterialViewer } from "@/components/offerings/MaterialViewer";
import { MaterialPeek } from "@/components/offerings/MaterialPeek";
import {
} from "@/components/solutioning/recordActions";
import { formatFromFilename } from "@/lib/offeringMaterials";
import type { OfferingMaterial } from "@/lib/offeringMaterials";
import { tint } from "@/lib/tint";

/**
 * Which mark a timeline event wears, read off the sentence the store wrote.
 * Matching on words rather than a stored kind because the log predates this
 * timeline — history already in the database gets the right mark too.
 */
/** Shared with the module's row-fold, so the two timelines cannot disagree. */
export function timelineMark(what: string): { icon: LucideIcon; color: string } {
  const w = what.toLowerCase();
  if (w.startsWith("requested")) return { icon: ClipboardList, color: "var(--ink-bright-blue)" };
  if (w.startsWith("picked it up") || w.startsWith("took this up"))
    return { icon: Hand, color: "#4338CA" };
  if (w.startsWith("started this") || w.startsWith("created this"))
    return { icon: Hand, color: "#4338CA" };
  if (w.startsWith("copied ")) return { icon: ClipboardList, color: "#0891B2" };
  if (w.startsWith("handed it back") || w.startsWith("took it off"))
    return { icon: Undo2, color: "var(--ink-amber)" };
  if (w.includes("completed")) return { icon: CheckCircle2, color: "#16A34A" };
  if (w.startsWith("reopened")) return { icon: RotateCcw, color: "var(--ink-violet-soft)" };
  if (w.startsWith("added")) return { icon: FilePlus2, color: "#0891B2" };
  if (w.startsWith("linked")) return { icon: Link2, color: "#0891B2" };
  if (w.startsWith("removed") || w.includes("deleted"))
    return { icon: Trash2, color: "#DC2626" };
  if (w.startsWith("assigned")) return { icon: UserRound, color: "var(--ink-violet-soft)" };
  return { icon: FileText, color: "#64748B" };
}


/**
 * ONE REQUEST, IN THE OFFERING PAGE'S OWN CLOTHES (Anir, Aug 24: "when I go
 * to the actual page, make it resemble the offerings page — when I click on an
 * offering, I think it looks pretty. It's a pretty similar UI").
 *
 * Same skeleton, deliberately: icon tile + big title with the actions on the
 * right, a full-width chip row underneath, the tab bar with counts (zero says
 * zero, the offering rule), and an Overview whose main column is icon-headed
 * sections beside a 340px rail of cards. The four document categories Suren
 * named — "customer documents, work in progress documents, final deliverables,
 * and analysis" — are the other tabs, each a page of its own like Sales
 * Materials is on an offering.
 */

const DOC_TABS: {
  key: DocCategory;
  label: string;
  hint: string;
  /** An example of the thing, so the dialog cannot be mistaken for another
   *  one (Anir, Aug 28: "can you customise this a little bit, because I don't
   *  know if I'm on analysis or deliverables or documents"). Four dialogs that
   *  differed only in a title bar read as one dialog. */
  example: string;
}[] = [
  {
    key: "customer",
    label: "Customer documents",
    hint: "Anything the customer sent us. Their RFP pack and their requirements go here.",
    example: "RFP package from the customer",
  },
  {
    key: "working",
    label: "Working documents",
    hint: "Drafts the team is still working on.",
    example: "Response draft v2",
  },
  {
    key: "final",
    label: "Final deliverables",
    hint: "What we actually sent or showed the customer.",
    example: "RFP response, final",
  },
  {
    key: "analysis",
    label: "Analysis",
    hint: "Our own notes on the customer documents, like a gap analysis.",
    example: "Requirements gap analysis",
  },
];

type Linkable = {
  id: string;
  ref: string;
  title: string;
  docs: {
    id: string;
    name: string;
    version: number;
    category: DocCategory;
    /** There is a file behind the name, so it can actually be opened. */
    hasFile?: boolean;
  }[];
};

/** The offering page's section heading, in miniature: icon in a blue-light
 *  square, a 16px title, a 12px description. */
function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
        <Icon size={16} strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <h2 className="text-[16px] font-semibold text-text-primary">{title}</h2>
        <p className="mt-0.5 text-[12px] text-text-tertiary">{description}</p>
      </div>
    </div>
  );
}

export function RequestDetail({
  request: initial,
  parent = null,
  meName,
  meRole,
  members,
  linkables,
  may,
  children_ = [],
}: {
  request: SolutionRequest;
  /** The request this work came out of, when it came out of one. */
  parent?: { id: string; ref: string; title: string } | null;
  meName: string;
  meRole: string;
  members: string[];
  linkables: Linkable[];
  /** What the SERVER says this person may do here (SOL-026). */
  may: { create: boolean; remove: boolean };
  /** The submissions and presentations raised off this request (SOL-028). */
  children_?: {
    id: string;
    ref: string;
    title: string;
    type?: string;
    status: string;
    deliverableStatus?: string;
    owner?: string;
  }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [r, setR] = useState(initial);
  const [tab, setTab] = useState<"overview" | DocCategory>("overview");
  const [adding, setAdding] = useState(false);
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  /** The document open in the in-app viewer, if any. */
  const [viewing, setViewing] = useState<SolutionDoc | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  /* The one door to the facts on this record, so nothing on the header writes
     the moment it is brushed. */
  const [editing, setEditing] = useState(false);
  const [editPriority, setEditPriority] = useState("");
  const [editNeededBy, setEditNeededBy] = useState("");
  /* CLOSING A REQUEST ASKS FIRST (Anir, Aug 30: "when I click it, it should ask
     me for a pop-up just like hand it back, to confirm I want to mark it as
     complete"). It is the one action here that ends the record for everybody
     working it, and it was the only one that fired on a single click. */
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmRemoveDoc, setConfirmRemoveDoc] = useState<{ id: string; name: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);

  const managerial = meRole === "admin" || meRole === "bd_owner";
  /* A cancelled record is history: it stays readable and stops being editable,
     which is the whole point of cancelling rather than deleting (SOL-033). */
  const canWrite = r.status !== "cancelled";
  /* SOL-014: a deliverable counts as open until it is finalized, submitted or
     cancelled — "Finalized and Cancelled remain distinct outcomes", and both
     of them are outcomes. */
  const openChildren = children_.filter(
    (c) =>
      !["Finalized", "Submitted to customer", "Cancelled"].includes(
        c.deliverableStatus ?? ""
      ) && c.status !== "completed" && c.status !== "cancelled"
  );
  const fulfiller = managerial || meRole === "sol_member";
  const iRequested =
    r.requestedBy.trim().toLowerCase() === meName.trim().toLowerCase();
  const iOwn = (r.owner ?? "").trim().toLowerCase() === meName.trim().toLowerCase();
  const kindMeta = KIND_META[r.kind];
  const KindIcon = kindMeta.icon;
  const overdue =
    !!r.neededBy &&
    r.status !== "completed" &&
    r.neededBy < new Date().toISOString().slice(0, 10);

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch("/api/solutioning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, requestId: r.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        return false;
      }
      const next = data.state?.requests?.find(
        (x: SolutionRequest) => x.id === r.id
      );
      if (next) setR(next);
      /* AND THE LIST BEHIND THIS PAGE (Suren, Aug 28: "now I say mark it
         completed... if I go to this presentation it just disappears, man...
         maybe I have to refresh — now it shows up").

         This page updated its own copy and nothing else. The list it was
         opened from is server-rendered, so going back replayed the version
         from before the change: the record was missing, or still showed the
         status it had a minute ago, until the browser was reloaded by hand.
         Every action here changes what that list should say, so the server
         data is re-fetched after each one. */
      router.refresh();
      return true;
    } catch {
      toast("That didn't save.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Create a NEW item (a submission or a presentation), rather than acting on
   *  this one — so it must not carry this request's id as the target. */
  async function create(
    body: Record<string, unknown>
  ): Promise<SolutionRequest | null> {
    setBusy(true);
    try {
      const res = await fetch("/api/solutioning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "create", ...body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        return null;
      }
      toast(`${data.request.ref} created.`);
      /* AND THE PAGE BEHIND IT (Anir, Aug 28: "I had to keep reloading
         whenever I added something new"). `post` already refreshed; this
         path did not, so a submission created from a request appeared only
         after a manual reload. */
      router.refresh();
      return data.request as SolutionRequest;
    } catch {
      toast("That didn't save.", "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  /* A REQUEST CARRIES ONLY ITS INPUTS (Suren, Aug 27: "at the time of
     requests, only customer documents are there, some analysis documents...
     when I look at the request, I don't want to see everything. When I look
     at a submission, I need to see working documents, final results, and
     everything"). Working documents and final deliverables belong to the
     submission or presentation that fulfils the request, so a request shows
     two tabs and the work shows four. */
  const visibleTabs =
    r.type === "request"
      ? DOC_TABS.filter((t) => t.key === "customer" || t.key === "analysis")
      : DOC_TABS;
  const docs = tab === "overview" ? [] : r.docs.filter((d) => d.category === tab);
  const hint = DOC_TABS.find((t) => t.key === tab)?.hint;

  return (
    <div>
      {/* THE WAY BACK NAMES THE ROOM YOU CAME FROM (Suren, Aug 28: "when I go
          and click on this, it should not say 'all requests'. It's all
          submissions"). Every record wore "All requests" whatever it was, so
          a submission offered to take you back to a list it is not on. */}
      <SmartBack
        fallback={
          r.type === "submission"
            ? "/solutioning?tab=submissions"
            : r.type === "presentation"
              ? "/solutioning?tab=presentations"
              : "/solutioning"
        }
        className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary"
      >
        <ArrowLeft size={15} strokeWidth={1.8} />{" "}
        {r.type === "submission"
          ? "All submissions"
          : r.type === "presentation"
            ? "All presentations"
            : "All requests"}
      </SmartBack>

      {/* ------------- header: identity left, primary actions right --------- */}
      <div className="rise-in flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <h1 className="flex min-w-0 items-center gap-3 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-text-primary">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ background: tint(kindMeta.color, 8), color: kindMeta.color }}
          >
            <KindIcon size={20} strokeWidth={1.9} />
          </span>
          <span className="min-w-0 break-words">{r.title}</span>
        </h1>

        {/* ONE OBVIOUS NEXT STEP, THE REST BEHIND A "···".
            Anir, Sep 1: "There are so many buttons here. Do we need all these?
            Be honest."

            Honestly: each was correctly gated, and he still saw five, because
            he was the admin AND the requester AND it was unowned AND unfinished
            — every branch fired at once. Correct, and still wrong to look at.
            Two filled blue buttons competed for "the thing to do", and Delete
            sat at the same weight as everyday work.

            Nothing is taken away. Whatever a person could reach before, they
            reach now; the header just states its one next step and puts the
            rest one click down. */}
        {(() => {
          const mayCreateWork =
            r.type === "request" &&
            r.status !== "completed" &&
            r.status !== "cancelled" &&
            /* SOL-026: creating the work is an owner's write, and the route
               refuses anyone else. */
            may.create &&
            (r.kind === "submission" || r.kind === "presentation") &&
            /* ONE ASK, ONE PIECE OF WORK. Taking a request up CREATES the
               submission — that is what Suren asked for on Aug 28 ("when I say
               'pick it up,' it has to create a submission") and lib/solutioning
               does it. This header did not know that, so the moment you took a
               request up it offered to create the very thing the pick-up had
               just made, and pressing it produced a second one against the same
               ask. Two clicks anyone would make in order, one after the other,
               and a duplicate deliverable at the end of them.
               openChildren is the live work already raised off this request. */
            openChildren.length === 0;
          const mayTakeUp = !r.owner && r.status !== "completed" && fulfiller;
          const mayHandBack = !!r.owner && r.status !== "completed" && iOwn;
          const mayComplete =
            r.status !== "completed" &&
            r.status !== "cancelled" &&
            (iRequested || managerial);
          const mayReopen =
            (r.status === "completed" && (iRequested || managerial)) ||
            (r.status === "cancelled" && (iRequested || iOwn || managerial));
          const mayCancel =
            r.status !== "cancelled" &&
            r.status !== "completed" &&
            (iRequested || iOwn || managerial);
          const mayEdit = canWrite && (iRequested || iOwn || managerial);
          const mayDelete =
            may.remove &&
            (meRole === "admin" || (iRequested && r.status === "initiated"));

          const createWork = async () => {
            const made = await create({
              type: r.kind === "submission" ? "submission" : "presentation",
              kind: r.kind,
              requestId: r.id,
              title: r.title,
              customer: r.customer,
              ...(r.customerId ? { customerId: r.customerId } : {}),
              ...(r.subtype ? { subtype: r.subtype } : {}),
              ...(r.neededBy ? { neededBy: r.neededBy } : {}),
              opportunityIds: r.opportunityIds,
              opportunityLabels: r.opportunityLabels,
              contactIds: r.contactIds,
              contactNames: r.contactNames,
            });
            if (made) router.push(`/solutioning/${made.id}`);
          };
          const openEdit = () => {
            setEditPriority(r.priority ?? "");
            setEditNeededBy(r.neededBy ?? "");
            setEditing(true);
          };

          /* THE PRIMARY IS WHATEVER THIS RECORD IS WAITING ON. Nobody has it
             yet, so taking it up comes before building the thing; once
             somebody owns it, building the thing is the job. */
          /* Whatever the pick-up made, or somebody made earlier: the header
             sends you to it rather than pretending it is not there. */
          const existingWork =
            r.type === "request" && openChildren.length > 0 ? openChildren[0] : null;
          const primary = mayTakeUp
            ? { label: "Take this up", icon: Hand, run: () => post({ op: "pick-up" }) }
            : existingWork
              ? {
                  label: `Open ${existingWork.ref}`,
                  icon: ArrowUpRight,
                  run: async () => router.push(`/solutioning/${existingWork.id}`),
                }
            : mayCreateWork
              ? {
                  label: `Create ${r.kind === "submission" ? "submission" : "presentation"}`,
                  icon: Plus,
                  run: createWork,
                }
              : mayReopen
                ? { label: "Reopen", icon: RotateCcw, run: () => post({ op: "reopen" }) }
                : null;

          /* Anything the primary did not take. */
          const menu: React.ReactNode[] = [];
          if (mayEdit)
            menu.push(
              <button key="edit" type="button" disabled={busy} onClick={openEdit} className={OVERFLOW_ITEM}>
                <Pencil size={14} strokeWidth={2.2} /> Edit
              </button>
            );
          if (mayCreateWork && primary?.label !== `Create ${r.kind === "submission" ? "submission" : "presentation"}`)
            menu.push(
              <button key="create" type="button" disabled={busy} onClick={() => void createWork()} className={OVERFLOW_ITEM}>
                <Plus size={14} strokeWidth={2.2} />
                Create {r.kind === "submission" ? "submission" : "presentation"}
              </button>
            );
          if (mayHandBack)
            menu.push(
              <button key="release" type="button" disabled={busy} onClick={() => void post({ op: "release" })} className={OVERFLOW_ITEM}>
                <Undo2 size={14} strokeWidth={2.2} /> Hand it back
              </button>
            );
          if (mayComplete)
            menu.push(
              <button
                key="complete"
                type="button"
                disabled={busy}
                title={iRequested ? "You asked for this, so you close it" : `Closing on ${r.requestedBy}'s behalf`}
                onClick={() => setConfirmComplete(true)}
                className={OVERFLOW_ITEM}
              >
                <Check size={14} strokeWidth={2.4} /> Mark it completed
              </button>
            );
          if (mayCancel)
            menu.push(
              <button
                key="cancel"
                type="button"
                disabled={busy}
                title="Stop this work and keep it in history"
                onClick={() => setConfirmCancel(true)}
                className={OVERFLOW_ITEM}
              >
                <Undo2 size={14} strokeWidth={2.2} /> Cancel it
              </button>
            );
          if (mayReopen && primary?.label !== "Reopen")
            menu.push(
              <button key="reopen" type="button" disabled={busy} onClick={() => void post({ op: "reopen" })} className={OVERFLOW_ITEM}>
                <RotateCcw size={14} strokeWidth={2.2} /> Reopen
              </button>
            );
          if (mayDelete)
            menu.push(
              <button
                key="delete"
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
                className={OVERFLOW_ITEM_DANGER}
              >
                <Trash2 size={14} strokeWidth={2.2} /> Delete this request
              </button>
            );

          if (!primary && menu.length === 0) return null;
          const PrimaryIcon = primary?.icon;
          return (
            <div className="flex shrink-0 items-center gap-2">
              {primary && PrimaryIcon && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void primary.run()}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <PrimaryIcon size={14} strokeWidth={2.4} />
                  {primary.label}
                </button>
              )}
              {menu.length > 0 && (
                <OverflowMenu label={`More actions for ${r.ref}`}>{menu}</OverflowMenu>
              )}
            </div>
          );
        })()}
      </div>

      {/* The tags own their own line, the offering rule (Anir, Aug 8).
          GROUPED, NOT FIVE PILLS IN A ROW (Anir, Aug 26: "this doesn't look
          good at the top. Those five stats are just back-to-back"). Three
          things are being said and they are not the same kind of thing: which
          request this is, what it is, and where it stands. A hairline between
          each group gives the row a rhythm, and the date — the only one that
          is about time — sits on the far right where a due date belongs. */}
      <div className="rise-in mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className="tnum inline-flex items-center rounded-full bg-surface px-2.5 py-1 text-[11.5px] font-bold text-text-secondary">
          {r.ref}
        </span>

        <span aria-hidden="true" className="h-4 w-px bg-border-light" />

        <span className="flex flex-wrap items-center gap-1.5">
          <KindChip kind={r.kind} />
          {r.subtype && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-light px-2.5 py-1 text-[12px] font-medium text-blue-primary">
              {r.subtype}
            </span>
          )}
        </span>

        <span aria-hidden="true" className="h-4 w-px bg-border-light" />

        <StatusPill status={r.status} />

        {/* THE DELIVERABLE'S OWN STATUS (SOL-019 and SOL-021), which is not the
            request's. "Changing Submission status does not automatically change
            the parent Request status or another deliverable's status." So it
            sits beside the request pill rather than replacing it, and only on
            the things that have one. */}
        {r.type !== "request" && canWrite && (
          /* The app's own picker, not a browser select. A native dropdown
             renders as the operating system's grey list — which is how the
             priority control ended up looking nothing like the coloured pills
             either side of it (Anir, Aug 31: "that definitely has to look
             better"). */
          <ColorSelect
            value={r.deliverableStatus ?? "Draft"}
            onChange={(v) => void post({ op: "set-deliverable-status", status: v })}
            ariaLabel="Deliverable status"
            minWidth={186}
            options={DELIVERABLE_STATUSES.map((x) => ({
              value: x,
              label: x,
              color: DELIVERABLE_TONE[x],
              icon: FileText,
            }))}
          />
        )}

        {/* PRIORITY IS A FACT HERE, NOT A CONTROL (Anir, Sep 1: "for the
            high-priority thing, you can't just be a dropdown here. Where's the
            edit stuff? There's no edit button or anything... I don't want it
            to just be a dropdown that anyone can change").

            It sat among five read-only chips looking exactly like them and
            wrote the moment you touched it — the timeline above already shows
            "Priority set to High" and "Priority cleared" a minute apart, which
            is somebody discovering that by accident. A chip now, changed
            through Edit like every other fact on the record.

            SOL-012 still lists it as mandatory metadata; what changed is how
            it is reached, not whether it exists. */}
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
          style={{
            background: tint(r.priority ? PRIORITY_TONE[r.priority] : "#64748B", 8),
            color: r.priority ? PRIORITY_TONE[r.priority] : "#64748B",
          }}
        >
          <Flag size={12} strokeWidth={2.4} />
          {r.priority ? `${r.priority} priority` : "Priority not set"}
        </span>

        {/* WHERE THIS CAME FROM (Suren, Aug 26: "you can say the submission is
            related to a request, but even without a request, a submission can
            be created"). Only drawn when there IS one — absence is normal, not
            a gap to apologise for. */}
        {parent && (
          <Link
            href={`/solutioning/${parent.id}`}
            title={parent.title}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[12px] font-medium text-text-secondary transition-colors hover:bg-blue-light hover:text-blue-primary"
          >
            <Link2 size={12} strokeWidth={2} />
            from {parent.ref}
          </Link>
        )}

        {r.neededBy && (
          <span
            className={cn(
              "tnum ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold",
              overdue
                ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--status-red)]"
                : "bg-surface text-text-secondary"
            )}
          >
            <CalendarDays size={12} strokeWidth={2} />
            needed by {formatDate(r.neededBy)}
            {overdue ? " · overdue" : ""}
          </span>
        )}
      </div>
      <p className="rise-in mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-text-tertiary">
        Requested by
        <span className="inline-flex items-center gap-1 font-semibold text-text-secondary">
          <Avatar name={r.requestedBy} className="h-[16px] w-[16px] text-[6px]" />
          {r.requestedBy}
        </span>
        <span suppressHydrationWarning>on {stampedAt(r.requestedAt)}</span>
      </p>

      {/* ------------------- the tab bar, offering-styled ------------------- */}
      <div
        role="tablist"
        aria-label="Request sections"
        className="rise-in mt-6 flex gap-8 overflow-x-auto border-b border-border-light"
      >
        {[
          { key: "overview" as const, label: "Overview" },
          ...visibleTabs.map((t) => ({
            key: t.key,
            // The count is always visible, zero included — the offering rule.
            label: `${t.label} (${r.docs.filter((d) => d.category === t.key).length})`,
          })),
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key as typeof tab);
              setAdding(false);
            }}
            className={cn(
              "-mb-px cursor-pointer whitespace-nowrap border-b-2 pb-3 text-[14px] transition-colors",
              tab === t.key
                ? "border-blue-primary font-semibold text-blue-primary"
                : "border-transparent font-medium text-text-secondary hover:text-text-primary"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* ------------------------------------------------ MAIN column */}
          {/* KEYED ON THE TAB, WHICH IS WHAT MAKES IT ANIMATE AT ALL
              (Suren, Aug 28: "add premium animations when I switch between").
              The .tab-panel class was here from the start and did nothing on a
              switch: React kept the same node, and a CSS animation only runs
              when an element mounts. The key forces the remount the class
              always assumed. */}
          {/* The key is what makes the animation replay, but these two panels
              are SIBLINGS — keying both on `tab` gave React two children keyed
              "overview" and it warned that one may be dropped. Prefixed, so
              each still remounts on a switch and neither collides. */}
          <div key={`main-${tab}`} className="tab-panel tab-panel-stagger">
            <section className="border-b border-border-light pb-7">
              <SectionHeading
                icon={FileText}
                title="What they asked for"
                description="The brief the requester wrote for the Solutioning team."
              />
              <p className="mt-4 max-w-[680px] pl-11 text-[13.5px] leading-relaxed text-text-secondary">
                {r.details || "No details written on the request."}
              </p>
            </section>

            <section className="border-b border-border-light py-7">
              <SectionHeading
                icon={Building2}
                title="Against"
                description="The customer, and the opportunities and contacts this is for."
              />
              <div className="mt-4 space-y-2.5 pl-11">
                <p className="flex items-center gap-2 text-[13.5px] font-semibold text-text-primary">
                  <CompanyLogo name={r.customer} className="h-6 w-6 text-[8px]" />
                  {r.customer}
                </p>
                {r.opportunityLabels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.opportunityLabels.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-light px-2.5 py-1 text-[12px] font-medium text-blue-primary"
                      >
                        <ListChecks size={12} strokeWidth={2} />
                        {label}
                      </span>
                    ))}
                  </div>
                )}
                {r.contactNames.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {r.contactNames.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[12px] font-medium text-text-primary"
                      >
                        <Avatar name={name} className="h-[16px] w-[16px] text-[6px]" />
                        {name}
                      </span>
                    ))}
                  </div>
                )}
                {r.opportunityLabels.length + r.contactNames.length === 0 && (
                  <p className="text-[12.5px] text-text-tertiary">
                    The customer itself, no specific opportunity or contact.
                  </p>
                )}
              </div>
            </section>

            {/* WHAT CAME OUT OF THIS REQUEST (SOL-028).
                "Opening a Solutioning Request shows... child deliverables...
                in one connected view." A request that has spawned three
                submissions said so nowhere: you had to go back to the list and
                notice the parent reference on each one. */}
            {children_.length > 0 && (
              <section className="border-b border-border-light py-7">
                <SectionHeading
                  icon={FilePlus2}
                  title={`Work raised off this (${children_.length})`}
                  description="Each one has its own owner, status and documents."
                />
                <div className="mt-4 space-y-2 pl-11">
                  {children_.map((c) => (
                    <Link
                      key={c.id}
                      href={`/solutioning/${c.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border-light bg-white px-3.5 py-2.5 transition-colors hover:border-blue-primary"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-text-primary">
                          {c.title}
                        </span>
                        <span className="tnum block text-[11.5px] text-text-tertiary">
                          {c.ref}
                          {c.owner ? ` · ${c.owner}` : " · nobody on it yet"}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-text-secondary">
                        {c.deliverableStatus ?? c.status.replace(/_/g, " ")}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* WHO IS ACCOUNTABLE, DIVISION BY DIVISION.
                Manoj's Pack 1, SOL-010: "Within a multi-Division Solutioning
                Request, create one internal accountability workstream for each
                represented Division... The customer-facing request remains a
                single Solutioning Request."

                The divisions themselves are derived from the linked
                opportunities and their offerings (SOL-007) — nobody types
                them. Each carries an accountable lead (SOL-009), the one
                person doing the work, and everyone supporting it (SOL-011). */}
            {(r.divisions ?? []).length > 0 && (
              <section className="border-b border-border-light py-7">
                <SectionHeading
                  icon={ListChecks}
                  title={`Divisions and who owns them (${(r.divisions ?? []).length})`}
                  description="These come from the opportunities on this request. Each one has a lead who is accountable for it."
                />
                <div className="mt-4 space-y-2.5 pl-11">
                  {(r.divisions ?? []).map((division) => {
                    const w = (r.workstreams ?? []).find(
                      (x) => x.division === division
                    );
                    return (
                      <div
                        key={division}
                        className="rounded-xl border border-border-light bg-white p-4"
                      >
                        <p className="text-[13.5px] font-semibold text-text-primary">
                          {division}
                        </p>
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <PersonPick
                            label="Solutioning lead"
                            hint="Accountable for this division"
                            value={w?.lead ?? ""}
                            members={members}
                            disabled={busy || !canWrite}
                            onPick={(v) =>
                              post({ op: "set-workstream", division, lead: v })
                            }
                          />
                          <PersonPick
                            label="Primary assignee"
                            hint="Doing the work"
                            value={w?.primaryAssignee ?? ""}
                            members={members}
                            disabled={busy || !canWrite}
                            onPick={(v) =>
                              post({
                                op: "set-workstream",
                                division,
                                primaryAssignee: v,
                              })
                            }
                          />
                          <PersonPick
                            label="Add a contributor"
                            hint="Supporting the work"
                            value=""
                            members={members.filter(
                              (m) =>
                                m !== w?.primaryAssignee &&
                                !(w?.contributors ?? []).includes(m)
                            )}
                            disabled={busy || !canWrite}
                            onPick={(v) =>
                              v
                                ? post({
                                    op: "set-workstream",
                                    division,
                                    contributors: [...(w?.contributors ?? []), v],
                                  })
                                : Promise.resolve(false)
                            }
                          />
                        </div>
                        {(w?.contributors ?? []).length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {(w?.contributors ?? []).map((c) => (
                              <span
                                key={c}
                                className="inline-flex items-center gap-1.5 rounded-full bg-surface py-1 pl-1.5 pr-1 text-[12px] font-medium text-text-primary"
                              >
                                <Avatar name={c} className="h-[16px] w-[16px] text-[6px]" />
                                {c}
                                {canWrite && (
                                  <button
                                    type="button"
                                    aria-label={`Remove ${c}`}
                                    disabled={busy}
                                    onClick={() =>
                                      post({
                                        op: "set-workstream",
                                        division,
                                        contributors: (w?.contributors ?? []).filter(
                                          (x) => x !== c
                                        ),
                                      })
                                    }
                                    className="cursor-pointer rounded-full p-0.5 text-error/70 transition-colors hover:bg-red-50 hover:text-error"
                                  >
                                    <Trash2 size={11} strokeWidth={2} />
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {r.kind === "meeting" && (
              <section className="border-b border-border-light py-7">
                <SectionHeading
                  icon={CalendarDays}
                  title="The meeting"
                  description="When it happens, and who is in the room."
                />
                <div className="mt-4 space-y-2.5 pl-11">
                  <p className="text-[13.5px] font-semibold text-text-primary">
                    <span suppressHydrationWarning>{r.meetingAt ? stampedAt(r.meetingAt) : "Not scheduled yet"}</span>
                  </p>
                  {r.attendees && r.attendees.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {r.attendees.map((a) => (
                        <span
                          key={a}
                          className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[12px] font-medium text-text-primary"
                        >
                          <Avatar name={a} className="h-[16px] w-[16px] text-[6px]" />
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="py-7">
              <SectionHeading
                icon={FileText}
                title="Documents"
                description={
                  r.type === "request"
                    ? "What the requester provided: their documents and your analysis."
                    : "What lives in each of the four tabs above."
                }
              />
              <div className="mt-4 grid max-w-[640px] grid-cols-2 gap-4 pl-11 sm:grid-cols-4">
                {visibleTabs.map((t) => {
                  const n = r.docs.filter((d) => d.category === t.key).length;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTab(t.key)}
                      className="cursor-pointer rounded-xl border border-border-light bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-card"
                    >
                      <p className="text-[20px] font-bold text-text-primary tnum">
                        {n}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-text-secondary">
                        {t.label}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* ------------------------------------------------- SIDE rail */}
          <div key={`rail-${tab}`} className="tab-panel tab-panel-stagger space-y-4">
            <SectionCard title="Owner" icon={UserRound}>
              {r.owner ? (
                <div className="flex items-center gap-2.5">
                  <Avatar name={r.owner} className="h-9 w-9 text-[11px]" />
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold text-text-primary">
                      {r.owner}
                    </span>
                    {r.pickedUpAt && (
                      <span className="block text-[11.5px] text-text-tertiary">
                        <span suppressHydrationWarning>picked it up {stampedAt(r.pickedUpAt)}</span>
                      </span>
                    )}
                  </span>
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-[12.5px] text-text-tertiary">
                  <CircleDashed size={14} strokeWidth={2} />
                  Waiting for the Solutioning team to take it up
                </p>
              )}
              {/* THE WAY BACK OUT (Anir, Aug 26: "I just picked this up, and I
                  don't know how to leave, because I don't want to pick it up.
                  If that's not a feature, then that's a problem"). It sits on
                  the owner card because that is the thing it undoes, and it is
                  quiet rather than a top-bar button: putting work down is a
                  correction, not one of the actions the page is FOR. */}
              {r.owner && r.status !== "completed" && (iOwn || managerial) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => post({ op: "release" })}
                  title={
                    iOwn
                      ? "Put it back so somebody else can take it up"
                      : `Take it off ${r.owner}`
                  }
                  className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[rgba(220,38,38,0.35)] px-3 py-2 text-[12.5px] font-semibold text-[color:var(--status-red)] transition-colors hover:border-[color:#DC2626] hover:bg-[rgba(220,38,38,0.07)] disabled:opacity-50"
                >
                  <Undo2 size={13.5} strokeWidth={2.2} />
                  {iOwn ? "Hand it back" : `Take it off ${r.owner.split(" ")[0]}`}
                </button>
              )}
              {r.completedAt && (
                <p className="mt-2.5 border-t border-border-light pt-2.5 text-[12px] text-text-secondary">
                  Completed by <b>{r.completedBy}</b>
                  <span className="block text-[11px] text-text-tertiary">
                    <span suppressHydrationWarning>{stampedAt(r.completedAt)}</span>
                  </span>
                </p>
              )}
            </SectionCard>

            {/* THE DEADLINE AS A DISTANCE, NOT A STRING (Anir, Aug 28: "for
                the needed by I want the timeline, so I want to visually see
                today, when the thing was requested, and when it is needed by.
                Just like the FDL components timeline"). */}
            {r.neededBy && (
              <SectionCard title="Where it stands" icon={CalendarDays}>
                <NeededByTimeline
                  requestedAt={r.requestedAt}
                  neededBy={r.neededBy}
                  done={r.status === "completed"}
                />
              </SectionCard>
            )}

            <SectionCard title="Timeline" icon={History}>
              {/* AN ACTUAL TIMELINE (Anir, Aug 27: "this has to be an actual
                  fucking timeline"). It was six identical blue documents in a
                  list. A timeline has a spine, and each event wears its own
                  mark: what KIND of thing happened is visible before a single
                  word is read. Green only for completion and red only for
                  removals — the reserved meanings. */}
              {/* THE TIMELINE IS A WINDOW, NOT A LEDGER THAT GROWS (Suren,
                  Aug 28: "this thing's getting longer and longer and longer,
                  right? The timeline has to be stuck there, and then obviously
                  I can scroll inside").

                  max-h alone was not enough: the card around it had no height
                  of its own, so a hundred entries still pushed the comment box
                  and everything under it off the page. A FIXED height pins the
                  card wherever it sits and scrolls the events inside it. */}
              {/* ONE MINUTE OF FIDDLING IS ONE ENTRY, NOT SIX (Suren, Aug 28:
                  "this should show like 5 not 7").

                  Toggling completed → reopened → completed while looking at a
                  record is one person making up their mind, and it wrote a row
                  per click: the same two lines three times over, stamped to
                  the same minute, burying the two things that actually
                  happened that day.

                  So a repeat of the same action, by the same person, inside
                  the same minute shows once. A COMMENT is never folded — the
                  same sentence typed twice is two things somebody said. */}
              {/* IT TAKES THE ROOM IT NEEDS, AND NO MORE (Anir, Aug 28: "why
                  is it so big? This should only take up five or six, and then
                  it should be scrolling within that").

                  A FIXED 360px pinned the card so a hundred entries could not
                  push the comment box off the page — which was the right
                  problem to solve and the wrong way to solve it: five entries
                  then reserved the same 360px and left a hand's width of white
                  above the comment button. max-height does both jobs: it
                  shrinks to five rows and it still caps and scrolls at a
                  hundred. Roughly six rows at 52px each. */}
              <ol className="max-h-[320px] overflow-y-auto pr-1">
                {[...r.activity]
                  .reverse()
                  .filter((a, i, arr) =>
                    a.comment
                      ? true
                      : !arr.some(
                          (b, j) =>
                            j < i &&
                            !b.comment &&
                            b.what === a.what &&
                            b.by === a.by &&
                            b.at.slice(0, 16) === a.at.slice(0, 16)
                        )
                  )
                  .map((a, i, all) => {
                  /* A COMMENT IS SOMEBODY TALKING, AN EVENT IS THE RECORD
                     MOVING. Same spine, different voice: a comment wears a
                     speech mark and its words are set as prose, so a sentence
                     from a person is never mistaken for something the app
                     did. */
                  const mark = a.comment
                    ? { icon: MessageSquare, color: "var(--ink-bright-blue)" }
                    : timelineMark(a.what);
                  const MarkIcon = mark.icon;
                  return (
                    <li key={`${a.at}-${i}`} className="relative pl-9 pb-4 last:pb-0">
                      {i < all.length - 1 && (
                        <span
                          aria-hidden="true"
                          className="absolute left-[12px] top-[26px] bottom-0 w-[2px] rounded bg-border-light"
                        />
                      )}
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-0 grid h-[26px] w-[26px] place-items-center rounded-full"
                        style={{ background: tint(mark.color, 10), color: mark.color }}
                      >
                        <MarkIcon size={13} strokeWidth={2.3} />
                      </span>
                      <span className="block min-w-0">
                        <span
                          className={cn(
                            "block whitespace-pre-wrap text-[12.5px] leading-snug",
                            a.comment
                              ? "rounded-lg bg-surface px-2.5 py-2 text-text-primary"
                              : "font-semibold text-text-primary"
                          )}
                        >
                          {a.what}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-text-tertiary">
                          <Avatar name={a.by} className="h-[15px] w-[15px] text-[6px]" />
                          <span className="font-medium text-text-secondary">{a.by}</span>
                          <span aria-hidden="true">·</span>
                          <span suppressHydrationWarning>{stampedAt(a.at)}</span>
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>

              {/* ANYONE WHO CAN SEE IT CAN SAY SOMETHING (Suren, Aug 28: "like
                  how you have a comment section when you hand it back,
                  somebody comes and provides some comments... anyone can
                  comment, whoever has access to this"). Deliberately available
                  on a completed record too: the moment work is handed back is
                  exactly when the person who asked for it has something to
                  say. */}
              {/* A BUTTON, NOT A BOX SITTING THERE (Anir, Aug 28: "super
                  fucking ugly ui here should just be a button to popup"). An
                  always-open textarea took a third of the card to say nothing,
                  and it sat under a timeline that is already scrolling. */}
              <div className="mt-3 border-t border-border-light pt-3">
                <button
                  type="button"
                  onClick={() => setCommenting(true)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-2 text-[12.5px] font-semibold text-blue-primary transition-colors hover:border-blue-subtle hover:bg-blue-light"
                >
                  <MessageSquare size={13.5} strokeWidth={2.2} />
                  Add a comment
                </button>
              </div>
            </SectionCard>
          </div>
        </div>
      ) : (
        /* -------------------------- one document tab, a page of its own */
        <div key={tab} className="tab-panel tab-panel-stagger mt-6">
          <div className="flex items-start justify-between gap-4">
            <SectionHeading
              icon={FileText}
              title={`${DOC_TABS.find((t) => t.key === tab)?.label} (${docs.length})`}
              description={hint ?? ""}
            />
            {r.status !== "completed" && !adding && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Plus size={14} strokeWidth={2.4} /> Add a document
              </button>
            )}
          </div>

          {/* A POPUP, like every other add flow in the app (Anir, Aug 27:
              "what the fuck is this ui — this should be a popup"). The form
              used to unfold inline and shove the list down under it. */}
          {r.status !== "completed" && adding && (
            <Modal
              open
              onClose={() => setAdding(false)}
              size="wide"
              title={`Add to ${(DOC_TABS.find((t) => t.key === tab)?.label ?? "documents").toLowerCase()}`}
            >
              <AddDocForm
                tabLabel={DOC_TABS.find((t) => t.key === tab)?.label ?? ""}
                tabHint={DOC_TABS.find((t) => t.key === tab)?.hint ?? ""}
                tabExample={
                  DOC_TABS.find((t) => t.key === tab)?.example ?? "Document name"
                }
                requestId={r.id}
                members={members}
                linkables={linkables}
                busy={busy}
                onCancel={() => setAdding(false)}
                onAdd={async (input) => {
                  const ok = await post({ op: "add-doc", category: tab, ...input });
                  if (ok) setAdding(false);
                  return ok;
                }}
              />
            </Modal>
          )}

          {docs.length === 0 ? (
            <p className="mt-6 rounded-xl bg-surface/60 px-4 py-10 text-center text-[13px] text-text-tertiary">
              Nothing in{" "}
              {DOC_TABS.find((t) => t.key === tab)?.label.toLowerCase()} yet.
              {r.status !== "completed"
                ? " Add the first one above."
                : ""}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border-light rounded-xl border border-border-light bg-white">
              {docs.map((d) => (
                <DocRow
                  key={d.id}
                  doc={d}
                  requestId={r.id}
                  onOpen={() => setViewing(d)}
                  members={members}
                  canRemove={
                    (managerial ||
                      iOwn ||
                      d.addedBy.trim().toLowerCase() ===
                        meName.trim().toLowerCase())
                  }
                  completed={r.status === "completed"}
                  busy={busy}
                  onAssign={(who) =>
                    post({ op: "assign-doc", docId: d.id, assignedTo: who })
                  }
                  onRemove={() => setConfirmRemoveDoc({ id: d.id, name: d.name })}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {viewing?.docsPath && (
        /* THE SAME VIEWER THE SALES MATERIALS USE. Word, Excel, PowerPoint,
           PDF and video all render the way they do there, because it is the
           same component reading through the same renderer — only the endpoint
           differs. */
        <MaterialViewer
          offeringId=""
          offeringName={r.customer || "This request"}
          material={asMaterial(viewing)}
          path={viewing.docsPath}
          label={viewing.name}
          downloadUrl={solutioningDownloadUrl(r.id, viewing.id)}
          openInNewTabUrl={solutioningDownloadUrl(r.id, viewing.id)}
          previewUrl={solutioningPreviewUrl(r.id, viewing.id)}
          onClose={() => setViewing(null)}
        />
      )}

      {/* THE COMMENT POPUP. Deliberately available on a completed record too:
          the moment work is handed back is exactly when the person who asked
          for it has something to say. */}
      <Modal
        open={commenting}
        onClose={() => setCommenting(false)}
        title="Add a comment"
      >
        <Textarea
          rows={5}
          autoFocus
          value={comment}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            setComment(e.target.value)
          }
          placeholder="What the person picking this up next needs to know…"
          aria-label="Comment"
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setCommenting(false)}
            className="rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !comment.trim()}
            onClick={async () => {
              const text = comment.trim();
              if (!text) return;
              if (await post({ op: "comment", text })) {
                setComment("");
                setCommenting(false);
              }
            }}
            className="rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Comment
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmComplete}
        onClose={() => setConfirmComplete(false)}
        onConfirm={() => {
          setConfirmComplete(false);
          void post({ op: "complete" });
        }}
        busy={busy}
        tone="primary"
        title="Mark this completed?"
        body={
          <>
            <b>{r.title}</b> closes for everyone working it.
            {/* SOL-014: "If one of several required deliverables is still open,
                the request does not auto-complete... An authorized user can
                explicitly close the request where appropriate." So this warns
                and still lets them through — it is their call, made knowing
                what is unfinished, rather than a refusal on click. */}
            {openChildren.length > 0 && (
              <span className="mt-3 block rounded-lg border border-border-light bg-surface px-3 py-2.5 text-[12.5px] text-text-secondary">
                {openChildren.length === 1
                  ? "One deliverable is still open:"
                  : `${openChildren.length} deliverables are still open:`}{" "}
                <b className="text-text-primary">
                  {openChildren.map((c) => c.ref).join(", ")}
                </b>
                . Closing this does not close them.
              </span>
            )}
          </>
        }
        detail="It leaves the open list. You can reopen it later if something else comes up."
        confirmLabel="Yes, mark it completed"
      />

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => {
          void post({ op: "cancel", reason: cancelReason.trim() || undefined });
          setCancelReason("");
          setConfirmCancel(false);
        }}
        /* RED IS FOR WHAT CANNOT BE TAKEN BACK. Cancelling does not delete the
           record, but no code path brings it back: cancelRequest only ever
           sets status to "cancelled", reopenRequest returns early unless the
           status is "completed", and canWrite above turns the whole record
           read-only from then on. One-way door, so it keeps the red. */
        title={`Cancel ${r.ref}?`}
        body={
          <>
            The work on <b>{r.ref}</b> stops for good. Nothing is deleted, and
            it stays in the list marked Cancelled so people can see what
            happened to it. Nobody can change it after this.
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              placeholder="Why is it stopping? (optional, goes on the timeline)"
              className="mt-3 w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
            />
          </>
        }
        confirmLabel="Cancel it"
      />

      {/* EDITING THE FACTS, DELIBERATELY (Anir, Sep 1: "I don't want it to
          just be a dropdown that anyone can change"). Open it, change what you
          meant to change, save. Nothing on the header writes on touch. */}
      {editing && (
        <Modal
          open
          onClose={() => setEditing(false)}
          title={`Edit ${r.ref}`}
          size="default"
        >
          <div className="space-y-4">
            <label className="block">
              <span className="text-[12px] font-semibold text-text-primary">
                Priority
              </span>
              <span className="mt-1.5 block">
                <ColorSelect
                  value={editPriority}
                  onChange={setEditPriority}
                  ariaLabel="Priority"
                  minWidth={200}
                  options={[
                    { value: "", label: "Priority not set", color: "#64748B", icon: Flag },
                    ...REQUEST_PRIORITIES.map((x) => ({
                      value: x,
                      label: `${x} priority`,
                      color: PRIORITY_TONE[x],
                      icon: Flag,
                    })),
                  ]}
                />
              </span>
            </label>
            <label className="block">
              <span className="text-[12px] font-semibold text-text-primary">
                Needed by
              </span>
              <input
                type="date"
                value={editNeededBy}
                onChange={(e) => setEditNeededBy(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
              />
            </label>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="cursor-pointer rounded-lg border border-border-light bg-white px-4 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  /* Only what actually moved, so saving the dialog cannot
                     overwrite a field somebody else changed while it was
                     open — and each lands on the timeline under its own name. */
                  if (editPriority !== (r.priority ?? "")) {
                    await post({ op: "set-priority", priority: editPriority });
                  }
                  if (editNeededBy !== (r.neededBy ?? "")) {
                    await post({
                      op: "update",
                      patch: { neededBy: editNeededBy || null },
                    });
                  }
                  setEditing(false);
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-5 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Save changes
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={confirmRemoveDoc !== null}
        onClose={() => setConfirmRemoveDoc(null)}
        onConfirm={() => {
          if (confirmRemoveDoc) void post({ op: "remove-doc", docId: confirmRemoveDoc.id });
          setConfirmRemoveDoc(null);
        }}
        title="Remove this document?"
        body={<><b>{confirmRemoveDoc?.name}</b> comes off this request for everyone working on it. You would have to add it again.</>}
        confirmLabel="Remove it"
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          const ok = await post({ op: "delete" });
          if (ok) {
            toast(`${r.ref} deleted.`);
            router.push("/solutioning");
          }
        }}
        /* NAME THE THING BEING DELETED (Anir, Aug 28: "here I need the name,
           lol — the request id is just the id"). "Delete REQ-0003?" asks you
           to confirm against a reference number nobody carries in their head;
           the title is what tells you it is the right record. The ref stays,
           after it, for the person who does work by number. */
        title={`Delete "${r.title}"?`}
        body={`${r.ref} and every document on it go too. If another request borrowed one of these documents, it disappears from there as well.`}
        confirmLabel="Delete the request"
      />
    </div>
  );
}

/**
 * A SOLUTIONING DOCUMENT, WEARING A SALES MATERIAL'S CLOTHES.
 *
 * The viewer and the hover peek are the ones the sales-materials page uses, so
 * a document opens exactly the way a material does (Anir, Aug 26: "copy all
 * that shit. Every single part of it, like the preview, the hover"). They take
 * an OfferingMaterial; this is the same file described in that shape. No
 * folders — a request's four tabs already are the arrangement.
 */
function asMaterial(doc: SolutionDoc): OfferingMaterial {
  return {
    id: doc.id,
    kind: formatFromFilename(doc.fileName || doc.name),
    label: doc.name,
    url: doc.url ?? "",
    ...(doc.docsPath ? { docsPath: doc.docsPath } : {}),
  };
}

/** Where this request's files are read from — never an offering's route. */
const solutioningPreviewUrl =
  (requestId: string, docId: string) =>
  (_path: string, member: string | null) =>
    `/api/solutioning/preview?requestId=${encodeURIComponent(
      requestId
    )}&docId=${encodeURIComponent(docId)}${
      member ? `&member=${encodeURIComponent(member)}` : ""
    }`;

const solutioningDownloadUrl = (requestId: string, docId: string) =>
  `/api/solutioning/download?requestId=${encodeURIComponent(
    requestId
  )}&docId=${encodeURIComponent(docId)}`;

function DocRow({
  doc: d,
  members,
  canRemove,
  completed,
  busy,
  requestId,
  onOpen,
  onAssign,
  onRemove,
}: {
  doc: SolutionDoc;
  members: string[];
  canRemove: boolean;
  completed: boolean;
  busy: boolean;
  requestId: string;
  onOpen: () => void;
  onAssign: (who: string | null) => void;
  onRemove: () => void;
}) {
  /* A doc that IS a file opens in the app; one that is only a link can never
     do more than open somewhere else. */
  const isFile = !!d.docsPath;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            d.ref
              ? "bg-[rgba(13,148,136,0.1)] text-[color:#0D9488]"
              : "bg-blue-light text-blue-primary"
          )}
        >
          {d.ref ? (
            <Link2 size={14.5} strokeWidth={2} />
          ) : (
            <FileText size={14.5} strokeWidth={2} />
          )}
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            {isFile ? (
              /* HOVER TO SEE IT, CLICK TO OPEN IT — the sales-materials
                 behaviour, from the same two components. */
              <MaterialPeek
                material={asMaterial(d)}
                /* THE PAGE, NOT THE API — the card iframes this, so it must be
                   something that renders the document rather than the JSON the
                   preview endpoint returns (found in the browser, Aug 28: the
                   card opened onto `{"preview":{"kind":"native"…`). ?embed=1 is
                   the bare-document mode sales materials peek through. */
                previewUrl={`/solutioning/${encodeURIComponent(
                  requestId
                )}/documents/${encodeURIComponent(d.id)}?embed=1`}
              >
                <button
                  type="button"
                  onClick={onOpen}
                  className="min-w-0 cursor-pointer break-words text-left text-[13px] font-semibold text-text-primary underline-offset-2 transition-colors hover:text-blue-primary hover:underline"
                >
                  {d.name}
                </button>
              </MaterialPeek>
            ) : (
              <span className="min-w-0 break-words text-[13px] font-semibold text-text-primary">
                {d.name}
              </span>
            )}
            {!d.ref && (
              <span className="shrink-0 rounded-md bg-surface px-1.5 py-[1px] text-[10px] font-bold text-text-secondary tnum">
                v{d.version}
              </span>
            )}
            {d.ref && (
              <span className="shrink-0 rounded-md bg-[rgba(13,148,136,0.1)] px-1.5 py-[1px] text-[10px] font-bold text-[color:#0D9488]">
                linked
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-[11px] text-text-tertiary">
            added by {d.addedBy} · {stampedAt(d.addedAt)}
            {d.note ? ` · “${d.note}”` : ""}
          </span>
        </span>
      </span>

      {/* Who is working this document — what puts them "on the submission
          side" of the people counts. */}
      <span className="flex shrink-0 items-center gap-2">
        {!completed ? (
          <ColorSelect
            value={d.assignedTo ?? ""}
            onChange={(v) => onAssign(v || null)}
            ariaLabel={`Who is working on ${d.name}`}
            minWidth={150}
            dense
            options={[
              { value: "", label: "Nobody on it", color: "#64748B", icon: CircleDashed },
              ...members.map((m) => ({ value: m, label: m, avatarName: m })),
            ]}
          />
        ) : d.assignedTo ? (
          <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
            <Avatar name={d.assignedTo} className="h-5 w-5 text-[7px]" />
            {d.assignedTo}
          </span>
        ) : null}
        {d.url && (
          <a
            href={d.url}
            target="_blank"
            rel="noreferrer"
            title={`Open ${d.name}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-light bg-white text-text-tertiary transition-colors hover:border-blue-subtle hover:text-blue-primary"
          >
            <ExternalLink size={13.5} strokeWidth={2} />
          </a>
        )}
        {canRemove && !completed && (
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            aria-label={`Remove ${d.name}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--status-red)] transition-colors hover:bg-[rgba(220,38,38,0.10)] disabled:opacity-50"
          >
            <Trash2 size={13.5} strokeWidth={2} />
          </button>
        )}
      </span>
    </li>
  );
}

function AddDocForm({
  tabLabel,
  tabHint,
  tabExample,
  members,
  linkables,
  busy,
  requestId,
  onCancel,
  onAdd,
}: {
  tabLabel: string;
  tabHint: string;
  tabExample: string;
  members: string[];
  linkables: Linkable[];
  busy: boolean;
  requestId: string;
  onCancel: () => void;
  onAdd: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"new" | "link">("new");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [note, setNote] = useState("");
  /** Stated, not implied (Suren, Aug 27: "I need a version number also when
   *  you add the document"). Blank keeps the same-name auto numbering. */
  const [version, setVersion] = useState("1");
  const [refRequestId, setRefRequestId] = useState("");
  const [refDocId, setRefDocId] = useState("");
  /* THE FILE ITSELF, not a link to it somewhere else. */
  const [file, setFile] = useState<{ docsPath: string; fileName: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pickFile = async (chosen: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", chosen);
      const res = await fetch(
        `/api/solutioning/upload?requestId=${encodeURIComponent(requestId)}`,
        { method: "POST", body: form }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.docsPath) {
        setUploadError(data.error || "That file did not upload.");
        return;
      }
      setFile({ docsPath: data.docsPath, fileName: data.fileName });
      /* Name the document after the file unless somebody already typed one. */
      setName((current) => current || data.fileName.replace(/\.[^.]+$/, ""));
    } catch {
      setUploadError("That file did not upload.");
    } finally {
      setUploading(false);
    }
  };

  const home = linkables.find((l) => l.id === refRequestId) ?? null;
  const picked = home?.docs.find((d) => d.id === refDocId) ?? null;
  const refDoc = home?.docs.find((d) => d.id === refDocId) ?? null;

  return (
    /* THE DIALOG HOLDS ONE SIZE (Anir, Aug 28: "why is this popup small",
       and before that "the dimensions have to stay the same"). The two tabs
       hold very different amounts — a full upload form against a single line
       of "nothing to link yet" — so switching between them resized the whole
       popup under the cursor. A floor on the body means the shorter tab fills
       space that is already there. */
    <div className="space-y-3">
      {/* WHAT BELONGS IN THIS ONE, and only that (Anir, Aug 28: "you already
          have Add to Analysis — you don't need another analysis thing at the
          top").

          The first cut put the category in a bordered card with its name in
          bold, directly under a title bar that already said the same word. The
          sentence was the useful half; the name was the dialog title again,
          boxed. So it is one quiet line now, and the document-name placeholder
          carries the rest of the distinction. */}
      <p className="text-[12.5px] leading-relaxed text-text-secondary">
        {tabHint}
      </p>
      <div className="flex w-fit items-center gap-1 rounded-lg bg-surface p-1 text-[12px] font-semibold">
        <button
          type="button"
          onClick={() => setMode("new")}
          className={cn(
            "rounded-md px-2.5 py-1 transition-colors",
            mode === "new"
              ? "bg-white text-blue-primary shadow-card"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          New document
        </button>
        {/* "As part of a meeting a person can refer to a document that was
            created as part of a presentation request" — the link path. */}
        <button
          type="button"
          onClick={() => setMode("link")}
          className={cn(
            "rounded-md px-2.5 py-1 transition-colors",
            mode === "link"
              ? "bg-white text-blue-primary shadow-card"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          Link from another request
        </button>
      </div>

      <div className="min-h-[420px]">
      {mode === "new" ? (
        /* THE SALES MATERIALS SHAPE (Anir, Aug 28: "this is the worst UI I've
           ever seen. Make it look more like the Offering Sales Materials
           UI").

           It was a two-column grid of bare inputs whose only labels were
           their own placeholders, with the upload squeezed into a pill the
           size of a text field — so the primary action looked like the least
           important thing on the form and nothing said what anything was.

           Same order the materials dialog uses: the FILE first and large,
           because attaching one is the point, then what to call it, then the
           optional details. Real labels on everything. */
        <div className="space-y-3">
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-5 text-center transition-colors",
              file
                ? "border-blue-subtle bg-blue-light/30"
                : "border-border-light hover:border-blue-subtle hover:bg-blue-light/20",
              uploading && "opacity-60"
            )}
          >
            <input
              type="file"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (chosen) void pickFile(chosen);
                e.target.value = "";
              }}
            />
            {file ? (
              <>
                <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-text-primary">
                  <FileText size={15} strokeWidth={2} className="text-blue-primary" />
                  {file.fileName}
                </span>
                <span className="text-[11.5px] text-text-tertiary">
                  Click to replace, or{" "}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setFile(null);
                    }}
                    className="font-semibold text-[color:var(--ink-red)]"
                  >
                    remove it
                  </span>
                </span>
              </>
            ) : (
              <>
                <span className="text-[13.5px] font-semibold text-text-primary">
                  {uploading ? "Uploading…" : "Upload a file"}
                </span>
                <span className="text-[11.5px] text-text-tertiary">
                  It previews in the app the way a sales material does
                </span>
              </>
            )}
          </label>

          {uploadError && (
            <p className="text-[11.5px] font-medium text-[color:var(--status-red)]">
              {uploadError}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_96px]">
            <Field label="Document name">
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tabExample}
              />
            </Field>
            {/* The version, right beside the name it versions (Suren,
                Aug 27: "I need a version number also when you add the
                document"). */}
            <Field label="Version">
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                aria-label="Version number"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Who is working on it">
              <ColorSelect
                value={assignedTo}
                onChange={setAssignedTo}
                ariaLabel="Who is working on it"
                className="w-full"
                dense
                options={[
                  { value: "", label: "Nobody on it yet", color: "#64748B", icon: CircleDashed },
                  ...members.map((m) => ({ value: m, label: m, avatarName: m })),
                ]}
              />
            </Field>
            <Field label="Note">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>

          {!file && (
            <Field label="Or link to one that lives elsewhere">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://… SharePoint, Drive, anywhere"
              />
            </Field>
          )}
        </div>
      ) : linkables.length === 0 ? (
        /* A DESIGNED EMPTY STATE, NOT A VOID (Anir, Aug 28: "now this just
           looks weird"). Pinning the height stopped the dialog resizing, but
           wrapping one grey sentence in a dashed box the size of the whole
           form just made the emptiness the loudest thing on screen. Same
           EmptyState the rest of the app uses: a mark, a heading, a line, and
           nothing drawn around the space it does not need. */
        <div className="flex h-full items-center justify-center">
          <EmptyState
            icon={Link2}
            title="Nothing to link yet"
            description="Documents built on another request show up here. There are none on any other request so far."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ColorSelect
            value={refRequestId}
            onChange={(v) => {
              setRefRequestId(v);
              setRefDocId("");
            }}
            ariaLabel="Which request is it on"
            minWidth={220}
            searchable
            inlineDescription
            options={[
              ...(refRequestId
                ? []
                : [{ value: "", label: "Pick the request", color: "#64748B", icon: CircleDashed }]),
              /* HOW MANY DOCUMENTS ARE BEHIND EACH ONE, before it is picked
                 (Suren, Aug 28: "do that everywhere else this could be helpful
                 where the next step is dependent on the first dropdown having
                 data"). The picker beside this one is filled from this choice. */
              ...linkables.map((l) => ({
                value: l.id,
                label: `${l.ref} · ${l.title}`,
                color: "#0D9488",
                icon: Link2,
                description: `${l.docs.length} ${
                  l.docs.length === 1 ? "document" : "documents"
                }`,
                descriptionAccent: l.docs.length > 0,
              })),
            ]}
          />
          <ColorSelect
            value={refDocId}
            onChange={setRefDocId}
            ariaLabel="Which document"
            minWidth={200}
            options={[
              ...(refDocId
                ? []
                : [
                    {
                      value: "",
                      label: home ? "Pick the document" : "Pick the request first",
                      color: "#64748B",
                      icon: CircleDashed,
                    },
                  ]),
              ...(home?.docs ?? []).map((d) => ({
                value: d.id,
                label: `${d.name} v${d.version}`,
                color: "var(--ink-bright-blue)",
                icon: FileText,
              })),
            ]}
          />
          {/* LOOK AT IT BEFORE YOU LINK IT (Anir, Aug 28: "if I choose that
              document I should be able to like open it or something lol"). Two
              dropdowns and a note asked you to vouch for a file by its
              filename. It opens in a new tab rather than a viewer inside this
              dialog, because a viewer stacked on a dialog stacked on a page is
              three layers deep to close. */}
          {picked?.hasFile ? (
            <a
              href={solutioningDownloadUrl(refRequestId, picked.id)}
              target="_blank"
              rel="noreferrer"
              className="col-span-full inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface/50 px-3 py-2 text-[12.5px] transition-colors hover:border-blue-subtle hover:bg-blue-light/20 sm:w-fit"
            >
              <FileText size={14} strokeWidth={2} className="shrink-0 text-blue-primary" />
              <span className="min-w-0 truncate font-semibold text-text-primary">
                {picked.name} v{picked.version}
              </span>
              <span className="shrink-0 font-semibold text-blue-primary">
                Open it
              </span>
              <ExternalLink size={12} strokeWidth={2.2} className="shrink-0 text-blue-primary" />
            </a>
          ) : picked ? (
            /* A DOCUMENT CAN BE A NAME WITH NOTHING BEHIND IT. Rendering
               "Open it" on one of those sent the reader to a 404 — found in
               the browser, Aug 28, on the first document I tried. Say what
               it is instead of offering a door that does not open. */
            <span className="col-span-full inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface/50 px-3 py-2 text-[12.5px] sm:w-fit">
              <FileText size={14} strokeWidth={2} className="shrink-0 text-text-tertiary" />
              <span className="min-w-0 truncate font-semibold text-text-primary">
                {picked.name} v{picked.version}
              </span>
              <span className="shrink-0 text-text-tertiary">
                No file uploaded against this one
              </span>
            </span>
          ) : null}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why it's here (optional)"
            className="h-9 w-full rounded-lg border border-border-light bg-white px-3 text-[12.5px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus sm:col-span-2"
          />
        </div>
      )}

      </div>

      {/* CANCEL THEN PRIMARY, BOTTOM RIGHT (Anir, Aug 28: "why are the buttons
          on the left"). Every other dialog in the app ends this way; this one
          had them flush left in the reverse order. */}
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-border-light pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={
            busy ||
            uploading ||
            (mode === "new" ? !name.trim() : !refRequestId || !refDocId)
          }
          onClick={() =>
            onAdd(
              mode === "new"
                ? {
                    name: name.trim(),
                    version: Number(version) || 1,
                    url: file ? undefined : url.trim() || undefined,
                    docsPath: file?.docsPath,
                    fileName: file?.fileName,
                    assignedTo: assignedTo || undefined,
                    note: note.trim() || undefined,
                  }
                : {
                    name: refDoc?.name ?? "Linked document",
                    refRequestId,
                    refDocId,
                    note: note.trim() || undefined,
                  }
            )
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={14} strokeWidth={2.4} />
          Add to {tabLabel.toLowerCase()}
        </button>
      </div>
    </div>
  );
}

/**
 * ONE PERSON, PICKED FROM THE WORKSPACE.
 *
 * A plain select rather than a search box: a division has one lead and one
 * primary assignee, the list is the workspace, and a control that needs typing
 * before it shows you anything hides how few choices there really are.
 */
function PersonPick({
  label,
  hint,
  value,
  members,
  disabled,
  onPick,
}: {
  label: string;
  hint: string;
  value: string;
  members: string[];
  disabled: boolean;
  onPick: (v: string) => Promise<boolean> | void;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11.5px] font-semibold text-text-primary">
        {label}
      </span>
      <span className="block text-[11px] text-text-tertiary">{hint}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onPick(e.target.value)}
        className="mt-1.5 h-9 w-full cursor-pointer rounded-lg border border-border-light bg-white px-2 text-[12.5px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="">Nobody yet</option>
        {members.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </label>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CircleDashed,
  ExternalLink,
  FileText,
  Link2,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { stampedAt } from "@/lib/performanceShared";
import type {
  DocCategory,
  SolutionDoc,
  SolutionRequest,
} from "@/lib/solutioning";
import { KindChip, StatusPill } from "./bits";

/**
 * ONE REQUEST, WHOLE (Suren, Aug 24): the four document tabs — "customer
 * documents, work in progress documents, final deliverables, and analysis" —
 * with versions and a person on each document, the actions each side of the
 * flow owns, and the story down the right as a rail (the layout Anir chose for
 * the verify dialog the same day: "if I'm scrolling on the timeline, that's
 * the only place I'm scrolling").
 */

const TABS: { key: DocCategory; label: string; hint: string }[] = [
  {
    key: "customer",
    label: "Customer documents",
    hint: "What the customer gave us — the RFP package, their requirements",
  },
  {
    key: "working",
    label: "Working documents",
    hint: "Work in progress — drafts being built",
  },
  {
    key: "final",
    label: "Final deliverables",
    hint: "What was actually submitted or presented",
  },
  {
    key: "analysis",
    label: "Analysis",
    hint: "What we made of the customer documents",
  },
];

type Linkable = {
  id: string;
  ref: string;
  title: string;
  docs: { id: string; name: string; version: number; category: DocCategory }[];
};

export function RequestDetail({
  request: initial,
  live,
  meName,
  meRole,
  members,
  linkables,
}: {
  request: SolutionRequest;
  live: boolean;
  meName: string;
  meRole: string;
  members: string[];
  linkables: Linkable[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [r, setR] = useState(initial);
  const [tab, setTab] = useState<DocCategory>("customer");
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const managerial = meRole === "admin" || meRole === "manager";
  const fulfiller = managerial || meRole === "solutions";
  const iRequested =
    r.requestedBy.trim().toLowerCase() === meName.trim().toLowerCase();
  const iOwn = (r.owner ?? "").trim().toLowerCase() === meName.trim().toLowerCase();

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
      return true;
    } catch {
      toast("That didn't save.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const docs = r.docs.filter((d) => d.category === tab);

  return (
    <div>
      <SmartBack
        fallback="/solutioning"
        className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All requests
      </SmartBack>

      {/* ------------------------------------------------------- header */}
      <div className="rise-in flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-bold text-text-tertiary tnum">
              {r.ref}
            </span>
            <KindChip kind={r.kind} />
            {r.subtype && (
              <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                {r.subtype}
              </span>
            )}
            <StatusPill status={r.status} />
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-text-primary">
            {r.title}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-text-secondary">
            Requested by
            <span className="inline-flex items-center gap-1 font-semibold text-text-primary">
              <Avatar name={r.requestedBy} className="h-[18px] w-[18px] text-[6px]" />
              {r.requestedBy}
            </span>
            on {stampedAt(r.requestedAt)}
            {r.neededBy && (
              <>
                <span aria-hidden className="text-border">·</span>
                needed by{" "}
                <b
                  className={cn(
                    "tnum",
                    r.status !== "completed" &&
                      r.neededBy < new Date().toISOString().slice(0, 10)
                      ? "text-[color:#DC2626]"
                      : "text-text-primary"
                  )}
                >
                  {r.neededBy}
                </b>
              </>
            )}
          </p>
          {r.details && (
            <p className="mt-2 max-w-[680px] text-[13px] leading-relaxed text-text-secondary">
              {r.details}
            </p>
          )}
        </div>

        {/* The actions each side of the flow owns. */}
        {live && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!r.owner && r.status !== "completed" && fulfiller && (
              <button
                type="button"
                disabled={busy}
                onClick={() => post({ op: "pick-up" })}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check size={14} strokeWidth={2.4} /> Pick it up
              </button>
            )}
            {r.status !== "completed" && (iRequested || managerial) && (
              /* "The sales person says it is completed" — the requester's
                 button, and the tooltip is honest about whose it is. */
              <button
                type="button"
                disabled={busy}
                title={
                  iRequested
                    ? "You asked for this, so you close it"
                    : `Closing on ${r.requestedBy}'s behalf`
                }
                onClick={() => post({ op: "complete" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(26,122,53,0.4)] bg-[rgba(26,122,53,0.08)] px-4 py-2 text-[13px] font-semibold text-[color:#1A7A35] transition-colors hover:bg-[rgba(26,122,53,0.14)] disabled:opacity-50"
              >
                <Check size={14} strokeWidth={2.4} /> Mark it completed
              </button>
            )}
            {r.status === "completed" && (iRequested || managerial) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => post({ op: "reopen" })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-4 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
              >
                <RotateCcw size={14} strokeWidth={2.2} /> Reopen
              </button>
            )}
            {(meRole === "admin" || (iRequested && r.status === "initiated")) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete this request"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-light bg-white text-text-tertiary transition-colors hover:border-[rgba(220,38,38,0.4)] hover:text-[color:#DC2626]"
              >
                <Trash2 size={14.5} strokeWidth={2} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------- the facts strip */}
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
            Customer
          </p>
          <p className="mt-1.5 flex items-center gap-2 text-[13.5px] font-semibold text-text-primary">
            <CompanyLogo name={r.customer} className="h-6 w-6 text-[8px]" />
            {r.customer}
          </p>
          {(r.opportunityLabels.length > 0 || r.contactNames.length > 0) && (
            <div className="mt-2.5 space-y-1">
              {r.opportunityLabels.map((label) => (
                <p key={label} className="text-[12px] text-text-secondary">
                  · {label}
                </p>
              ))}
              {r.contactNames.map((name) => (
                <p
                  key={name}
                  className="flex items-center gap-1.5 text-[12px] text-text-secondary"
                >
                  <Avatar name={name} className="h-[16px] w-[16px] text-[6px]" />
                  {name}
                </p>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
            Owner
          </p>
          {r.owner ? (
            <p className="mt-1.5 flex items-center gap-2 text-[13.5px] font-semibold text-text-primary">
              <Avatar name={r.owner} className="h-6 w-6 text-[8px]" />
              {r.owner}
              {r.pickedUpAt && (
                <span className="text-[11px] font-normal text-text-tertiary">
                  since {stampedAt(r.pickedUpAt)}
                </span>
              )}
            </p>
          ) : (
            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-text-tertiary">
              <CircleDashed size={14} strokeWidth={2} />
              Waiting for the Solutions team to pick it up
            </p>
          )}
          {r.completedAt && (
            <p className="mt-2 text-[12px] text-text-secondary">
              Completed by <b>{r.completedBy}</b> on {stampedAt(r.completedAt)}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
            {r.kind === "meeting" ? "Meeting" : "Documents"}
          </p>
          {r.kind === "meeting" ? (
            <>
              <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
                <CalendarDays size={14} strokeWidth={2} className="text-[color:#0D9488]" />
                {r.meetingAt ? stampedAt(r.meetingAt) : "Not scheduled yet"}
              </p>
              {r.attendees && r.attendees.length > 0 && (
                <div className="mt-2 space-y-1">
                  {r.attendees.map((a) => (
                    <p
                      key={a}
                      className="flex items-center gap-1.5 text-[12px] text-text-secondary"
                    >
                      <Avatar name={a} className="h-[16px] w-[16px] text-[6px]" />
                      {a}
                    </p>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="mt-1.5 text-[13.5px] font-semibold text-text-primary tnum">
              {r.docs.length}
              <span className="ml-1 font-normal text-text-secondary">
                across the four tabs
              </span>
            </p>
          )}
        </Card>
      </div>

      {/* --------------------------- documents left, the story down the rail */}
      <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:gap-0">
        <div className="min-w-0 flex-1 lg:pr-6">
          <Card className="p-0 overflow-hidden">
            <div className="flex flex-wrap gap-1 border-b border-border-light bg-surface/60 px-3 pt-2.5">
              {TABS.map((t) => {
                const n = r.docs.filter((d) => d.category === t.key).length;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-t-lg border-b-2 px-3 py-2 text-[12.5px] font-semibold transition-colors",
                      active
                        ? "border-blue-primary bg-white text-blue-primary"
                        : "border-transparent text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {t.label}
                    <span
                      className={cn(
                        "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tnum",
                        active
                          ? "bg-blue-light text-blue-primary"
                          : "bg-surface text-text-tertiary"
                      )}
                    >
                      {n}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="border-b border-border-light bg-surface/30 px-4 py-2 text-[11.5px] text-text-tertiary">
              {TABS.find((t) => t.key === tab)?.hint}
            </p>

            {docs.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-text-tertiary">
                Nothing in {TABS.find((t) => t.key === tab)?.label.toLowerCase()}{" "}
                yet.
              </p>
            ) : (
              <ul className="divide-y divide-border-light">
                {docs.map((d) => (
                  <DocRow
                    key={d.id}
                    doc={d}
                    live={live}
                    members={members}
                    canRemove={
                      live &&
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
                    onRemove={() => post({ op: "remove-doc", docId: d.id })}
                  />
                ))}
              </ul>
            )}

            {live && r.status !== "completed" && (
              <div className="border-t border-border-light bg-surface/40 px-4 py-3">
                {adding ? (
                  <AddDocForm
                    tabLabel={TABS.find((t) => t.key === tab)?.label ?? ""}
                    members={members}
                    linkables={linkables}
                    busy={busy}
                    onCancel={() => setAdding(false)}
                    onAdd={async (input) => {
                      const ok = await post({
                        op: "add-doc",
                        category: tab,
                        ...input,
                      });
                      if (ok) setAdding(false);
                      return ok;
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-blue-primary hover:underline"
                  >
                    <Plus size={14} strokeWidth={2.4} /> Add a document here
                  </button>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* The rail: its own scroller, exactly the verify-dialog shape. */}
        <div className="shrink-0 border-t border-border-light pt-4 lg:max-h-[560px] lg:w-[268px] lg:overflow-y-auto lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
            Timeline
          </p>
          <ol className="mt-3 space-y-4">
            {[...r.activity].reverse().map((a, i) => (
              <li key={`${a.at}-${i}`} className="flex gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-light text-blue-primary">
                  <FileText size={12} strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold leading-snug text-text-primary">
                    {a.what}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-text-tertiary">
                    {stampedAt(a.at)}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-text-secondary">
                    <Avatar name={a.by} className="h-[16px] w-[16px] text-[6px]" />
                    {a.by}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

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
        title={`Delete ${r.ref}?`}
        body="The request and its document list go with it. Documents linked into other requests are unlinked there too."
        confirmLabel="Delete the request"
      />
    </div>
  );
}

function DocRow({
  doc: d,
  live,
  members,
  canRemove,
  completed,
  busy,
  onAssign,
  onRemove,
}: {
  doc: SolutionDoc;
  live: boolean;
  members: string[];
  canRemove: boolean;
  completed: boolean;
  busy: boolean;
  onAssign: (who: string | null) => void;
  onRemove: () => void;
}) {
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
            <span className="min-w-0 break-words text-[13px] font-semibold text-text-primary">
              {d.name}
            </span>
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
        {live && !completed ? (
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface hover:text-[color:#DC2626] disabled:opacity-50"
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
  members,
  linkables,
  busy,
  onCancel,
  onAdd,
}: {
  tabLabel: string;
  members: string[];
  linkables: Linkable[];
  busy: boolean;
  onCancel: () => void;
  onAdd: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<"new" | "link">("new");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [note, setNote] = useState("");
  const [refRequestId, setRefRequestId] = useState("");
  const [refDocId, setRefDocId] = useState("");

  const home = linkables.find((l) => l.id === refRequestId) ?? null;
  const refDoc = home?.docs.find((d) => d.id === refDocId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 rounded-lg bg-surface p-1 text-[12px] font-semibold w-fit">
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

      {mode === "new" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Document name — same name again becomes v2"
            className="h-9 w-full rounded-lg border border-border-light bg-white px-3 text-[12.5px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Link to the file (SharePoint, Drive…) — optional"
            className="h-9 w-full rounded-lg border border-border-light bg-white px-3 text-[12.5px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
          />
          <ColorSelect
            value={assignedTo}
            onChange={setAssignedTo}
            ariaLabel="Who is working on it"
            minWidth={180}
            dense
            options={[
              { value: "", label: "Nobody on it yet", color: "#64748B", icon: CircleDashed },
              ...members.map((m) => ({ value: m, label: m, avatarName: m })),
            ]}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note — optional"
            className="h-9 w-full rounded-lg border border-border-light bg-white px-3 text-[12.5px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
          />
        </div>
      ) : linkables.length === 0 ? (
        <p className="text-[12px] text-text-tertiary">
          No other request has documents to link yet.
        </p>
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
            options={[
              ...(refRequestId
                ? []
                : [{ value: "", label: "Pick the request", color: "#64748B", icon: CircleDashed }]),
              ...linkables.map((l) => ({
                value: l.id,
                label: `${l.ref} · ${l.title}`,
                color: "#0D9488",
                icon: Link2,
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
                color: "#0071E3",
                icon: FileText,
              })),
            ]}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why it's here — optional"
            className="h-9 w-full rounded-lg border border-border-light bg-white px-3 text-[12.5px] outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus sm:col-span-2"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={
            busy ||
            (mode === "new" ? !name.trim() : !refRequestId || !refDocId)
          }
          onClick={() =>
            onAdd(
              mode === "new"
                ? {
                    name: name.trim(),
                    url: url.trim() || undefined,
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
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={13} strokeWidth={2.4} />
          Add to {tabLabel.toLowerCase()}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileText,
  MessageSquare,
  Mic,
  RotateCcw,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { SectionCard } from "@/components/ui/SectionCard";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { Textarea } from "@/components/ui/Textarea";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";
import { stampedAt } from "@/lib/performanceShared";
import { MEETING_TYPES, type Meeting, type MeetingNoteKind } from "@/lib/meetings";
import { Field, Input } from "@/components/ui/Input";

/**
 * ONE MEETING.
 *
 * Suren, Aug 28, on what goes on it after the fact: "if you go to presentation
 * material, whatever is the meeting presentation that is there, and then any
 * analysis based on the meetings... this analysis doesn't have to be a
 * document, it can be — they can provide some, like, what is a meeting brief
 * or meeting transcript, whatever it is. They can add a document or they can
 * add comments... and meeting got completed, any meeting outcomes, all of
 * that comes into the analysis."
 *
 * So the write-up is four kinds of the same thing — a brief, a transcript, an
 * outcome, a comment — and they share one stream in the order they were
 * written, because that is the order somebody reading the meeting wants them.
 */

const NOTE_META: Record<
  MeetingNoteKind,
  { label: string; icon: typeof FileText; color: string; placeholder: string }
> = {
  brief: {
    label: "Brief",
    icon: FileText,
    color: "#0071E3",
    placeholder: "What this meeting needs to achieve, written before it happens…",
  },
  transcript: {
    label: "Transcript",
    icon: Mic,
    color: "#7C3AED",
    placeholder: "Paste the transcript…",
  },
  outcome: {
    label: "Outcome",
    icon: Target,
    color: "#16A34A",
    placeholder: "What came out of it, and what happens next…",
  },
  comment: {
    label: "Comment",
    icon: MessageSquare,
    color: "#64748B",
    placeholder: "Anything worth saying about this meeting…",
  },
};

export function MeetingDetail({
  meeting: initial,
  meName,
  meRole,
  members,
}: {
  meeting: Meeting;
  meName: string;
  meRole: string;
  members: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [m, setM] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [noteKind, setNoteKind] = useState<MeetingNoteKind>("outcome");
  const [noteText, setNoteText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const mine = m.owner.trim().toLowerCase() === meName.trim().toLowerCase();
  const canDelete = mine || meRole === "admin";
  const done = m.status === "completed";

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, id: m.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        return false;
      }
      const next = data.state?.meetings?.find((x: Meeting) => x.id === m.id);
      if (next) setM(next);
      /* And the list behind this page, which counts planned and completed. */
      router.refresh();
      return true;
    } catch {
      toast("That didn't save.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SmartBack
        fallback="/meetings"
        className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All meetings
      </SmartBack>

      <div className="rise-in flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <h1 className="flex min-w-0 items-center gap-3 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-text-primary">
            <CompanyLogo name={m.customer} className="h-11 w-11 shrink-0 text-[12px]" />
            <span className="min-w-0 break-words">{m.title}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold tnum text-text-tertiary">{m.ref}</span>
            <span className="rounded-full bg-blue-light/70 px-2.5 py-1 text-[11px] font-semibold text-blue-primary">
              {m.type}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                done
                  ? "bg-[rgba(22,163,74,0.12)] text-[color:#16A34A]"
                  : "bg-[rgba(0,113,227,0.12)] text-blue-primary"
              )}
            >
              {done ? "Completed" : "Planned"}
            </span>
            <span className="text-[12.5px] text-text-secondary">
              {formatDate(m.meetingAt)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* "Somebody has to go once the meeting is done and say that meeting
              is complete." Anyone who can see it may, because a meeting is not
              owned work. */}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              post({ op: "status", status: done ? "planned" : "completed" })
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50",
              done
                ? "border border-border-light bg-white text-text-secondary"
                : "bg-blue-primary text-white"
            )}
          >
            {done ? (
              <>
                <RotateCcw size={15} strokeWidth={2} /> Reopen
              </>
            ) : (
              <>
                <CheckCircle2 size={15} strokeWidth={2} /> Mark it done
              </>
            )}
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete this meeting"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-light text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
            >
              <Trash2 size={15} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <SectionCard title="The write-up" icon={FileText}>
            <p className="text-[12.5px] text-text-secondary">
              A brief before it, a transcript or an outcome after. Anything
              typed here is part of the meeting record.
            </p>

            <div className="mt-3 rounded-xl border border-border-light bg-surface/40 p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(Object.keys(NOTE_META) as MeetingNoteKind[]).map((k) => {
                  const meta = NOTE_META[k];
                  const on = noteKind === k;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setNoteKind(k)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                        on
                          ? "text-white"
                          : "border border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                      )}
                      style={on ? { background: meta.color } : undefined}
                    >
                      <Icon size={11} strokeWidth={2.4} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2">
                <Textarea
                  rows={noteKind === "transcript" ? 6 : 3}
                  value={noteText}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setNoteText(e.target.value)
                  }
                  placeholder={NOTE_META[noteKind].placeholder}
                  aria-label={`Add a ${NOTE_META[noteKind].label.toLowerCase()}`}
                />
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  disabled={busy || !noteText.trim()}
                  onClick={async () => {
                    const text = noteText.trim();
                    if (!text) return;
                    if (await post({ op: "add-note", kind: noteKind, text }))
                      setNoteText("");
                  }}
                  className="rounded-lg bg-blue-primary px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Add {NOTE_META[noteKind].label.toLowerCase()}
                </button>
              </div>
            </div>

            {m.notes.length === 0 ? (
              <p className="mt-3 py-6 text-center text-[12.5px] text-text-secondary">
                Nothing written down yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {[...m.notes].reverse().map((n) => {
                  const meta = NOTE_META[n.kind];
                  const Icon = meta.icon;
                  return (
                    <li key={n.id} className="rounded-xl border border-border-light p-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                          style={{ background: `${meta.color}18`, color: meta.color }}
                        >
                          <Icon size={10} strokeWidth={2.6} />
                          {meta.label}
                        </span>
                        <Avatar name={n.by} className="h-[18px] w-[18px] text-[7px]" />
                        <span className="text-[11.5px] font-medium text-text-secondary">
                          {n.by}
                        </span>
                        <span className="text-[11px] text-text-tertiary">
                          {stampedAt(n.at)}
                        </span>
                        <button
                          type="button"
                          onClick={() => post({ op: "remove-note", noteId: n.id })}
                          aria-label="Remove this note"
                          className="ml-auto rounded-md p-1 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
                        >
                          <Trash2 size={12} strokeWidth={2.2} />
                        </button>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-text-primary">
                        {n.text}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
          {/* WHAT WAS PRESENTED (Suren, Aug 28: "whatever that was presented,
              they provide that presented details"). Files sit BESIDE the
              written record rather than instead of it — his whole point about
              analysis was that it is sometimes a document and sometimes just
              words. */}
          <SectionCard title="Documents" icon={FileText}>
            <p className="text-[12.5px] text-text-secondary">
              The deck that was shown, and anything handed over.
            </p>
            <label
              className={cn(
                "mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-5 text-center transition-colors",
                "border-border-light hover:border-blue-subtle hover:bg-blue-light/20",
                uploading && "opacity-60"
              )}
            >
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={async (e) => {
                  const chosen = e.target.files?.[0];
                  e.target.value = "";
                  if (!chosen) return;
                  setUploading(true);
                  setUploadError(null);
                  try {
                    const body = new FormData();
                    body.append("file", chosen);
                    const res = await fetch(
                      `/api/meetings/upload?meetingId=${encodeURIComponent(m.id)}`,
                      { method: "POST", body }
                    );
                    const data = await res.json().catch(() => null);
                    if (!res.ok || !data?.ok) {
                      setUploadError(data?.error || "That file did not upload.");
                      return;
                    }
                    await post({
                      op: "add-doc",
                      label: data.fileName,
                      docsPath: data.docsPath,
                    });
                  } catch {
                    setUploadError("That file did not upload.");
                  } finally {
                    setUploading(false);
                  }
                }}
              />
              <span className="text-[13.5px] font-semibold text-text-primary">
                {uploading ? "Uploading…" : "Upload a file"}
              </span>
              <span className="text-[11.5px] text-text-tertiary">
                The deck, the one-pager, whatever was in the room
              </span>
            </label>
            {uploadError && (
              <p className="mt-2 text-[11.5px] font-medium text-[color:#DC2626]">
                {uploadError}
              </p>
            )}
            {m.docs.length > 0 && (
              <ul className="mt-3 divide-y divide-border-light overflow-hidden rounded-lg border border-border-light">
                {m.docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2.5 px-3 py-2.5">
                    <FileText size={15} strokeWidth={2} className="shrink-0 text-blue-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-text-primary">
                        {d.label}
                      </span>
                      <span className="block text-[11px] text-text-tertiary">
                        {d.addedBy} · {stampedAt(d.addedAt)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => post({ op: "remove-doc", docId: d.id })}
                      aria-label={`Remove ${d.label}`}
                      className="shrink-0 rounded-md p-1 text-[color:#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
                    >
                      <Trash2 size={13} strokeWidth={2.2} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard title="Who was there" icon={Users}>
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
              Presenting
            </p>
            <PeopleRow names={m.presenters} empty="Nobody named as presenter." />

            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
              From Freyr
            </p>
            <PeopleRow names={m.attendees} empty="Nobody else recorded." />

            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
              From {m.customer}
            </p>
            <PeopleRow names={m.contactNames} empty="No contacts recorded." />

            <div className="mt-3 border-t border-border-light pt-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
                Owner
              </p>
              <div className="mt-1.5">
                <ColorSelect
                  value={m.owner}
                  ariaLabel="Meeting owner"
                  collapsible={false}
                  dense
                  className="w-full"
                  onChange={(v) => post({ op: "update", patch: { owner: v } })}
                  options={[...new Set([m.owner, ...members])]
                    .filter(Boolean)
                    .map((n) => ({ value: n, label: n, avatarName: n }))}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="What it is against" icon={Building2}>
            <div className="flex items-center gap-2">
              <CompanyLogo name={m.customer} className="h-7 w-7 shrink-0 text-[9px]" />
              <span className="text-[13px] font-semibold text-text-primary">
                {m.customer}
              </span>
            </div>
            {m.opportunityLabels.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {m.opportunityLabels.map((label) => (
                  <li
                    key={label}
                    className="flex items-center gap-2 text-[12.5px] text-text-secondary"
                  >
                    <Briefcase size={13} strokeWidth={2} className="shrink-0 text-blue-primary" />
                    {label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[12px] text-text-tertiary">
                The account itself, no specific deal.
              </p>
            )}
            {m.materialsBy && !editing && (
              <p className="mt-3 flex items-center gap-1.5 border-t border-border-light pt-3 text-[12px] text-text-secondary">
                <CalendarDays size={13} strokeWidth={2} className="shrink-0" />
                Materials needed by {formatDate(m.materialsBy)}
              </p>
            )}

            {/* A MEETING MOVES. Dates slip, a discovery call turns into a
                demo, the deck is needed earlier than planned — so the three
                facts most likely to change are editable in place rather than
                frozen at whatever was typed when it was created. */}
            <div className="mt-3 border-t border-border-light pt-3">
              {editing ? (
                <div className="space-y-2.5">
                  <Field label="Type of meeting">
                    <ColorSelect
                      value={String(m.type)}
                      ariaLabel="Type of meeting"
                      collapsible={false}
                      dense
                      className="w-full"
                      onChange={(v) => post({ op: "update", patch: { type: v } })}
                      options={MEETING_TYPES.map((t) => ({
                        value: t,
                        label: t,
                        color: "#0071E3",
                      }))}
                    />
                  </Field>
                  <Field label="When is it">
                    <Input
                      type="date"
                      value={m.meetingAt}
                      onChange={(e) =>
                        post({ op: "update", patch: { meetingAt: e.target.value } })
                      }
                    />
                  </Field>
                  <Field label="Materials needed by">
                    <Input
                      type="date"
                      value={m.materialsBy ?? ""}
                      onChange={(e) =>
                        post({ op: "update", patch: { materialsBy: e.target.value } })
                      }
                    />
                  </Field>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="mt-1 text-[12px] font-semibold text-blue-primary hover:underline"
              >
                {editing ? "Done editing" : "Change the type or the dates"}
              </button>
            </div>
            {m.completedAt && (
              <p className="mt-2 text-[12px] text-text-secondary">
                Marked done by <b>{m.completedBy}</b>
                <span className="block text-[11px] text-text-tertiary">
                  {stampedAt(m.completedAt)}
                </span>
              </p>
            )}
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this meeting?"
        body={`${m.ref} and everything written on it will be removed. This cannot be undone.`}
        confirmLabel="Delete it"
        tone="destructive"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          const res = await fetch("/api/meetings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ op: "delete", id: m.id }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.ok) {
            toast(data?.error || "That didn't delete.", "error");
            return;
          }
          toast(`${m.ref} deleted.`);
          router.push("/meetings");
        }}
      />
    </div>
  );
}

function PeopleRow({ names, empty }: { names: string[]; empty: string }) {
  if (names.length === 0)
    return <p className="mt-1 text-[12px] text-text-tertiary">{empty}</p>;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
      {names.map((n) => (
        <li key={n} className="inline-flex items-center gap-1.5">
          <Avatar name={n} className="h-[22px] w-[22px] text-[8px]" />
          <span className="text-[12.5px] text-text-primary">{n}</span>
        </li>
      ))}
    </ul>
  );
}

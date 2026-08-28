"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  MessageSquare,
  Mic,
  MonitorPlay,
  Pencil,
  Plus,
  UserCog,
  RotateCcw,
  Target,
  Trash2,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { SectionCard } from "@/components/ui/SectionCard";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { Textarea } from "@/components/ui/Textarea";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";
import { stampedAt } from "@/lib/performanceShared";
import { type Meeting, type MeetingNoteKind } from "@/lib/meetings";
import { NewMeetingDialog } from "@/components/meetings/NewMeetingDialog";
import { Modal } from "@/components/ui/Modal";
import { meetingTypeMeta } from "@/components/meetings/meetingTypeMeta";

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
  /* NEITHER OF THESE MAY WEAR WHAT IT WAS WEARING (found in the browser,
     Aug 28). Outcome was #16A34A — the exact green this app uses for verified
     and complete, spent here as an identity colour, which is the thing the
     status-tone rule exists to prevent. Comment was #64748B, a plain slate,
     against the standing rule that a category chip is never gray.

     Teal and pink are FILTER_PALETTE slots: distinct from each other, distinct
     from Brief's blue and Transcript's purple, and neither is mistakable for a
     status. */
  outcome: {
    label: "Outcome",
    icon: Target,
    color: "#0D9488",
    placeholder: "What came out of it, and what happens next…",
  },
  comment: {
    label: "Comment",
    icon: MessageSquare,
    color: "#DB2777",
    placeholder: "Anything worth saying about this meeting…",
  },
};

export function MeetingDetail({
  meeting: initial,
  meName,
  meRole,
  members,
  customers,
  contacts,
  opportunities,
}: {
  meeting: Meeting;
  meName: string;
  meRole: string;
  members: string[];
  customers: { id: string; name: string }[];
  contacts: { id: string; name: string; customerId: string | null; title: string }[];
  opportunities: {
    id: string;
    label: string;
    customer: string;
    customerId: string | null;
  }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [m, setM] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [noteKind, setNoteKind] = useState<MeetingNoteKind>("outcome");
  const [noteText, setNoteText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  /* WHAT IS ABOUT TO BE DESTROYED, held by id.
     Standing rule since Aug 25: every delete control is red AND asks first,
     and only a delete already inside a popup may act directly. These two did
     not ask — found in the browser on Aug 28 by clicking one: an uploaded
     transcript, which can be an hour of a customer call, disappeared on a
     single click with nothing to undo it. */
  const [confirmNote, setConfirmNote] = useState<string | null>(null);
  const [confirmDoc, setConfirmDoc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);

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
            {(() => {
              const meta = meetingTypeMeta(String(m.type));
              const TypeIcon = meta.icon;
              return (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: `${meta.color}18`, color: meta.color }}
                >
                  <TypeIcon size={11} strokeWidth={2.4} />
                  {m.type}
                </span>
              );
            })()}
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
          {/* EDITING IS A BUTTON UP HERE, NOT A LINK BURIED IN A CARD.
              Suren, Aug 28: "How do we edit it, man? There is no editing
              there. Once I created the thing, change the type or the dates...
              I cannot edit who was there. This one doesn't allow you."
              There WAS an edit link, at the bottom of the third card, covering
              three fields. He never found it, and it could not touch the
              people — which is the half most likely to be wrong, because who
              actually turned up is only known afterwards. */}
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-blue-primary"
          >
            <Pencil size={15} strokeWidth={2} /> Edit
          </button>
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
          <SectionCard
            title="The write-up"
            icon={FileText}
            /* ADDING IS A BUTTON, THEN A POPUP (Anir, Aug 28: "this is so
               ugly, I hate when you do this. Adding should never be just like
               that. You press a button, then there's a popup, then you add
               it").

               A kind picker, a textarea and a Save button sitting permanently
               open in the card pushed the actual write-up — the thing you came
               to read — below the fold on a meeting with nothing written on it
               yet. Every other add in this app is a button that opens a
               dialog; this one had no reason to be the exception. */
            action={
              <AddSquare
                label="Add to the write-up"
                onClick={() => {
                  setNoteKind("outcome");
                  setNoteText("");
                  setNoteOpen(true);
                }}
              />
            }
          >
            <p className="text-[12.5px] text-text-secondary">
              A brief before it, a transcript or an outcome after. Anything
              written here is part of the meeting record.
            </p>

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
                          onClick={() => setConfirmNote(n.id)}
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
          {/* SAME SHAPE AS THE WRITE-UP (Anir, Aug 28: "same thing on the
              documents thing, there has to be the blue square with the white
              plus on the top right and I add that way"). A permanent dashed
              drop zone is a second way of doing the one thing this card does,
              and it sat where the files themselves should be. */}
          <SectionCard
            title="Documents"
            icon={FileText}
            action={
              <AddSquare
                label="Add a document"
                busy={uploading}
                onClick={() => {
                  setUploadError(null);
                  setDocOpen(true);
                }}
              />
            }
          >
            <p className="text-[12.5px] text-text-secondary">
              The deck that was shown, and anything handed over.
            </p>
            {uploadError && (
              <p className="mt-2 text-[11.5px] font-medium text-[color:#DC2626]">
                {uploadError}
              </p>
            )}
            {m.docs.length === 0 ? (
              <p className="mt-3 py-6 text-center text-[12.5px] text-text-secondary">
                Nothing handed over yet.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border-light overflow-hidden rounded-lg border border-border-light">
                {m.docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2.5 px-3 py-2.5">
                    <FileText size={15} strokeWidth={2} className="shrink-0 text-blue-primary" />
                    {/* THE ROW IS THE WAY IN. A card that took the file and
                        then only offered a filename and a delete button gave
                        you no way back to what was handed over (found in the
                        browser, Aug 28). The whole row opens it, so there is
                        nothing to aim at. */}
                    <a
                      href={`/api/meetings/download?meetingId=${encodeURIComponent(
                        m.id
                      )}&docId=${encodeURIComponent(d.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="group min-w-0 flex-1"
                    >
                      <span className="block truncate text-[12.5px] font-semibold text-text-primary group-hover:text-blue-primary">
                        {d.label}
                      </span>
                      <span className="block text-[11px] text-text-tertiary">
                        {d.addedBy} · {stampedAt(d.addedAt)}
                      </span>
                    </a>
                    <a
                      href={`/api/meetings/download?meetingId=${encodeURIComponent(
                        m.id
                      )}&docId=${encodeURIComponent(d.id)}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${d.label}`}
                      title={`Open ${d.label}`}
                      className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                    >
                      <ExternalLink size={14} strokeWidth={2.2} />
                    </a>
                    <button
                      type="button"
                      onClick={() => setConfirmDoc(d.id)}
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
          {/* THREE DIFFERENT JOBS IN A ROOM, NOT ONE.
              Suren, Aug 28: "you have presenter, but I think you also have
              somebody presenting and somebody attending. There is something
              called meeting owner: who was running the meeting?" — so the
              person who RAN it, the people who PRESENTED, and the people who
              were simply there are three separate lines, and all three are
              editable, because who actually turned up is a fact you only have
              after the meeting. */}
          {/* THREE DIFFERENT JOBS IN A ROOM, NOT ONE.
              Suren, Aug 28: "you have presenter, but I think you also have
              somebody presenting and somebody attending. There is something
              called meeting owner: who was running the meeting?" — so the
              person who RAN it, the people who PRESENTED, and the people who
              were simply there are three separate lines. All of them are
              editable, behind the Edit button at the top. */}
          <SectionCard title="Who was there" icon={Users}>
            {/* FOUR GROUPS, FOUR BLOCKS (Anir, Aug 28: "hard to read, need
                proper separation"). Evenly spaced label-then-faces pairs read
                as one column of eight things rather than four groups of two —
                a caption and the row above it sat as close as a caption and
                its own row. A rule and real air between each group makes the
                grouping do the work the labels were doing alone. */}
            <div className="divide-y divide-border-light">
              <div className="pb-3">
                <WhoLabel icon={UserCog} text="Ran the meeting" />
                <PeopleRow names={[m.owner].filter(Boolean)} empty="Nobody named." />
              </div>
              <div className="py-3">
                <WhoLabel icon={MonitorPlay} text="Presented" />
                <PeopleRow names={m.presenters} empty="Nobody named as presenter." />
              </div>
              <div className="py-3">
                <WhoLabel icon={Users} text="Also there from Freyr" />
                <PeopleRow names={m.attendees} empty="Nobody else recorded." />
              </div>
              <div className="pt-3">
                <WhoLabel logoName={m.customer} text={`From ${m.customer}`} />
                <PeopleRow names={m.contactNames} empty="No contacts recorded." />
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

      {/* ADD TO THE WRITE-UP — pick what it is, type it or upload it, save. */}
      <Modal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title="Add to the write-up"
        size="wide"
      >
        <div>
          <p className="text-[12.5px] text-text-secondary">
            What kind of note is this?
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                    on
                      ? "text-white"
                      : "border border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                  )}
                  style={on ? { background: meta.color } : undefined}
                >
                  <Icon size={12} strokeWidth={2.4} />
                  {meta.label}
                </button>
              );
            })}
          </div>

          <div className="mt-3">
            {/* ONE HEIGHT FOR ALL FOUR (Anir, Aug 28: "why is transcript
                bigger than the rest of them"). Ten rows for a transcript and
                six for everything else made the dialog jump every time a pill
                was pressed — the resizing-popup complaint again, this time
                caused by the picker inside it. Eight rows suits a pasted
                transcript and does not dwarf a one-line comment. */}
            <Textarea
              rows={8}
              value={noteText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setNoteText(e.target.value)
              }
              placeholder={NOTE_META[noteKind].placeholder}
              aria-label={`Add a ${NOTE_META[noteKind].label.toLowerCase()}`}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {/* UPLOAD IT INSTEAD OF TYPING IT (Suren, Aug 28: "what is this?
                This should be like an upload thing, or it should be an option
                at least"). Nobody walks out of a call holding a transcript;
                they hold a recording. It comes back as timestamped lines in
                the box above, to be read and corrected before it is saved. */}
            <label
              className={cn(
                "mr-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-2 text-[12.5px] font-semibold text-text-secondary transition-colors hover:text-blue-primary",
                transcribing && "pointer-events-none opacity-60"
              )}
            >
              <Upload size={14} strokeWidth={2.2} />
              {transcribing
                ? "Reading the file…"
                : noteKind === "transcript"
                  ? "Upload a recording or transcript"
                  : "Upload a file instead"}
              <input
                type="file"
                className="hidden"
                accept="audio/*,video/*,.txt,.md,.docx,.pdf,.vtt,.srt"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setTranscribing(true);
                  try {
                    const fd = new FormData();
                    fd.append("file", f);
                    const res = await fetch("/api/meetings/transcribe", {
                      method: "POST",
                      body: fd,
                    });
                    const data = await res.json().catch(() => null);
                    if (!res.ok || !data?.ok) {
                      toast(data?.error || "That file could not be read.", "error");
                      return;
                    }
                    /* Appended, never overwritten — a half-typed note in the
                       box is somebody's work. */
                    setNoteText((cur) =>
                      cur.trim() ? `${cur.trim()}\n\n${data.text}` : data.text
                    );
                    toast(
                      data.kind === "recording"
                        ? `Transcribed ${data.minutes || "<1"} min. Read it over, then add it.`
                        : "Text pulled out. Read it over, then add it.",
                      "success"
                    );
                  } catch {
                    toast("That file could not be read.", "error");
                  } finally {
                    setTranscribing(false);
                  }
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => setNoteOpen(false)}
              className="rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || transcribing || !noteText.trim()}
              onClick={async () => {
                const text = noteText.trim();
                if (!text) return;
                if (await post({ op: "add-note", kind: noteKind, text })) {
                  setNoteText("");
                  setNoteOpen(false);
                }
              }}
              className="rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Add {NOTE_META[noteKind].label.toLowerCase()}
            </button>
          </div>
        </div>
      </Modal>

      {/* ADD A DOCUMENT — the deck, the one-pager, whatever was handed over. */}
      <Modal
        open={docOpen}
        onClose={() => setDocOpen(false)}
        title="Add a document"
        size="wide"
      >
        <div>
          <p className="text-[12.5px] text-text-secondary">
            The deck that was shown, the one-pager, whatever was in the room.
          </p>
          <label
            className={cn(
              "mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-10 text-center transition-colors",
              "border-border-light hover:border-blue-subtle hover:bg-blue-light/20",
              uploading && "pointer-events-none opacity-60"
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
                  if (
                    await post({
                      op: "add-doc",
                      label: data.fileName,
                      docsPath: data.docsPath,
                    })
                  )
                    setDocOpen(false);
                } catch {
                  setUploadError("That file did not upload.");
                } finally {
                  setUploading(false);
                }
              }}
            />
            <Upload size={20} strokeWidth={2} className="text-blue-primary" />
            <span className="mt-1 text-[13.5px] font-semibold text-text-primary">
              {uploading ? "Uploading…" : "Choose a file"}
            </span>
            <span className="text-[11.5px] text-text-tertiary">
              It is stored against this meeting and anyone on it can open it
            </span>
          </label>
          {uploadError && (
            <p className="mt-2 text-[11.5px] font-medium text-[color:#DC2626]">
              {uploadError}
            </p>
          )}
        </div>
      </Modal>

      {/* THE SAME FORM THAT MADE IT, PREFILLED (Suren, Aug 28: "the edit
          should be like offering"). One Save at the end, so a half-typed date
          is never written and nothing is committed until it is meant. */}
      {editOpen && (
        <NewMeetingDialog
          meeting={m}
          meName={meName}
          members={members}
          customers={customers}
          contacts={contacts}
          opportunities={opportunities}
          onClose={() => setEditOpen(false)}
          onCreate={async (patch) => {
            const ok = await post({ op: "update", patch });
            if (ok) setEditOpen(false);
            return ok;
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmNote}
        title="Remove this from the write-up?"
        body={(() => {
          const n = m.notes.find((x) => x.id === confirmNote);
          if (!n) return "It will be removed from the meeting record.";
          const words = n.text.trim().split(/\s+/).length;
          return `A ${NOTE_META[n.kind].label.toLowerCase()} of ${words} ${
            words === 1 ? "word" : "words"
          }, written by ${n.by}. It goes from the meeting record and cannot be brought back.`;
        })()}
        confirmLabel="Remove it"
        tone="destructive"
        onClose={() => setConfirmNote(null)}
        onConfirm={async () => {
          const id = confirmNote;
          setConfirmNote(null);
          if (id) await post({ op: "remove-note", noteId: id });
        }}
      />

      <ConfirmDialog
        open={!!confirmDoc}
        title="Remove this document?"
        body={`${
          m.docs.find((x) => x.id === confirmDoc)?.label ?? "This file"
        } comes off the meeting and cannot be brought back.`}
        confirmLabel="Remove it"
        tone="destructive"
        onClose={() => setConfirmDoc(null)}
        onConfirm={async () => {
          const id = confirmDoc;
          setConfirmDoc(null);
          if (id) await post({ op: "remove-doc", docId: id });
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete "${m.title}"?`}
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

/**
 * THE BLUE SQUARE WITH THE WHITE PLUS (Anir, Aug 28: "there has to be the blue
 * square with the white plus on the top right and I add that way").
 *
 * The same 36px mark the offering cards use, so "add one of these" looks
 * identical wherever it appears.
 */
function AddSquare({
  label,
  onClick,
  busy = false,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-blue-primary text-white transition-colors hover:bg-blue-hover disabled:opacity-50"
    >
      <Plus size={17} strokeWidth={2.4} />
    </button>
  );
}

/**
 * A LABEL WEARS A MARK (Suren, Aug 28: "icons / company pfp").
 *
 * Four stacked gray captions read as one block of small print, and the reader
 * has to parse each one to find the row they want. A mark in front makes each
 * group findable at a glance — and the customer's group wears the customer's
 * own logo, which is the same thing every other account reference in the app
 * does.
 */
function WhoLabel({
  icon: Icon,
  logoName,
  text,
  className,
}: {
  icon?: LucideIcon;
  logoName?: string;
  text: string;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-text-tertiary",
        className
      )}
    >
      {logoName ? (
        <CompanyLogo name={logoName} className="h-[15px] w-[15px] shrink-0 text-[6px]" />
      ) : Icon ? (
        <Icon size={13} strokeWidth={2.2} className="shrink-0 text-blue-primary" />
      ) : null}
      {text}
    </p>
  );
}

/**
 * A HUNDRED PEOPLE STILL HAS TO LOOK LIKE SOMETHING (Anir, Aug 28: "if there's
 * 100 people, how will this look? Ensure it looks good").
 *
 * A conference or a town hall genuinely has that many, and an unbounded list
 * would run a 340px rail off the bottom of the screen and push everything
 * under it — the same thing the solutioning timeline did before it was given a
 * window.
 *
 * So: six names, then a count you can press. Opened, it scrolls inside a fixed
 * height instead of growing the page, and the card is the same size at 100
 * people as it is at two. Six is chosen because it is what fits without the
 * group taller than its neighbours — the four groups stay comparable at a
 * glance, which is the whole point of separating them.
 */
const FACES_SHOWN = 6;

function PeopleRow({ names, empty }: { names: string[]; empty: string }) {
  const [all, setAll] = useState(false);
  if (names.length === 0)
    return <p className="mt-1 text-[12px] text-text-tertiary">{empty}</p>;

  const extra = names.length - FACES_SHOWN;
  const list = all ? names : names.slice(0, FACES_SHOWN);

  return (
    <>
      <ul
        className={cn(
          "mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5",
          all && "max-h-[220px] overflow-y-auto pr-1"
        )}
      >
        {list.map((n) => (
          <li key={n} className="inline-flex items-center gap-1.5">
            <Avatar name={n} className="h-[22px] w-[22px] text-[8px]" />
            <span className="text-[12.5px] text-text-primary">{n}</span>
          </li>
        ))}
      </ul>
      {extra > 0 && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-1.5 text-[11.5px] font-semibold text-blue-primary hover:underline"
        >
          {all ? "Show fewer" : `+${extra} more`}
        </button>
      )}
    </>
  );
}

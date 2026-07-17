"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Check,
  Download,
  History,
  Send,
  Files,
  ChevronDown,
  MoreHorizontal,
  RotateCcw,
  Mail,
  CalendarClock,
  Lock,
  MessageSquare,
  CornerDownRight,
  Pencil,
  Clock,
  Phone,
  FileText,
  Timer,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { SubjectLineCarousel } from "@/components/sessions/SubjectLineCarousel";
import { copyText } from "@/lib/clipboard";
import { EMAIL_TEMPLATES, fillTemplate } from "@/lib/email-templates";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type {
  PitchEmail,
  PitchCallScript,
  PitchVersion,
  ReviewStatus,
} from "@/lib/types";

import { REVIEW_META } from "@/lib/review";

const CRM_TARGETS = [
  { key: "hubspot", label: "HubSpot" },
  { key: "salesforce", label: "Salesforce" },
  { key: "sequence", label: "Push to sequence" },
];

const VERSION_SOURCE_LABEL: Record<string, string> = {
  initial: "First generated",
  regenerate: "Regenerated",
  manual: "Saved edit",
};

const TABS = [
  { key: "5min", label: "5-Min Script" },
  { key: "email", label: "Intro Email" },
  { key: "phone", label: "Cold Call Script" },
  { key: "objections", label: "Objections" },
  { key: "brief", label: "Account Brief" },
];
const EDITABLE = new Set(["5min", "email", "phone"]);

// Per-format identity for the editor's document header — an icon, a real name,
// and a one-line "what this is" so each AI output reads like a finished
// deliverable, not a raw text box (Suren: "redo how this feels… make it look
// so much better").
const FORMAT_META: Record<
  string,
  { icon: typeof Send; name: string; hint: string }
> = {
  "5min": { icon: Clock, name: "5-Minute Script", hint: "What to say on a quick intro call" },
  email: { icon: Mail, name: "Intro Email", hint: "A first-touch email to open the conversation" },
  phone: { icon: Phone, name: "Cold Call Script", hint: "A guided script for a cold call" },
  objections: { icon: MessageSquare, name: "Objection Handling", hint: "Common pushbacks and how to answer them" },
  brief: { icon: FileText, name: "Account Brief", hint: "The context to know before you reach out" },
};

export interface AccountBrief {
  summary: string;
  facts: { label: string; value: string }[];
  contactName: string;
  contactRole: string;
  contactBackground: string;
}

function asEmail(v: PitchEmail | string | null): PitchEmail {
  if (!v) return { subject_lines: [], body: "" };
  if (typeof v === "object") return v;
  try {
    const p = JSON.parse(v);
    if (p && typeof p === "object" && "body" in p) return p;
  } catch {}
  return { subject_lines: [], body: v };
}
function asCall(v: PitchCallScript | string | null): PitchCallScript {
  const empty: PitchCallScript = {
    opener: "",
    value_prop: "",
    permission_question: "",
    if_bad_time_voicemail: "",
    if_good_time_continue: "",
    qualifying_questions: [],
  };
  if (!v) return empty;
  if (typeof v === "object") return v;
  try {
    return { ...empty, ...JSON.parse(v) };
  } catch {
    return { ...empty, opener: v };
  }
}
function callToText(c: PitchCallScript): string {
  return [
    `OPENER\n${c.opener}`,
    `\nVALUE PROP\n${c.value_prop}`,
    `\nPERMISSION QUESTION\n${c.permission_question}`,
    `\nIF BAD TIME (VOICEMAIL)\n${c.if_bad_time_voicemail}`,
    `\nIF GOOD TIME (CONTINUE)\n${c.if_good_time_continue}`,
    `\nQUALIFYING QUESTIONS\n${(c.qualifying_questions || [])
      .map((q, i) => `${i + 1}. ${q}`)
      .join("\n")}`,
  ].join("\n");
}
function initialPhone(v: PitchCallScript | string): string {
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("{")) {
      try {
        return callToText(asCall(t));
      } catch {
        return v;
      }
    }
    return v;
  }
  return callToText(v);
}
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function PitchWorkspace({
  sessionId,
  title,
  lastActivityAt,
  pitch5min,
  pitchEmail,
  pitchCall,
  accountBrief,
  objections,
  initialReviewStatus,
  initialReviewNote,
  recipientEmail,
  recipientName,
  companyName,
}: {
  sessionId: string;
  title: string;
  lastActivityAt?: string;
  pitch5min: string;
  pitchEmail: PitchEmail | string;
  pitchCall: PitchCallScript | string;
  accountBrief?: AccountBrief;
  objections?: { q: string; a: string }[];
  initialReviewStatus?: ReviewStatus;
  initialReviewNote?: string | null;
  recipientEmail?: string;
  recipientName?: string;
  companyName?: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const email0 = useMemo(() => asEmail(pitchEmail), [pitchEmail]);

  const [active, setActive] = useState("5min");
  const [crmOpen, setCrmOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<PitchVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>(
    initialReviewStatus || "draft"
  );
  const [reviewNote, setReviewNote] = useState<string | null>(
    initialReviewNote || null
  );
  const [reviewing, setReviewing] = useState(false);

  // compose & send email (V3)
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeTemplate, setComposeTemplate] = useState("");
  const [scheduleOn, setScheduleOn] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [script, setScript] = useState(pitch5min || "");
  const [subjects, setSubjects] = useState<string[]>(email0.subject_lines || []);
  const [emailBody, setEmailBody] = useState(email0.body || "");
  const [phoneText, setPhoneText] = useState(initialPhone(pitchCall));
  const [selectedSubject, setSelectedSubject] = useState(
    email0.subject_lines?.[0] || ""
  );
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  // Track unsaved edits so the Save button (now at the bottom-right of the
  // editor, where a Save belongs) can show a clear dirty/saved state — Suren:
  // "the user should edit it themselves… where's the save button, it can't go
  // up there." Editing is the primary interaction; regenerate is gone.
  const [dirty, setDirty] = useState(false);

  const briefText = accountBrief
    ? `${accountBrief.summary}\n\n${accountBrief.facts
        .map((f) => `${f.label}: ${f.value}`)
        .join("\n")}\n\nContact: ${accountBrief.contactName} — ${
        accountBrief.contactRole
      }\n${accountBrief.contactBackground}`
    : "";
  const objText = (objections || [])
    .map((o) => `Q: ${o.q}\nA: ${o.a}`)
    .join("\n\n");

  const currentText =
    active === "5min"
      ? script
      : active === "email"
      ? `Subject: ${selectedSubject}\n\n${emailBody}`
      : active === "phone"
      ? phoneText
      : active === "objections"
      ? objText
      : briefText;

  async function copy() {
    if (await copyText(currentText)) {
      setCopied(true);
      toast("Copied to clipboard");
      setTimeout(() => setCopied(false), 1800);
      return;
    }
    toast("Copy failed — select the text and copy it manually", "error");
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/pitch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pitch_5min_script: script,
          pitch_email: { subject_lines: subjects, body: emailBody },
          pitch_call_script: phoneText,
        }),
      });
      const data = await res.json();
      if (data.ok) setDirty(false);
      toast(data.ok ? "Pitch saved" : data.error || "Couldn't save", data.ok ? "success" : "error");
    } catch {
      toast("Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  }

  function exportTab() {
    downloadText(`freyr-${active}.txt`, currentText);
    toast("Exported");
  }

  function openCompose() {
    if (reviewStatus !== "approved") {
      toast("Needs compliance approval before sending", "error");
      return;
    }
    setComposeSubject(selectedSubject || subjects[0] || "");
    setComposeBody(emailBody);
    setComposeTemplate("");
    setScheduleOn(false);
    setScheduleAt("");
    setComposeOpen(true);
  }

  function applyTemplate(id: string) {
    setComposeTemplate(id);
    const t = EMAIL_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const vars = { company: companyName, contact: recipientName, rep: "Suren Dheen" };
    setComposeSubject(fillTemplate(t.subject, vars));
    setComposeBody(fillTemplate(t.body, vars));
  }

  async function sendEmail() {
    if (!composeSubject.trim()) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientEmail || "contact@account.com",
          subject: composeSubject,
          body: composeBody,
          scheduleAt: scheduleOn && scheduleAt ? scheduleAt : null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(
          data.scheduled
            ? "Email scheduled"
            : `Email sent to ${recipientEmail || "the contact"}`
        );
        setComposeOpen(false);
      } else {
        toast(data.error || "Couldn't send", "error");
      }
    } catch {
      toast("Couldn't send", "error");
    } finally {
      setSendingEmail(false);
    }
  }

  async function review(action: "submit" | "approve" | "request_changes") {
    setReviewing(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.ok && data.session) {
        setReviewStatus(data.session.review_status);
        setReviewNote(data.session.review_note || null);
        toast(
          action === "submit"
            ? "Submitted — the Sessions list now shows In review; approve or send back from here"
            : action === "approve"
            ? "Pitch approved — cleared to send"
            : "Sent back for changes"
        );
      } else {
        toast("Couldn't update review", "error");
      }
    } catch {
      toast("Couldn't update review", "error");
    } finally {
      setReviewing(false);
    }
  }

  async function pushToCrm(target: string) {
    setCrmOpen(false);
    // Compliance gate (#7): a pitch must be approved before it leaves the building.
    if (reviewStatus !== "approved") {
      toast("Needs compliance approval before sending", "error");
      return;
    }
    setPushing(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/crm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const data = await res.json();
      toast(
        data.ok ? `Pushed to ${data.target}` : "Couldn't push",
        data.ok ? "success" : "error"
      );
    } catch {
      toast("Couldn't push", "error");
    } finally {
      setPushing(false);
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    setVersionsLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/versions`);
      const data = await res.json();
      setVersions(data.versions || []);
    } catch {
      toast("Couldn't load history", "error");
    } finally {
      setVersionsLoading(false);
    }
  }

  async function restore(v: PitchVersion) {
    const em = asEmail(v.pitch_email);
    setScript(v.pitch_5min_script);
    setSubjects(em.subject_lines || []);
    setEmailBody(em.body || "");
    setSelectedSubject(em.subject_lines?.[0] || "");
    setPhoneText(callToText(asCall(v.pitch_call_script)));
    setHistoryOpen(false);
    setDirty(false);
    try {
      await fetch(`/api/sessions/${sessionId}/pitch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pitch_5min_script: v.pitch_5min_script,
          pitch_email: v.pitch_email,
          pitch_call_script: v.pitch_call_script,
          source: "restore",
        }),
      });
      toast("Version restored");
    } catch {
      toast("Restored locally — couldn't persist", "error");
    }
  }

  async function duplicate() {
    setMoreOpen(false);
    setDuplicating(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/duplicate`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok && data.id) {
        toast("Session duplicated");
        router.push(`/sessions/${data.id}`);
      } else {
        toast("Couldn't duplicate", "error");
        setDuplicating(false);
      }
    } catch {
      toast("Couldn't duplicate", "error");
      setDuplicating(false);
    }
  }

  const fm = FORMAT_META[active];
  const FIcon = fm.icon;
  const readTime = Math.max(1, Math.round(wordCount(currentText) / 160));

  const taClass =
    "w-full min-h-[440px] bg-transparent text-[15px] leading-[1.75] text-text-primary outline-none resize-y placeholder:text-text-tertiary";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-7 pb-5 border-b border-border-light">
        <div className="flex items-center gap-2 mb-2">
          <span className="bg-blue-light text-blue-primary px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-[0.05em]">
            Active Outreach
          </span>
          <span className="text-text-tertiary text-[14px]">•</span>
          <span className="text-text-secondary text-[13px]">
            Last activity: {lastActivityAt ? timeAgo(lastActivityAt) : "—"}
          </span>
        </div>
        <div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
            {title}
          </h1>
          <div className="flex items-center flex-nowrap gap-1.5 mt-4 pb-1 whitespace-nowrap overflow-x-auto [&>*]:shrink-0">
            {/* Compliance approval (#7) */}
            {(() => {
              const rm = REVIEW_META[reviewStatus];
              const RIcon = rm.icon;
              return (
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em] px-2.5 py-1 rounded"
                  style={{ background: rm.bg, color: rm.color }}
                >
                  <RIcon size={12} strokeWidth={2.4} />
                  {rm.label}
                </span>
              );
            })()}
            <span className="w-px h-6 bg-border-light mx-0.5" />
            {/* The one action that moves this pitch forward is the blue
                primary — everything gated stays clearly secondary so the row
                reads left-to-right in the order you actually work it. */}
            {reviewStatus === "in_review" ? (
              <>
                <button
                  onClick={() => review("approve")}
                  disabled={reviewing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-primary text-white text-[13px] font-semibold hover:bg-blue-hover transition-colors disabled:opacity-50"
                >
                  <Check size={15} strokeWidth={2} />
                  Approve
                </button>
                <button
                  onClick={() => review("request_changes")}
                  disabled={reviewing}
                  className="px-3 py-1.5 rounded-lg border border-border-light text-[13px] font-medium text-text-secondary hover:bg-surface transition-colors disabled:opacity-50"
                >
                  Request changes
                </button>
              </>
            ) : reviewStatus !== "approved" ? (
              <button
                onClick={() => review("submit")}
                disabled={reviewing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-primary text-white text-[13px] font-semibold hover:bg-blue-hover transition-colors disabled:opacity-50"
              >
                <Send size={15} strokeWidth={1.8} />
                {reviewStatus === "changes_requested"
                  ? "Resubmit for review"
                  : "Submit for review"}
              </button>
            ) : null}
            {/* Compose & send email — locked until compliance clears it */}
            <button
              onClick={openCompose}
              title={
                reviewStatus === "approved"
                  ? "Send this email"
                  : "Unlocks after compliance approval"
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-light text-[13px] font-medium text-text-secondary hover:bg-surface transition-colors"
            >
              {reviewStatus === "approved" ? (
                <Mail size={15} strokeWidth={1.7} />
              ) : (
                <Lock size={13} strokeWidth={1.9} className="text-text-tertiary" />
              )}
              Send email
            </button>
            {/* Send to CRM / sequence (#42) */}
            <div className="relative">
              <button
                onClick={() => setCrmOpen((o) => !o)}
                disabled={pushing}
                aria-haspopup="menu"
                aria-expanded={crmOpen}
                title={
                  reviewStatus === "approved"
                    ? "Push to your CRM or a sequence"
                    : "Unlocks after compliance approval"
                }
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-50",
                  reviewStatus === "approved"
                    ? "bg-blue-primary text-white hover:bg-blue-hover"
                    : "border border-border-light text-text-secondary hover:bg-surface"
                )}
              >
                {reviewStatus === "approved" ? (
                  <Send size={15} strokeWidth={1.8} />
                ) : (
                  <Lock size={13} strokeWidth={1.9} className="text-text-tertiary" />
                )}
                Send to CRM
                <ChevronDown size={14} strokeWidth={2} className="opacity-80" />
              </button>
              {crmOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCrmOpen(false)} />
                  <div
                    role="menu"
                    aria-label="Send to CRM"
                    className="absolute right-0 mt-2 w-[200px] bg-white border border-border-light rounded-xl shadow-card z-50 p-1.5"
                  >
                    {CRM_TARGETS.map((t) => (
                      <button
                        key={t.key}
                        role="menuitem"
                        onClick={() => pushToCrm(t.key)}
                        className="w-full text-left px-2.5 py-2 rounded-lg text-[13px] text-text-primary hover:bg-surface transition-colors"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* More — version history + duplicate tucked into one ⋯ menu so the
                action row stays on a single line (Suren: History/Duplicate were
                each wrapping onto their own line). */}
            <div className="relative">
              <button
                onClick={() => setMoreOpen((o) => !o)}
                aria-label="More actions"
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                className="p-1.5 border border-border-light rounded-lg hover:bg-surface transition-colors text-text-secondary"
              >
                <MoreHorizontal size={18} strokeWidth={1.8} />
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div
                    role="menu"
                    aria-label="More actions"
                    className="absolute right-0 mt-2 w-[210px] bg-white border border-border-light rounded-xl shadow-card z-50 p-1.5"
                  >
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false);
                        openHistory();
                      }}
                      className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-[13px] text-text-primary hover:bg-surface transition-colors"
                    >
                      <History size={15} strokeWidth={1.7} className="text-text-tertiary" />
                      Version history
                    </button>
                    <button
                      role="menuitem"
                      onClick={duplicate}
                      disabled={duplicating}
                      className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg text-[13px] text-text-primary hover:bg-surface transition-colors disabled:opacity-50"
                    >
                      <Files size={15} strokeWidth={1.7} className="text-text-tertiary" />
                      Duplicate session
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        {/* What the compliance gate means, in the state you're in right now */}
        <p className="mt-3 text-[12.5px] text-text-secondary leading-relaxed max-w-[720px]">
          {REVIEW_META[reviewStatus].explain}
          {reviewStatus === "changes_requested" && reviewNote && (
            <span className="text-text-primary"> Reviewer note: &ldquo;{reviewNote}&rdquo;</span>
          )}
        </p>
      </div>

      {/* Tabs + actions live INSIDE the scroll area, above the content, so they
          scroll together instead of staying locked at the top (Suren: "when I
          scroll, the copy button should scroll with it, not lock in"). */}
      <div className="flex-1 overflow-y-auto p-8">
        {/* One row, always: tabs left, utilities right. No wrap — on a narrow
            pane the tablist scrolls sideways instead of dumping the icons onto
            their own line (Suren: "put it on the same row as the 5 things"). */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Pitch formats"
            className="inline-flex items-center gap-1 rounded-xl bg-surface p-1 min-w-0 overflow-x-auto"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={active === t.key}
                onClick={() => setActive(t.key)}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-[13px] transition-all whitespace-nowrap",
                  active === t.key
                    ? "bg-white text-blue-primary font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                    : "text-text-secondary hover:text-text-primary font-medium"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Compact icon utilities — download + copy. */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={exportTab}
              title="Download as a text file"
              aria-label="Export as text file"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:bg-surface hover:text-text-primary transition-colors active:scale-[0.94]"
            >
              <Download size={16} strokeWidth={1.7} />
            </button>
            <button
              onClick={copy}
              title="Copy to clipboard"
              aria-label="Copy to clipboard"
              className={cn(
                "w-8 h-8 flex items-center justify-center rounded-lg transition-colors active:scale-[0.94]",
                copied
                  ? "text-success bg-success/10"
                  : "text-text-secondary hover:bg-surface hover:text-text-primary"
              )}
            >
              {copied ? <Check size={16} strokeWidth={2.1} /> : <Copy size={16} strokeWidth={1.7} />}
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-3xl bg-white border border-border-light rounded-2xl shadow-card overflow-hidden page-in">
          {/* Document header: names the format + read time */}
          <div className="flex items-center justify-between gap-3 px-6 py-3.5 border-b border-border-light bg-surface/40">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                <FIcon size={17} strokeWidth={1.8} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-text-primary leading-tight">
                  {fm.name}
                </p>
                <p className="text-[12px] text-text-tertiary truncate">{fm.hint}</p>
              </div>
            </div>
            {EDITABLE.has(active) && wordCount(currentText) > 0 && (
              <span className="shrink-0 flex items-center gap-1.5 text-[11.5px] font-medium text-text-tertiary tnum whitespace-nowrap">
                <Timer size={13} strokeWidth={1.8} />
                {readTime} min read
              </span>
            )}
          </div>
          <div className="p-6 md:p-8">
            {active === "email" && (
              <div className="mb-5 flex items-center gap-2.5 rounded-xl bg-surface border border-border-light px-4 py-2.5 text-[13px]">
                <Avatar name={recipientName || "Contact"} className="h-7 w-7 shrink-0 text-[9px]" />
                <span className="text-text-tertiary shrink-0">To</span>
                <span className="font-semibold text-text-primary truncate">
                  {recipientName ? `${recipientName} · ` : ""}
                  {recipientEmail || "the contact"}
                </span>
              </div>
            )}
            {active === "email" && subjects.length > 0 && (
              <div className="mb-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
                  Subject line
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-text-tertiary">
                    — pick the one to send
                  </span>
                </p>
                <SubjectLineCarousel
                  subjects={subjects}
                  selected={selectedSubject}
                  onSelect={(subject) => {
                    setSelectedSubject(subject);
                    setDirty(true);
                  }}
                />
              </div>
            )}

            {active === "5min" && (
              <textarea
                className={taClass}
                value={script}
                onChange={(e) => {
                  setScript(e.target.value);
                  setDirty(true);
                }}
              />
            )}
            {active === "email" && (
              <textarea
                className={taClass}
                value={emailBody}
                onChange={(e) => {
                  setEmailBody(e.target.value);
                  setDirty(true);
                }}
              />
            )}
            {active === "phone" && (
              <textarea
                className={taClass}
                value={phoneText}
                onChange={(e) => {
                  setPhoneText(e.target.value);
                  setDirty(true);
                }}
              />
            )}

            {active === "objections" && (
              <div className="space-y-3.5">
                {(objections || []).map((o, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-border-light overflow-hidden"
                  >
                    {/* What they say */}
                    <div className="flex items-start gap-2.5 px-4 py-3 bg-surface border-b border-border-light">
                      <MessageSquare
                        size={16}
                        strokeWidth={1.7}
                        className="text-text-tertiary mt-0.5 shrink-0"
                      />
                      <p className="text-[14px] font-semibold text-text-primary leading-snug">
                        {o.q}
                      </p>
                    </div>
                    {/* How to respond */}
                    <div className="flex items-start gap-2.5 px-4 py-3">
                      <CornerDownRight
                        size={16}
                        strokeWidth={1.7}
                        className="text-blue-primary mt-0.5 shrink-0"
                      />
                      <p className="text-[14px] text-text-secondary leading-relaxed">
                        {o.a}
                      </p>
                    </div>
                  </div>
                ))}
                {(!objections || objections.length === 0) && (
                  <p className="text-[13px] text-text-tertiary">No objections prepared.</p>
                )}
              </div>
            )}

            {active === "brief" && accountBrief && (
              <div className="space-y-5">
                <p className="text-[15px] text-text-secondary leading-relaxed">{accountBrief.summary}</p>
                <div className="grid grid-cols-2 gap-3">
                  {accountBrief.facts.map((f, i) => (
                    <div key={i} className="bg-surface rounded-lg p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">{f.label}</p>
                      <p className="text-[14px] text-text-primary mt-0.5">{f.value}</p>
                    </div>
                  ))}
                </div>
                <div className="border-l-2 border-blue-primary bg-surface rounded-lg p-3">
                  <p className="text-[14px] font-semibold text-text-primary">
                    {accountBrief.contactName} · {accountBrief.contactRole}
                  </p>
                  <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">{accountBrief.contactBackground}</p>
                </div>
              </div>
            )}
          </div>

          {EDITABLE.has(active) && (
            <div className="px-6 py-3 border-t border-border-light flex justify-between items-center gap-3">
              <span className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
                <Pencil size={13} strokeWidth={1.7} />
                Type to edit
                <span className="text-border">·</span>
                <span className="tnum">{wordCount(currentText)} words</span>
              </span>
              {/* Save belongs at the bottom-right of the editor, not up in the
                  toolbar (Suren). Shows dirty vs. saved so it's obvious. */}
              <button
                onClick={save}
                disabled={saving || !dirty}
                className={cn(
                  "inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg transition-colors active:scale-[0.97] disabled:cursor-default",
                  dirty
                    ? "bg-blue-primary text-white hover:bg-blue-hover"
                    : "bg-surface text-text-tertiary"
                )}
              >
                {saving ? (
                  "Saving…"
                ) : dirty ? (
                  "Save changes"
                ) : (
                  <>
                    <Check size={15} strokeWidth={2} />
                    Saved
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Version history (#43) */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Pitch version history">
        {versionsLoading ? (
          <p className="text-[13px] text-text-secondary">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="text-[13px] text-text-secondary">No versions yet.</p>
        ) : (
          <ul className="divide-y divide-border-light max-h-[60vh] overflow-y-auto">
            {versions.map((v, i) => (
              <li key={v.id} className="flex items-center gap-3 py-3">
                <span
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    i === 0
                      ? "bg-blue-primary text-white"
                      : "bg-blue-light text-blue-primary"
                  )}
                >
                  <History size={15} strokeWidth={1.7} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-text-primary">
                    {VERSION_SOURCE_LABEL[v.source] || v.source}
                    {i === 0 && (
                      <span className="ml-2 text-[11px] font-bold text-blue-primary">
                        CURRENT
                      </span>
                    )}
                  </p>
                  <p className="text-[12px] text-text-tertiary tnum">
                    {formatDateTime(v.created_at)}
                  </p>
                </div>
                {i === 0 ? (
                  <span className="text-[12px] text-text-tertiary">In use</span>
                ) : (
                  <button
                    onClick={() => restore(v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-[12px] font-medium text-text-secondary hover:bg-surface transition-colors"
                  >
                    <RotateCcw size={13} strokeWidth={1.8} />
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* Compose & send email (V3) */}
      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="Send email">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-text-tertiary w-16 shrink-0">To</span>
            <span className="font-medium text-text-primary truncate">
              {recipientName ? `${recipientName} · ` : ""}
              {recipientEmail || "contact@account.com"}
            </span>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">
              Template
            </label>
            <select
              aria-label="Email template"
              value={composeTemplate}
              onChange={(e) => applyTemplate(e.target.value)}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary"
            >
              <option value="">From this pitch (current draft)</option>
              {EMAIL_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">
              Subject
            </label>
            <input
              value={composeSubject}
              onChange={(e) => setComposeSubject(e.target.value)}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">
              Body
            </label>
            <textarea
              value={composeBody}
              onChange={(e) => setComposeBody(e.target.value)}
              rows={7}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-blue-primary resize-y"
            />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-text-secondary">
            <input
              type="checkbox"
              checked={scheduleOn}
              onChange={(e) => setScheduleOn(e.target.checked)}
            />
            <CalendarClock size={14} strokeWidth={1.7} />
            Schedule for later
          </label>
          {scheduleOn && (
            <input
              type="datetime-local"
              aria-label="Schedule time"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary"
            />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setComposeOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={sendEmail}
            loading={sendingEmail}
            disabled={!composeSubject.trim() || (scheduleOn && !scheduleAt)}
          >
            <Send size={15} strokeWidth={1.9} />
            {scheduleOn ? "Schedule" : "Send"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

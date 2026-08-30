"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  AlertCircle,
  X,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Eye,
  FlaskConical,
  Mail,
  Send,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { emailShell } from "@/lib/emailShell";
import { InfoHint } from "@/components/ui/InfoHint";
import { useToast } from "@/components/ui/Toast";
import { Avatar } from "@/components/ui/Avatar";
import { cn, formatDate } from "@/lib/utils";
import type { AdminEmailRecord } from "@/lib/adminEmail";
import { RichTextBox } from "./RichTextBox";
import { OwnerDigestPicker } from "./OwnerDigestPicker";

/**
 * WRITING AND SENDING AN EMAIL FROM THE APP (Anir, Aug 25: "have you added
 * that element anywhere for admins to be able to create emails here
 * somewhere?" — and then "build the email stuff out for admins").
 *
 * Two questions he asked on the same call are answered on this screen rather
 * than in a doc nobody opens: it says which address the mail leaves from, and
 * it says out loud that recipients do not need accounts, which is the thing
 * anybody would wonder before typing a customer's address into a sales tool.
 *
 * Everything sent is listed underneath, failures included. A mail that left
 * the workspace and cannot be shown afterwards is worse than no mail at all.
 */

const FIELD =
  "w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary";

function Label({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <span className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
      {children}
      {hint && <InfoHint text={hint} />}
    </span>
  );
}

/**
 * THE THREE EMAILS THE APP SENDS ON ITS OWN.
 *
 * Each entry describes a real route: /api/cron/announce, /api/cron/monthly and
 * /api/cron/roadmap-digest. If one is added, retired or re-timed, it belongs
 * here too — a box that quietly goes stale is worse than no box.
 */
const AUTOMATED_EMAILS: {
  name: string;
  when: string;
  what: string;
  who: string;
  color: string;
  icon: typeof Mail;
  /** What /api/admin/email-preview builds to show this one. */
  kind: "release" | "monthly" | "roadmap";
}[] = [
  {
    name: "Release announcement",
    when: "On a major release",
    what: "Tells everyone what changed when a release is marked major.",
    who: "every active member",
    color: "#0071E3",
    icon: Send,
    kind: "release",
  },
  {
    name: "Monthly digest",
    when: "Monthly",
    what: "The month's numbers, plus a nudge to whoever owns something that has gone quiet.",
    who: "offering owners and members",
    color: "#7C3AED",
    icon: CalendarClock,
    kind: "monthly",
  },
  {
    name: "Roadmap digest",
    when: "On roadmap changes",
    what: "Every roadmap change since the last send, gathered into one mail.",
    who: "people subscribed to the roadmap",
    color: "#0891B2",
    icon: Clock3,
    kind: "roadmap",
  },
];

type WorkspacePerson = {
  id: string;
  name: string;
  email: string;
  role?: string;
  active?: boolean;
};

/** The addresses in a comma / semicolon / newline separated field. */
/**
 * The inbox stamp (Anir, Aug 27: "just copy this, like how a normal inbox
 * looks"): the time alone for today's mail, "Aug 26" inside the year, the
 * full date beyond it — exactly the amount of "when" an inbox prints.
 */
function inboxStamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

/** The gray snippet after the subject, from the plain-text body. */
/**
 * A NAME THAT FITS A ROW (Anir, Aug 30: "if it's one-to-one, it should just be
 * anir S. and then Saras V.").
 *
 * First name and a last initial, so both ends of a send fit side by side where
 * two full names would not. An address that belongs to nobody in the directory
 * keeps its local part rather than being cut into something unrecognisable.
 */
function shortName(who: string): string {
  const name = (who || "").trim();
  if (!name) return "";
  if (name.includes("@")) return name.split("@")[0];
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? name;
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** Every address an email went to, To then CC then BCC, in that order. */
function everyone(e: {
  to: string;
  cc: string[];
  bcc: string[];
}): string[] {
  return [
    ...splitAddresses(e.to).map(addressOf),
    ...e.cc.flatMap((c) => splitAddresses(c).map(addressOf)),
    ...e.bcc.flatMap((b) => splitAddresses(b).map(addressOf)),
  ].filter(Boolean);
}

function snippetOf(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 160);
}

function splitAddresses(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The bare address out of "Name <a@b.com>", or the text itself. */
function addressOf(entry: string): string {
  const angled = entry.match(/<([^>]+)>/);
  return (angled ? angled[1] : entry).trim();
}

/** Add an address to a comma/newline separated field without duplicating it. */
function addAddress(current: string, email: string): string {
  const wanted = addressOf(email).toLowerCase();
  const already = splitAddresses(current).map((a) => addressOf(a).toLowerCase());
  if (already.includes(wanted)) return current;
  const kept = splitAddresses(current);
  return [...kept, email.trim()].join(", ");
}

/**
 * A RECIPIENT FIELD THAT BEHAVES LIKE A MAIL CLIENT'S.
 *
 * Anir, Aug 26: "I don't want a separate button. When I click on it, it should
 * instantly show me a dropdown, but if I start typing it should just search,
 * and if it doesn't exist I can press Enter and just save that as the email.
 * Basically the same as Gmail."
 *
 * So: focus opens the list, typing filters it, Enter takes the highlighted
 * person — or, when nothing matches, takes what you typed as an address.
 * Comma, semicolon and Tab commit too, backspace on an empty box takes back
 * the last one, and each recipient is a chip you can remove.
 *
 * The value stays a comma-separated STRING, because that is what the send
 * route parses and what a pasted "a@x.com, b@y.com" already is.
 */
function RecipientField({
  label,
  hint,
  value,
  onChange,
  people,
  ariaLabel,
  trailing,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  people: WorkspacePerson[];
  ariaLabel: string;
  /** Rendered at the right of the label row. The recipient count lives here
   *  (Anir, Aug 30: "I don't like where the one recipient is either, that
   *  doesn't make any sense, it should go up top") — it is a fact about this
   *  field, so it belongs on this field rather than beside the Send button a
   *  page below. */
  trailing?: React.ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const chosen = splitAddresses(value);
  const taken = new Set(chosen.map((a) => addressOf(a).toLowerCase()));
  const q = draft.trim().toLowerCase();
  const matches = people
    .filter((person) => !taken.has(person.email.toLowerCase()))
    .filter(
      (person) =>
        !q ||
        person.name.toLowerCase().includes(q) ||
        person.email.toLowerCase().includes(q)
    )
    .slice(0, 50);

  useEffect(() => setActive(0), [draft]);

  /* Clicking anywhere else closes the list and keeps whatever was half-typed
     as a recipient, the way leaving a mail client's To field does. */
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (boxRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setDraft((current) => {
        const trimmed = current.trim();
        if (trimmed) onChange(addAddress(value, trimmed));
        return "";
      });
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open, value, onChange]);

  const commit = (address: string) => {
    const trimmed = address.trim();
    if (!trimmed) return;
    onChange(addAddress(value, trimmed));
    setDraft("");
    setActive(0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!matches.length) return;
      event.preventDefault();
      setOpen(true);
      setActive((i) =>
        event.key === "ArrowDown"
          ? (i + 1) % matches.length
          : (i - 1 + matches.length) % matches.length
      );
      return;
    }
    if (event.key === "Enter" || event.key === "Tab" || event.key === "," || event.key === ";") {
      /* Enter on a highlighted person takes them; Enter on text that matches
         nobody takes the text. Tab only commits when there is something to
         commit, so it still moves focus on an empty field. */
      const hasDraft = draft.trim().length > 0;
      if (!hasDraft && event.key !== "Enter") return;
      if (event.key === "Enter" && !hasDraft && !matches.length) return;
      event.preventDefault();
      if (hasDraft && matches.length && event.key !== ",") commit(matches[active].email);
      else if (hasDraft) commit(draft);
      else if (matches.length) commit(matches[active].email);
      return;
    }
    if (event.key === "Backspace" && !draft && chosen.length) {
      event.preventDefault();
      onChange(chosen.slice(0, -1).join(", "));
      return;
    }
    if (event.key === "Escape") setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      {trailing ? (
        <span className="flex items-center justify-between gap-2">
          <Label hint={hint}>{label}</Label>
          {trailing}
        </span>
      ) : (
        <Label hint={hint}>{label}</Label>
      )}
      <div
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
        className="flex min-h-[42px] w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-border-light bg-white px-2 py-1.5 transition-colors focus-within:border-blue-primary"
      >
        {chosen.map((address) => {
          const person = people.find(
            (candidate) =>
              candidate.email.toLowerCase() === addressOf(address).toLowerCase()
          );
          return (
            <span
              key={address}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface py-0.5 pl-0.5 pr-1.5 text-[12.5px]"
            >
              {person ? (
                <Avatar name={person.name} className="h-5 w-5 shrink-0 text-[7px]" />
              ) : (
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-light text-blue-primary">
                  <Mail size={10} strokeWidth={2.4} />
                </span>
              )}
              <span className="truncate font-medium text-text-primary">
                {person ? person.name : address}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange(chosen.filter((a) => a !== address).join(", "));
                }}
                aria-label={`Remove ${person ? person.name : address}`}
                className="shrink-0 cursor-pointer rounded-full p-0.5 text-text-tertiary transition-colors hover:bg-white hover:text-[color:#DC2626]"
              >
                <X size={11} strokeWidth={2.6} />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            /* A pasted block of addresses becomes chips immediately. */
            const text = event.clipboardData.getData("text");
            if (!/[,;\n]/.test(text)) return;
            event.preventDefault();
            let next = value;
            for (const piece of splitAddresses(text)) next = addAddress(next, piece);
            onChange(next);
          }}
          placeholder={chosen.length ? "" : "Type a name, or an address"}
          aria-label={ariaLabel}
          className="min-w-[180px] flex-1 bg-transparent px-1 py-1 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary"
        />
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-border-light bg-white shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]">
          {matches.length === 0 ? (
            <p className="px-3 py-2.5 text-[12px] text-text-secondary">
              {draft.trim() ? (
                <>
                  Nobody by that name. Press{" "}
                  <b className="text-text-primary">Enter</b> to use{" "}
                  <b className="text-text-primary">{draft.trim()}</b> as the
                  address.
                </>
              ) : (
                "Everyone is already on this email."
              )}
            </p>
          ) : (
            <ul className="max-h-[260px] overflow-y-auto py-1">
              {matches.map((person, index) => (
                <li key={person.email}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => {
                      commit(person.email);
                      inputRef.current?.focus();
                    }}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition-colors",
                      index === active ? "bg-blue-light/60" : "hover:bg-surface"
                    )}
                  >
                    <Avatar name={person.name} className="h-6 w-6 shrink-0 text-[8px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-text-primary">
                        {person.name}
                      </span>
                      <span className="block truncate text-[11px] text-text-tertiary">
                        {person.email}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function EmailComposer() {
  const { toast } = useToast();
  const [from, setFrom] = useState("");
  const [live, setLive] = useState(true);
  const [sent, setSent] = useState<AdminEmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * EACH SECTION FOLDS (Anir, Aug 27: "all these sections, I think, should
   * be collapsible dropdowns — Write an email... Automated emails... Sent
   * from this workspace"). All three start open; the fold is the same
   * animated reveal the accrual cards use, so it feels like a dropdown
   * rather than content blinking in and out.
   */
  const [shut, setShut] = useState<Record<string, boolean>>({});
  /** Which automated email is being read, and what came back for it. */
  const [preview, setPreview] = useState<{ kind: string; name: string } | null>(
    null
  );
  const [previewMail, setPreviewMail] = useState<{
    subject?: string;
    html?: string;
    note?: string;
    empty?: string;
    error?: string;
  } | null>(null);
  const foldToggle = (key: string) =>
    setShut((prev) => ({ ...prev, [key]: !prev[key] }));

  /* Fetched when the dialog opens rather than up front: three emails nobody
     may look at are three queries nobody asked for. */
  useEffect(() => {
    if (!preview) return;
    let alive = true;
    setPreviewMail(null);
    fetch(`/api/admin/email-preview?kind=${encodeURIComponent(preview.kind)}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => alive && setPreviewMail(data))
      .catch(() => alive && setPreviewMail({ error: "That did not load." }));
    return () => {
      alive = false;
    };
  }, [preview]);

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showCopies, setShowCopies] = useState(false);
  const [sending, setSending] = useState(false);
  /** Everyone in the workspace, so a recipient can be PICKED (Anir, Aug 26:
   *  "where is the emails so I don't have to enter emails, I can just choose
   *  someone"). Free text stays: plenty of recipients are customers who will
   *  never have an account here. */
  const [people, setPeople] = useState<WorkspacePerson[]>([]);
  /** Outlook's red exclamation mark, off by default. */
  const [important, setImportant] = useState(false);
  /** Send is a two-press action: nobody mails a customer by mis-clicking. */
  const [confirming, setConfirming] = useState(false);
  const [openRecord, setOpenRecord] = useState<string | null>(null);
  /** Search over the sent log (Anir, Aug 27: "search bars for the emails"). */
  const [logQuery, setLogQuery] = useState("");

  const load = useCallback(async () => {
    try {
      void fetch("/api/settings/access", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) return;
          const rows: WorkspacePerson[] = [
            ...((d.members ?? []) as WorkspacePerson[]),
            /* Someone invited but not yet signed in still has an address. */
            ...((d.invitations ?? []) as WorkspacePerson[]),
          ].filter((m) => m.email && m.name);
          /* One person per address, and the FULLER record wins. The
             workspace really does hold two members on anir.s@ — "Anir S"
             and "Anir Suren" — and first-in kept the stub, so the sent log
             showed initials where his photo exists and the To field
             suggested the stub. More words, then more letters, is the
             fuller display name. */
          const best = new Map<string, WorkspacePerson>();
          for (const m of rows) {
            const key = m.email.toLowerCase();
            const cur = best.get(key);
            if (!cur) {
              best.set(key, m);
              continue;
            }
            const words = (x: WorkspacePerson) => x.name.trim().split(/\s+/).length;
            if (
              words(m) > words(cur) ||
              (words(m) === words(cur) && m.name.length > cur.name.length)
            )
              best.set(key, m);
          }
          setPeople([...best.values()]);
        })
        .catch(() => undefined);
      const res = await fetch("/api/admin/email", { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) {
        setFrom(data.from || "");
        setLive(!!data.live);
        setSent(data.emails || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const count = (raw: string) =>
    raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).length;
  const recipients = count(to) + count(cc) + count(bcc);
  /* An empty contenteditable still holds "<br>" or "<p></p>", so a message is
     "written" only when it carries actual words. */
  const wordsInBody = body.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
  const ready = !!to.trim() && !!subject.trim() && !!wordsInBody;

  async function send() {
    setSending(true);
    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, cc, bcc, replyTo, subject, html: body, important }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        /* Close the dialog BEFORE the toast: a failure message behind a
           modal overlay is a failure message nobody reads. */
        setConfirming(false);
        toast(data?.error || "That did not send.", "error");
        await load();
        return;
      }
      toast(
        data.simulated
          ? "Sample mode: nothing was sent."
          : `Sent to ${data.recipients} ${data.recipients === 1 ? "person" : "people"}.`
      );
      setTo("");
      setCc("");
      setBcc("");
      setReplyTo("");
      setSubject("");
      setBody("");
      setConfirming(false);
      await load();
    } catch {
      setConfirming(false);
      toast("That did not send.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* The title is the toggle; the draft picker beside it stays its
              own control, so reaching for a draft never folds the form. */}
          <button
            type="button"
            onClick={() => foldToggle("write")}
            aria-expanded={!shut.write}
          /* THE WHOLE ROW IS THE TARGET (Anir, Aug 30: "on all these
             dropdowns you keep making this mistake — I'm trying to hit it but
             I can't, I don't wanna have to always hit the text exactly, I
             should be able to hit the entire thing"). The button hugged its
             own label, so the empty half of a full-width header row did
             nothing. It stretches to whatever sits on its right — the
             Templates picker and the hint keep their own hit areas. */
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-left text-[15px] font-semibold text-text-primary"
          >
            <ChevronDown
              size={15}
              strokeWidth={2.2}
              className={cn(
                "shrink-0 text-text-tertiary transition-transform",
                shut.write && "-rotate-90"
              )}
            />
            <Mail size={15} strokeWidth={2} className="text-blue-primary" />
            Write an email
          </button>
          <span className="flex flex-wrap items-center gap-3">
            {/* START FROM A DRAFT (Saras, Aug 25: "can you make an automated
                email draft for offering owners?"). On the title line rather
                than in a block of its own: it is a shortcut, not a step, and
                it was pushing the To field down the page. */}
            <OwnerDigestPicker
              onLoad={(draft) => {
                setTo(draft.to);
                setSubject(draft.subject);
                setBody(draft.html);
                setConfirming(false);
                /* AND OPEN THE FORM (Anir, Aug 30: "if I click the draft and I
                   click one of these people but I have the dropdown closed, it
                   doesn't do anything — it should open it on command"). It
                   loaded the draft into a form nobody could see, so a real
                   action looked like a dead click. */
                setShut((current) => ({ ...current, write: false }));
              }}
            />
            {from && (
              /* THE SENDING ADDRESS LIVES IN THE HINT (Anir, Aug 26: "tuck
                 that into the question mark"). It never changes and nobody
                 sets it here, so spelling out a 45-character address on the
                 title line was a permanent banner for a one-off question. */
              <InfoHint
                text={`Every email the app sends comes from ${from}. Replies come back to it unless you set a reply-to below.`}
              />
            )}
          </span>
        </div>

        <div className="freyr-fold" data-open={shut.write ? "false" : "true"}>
          <div>
        {/* NO BANNER ABOVE THE TO FIELD (Anir, Aug 26: "this is ugly, do we
            really need those popups at the top? I just want the To field at
            the top like normal"). The one thing it said — that a recipient
            needs no account — is on the To field's own hint, which is where
            somebody actually wonders it. */}

        {!live && (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-[rgba(124,58,237,0.10)] px-3 py-2 text-[12.5px] font-medium text-[color:#7C3AED]">
            <FlaskConical size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
            Sample mode. You can write and press Send to see the whole flow, but
            nothing leaves the building. Switch to Real to deliver.
          </p>
        )}

        <div className="mt-4 space-y-3.5">
          <RecipientField
            label="To"
            hint="Start typing a name to pick somebody, or type any address and press Enter. Anyone can be a recipient; they do not need an account here."
            value={to}
            onChange={setTo}
            people={people}
            ariaLabel="To"
            trailing={
              <span className="text-[11.5px] text-text-tertiary tnum">
                {recipients === 0
                  ? "No recipients yet"
                  : `${recipients} ${recipients === 1 ? "recipient" : "recipients"}`}
              </span>
            }
          />

          <button
            type="button"
            onClick={() => setShowCopies((v) => !v)}
            aria-expanded={showCopies}
            className="flex cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-blue-primary transition-colors hover:underline"
          >
            <ChevronDown
              size={13}
              strokeWidth={2.3}
              className={cn("transition-transform", !showCopies && "-rotate-90")}
            />
            {showCopies ? "Hide" : "Add"} CC, BCC and reply-to
          </button>

          {showCopies && (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <RecipientField
                label="CC"
                hint="They see each other and the To line. Use this for people who need to be in the loop."
                value={cc}
                onChange={setCc}
                people={people}
                ariaLabel="CC"
              />
              <RecipientField
                label="BCC"
                hint="Hidden from everyone else on the mail."
                value={bcc}
                onChange={setBcc}
                people={people}
                ariaLabel="BCC"
              />
              <label className="block sm:col-span-2">
                <Label hint="Where replies go. Leave blank and they come back to the sending address above.">
                  Reply to
                </Label>
                <input
                  value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="you@freyrsolutions.com"
                  aria-label="Reply to"
                  className={FIELD}
                />
              </label>
            </div>
          )}

          <div className="block">
            {/* MARK IT IMPORTANT, BESIDE THE SUBJECT (Anir, Aug 30: "I don't
                like why the Mark as important is there, I don't think that's a
                good place to have it — figure out a better place"). It was
                down in the send bar among the things you do AFTER writing, but
                it is a property of the message, and the subject line is where
                Outlook's own "!" ends up. */}
            <span className="flex items-center justify-between gap-2">
              <Label>Subject</Label>
              <button
                type="button"
                onClick={() => setImportant((v) => !v)}
                aria-pressed={important}
                title="Sets the headers Outlook reads to draw its red exclamation mark"
                className={`mb-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                  important
                    ? "border-[color:#DC2626] bg-[rgba(220,38,38,0.08)] text-[color:#DC2626]"
                    : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
                }`}
              >
                <AlertCircle size={12} strokeWidth={2.3} />
                {important ? "Marked important" : "Mark as important"}
              </button>
            </span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What this email is about"
              aria-label="Subject"
              className={FIELD}
            />
          </div>

          <div>
            {/* THE FORMAT BAR SARAS ASKED FOR (Aug 25: "a format bar for the
                message to be added though — Bold, Italics, Underline, Font,
                Font Size, Font Colour, Highlights, bullets, indentation"). */}
            <Label hint="Bold, italics, underline, font and size, colour, highlight, bullets and indentation. The formatting carries into the email; a plain-text copy goes with it for clients that refuse HTML.">
              Message
            </Label>
            <RichTextBox
              value={body}
              onChange={setBody}
              ariaLabel="Message"
              placeholder="Write it the way you would in your mail client."
            />
          </div>
        </div>

        {/* NO RULE ABOVE SEND (Anir, Aug 30: "you don't need that little
            horizontal line above Send, that's kind of pointless — it's not
            really separating much"). With the count and the important toggle
            moved up to the fields they describe, this row is one button, and a
            hairline above a single button separates nothing. */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {/* STILL TWO PRESSES, NOW AS A POP-UP (Anir, Aug 27: "make the
              send button, like the confirmation thing, a pop-up instead of
              whatever you have right now"). The inline swap made the whole
              footer rearrange itself under the cursor; a dialog holds the
              question still. Blue, not red — nothing is destroyed by
              sending, and red is reserved. */}
          <button
            type="button"
            disabled={!ready}
            onClick={() => setConfirming(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={14} strokeWidth={2.2} />
            Send
          </button>
          <ConfirmDialog
            open={confirming}
            onClose={() => setConfirming(false)}
            onConfirm={send}
            busy={sending}
            tone="primary"
            title={live ? "Send this email?" : "Simulate this send?"}
            /* NAME THEM (Anir, Aug 30: "when I do send it, it has to show
               me who it's going to on this popup"). "It goes to 1 person" is
               the one fact you already know when you press Send; who that
               person is, is the thing worth confirming before something
               leaves the building. */
            body={
              (() => {
                const named = everyone({ to, cc: [cc], bcc: [bcc] }).map((a) => ({
                  address: a,
                  person: people.find(
                    (p) => p.email.toLowerCase() === a.toLowerCase()
                  ),
                }));
                const shown = named.slice(0, 8);
                const rest = named.length - shown.length;
                return (
                  <>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {shown.map((n) => (
                        <span
                          key={n.address}
                          title={n.address}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border-light bg-white py-0.5 pl-1 pr-2.5 text-[12.5px] text-text-primary"
                        >
                          <Avatar
                            name={n.person?.name ?? n.address}
                            className="h-5 w-5 shrink-0 text-[7px]"
                          />
                          <span className="max-w-[220px] truncate">
                            {n.person?.name ?? n.address}
                          </span>
                        </span>
                      ))}
                      {rest > 0 && (
                        <span className="text-[12.5px] font-semibold text-text-secondary tnum">
                          +{rest} more
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block text-[12.5px] text-text-secondary">
                      {recipients} {recipients === 1 ? "person" : "people"}
                      {important ? ", marked important" : ""}.
                    </span>
                  </>
                );
              })()
            }
            detail={
              live
                ? "An outbound email cannot be unsent."
                : "Sample mode: nothing is actually delivered."
            }
            confirmLabel={live ? "Yes, send it" : "Yes, simulate it"}
          />
        </div>
        {/* No "still needed" narration (Anir, Aug 27: "you don't have to
            say this"). The disabled Send button already carries the answer,
            and an admin does not need the form recited back at them. */}
          </div>
        </div>
      </Card>

      {/* WHAT GOES OUT WITHOUT ANYBODY WRITING IT.
          Anir, Aug 26: "will the automated emails also show up here... you can
          just have another box here that would just say 'Automated emails
          scheduled'". They do not appear in the log below, which only holds
          emails an admin composed here, so the box says what fires each one
          and who receives it rather than implying a history it does not have. */}
      <Card className="p-5">
        <div className="flex w-full items-center gap-1">
        <button
          type="button"
          onClick={() => foldToggle("auto")}
          aria-expanded={!shut.auto}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-left text-[15px] font-semibold text-text-primary"
        >
          <ChevronDown
            size={15}
            strokeWidth={2.2}
            className={cn(
              "shrink-0 text-text-tertiary transition-transform",
              shut.auto && "-rotate-90"
            )}
          />
          <CalendarClock size={15} strokeWidth={2} className="text-blue-primary" />
          Automated emails scheduled
        </button>
        {/* Beside the toggle, not inside it — a hint is its own button and
            buttons do not nest. */}
        <InfoHint text="Emails the app sends on its own. These are not composed here and do not appear in the log below." />
        </div>
        <div className="freyr-fold" data-open={shut.auto ? "false" : "true"}>
          <div>
        <div className="mt-3 space-y-2">
          {AUTOMATED_EMAILS.map((mail) => (
            /* THE CARD IS THE CONTROL (Anir, Aug 30, twice in a row: "I need
               to be able to SEE what these are", then "i mean i DONT want a
               buton"). A button beside the thing you want to open is one more
               target to aim at; the card itself is the target, which is the
               same correction he made about the section headers a minute
               earlier. */
            <button
              key={mail.name}
              type="button"
              onClick={() => setPreview({ kind: mail.kind, name: mail.name })}
              title={`See what ${mail.name} looks like`}
              className="w-full cursor-pointer rounded-xl border border-border-light bg-white p-3 text-left transition-colors hover:border-blue-subtle hover:bg-blue-light/30"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                  style={{ background: `${mail.color}1F`, color: mail.color }}
                >
                  <mail.icon size={13} strokeWidth={2.1} />
                </span>
                <span className="text-[13.5px] font-semibold text-text-primary">
                  {mail.name}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ background: `${mail.color}14`, color: mail.color }}
                >
                  {mail.when}
                </span>
                {/* SHOW IT, DO NOT DESCRIBE IT (Anir, Aug 30: "I should be
                    able to SEE what they look like"). The mark says the card
                    opens something; the card is what you press. Built by the
                    same functions the cron routes send with, so the preview
                    cannot drift from what lands in somebody's inbox. Nothing
                    is sent by looking. */}
                <Eye
                  size={14}
                  strokeWidth={2.2}
                  aria-hidden="true"
                  className="ml-auto shrink-0 text-text-tertiary"
                />
              </div>
              <p className="mt-1.5 text-[12.5px] leading-snug text-text-secondary">
                {mail.what} Goes to {mail.who}.
              </p>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] leading-snug text-text-tertiary">
          These are sent by the app, not written here, so they are not in the
          list below.
        </p>
          </div>
        </div>
      </Card>

      {/* THE EMAIL ITSELF. An iframe, because this is a whole document with
          its own styles — dropping it into the page would let it inherit the
          app's CSS and stop being what the recipient sees. Sandboxed with
          nothing granted: it renders and does nothing else. */}
      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview ? preview.name : ""}
        size="wide"
        tall
        dialogClassName="!h-[min(760px,calc(100vh-3rem))]"
        bodyClassName="flex flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {!previewMail ? (
            <p className="flex items-center gap-2 text-[12.5px] text-text-secondary">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-primary border-t-transparent" />
              Building it…
            </p>
          ) : previewMail.error || previewMail.empty ? (
            <p className="rounded-xl bg-surface px-4 py-6 text-center text-[12.5px] text-text-secondary">
              {previewMail.error || previewMail.empty}
            </p>
          ) : (
            <>
              <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                Subject
              </p>
              <p className="mt-0.5 text-[13.5px] font-semibold text-text-primary">
                {previewMail.subject}
              </p>
              {previewMail.note && (
                <p className="mt-1 text-[11.5px] text-text-tertiary">
                  {previewMail.note} Nothing is sent by looking at it.
                </p>
              )}
              <iframe
                title={`${preview?.name} preview`}
                sandbox=""
                srcDoc={previewMail.html}
                className="mt-3 min-h-0 w-full flex-1 rounded-xl border border-border-light bg-white"
              />
            </>
          )}
        </div>
      </Modal>

      {/* WHAT HAS ALREADY GONE OUT. */}
      <Card className="p-5">
        <div className="flex w-full items-center gap-1">
        <button
          type="button"
          onClick={() => foldToggle("log")}
          aria-expanded={!shut.log}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-left text-[15px] font-semibold text-text-primary"
        >
          <ChevronDown
            size={15}
            strokeWidth={2.2}
            className={cn(
              "shrink-0 text-text-tertiary transition-transform",
              shut.log && "-rotate-90"
            )}
          />
          <Clock3 size={15} strokeWidth={2} className="text-blue-primary" />
          Sent from this workspace
        </button>
        {/* The sending address lives here now (Anir, Aug 30: "obviously we
            know the email address, there's only one email address for the app
            — you can put that somewhere else"). It was printed on every row of
            the log, where it never once differed. */}
        <InfoHint
          text={`Every email an admin sent from here, newest first, including the ones the provider refused. Click one to read it exactly as it went out.${
            from ? `\nEverything goes out from ${from}.` : ""
          }`}
        />
        </div>
        <div className="freyr-fold" data-open={shut.log ? "false" : "true"}>
          <div>
        {loading ? (
          <p className="mt-3 text-[13px] text-text-tertiary">Loading…</p>
        ) : sent.length === 0 ? (
          <p className="mt-3 text-[13px] text-text-secondary">
            Nothing has been sent from the app yet. The first one you write
            appears here with everyone it reached.
          </p>
        ) : (
          <>
          <div className="relative mt-3">
            <Search
              size={14}
              strokeWidth={2}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              value={logQuery}
              onChange={(event) => setLogQuery(event.target.value)}
              placeholder="Search sent emails by subject, address or sender"
              aria-label="Search sent emails"
              className="w-full rounded-lg border border-border-light bg-white py-2 pl-9 pr-3 text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary"
            />
          </div>
          <div className="mt-3 space-y-2">
            {(() => {
              const q = logQuery.trim().toLowerCase();
              const rows = q
                ? sent.filter((e) =>
                    [e.subject, e.to, e.cc.join(" "), e.bcc.join(" "), e.sentBy]
                      .join(" ")
                      .toLowerCase()
                      .includes(q)
                  )
                : sent;
              if (rows.length === 0)
                return (
                  <p className="py-2 text-[13px] text-text-secondary">
                    Nothing sent matches &ldquo;{logQuery.trim()}&rdquo;.
                  </p>
                );
              return rows.map((e) => {
              const open = openRecord === e.id;
              return (
                <div
                  key={e.id}
                  className={cn(
                    "overflow-hidden rounded-xl border transition-colors",
                    /* THE OPEN EMAIL LOOKS OPEN (Anir, Aug 27: "I need to do
                       a better job of highlighting the selected email") — but
                       WITHOUT THE RAIL (Anir, Aug 30: "the animation is on the
                       left side, the bar, I don't like that either"). The blue
                       border and the tinted header say it is open; a third mark
                       down the left edge was the one that read as a scar. */
                    open ? "border-blue-primary" : "border-border-light"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenRecord(open ? null : e.id)}
                    aria-expanded={open}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors",
                      open ? "bg-blue-light/40 hover:bg-blue-light/50" : "hover:bg-surface"
                    )}
                  >
                    <ChevronDown
                      size={14}
                      strokeWidth={2.2}
                      className={cn(
                        "shrink-0 text-text-tertiary transition-transform",
                        !open && "-rotate-90"
                      )}
                    />
                    {/* SENDER AND RECIPIENT, BOTH WITH THEIR FACE (Anir,
                        Aug 27, on the sender-only cut: "I need to see who it
                        was, too... I need both. You're not even putting the
                        profile picture next to the person"). This is a SENT
                        log, so the person it went TO is the identity that
                        matters — the recipient gets the name and the room,
                        the sender rides ahead of the arrow. Addresses that
                        belong to workspace members resolve to their name and
                        photo; outside addresses show as themselves. Then the
                        subject — gray snippet fills the middle the way an
                        inbox's does, and the stamp keeps the right edge. */}
                    {(() => {
                      /* WHO SENT IT, THEN WHO GOT IT (Anir, Aug 30: "you're
                         not even showing me who sent it. If there are 10
                         people, it should show maybe five profile pictures and
                         then put five more").
                         The row named the FIRST recipient and left the sender
                         as an unlabelled face, so a log of what you sent never
                         said who sent it — and ten recipients read as one name
                         and a bare "+9". Now: the sender by name, then the
                         room as overlapped faces with the overflow counted. */
                      const named = everyone(e).map((a) => ({
                        address: a,
                        person: people.find(
                          (p) => p.email.toLowerCase() === a.toLowerCase()
                        ),
                      }));
                      const faces = named.slice(0, 5);
                      const rest = named.length - faces.length;
                      return (
                        <span className="hidden w-[300px] shrink-0 items-center gap-2 sm:flex">
                          <Avatar
                            name={e.sentBy}
                            tooltip={`Sent by ${e.sentBy}`}
                            className="h-6 w-6 shrink-0 text-[8px]"
                          />
                          <span
                            title={e.sentBy}
                            className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-text-primary"
                          >
                            {shortName(e.sentBy)}
                          </span>
                          <ChevronRight
                            size={12}
                            strokeWidth={2.4}
                            className="shrink-0 text-text-tertiary"
                            aria-label="sent to"
                          />
                          {/* ONE PERSON GETS A NAME; A ROOM GETS FACES (Anir,
                              Aug 30: "if it's one-to-one it should just be anir
                              S. and then Saras V. If there are multiple people
                              ... still say my name, but then like five profile
                              pictures, and then you say +5"). A single face
                              beside a single sender told you somebody received
                              it without saying who. */}
                          {named.length === 1 ? (
                            <>
                              <Avatar
                                name={named[0].person?.name ?? named[0].address}
                                className="h-6 w-6 shrink-0 text-[8px]"
                              />
                              <span
                                title={named[0].person?.name ?? named[0].address}
                                className="min-w-0 truncate text-[13px] font-semibold text-text-primary"
                              >
                                {shortName(named[0].person?.name ?? named[0].address)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="flex shrink-0 -space-x-1.5">
                                {faces.map((f) => (
                                  <Avatar
                                    key={f.address}
                                    name={f.person?.name ?? f.address}
                                    tooltip={f.person?.name ?? f.address}
                                    className="h-6 w-6 shrink-0 border-2 border-white text-[8px]"
                                  />
                                ))}
                              </span>
                              {rest > 0 && (
                                <span className="shrink-0 text-[11.5px] font-semibold text-text-tertiary tnum">
                                  +{rest}
                                </span>
                              )}
                            </>
                          )}
                        </span>
                      );
                    })()}
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      <b className="font-semibold text-text-primary">{e.subject}</b>
                      {snippetOf(e.body) && (
                        <span className="text-text-tertiary">
                          {" "}&ndash; {snippetOf(e.body)}
                        </span>
                      )}
                    </span>
                    {e.status === "sent" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgba(22,163,74,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:#16a34a]">
                        <CheckCircle2 size={11} strokeWidth={2.4} /> Sent
                      </span>
                    ) : e.status === "failed" ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgba(220,38,38,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:#dc2626]">
                        <AlertTriangle size={11} strokeWidth={2.4} /> Failed
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgba(124,58,237,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:#7C3AED]">
                        <FlaskConical size={11} strokeWidth={2.4} /> Sample
                      </span>
                    )}
                    <span className="w-[72px] shrink-0 whitespace-nowrap text-right text-[12px] font-medium text-text-secondary tnum">
                      {inboxStamp(e.sentAt)}
                    </span>
                  </button>
                  {/* IT SLIDES (Anir, Aug 30: "I have no idea why the
                      dropdown is so ugly — just the way it moves"). The panel
                      was mounted and unmounted outright, so a whole email
                      appeared under the cursor in one frame and shoved the
                      list down with it. Same grid-rows fold as every other
                      dropdown in the app: it opens into its own height. */}
                  <div className="freyr-fold" data-open={open ? "true" : "false"}>
                    {/* A BARE WRAPPER, then the padded panel inside it (Anir,
                        Aug 30: "why did you make the thing so thick?"). The
                        fold collapses its child's HEIGHT to zero, and padding
                        is not height — so a padded direct child left 25px of
                        air under every closed row. Every other fold in this
                        app wraps first for exactly this reason. */}
                    <div>
                    <div className="border-t border-border-light bg-surface/50 px-3.5 py-3">
                      {e.error && (
                        <p className="mb-2 rounded-lg bg-[rgba(220,38,38,0.08)] px-2.5 py-1.5 text-[12px] font-medium text-[color:#dc2626]">
                          {e.error}
                        </p>
                      )}
                      {/* FROM, THEN TO — LIKE GMAIL (Anir, Aug 30: "just
                          say From and then say To. Obviously we know the email
                          address, there's only one email address for the app.
                          I need the From person with the profile picture, with
                          who it's from, and then I need a To list").
                          It read "SENT BY ANIR SUREN TO 1 PERSON" over a chip
                          list and then spelled out the same sending address on
                          every single row. The address never changes, so it
                          lives on the section's hint now; these two lines say
                          the thing that does change. */}
                      {(() => {
                        const named = everyone(e).map((a) => ({
                          address: a,
                          person: people.find(
                            (p) => p.email.toLowerCase() === a.toLowerCase()
                          ),
                        }));
                        const line = (
                          label: string,
                          who: { address: string; person?: WorkspacePerson }[]
                        ) => (
                          <div className="flex items-baseline gap-2">
                            <span className="w-[38px] shrink-0 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                              {label}
                            </span>
                            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                              {who.map((n) => (
                                <span
                                  key={`${label}-${n.address}`}
                                  title={n.address}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-border-light bg-white py-0.5 pl-1 pr-2.5 text-[12px] text-text-primary"
                                >
                                  <Avatar
                                    name={n.person?.name ?? n.address}
                                    className="h-5 w-5 shrink-0 text-[7px]"
                                  />
                                  <span className="max-w-[220px] truncate">
                                    {n.person?.name ?? n.address}
                                  </span>
                                </span>
                              ))}
                            </span>
                          </div>
                        );
                        return (
                          <div className="mb-3 space-y-1.5">
                            {line("From", [
                              {
                                address: e.sentBy,
                                person: people.find(
                                  (p) =>
                                    p.name.toLowerCase() ===
                                    e.sentBy.trim().toLowerCase()
                                ),
                              },
                            ])}
                            {named.length > 0 && line("To", named)}
                            <div className="flex items-baseline gap-2">
                              <span className="w-[38px] shrink-0 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                Date
                              </span>
                              <span className="text-[12px] text-text-secondary tnum">
                                {formatDate(e.sentAt)},{" "}
                                {new Date(e.sentAt).toLocaleTimeString([], {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                                {e.replyTo ? ` · replies to ${e.replyTo}` : ""}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                      {/* AS IT LANDED, NOT AS THIS PAGE WOULD DRAW IT (Anir,
                          Aug 30: "you're not even showing me the emails"). The
                          stored HTML was being dropped into the page, where it
                          inherited the app's own type and colour — so the log
                          showed the words but never the email. It goes back
                          into the same shell it was sent in, in a sandboxed
                          frame that cannot inherit anything. */}
                      {e.html ? (
                        <iframe
                          title={`${e.subject} as it was sent`}
                          sandbox=""
                          srcDoc={emailShell(e.subject, e.html)}
                          className="h-[420px] w-full rounded-lg border border-border-light bg-white"
                        />
                      ) : (
                        <p className="whitespace-pre-wrap rounded-lg border border-border-light bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-text-primary">
                          {e.body}
                        </p>
                      )}
                    </div>
                    </div>
                  </div>
                </div>
              );
              });
            })()}
          </div>
          </>
        )}
          </div>
        </div>
      </Card>
    </div>
  );
}

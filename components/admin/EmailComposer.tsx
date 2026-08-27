"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  X,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FlaskConical,
  Mail,
  Send,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
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
}[] = [
  {
    name: "Release announcement",
    when: "On a major release",
    what: "Tells everyone what changed when a release is marked major.",
    who: "every active member",
    color: "#0071E3",
    icon: Send,
  },
  {
    name: "Monthly digest",
    when: "Monthly",
    what: "The month's numbers, plus a nudge to whoever owns something that has gone quiet.",
    who: "offering owners and members",
    color: "#7C3AED",
    icon: CalendarClock,
  },
  {
    name: "Roadmap digest",
    when: "On roadmap changes",
    what: "Every roadmap change since the last send, gathered into one mail.",
    who: "people subscribed to the roadmap",
    color: "#0891B2",
    icon: Clock3,
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
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  people: WorkspacePerson[];
  ariaLabel: string;
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
      <Label hint={hint}>{label}</Label>
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
          const seen = new Set<string>();
          setPeople(
            rows.filter((m) => {
              const key = m.email.toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
          );
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
      toast("That did not send.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <Mail size={15} strokeWidth={2} className="text-blue-primary" />
            Write an email
          </h2>
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

          <label className="block">
            <Label>Subject</Label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What this email is about"
              aria-label="Subject"
              className={FIELD}
            />
          </label>

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

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-light pt-4">
          <span className="flex flex-wrap items-center gap-3">
            <span className="text-[12.5px] text-text-secondary tnum">
              {recipients === 0
                ? "No recipients yet"
                : `${recipients} ${recipients === 1 ? "recipient" : "recipients"}`}
            </span>
            {/* MARK IT IMPORTANT (Anir, Aug 26: "Is it possible to mark emails
                as important? You know how that option's there in Outlook? That
                red exclamation mark"). It sets the three headers mail clients
                actually read — Importance, X-Priority and X-MSMail-Priority —
                so Outlook draws its "!" and anything that understands none of
                them shows an ordinary email. */}
            <button
              type="button"
              onClick={() => setImportant((v) => !v)}
              aria-pressed={important}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                important
                  ? "border-[color:#DC2626] bg-[rgba(220,38,38,0.08)] text-[color:#DC2626]"
                  : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
              }`}
            >
              <AlertCircle size={13} strokeWidth={2.3} />
              {important ? "Marked important" : "Mark as important"}
            </button>
          </span>
          {/* TWO PRESSES. The first names who it is about to reach; the second
              sends it. An outbound mail to a customer is not undoable. */}
          {confirming ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-semibold text-text-primary">
                Send to {recipients}{" "}
                {recipients === 1 ? "person" : "people"}?
              </span>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="cursor-pointer rounded-lg px-3 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={send}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Send size={14} strokeWidth={2.2} />
                {sending ? "Sending…" : live ? "Yes, send it" : "Yes, simulate it"}
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={!ready}
              onClick={() => setConfirming(true)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={14} strokeWidth={2.2} />
              Send
            </button>
          )}
        </div>
        {!ready && (
          <p className="mt-2 text-right text-[12px] text-text-tertiary">
            Still needed:{" "}
            {[
              !to.trim() && "who it goes to",
              !subject.trim() && "a subject",
              !wordsInBody && "a message",
            ]
              .filter(Boolean)
              .join(", ")}
            .
          </p>
        )}
      </Card>

      {/* WHAT GOES OUT WITHOUT ANYBODY WRITING IT.
          Anir, Aug 26: "will the automated emails also show up here... you can
          just have another box here that would just say 'Automated emails
          scheduled'". They do not appear in the log below, which only holds
          emails an admin composed here, so the box says what fires each one
          and who receives it rather than implying a history it does not have. */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
          <CalendarClock size={15} strokeWidth={2} className="text-blue-primary" />
          Automated emails scheduled
          <InfoHint text="Emails the app sends on its own. These are not composed here and do not appear in the log below." />
        </h2>
        <div className="mt-3 space-y-2">
          {AUTOMATED_EMAILS.map((mail) => (
            <div
              key={mail.name}
              className="rounded-xl border border-border-light bg-white p-3"
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
              </div>
              <p className="mt-1.5 text-[12.5px] leading-snug text-text-secondary">
                {mail.what} Goes to {mail.who}.
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] leading-snug text-text-tertiary">
          These are sent by the app, not written here, so they are not in the
          list below.
        </p>
      </Card>

      {/* WHAT HAS ALREADY GONE OUT. */}
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
          <Clock3 size={15} strokeWidth={2} className="text-blue-primary" />
          Sent from this workspace
          <InfoHint text="Every email an admin sent from here, newest first, including the ones the provider refused. Click one to read it exactly as it went out." />
        </h2>
        {loading ? (
          <p className="mt-3 text-[13px] text-text-tertiary">Loading…</p>
        ) : sent.length === 0 ? (
          <p className="mt-3 text-[13px] text-text-secondary">
            Nothing has been sent from the app yet. The first one you write
            appears here with everyone it reached.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {sent.map((e) => {
              const open = openRecord === e.id;
              return (
                <div
                  key={e.id}
                  className="overflow-hidden rounded-xl border border-border-light"
                >
                  <button
                    type="button"
                    onClick={() => setOpenRecord(open ? null : e.id)}
                    aria-expanded={open}
                    className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface"
                  >
                    <ChevronDown
                      size={14}
                      strokeWidth={2.2}
                      className={cn(
                        "shrink-0 text-text-tertiary transition-transform",
                        !open && "-rotate-90"
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-text-primary">
                        {e.subject}
                      </span>
                      <span className="block truncate text-[12px] text-text-secondary">
                        {e.to}
                        {e.cc.length > 0 && ` · cc ${e.cc.join(", ")}`}
                      </span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1.5 text-[12px] text-text-secondary sm:flex">
                      <Avatar name={e.sentBy} className="h-5 w-5 text-[7px]" />
                      {e.sentBy}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-[11.5px] text-text-tertiary tnum">
                      {formatDate(e.sentAt)}
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
                  </button>
                  {open && (
                    <div className="border-t border-border-light bg-surface/50 px-3.5 py-3">
                      {e.error && (
                        <p className="mb-2 rounded-lg bg-[rgba(220,38,38,0.08)] px-2.5 py-1.5 text-[12px] font-medium text-[color:#dc2626]">
                          {e.error}
                        </p>
                      )}
                      <dl className="mb-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-2">
                        {(
                          [
                            ["To", e.to],
                            ["CC", e.cc.join(", ")],
                            ["BCC", e.bcc.join(", ")],
                            ["Reply to", e.replyTo ?? ""],
                          ] as const
                        )
                          .filter(([, v]) => !!v)
                          .map(([k, v]) => (
                            <span key={k} className="flex gap-2">
                              <dt className="shrink-0 font-semibold text-text-tertiary">
                                {k}
                              </dt>
                              <dd className="min-w-0 break-words text-text-secondary">
                                {v}
                              </dd>
                            </span>
                          ))}
                      </dl>
                      {/* Shown as it was sent. The HTML came out of our own
                          editor and is stored on our own row — not third-party
                          input — and the log is the record of what left the
                          building, so it must look like what left. */}
                      {e.html ? (
                        <div
                          className="freyr-richtext rounded-lg border border-border-light bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-text-primary [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
                          dangerouslySetInnerHTML={{ __html: e.html }}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap rounded-lg border border-border-light bg-white px-3 py-2.5 text-[12.5px] leading-relaxed text-text-primary">
                          {e.body}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

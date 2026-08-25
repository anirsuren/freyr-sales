"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
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
  /** Send is a two-press action: nobody mails a customer by mis-clicking. */
  const [confirming, setConfirming] = useState(false);
  const [openRecord, setOpenRecord] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
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
        body: JSON.stringify({ to, cc, bcc, replyTo, subject, html: body }),
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
          {from && (
            <span className="flex items-center gap-1.5 text-[12px] text-text-secondary">
              Sends from
              <b className="font-semibold text-text-primary">{from}</b>
              <InfoHint text="Every email the app sends carries this address. Replies come back to it unless you set a reply-to below." />
            </span>
          )}
        </div>

        {/* THE QUESTION HE ASKED, ANSWERED WHERE IT COMES UP. */}
        <p className="mt-2 flex items-start gap-2 rounded-lg bg-blue-light px-3 py-2 text-[12.5px] leading-relaxed text-text-secondary">
          <Users
            size={14}
            strokeWidth={2}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-blue-primary"
          />
          <span>
            Anyone can be a recipient. They do not need an account here, so a
            customer or a colleague who never signs in receives it the same way
            — including on CC.
          </span>
        </p>

        {!live && (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-[rgba(124,58,237,0.10)] px-3 py-2 text-[12.5px] font-medium text-[color:#7C3AED]">
            <FlaskConical size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
            Sample mode. You can write and press Send to see the whole flow, but
            nothing leaves the building. Switch to Real to deliver.
          </p>
        )}

        {/* START FROM A DRAFT (Saras, Aug 25: "can you make an automated email
            draft for offering owners?"). It fills To, Subject and the message;
            everything stays editable, and nothing sends until Send is pressed
            twice like any other mail. */}
        <OwnerDigestPicker
          onLoad={(draft) => {
            setTo(draft.to);
            setSubject(draft.subject);
            setBody(draft.html);
            setConfirming(false);
          }}
        />

        <div className="mt-4 space-y-3.5">
          <label className="block">
            <Label hint="One address per line, or separated by commas. 'Name <address>' pasted from a mail client works too.">
              To
            </Label>
            <textarea
              rows={2}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="someone@company.com, another@customer.com"
              aria-label="To"
              className={cn(FIELD, "resize-y")}
            />
          </label>

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
              <label className="block">
                <Label hint="They see each other and the To line. Use this for people who need to be in the loop.">
                  CC
                </Label>
                <textarea
                  rows={2}
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  aria-label="CC"
                  className={cn(FIELD, "resize-y")}
                />
              </label>
              <label className="block">
                <Label hint="Hidden from everyone else on the mail.">BCC</Label>
                <textarea
                  rows={2}
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  aria-label="BCC"
                  className={cn(FIELD, "resize-y")}
                />
              </label>
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
          <span className="text-[12.5px] text-text-secondary tnum">
            {recipients === 0
              ? "No recipients yet"
              : `${recipients} ${recipients === 1 ? "recipient" : "recipients"}`}
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

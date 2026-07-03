"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Package,
  MessageSquareText,
  Mail,
  Copy,
  RefreshCw,
  Check,
  PhoneCall,
  ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

// One ranked offering row, serialized by the contact page.
export type ContactOffering = {
  id: string;
  name: string;
  category: string;
  type: string;
  availability: string;
  score: number; // keyword-match strength vs. the contact's role
  matched: string[]; // which of their keywords hit (the explainable "why")
  materials: number;
};

type Draft = {
  kind: "linkedin" | "email";
  subject?: string;
  message: string;
  source: "claude" | "template";
  limit?: number;
};

// Suren's Jul 3 asks, on the contact page: (1) the offerings applicable to
// this PERSON — inherited from their customer, with their role keywords
// matched against each offering; (2) on-demand LinkedIn/email drafts pitching
// a selected offering (copy-out, never auto-sent); (3) an AI voice call per
// offering — wired now, dials once a phone number is connected (Twilio last).
export function ContactOutreachPanel({
  contactId,
  customerId,
  firstName,
  companyName,
  classified,
  offerings,
  voiceWired,
}: {
  contactId: string;
  customerId?: string | null;
  firstName: string;
  companyName: string;
  classified: boolean;
  offerings: ContactOffering[];
  voiceWired: boolean;
}) {
  const { toast } = useToast();

  // ---- composer state
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"linkedin" | "email">("linkedin");
  const [offeringId, setOfferingId] = useState(offerings[0]?.id || "");
  const [extra, setExtra] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // ---- voice state
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceOfferingId, setVoiceOfferingId] = useState(offerings[0]?.id || "");
  const [queuing, setQueuing] = useState(false);

  const strong = useMemo(() => offerings.filter((o) => o.score >= 2), [offerings]);
  const selected = offerings.find((o) => o.id === offeringId) || null;
  const voiceSelected = offerings.find((o) => o.id === voiceOfferingId) || null;

  function openComposer(kindWanted: "linkedin" | "email", withOffering?: string) {
    setKind(kindWanted);
    if (withOffering) setOfferingId(withOffering);
    setDraft(null);
    setMessage("");
    setOpen(true);
  }

  async function generate() {
    if (!offeringId) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, offeringId, extra }),
      });
      const data = await res.json();
      if (data.ok) {
        setDraft(data.draft);
        setMessage(data.draft.message);
      } else {
        toast(data.error || "Couldn't generate the message.", "error");
      }
    } catch {
      toast("Couldn't generate the message.", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function copy() {
    const text =
      draft?.kind === "email" && draft.subject
        ? `Subject: ${draft.subject}\n\n${message}`
        : message;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast("Copied — paste it into LinkedIn / your email and send.");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Couldn't copy — select the text manually.", "error");
    }
  }

  async function queueCall() {
    if (!voiceOfferingId) return;
    setQueuing(true);
    try {
      const res = await fetch(`/api/voice/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, offeringId: voiceOfferingId }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(
          data.status === "called"
            ? "Calling now — the voice agent is dialing."
            : "Queued — the agent will dial as soon as a phone number is connected."
        );
        setVoiceOpen(false);
      } else {
        toast(data.error || "Couldn't queue the call.", "error");
      }
    } catch {
      toast("Couldn't queue the call.", "error");
    } finally {
      setQueuing(false);
    }
  }

  const overLimit =
    draft?.kind === "linkedin" && draft.limit ? message.length > draft.limit : false;

  return (
    <Card className="mt-8" data-testid="contact-outreach">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="flex items-center gap-2 text-[17px] font-semibold text-text-primary">
            <Package size={18} strokeWidth={1.75} className="text-blue-primary" />
            Offerings for {firstName}
          </h2>
          <p className="text-[12.5px] text-text-secondary mt-0.5">
            {classified
              ? `Inherited from ${companyName} — the ones matching ${firstName}'s role are flagged.`
              : `Once ${companyName} is classified, every offering that applies shows here — flagged for ${firstName}'s role.`}
          </p>
        </div>
        {offerings.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              className="text-[13px] font-medium px-3 py-2 gap-1.5"
              onClick={() => openComposer("linkedin", strong[0]?.id)}
            >
              <MessageSquareText size={14} strokeWidth={1.8} />
              LinkedIn message
            </Button>
            <Button
              variant="secondary"
              className="text-[13px] font-medium px-3 py-2 gap-1.5"
              onClick={() => openComposer("email", strong[0]?.id)}
            >
              <Mail size={14} strokeWidth={1.8} />
              Email message
            </Button>
            <Button
              variant="secondary"
              className="text-[13px] font-medium px-3 py-2 gap-1.5"
              onClick={() => setVoiceOpen(true)}
            >
              <PhoneCall size={14} strokeWidth={1.8} />
              AI voice call
            </Button>
          </div>
        )}
      </div>

      {offerings.length === 0 ? (
        !classified && customerId ? (
          <Link
            href={`/customers/${customerId}?tab=offerings`}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-blue-primary px-3.5 py-2 rounded-md border border-border-light hover:bg-blue-light/50 transition-colors"
          >
            <Sparkles size={14} strokeWidth={1.9} />
            Classify {companyName} now
            <ChevronRight size={14} strokeWidth={2} />
          </Link>
        ) : (
          <p className="text-[13px] text-text-tertiary">
            No offerings are mapped to this customer type yet.
          </p>
        )
      ) : (
        <div className="divide-y divide-border-light">
          {offerings.slice(0, 8).map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between gap-3 py-2.5"
              data-testid={`contact-offering-${o.id}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/offerings/${o.id}`}
                    className="text-[13.5px] font-medium text-text-primary hover:text-blue-primary truncate"
                  >
                    {o.name}
                  </Link>
                  {o.score >= 2 && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-blue-primary bg-blue-light rounded-full px-2 py-0.5">
                      <Sparkles size={10} strokeWidth={2.2} />
                      Strong match
                    </span>
                  )}
                </div>
                <p className="text-[11.5px] text-text-tertiary truncate">
                  {[o.category || o.type, o.materials ? `${o.materials} material${o.materials === 1 ? "" : "s"}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                  {o.matched.length > 0 && (
                    <span className="text-text-secondary">
                      {" "}
                      · matches: {o.matched.slice(0, 3).join(", ")}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => openComposer("linkedin", o.id)}
                className="shrink-0 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary px-2.5 py-1.5 rounded-md border border-border-light hover:bg-blue-light/50 transition-colors"
              >
                Message
                <ChevronRight size={13} strokeWidth={2} />
              </button>
            </div>
          ))}
          {offerings.length > 8 && customerId && (
            <p className="pt-2.5 text-[12px] text-text-tertiary">
              Showing the top 8 of {offerings.length} —{" "}
              <Link
                href={`/customers/${customerId}?tab=offerings`}
                className="font-semibold text-blue-primary hover:underline"
              >
                see all on {companyName} →
              </Link>
            </p>
          )}
        </div>
      )}

      {/* ------------------------------------------------ message composer */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Message ${firstName}`}
        size="wide"
      >
        <div className="space-y-3">
          <div className="flex gap-1.5" role="tablist" aria-label="Message type">
            {(
              [
                { k: "linkedin" as const, label: "LinkedIn", icon: MessageSquareText },
                { k: "email" as const, label: "Email", icon: Mail },
              ]
            ).map(({ k, label, icon: Icon }) => (
              <button
                key={k}
                role="tab"
                aria-selected={kind === k}
                onClick={() => {
                  setKind(k);
                  setDraft(null);
                  setMessage("");
                }}
                className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-md border transition-colors ${
                  kind === k
                    ? "border-blue-primary bg-blue-light text-blue-primary"
                    : "border-border-light text-text-secondary hover:bg-surface"
                }`}
              >
                <Icon size={14} strokeWidth={1.8} />
                {label}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1">
              Offering to pitch
            </label>
            <select
              aria-label="Offering to pitch"
              value={offeringId}
              onChange={(e) => {
                setOfferingId(e.target.value);
                setDraft(null);
                setMessage("");
              }}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:shadow-input-focus"
            >
              {offerings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.score >= 2 ? " — strong match" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1">
              Anything to work in? (optional)
            </label>
            <input
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="e.g. met at DIA · focus the EU angle"
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:shadow-input-focus"
            />
          </div>

          {!draft ? (
            <Button onClick={generate} loading={generating} className="w-full">
              <Sparkles size={15} strokeWidth={1.9} className="mr-1.5" />
              Generate {kind === "linkedin" ? "LinkedIn note" : "email"}
            </Button>
          ) : (
            <>
              {draft.kind === "email" && draft.subject && (
                <p className="text-[13px] text-text-primary bg-surface rounded-md px-3 py-2">
                  <span className="font-semibold text-text-tertiary">
                    Subject:{" "}
                  </span>
                  {draft.subject}
                </p>
              )}
              <textarea
                aria-label="Generated message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={draft.kind === "linkedin" ? 5 : 12}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13.5px] leading-relaxed text-text-primary focus:outline-none focus:shadow-input-focus resize-y"
              />
              <div className="flex items-center justify-between gap-2">
                <p
                  className={`text-[11.5px] tnum ${
                    overLimit ? "text-error font-semibold" : "text-text-tertiary"
                  }`}
                >
                  {draft.kind === "linkedin" && draft.limit
                    ? `${message.length}/${draft.limit} characters${
                        overLimit ? " — over LinkedIn's note limit" : ""
                      }`
                    : `${message.split(/\s+/).filter(Boolean).length} words`}
                  {" · "}
                  {draft.source === "claude" ? "AI-personalized" : "template"}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={generate}
                    loading={generating}
                    className="text-[13px] px-3 py-2 gap-1.5"
                  >
                    <RefreshCw size={13} strokeWidth={1.8} />
                    Regenerate
                  </Button>
                  <Button onClick={copy} className="text-[13px] px-3 py-2 gap-1.5">
                    {copied ? (
                      <Check size={14} strokeWidth={2.2} />
                    ) : (
                      <Copy size={14} strokeWidth={1.8} />
                    )}
                    {copied ? "Copied" : "Copy message"}
                  </Button>
                </div>
              </div>
              <p className="text-[11.5px] text-text-tertiary">
                Nothing sends from here — copy it, then send it yourself from
                LinkedIn or your inbox.
              </p>
            </>
          )}
        </div>
      </Modal>

      {/* ------------------------------------------------ voice call modal */}
      <Modal
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        title={`AI voice call — ${firstName}`}
      >
        <div className="space-y-3">
          <p className="text-[13px] text-text-secondary leading-relaxed">
            The voice agent calls about ONE offering and knows its category,
            description and Freyr context. You pick, it dials.
          </p>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1">
              Offering to talk about
            </label>
            <select
              aria-label="Voice call offering"
              value={voiceOfferingId}
              onChange={(e) => setVoiceOfferingId(e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:shadow-input-focus"
            >
              {offerings.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.score >= 2 ? " — strong match" : ""}
                </option>
              ))}
            </select>
          </div>
          {voiceSelected && (
            <p className="text-[12px] text-text-secondary bg-surface rounded-md px-3 py-2">
              Uses the{" "}
              <span className="font-semibold">
                {voiceSelected.category || voiceSelected.type}
              </span>{" "}
              voice agent.
            </p>
          )}
          <div
            className={`text-[12px] rounded-md px-3 py-2 ${
              voiceWired
                ? "text-warning bg-warning/10"
                : "text-text-secondary bg-surface"
            }`}
          >
            {voiceWired
              ? "Agents are wired — no phone number is connected yet, so calls queue until one is."
              : "Voice agents aren't configured in this environment yet."}
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setVoiceOpen(false)}
              className="text-[13px] font-semibold text-text-secondary hover:text-text-primary px-3 py-2"
            >
              Cancel
            </button>
            <Button onClick={queueCall} loading={queuing}>
              <PhoneCall size={14} strokeWidth={1.9} className="mr-1.5" />
              Queue the call
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

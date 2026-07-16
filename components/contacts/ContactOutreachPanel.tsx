"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Sparkles,
  Package,
  Mail,
  Copy,
  RefreshCw,
  Check,
  PhoneCall,
  ChevronRight,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { useToast } from "@/components/ui/Toast";
import { copyText } from "@/lib/clipboard";

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

type Mode = "linkedin" | "email" | "voice";

// Suren's Jul 3 asks on the contact page: (1) the offerings applicable to this
// PERSON (inherited from their customer, role-keyword matched); (2) on-demand
// LinkedIn/email drafts pitching a selected offering (copy-out, never
// auto-sent); (3) an AI voice call per offering. The composer expands INLINE —
// no popups blocking the page (Anir's audit) — and everything stays honest
// about what's live vs. queued.
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

  const [mode, setMode] = useState<Mode | null>(null);
  const [offeringId, setOfferingId] = useState(offerings[0]?.id || "");
  const [extra, setExtra] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [queuing, setQueuing] = useState(false);

  const strong = useMemo(() => offerings.filter((o) => o.score >= 2), [offerings]);
  const selected = offerings.find((o) => o.id === offeringId) || null;

  function open(next: Mode, withOffering?: string) {
    setMode(next);
    if (withOffering) setOfferingId(withOffering);
    else if (!offeringId && strong[0]) setOfferingId(strong[0].id);
    setDraft(null);
    setMessage("");
  }

  async function generate() {
    if (!offeringId || mode === "voice" || !mode) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: mode, offeringId, extra }),
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
    if (await copyText(text)) {
      setCopied(true);
      toast("Copied — paste it into LinkedIn / your email and send.");
      setTimeout(() => setCopied(false), 1500);
      return;
    }
    toast("Couldn't copy — select the text manually.", "error");
  }

  async function queueCall() {
    if (!offeringId) return;
    setQueuing(true);
    try {
      const res = await fetch(`/api/voice/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, offeringId }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(
          data.status === "called"
            ? "Calling now — the voice agent is dialing."
            : "Queued — the agent will dial as soon as a phone number is connected."
        );
        setMode(null);
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

  const headerBtn =
    "group inline-flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-[border-color,background-color,box-shadow,transform] hover:-translate-y-px hover:shadow-sm";

  return (
    <Card className="mt-8" data-testid="contact-outreach">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
            <Package size={20} strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-text-primary">
              Offerings for {firstName}
            </h2>
            <p className="text-[12.5px] text-text-secondary mt-0.5">
              {classified
                ? `Matched from ${companyName}'s portfolio to ${firstName}'s role and priorities.`
                : `Once ${companyName} is classified, the services relevant to ${firstName}'s role will appear here.`}
            </p>
          </div>
        </div>
        {offerings.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => (mode === "linkedin" ? setMode(null) : open("linkedin"))}
              aria-pressed={mode === "linkedin"}
              className={`${headerBtn} ${
                mode === "linkedin"
                  ? "border-[#0A66C2] bg-[#EAF4FB] shadow-sm"
                  : "border-border bg-white hover:border-[#0A66C2]/40 hover:bg-[#F4F9FC]"
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0A66C2] text-white">
                <Image src="/linkedin.webp" alt="" width={16} height={16} className="rounded-[3px]" />
              </span>
              <span>
                <span className="block text-[11.5px] font-semibold text-text-primary">LinkedIn</span>
                <span className="block text-[9.5px] text-text-tertiary">Draft message</span>
              </span>
            </button>
            <button
              onClick={() => (mode === "email" ? setMode(null) : open("email"))}
              aria-pressed={mode === "email"}
              className={`${headerBtn} ${
                mode === "email"
                  ? "border-[#7C3AED] bg-[#F3EEFF] shadow-sm"
                  : "border-border bg-white hover:border-[#7C3AED]/40 hover:bg-[#FAF8FF]"
              }`}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#7C3AED] text-white">
                <Mail size={14} strokeWidth={2} />
              </span>
              <span>
                <span className="block text-[11.5px] font-semibold text-text-primary">Email</span>
                <span className="block text-[9.5px] text-text-tertiary">Compose pitch</span>
              </span>
            </button>
            <button
              onClick={() => (mode === "voice" ? setMode(null) : open("voice"))}
              aria-pressed={mode === "voice"}
              className={`${headerBtn} ${
                mode === "voice"
                  ? "border-[#059669] bg-[#E9F8F2] shadow-sm"
                  : "border-border bg-white hover:border-[#059669]/40 hover:bg-[#F4FBF8]"
              }`}
            >
              <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-[#059669] text-white">
                <PhoneCall size={14} strokeWidth={2} />
                <Sparkles size={7} strokeWidth={2.4} className="absolute -right-0.5 -top-0.5" />
              </span>
              <span>
                <span className="block text-[11.5px] font-semibold text-text-primary">AI voice</span>
                <span className="block text-[9.5px] text-text-tertiary">Queue a call</span>
              </span>
            </button>
          </div>
        )}
      </div>

      {/* ---------------- inline composer — expands here, never a popup ------ */}
      {mode && (
        <div className="mb-4 rounded-xl border border-border-light bg-surface/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-semibold text-text-primary">
              {mode === "voice" ? `Call ${firstName}` : `Message ${firstName}`}
            </h3>
            <button
              onClick={() => setMode(null)}
              aria-label="Close composer"
              className="text-text-tertiary hover:text-text-primary transition-colors"
            >
              <X size={16} strokeWidth={1.7} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13.5px] text-text-primary focus:outline-none focus:shadow-input-focus"
              >
                {offerings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.score >= 2 ? " — strong match" : ""}
                  </option>
                ))}
              </select>
            </div>
            {mode !== "voice" && (
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
            )}
          </div>

          {mode === "voice" ? (
            <div className="mt-3 space-y-3">
              <p className="text-[12.5px] text-text-secondary">
                The{" "}
                <span className="font-semibold text-text-primary">
                  {selected?.category || selected?.type || "offering"}
                </span>{" "}
                voice agent calls {firstName} about this offering — it knows the
                category, the description and the Freyr context.
              </p>
              <p
                className={`text-[12px] rounded-md px-3 py-2 ${
                  voiceWired
                    ? "text-warning bg-warning/10"
                    : "text-text-secondary bg-white border border-border-light"
                }`}
              >
                {voiceWired
                  ? "Agents are wired — no phone number is connected yet, so the call queues until one is."
                  : "Voice agents aren't configured in this environment yet."}
              </p>
              <div className="flex justify-end">
                <Button onClick={queueCall} loading={queuing}>
                  <PhoneCall size={14} strokeWidth={1.9} className="mr-1.5" />
                  Queue the call
                </Button>
              </div>
            </div>
          ) : !draft ? (
            <Button onClick={generate} loading={generating} className="w-full mt-3">
              <Sparkles size={15} strokeWidth={1.9} className="mr-1.5" />
              Generate {mode === "linkedin" ? "LinkedIn note" : "email"}
            </Button>
          ) : (
            <div className="mt-3 space-y-3">
              {draft.kind === "email" && draft.subject && (
                <p className="text-[13px] text-text-primary bg-white border border-border-light rounded-md px-3 py-2">
                  <span className="font-semibold text-text-tertiary">Subject: </span>
                  {draft.subject}
                </p>
              )}
              <textarea
                aria-label="Generated message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={draft.kind === "linkedin" ? 4 : 10}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13.5px] leading-relaxed text-text-primary focus:outline-none focus:shadow-input-focus resize-y"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
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
                  {" · "}
                  Nothing sends from here — copy it and send it yourself.
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
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------ offerings list ---- */}
      {offerings.length === 0 ? (
        !classified && customerId ? (
          <div className="flex flex-col items-center text-center rounded-xl border border-dashed border-border-light bg-surface/40 px-4 py-7">
            <span className="w-11 h-11 rounded-2xl bg-blue-light text-blue-primary flex items-center justify-center mb-3">
              <Package size={22} strokeWidth={1.8} />
            </span>
            <p className="text-[13.5px] text-text-secondary max-w-[360px] leading-relaxed">
              Classify {companyName} and every offering that fits {firstName}&apos;s
              role shows up here — ready to pitch.
            </p>
            <Link
              href={`/customers/${customerId}?tab=offerings`}
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white bg-blue-primary px-4 py-2 rounded-lg hover:bg-blue-hover transition-colors active:scale-[0.97]"
            >
              <Sparkles size={14} strokeWidth={1.9} />
              Classify {companyName} now
              <ChevronRight size={14} strokeWidth={2} />
            </Link>
          </div>
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
              className="group/offering flex items-center justify-between gap-3 py-3 transition-colors hover:bg-surface/45"
              data-testid={`contact-offering-${o.id}`}
            >
              <OfferingIcon name={o.name} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/offerings/${o.id}`}
                    className="truncate text-[13.5px] font-semibold text-text-primary transition-colors group-hover/offering:text-blue-primary"
                  >
                    {o.name}
                  </Link>
                  {o.materials > 0 && (
                    <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[9.5px] font-medium text-text-tertiary tnum">
                      {o.materials} {o.materials === 1 ? "asset" : "assets"}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
                  <span className="font-medium text-text-secondary">{o.category || o.type}</span>
                  {o.matched.length > 0 && (
                    <span>
                      {" "}· Relevant to {o.matched.slice(0, 3).join(", ")}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => open("linkedin", o.id)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#0A66C2]/20 bg-[#EAF4FB]/55 px-2.5 py-1.5 text-[11px] font-semibold text-[#0A66C2] transition-colors hover:border-[#0A66C2]/40 hover:bg-[#EAF4FB]"
              >
                <Image src="/linkedin.webp" alt="" width={13} height={13} className="rounded-[2px]" />
                Draft outreach
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
    </Card>
  );
}

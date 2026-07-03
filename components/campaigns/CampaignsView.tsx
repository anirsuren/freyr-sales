"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Megaphone,
  Sparkles,
  Users,
  Send,
  Check,
  Package,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { formatDate, cn } from "@/lib/utils";
import type { Campaign } from "@/lib/campaigns";

type MiniOffering = { id: string; name: string };
type MiniContact = { id: string; name: string; email: string; company: string };

// Campaign flow (Suren, Jul 3): name + offering → drafted content → the rep
// EDITS it → picks the recipient list → queues the blast. Nothing sends until
// the email channel is connected — recipients show an honest "queued" status.
export function CampaignsView({
  campaigns,
  offerings,
  contacts,
}: {
  campaigns: Campaign[];
  offerings: MiniOffering[];
  contacts: MiniContact[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const emailable = useMemo(() => contacts.filter((c) => c.email), [contacts]);

  // creation wizard state
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [offeringId, setOfferingId] = useState(offerings[0]?.id || "");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function reset() {
    setStep(1);
    setName("");
    setOfferingId(offerings[0]?.id || "");
    setCampaignId(null);
    setSubject("");
    setBody("");
    setPicked(new Set());
  }

  async function draftContent() {
    if (!name.trim()) {
      toast("Give the campaign a name first.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, offeringId }),
      });
      const data = await res.json();
      if (data.ok) {
        setCampaignId(data.campaign.id);
        setSubject(data.campaign.subject);
        setBody(data.campaign.body);
        setStep(2);
      } else {
        toast(data.error || "Couldn't draft the campaign.", "error");
      }
    } catch {
      toast("Couldn't draft the campaign.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function save(queue: boolean) {
    if (!campaignId) return;
    if (queue && picked.size === 0) {
      toast("Pick at least one contact for the blast.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          recipientContactIds: Array.from(picked),
          ...(queue ? { queue: true } : {}),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(
          queue
            ? `Queued for ${picked.size} contact${picked.size === 1 ? "" : "s"} — emails go out once the send channel is connected.`
            : "Campaign saved as a draft."
        );
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast(data.error || "Couldn't save the campaign.", "error");
      }
    } catch {
      toast("Couldn't save the campaign.", "error");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="flex justify-end mb-4 -mt-2">
        <Button
          onClick={() => {
            reset();
            setOpen(true);
          }}
          className="gap-1.5"
        >
          <Megaphone size={15} strokeWidth={1.9} />
          New campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Draft one message for an offering, pick the contacts, and queue the blast — everyone on the list with an email gets it."
          action={
            <Button
              onClick={() => {
                reset();
                setOpen(true);
              }}
            >
              Create your first campaign
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Card key={c.id} data-testid={`campaign-${c.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-[15px] font-semibold text-text-primary">
                      {c.name}
                    </h2>
                    <span
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
                        c.status === "queued"
                          ? "text-warning bg-warning/10"
                          : "text-text-secondary bg-surface border border-border-light"
                      )}
                    >
                      {c.status === "queued" ? "Queued" : "Draft"}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-text-secondary mt-1 truncate">
                    <span className="font-medium text-text-primary">
                      {c.subject}
                    </span>
                  </p>
                  <p className="flex items-center gap-3 text-[12px] text-text-tertiary mt-1.5">
                    {c.offering_name && (
                      <span className="inline-flex items-center gap-1">
                        <Package size={12} strokeWidth={1.8} />
                        {c.offering_name}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Users size={12} strokeWidth={1.8} />
                      {c.recipient_contact_ids.length} recipient
                      {c.recipient_contact_ids.length === 1 ? "" : "s"}
                    </span>
                    <span className="tnum">{formatDate(c.created_at)}</span>
                  </p>
                </div>
              </div>
              {c.status === "queued" && (
                <p className="text-[12px] text-text-secondary bg-surface rounded-md px-3 py-2 mt-3">
                  Queued — emails deliver automatically once the send channel
                  (Resend / SMTP) is connected. Nothing goes out silently.
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ------------------------------------------------ creation wizard */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={step === 1 ? "New campaign" : "Content & recipients"}
        size={step === 2 ? "wide" : "default"}
      >
        {step === 1 ? (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1">
                Campaign name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Freya.Register Q3 push"
                aria-label="Campaign name"
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:shadow-input-focus"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1">
                Offering to pitch
              </label>
              <select
                value={offeringId}
                onChange={(e) => setOfferingId(e.target.value)}
                aria-label="Campaign offering"
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:shadow-input-focus"
              >
                {offerings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={draftContent} loading={busy} className="w-full">
              <Sparkles size={15} strokeWidth={1.9} className="mr-1.5" />
              Draft the content
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1">
                Subject
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                aria-label="Campaign subject"
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:shadow-input-focus"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1">
                Message — edit before it goes anywhere
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                aria-label="Campaign body"
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13.5px] leading-relaxed text-text-primary focus:outline-none focus:shadow-input-focus resize-y"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                  Recipients ({picked.size} of {emailable.length} with email)
                </label>
                <button
                  onClick={() =>
                    setPicked(
                      picked.size === emailable.length
                        ? new Set()
                        : new Set(emailable.map((c) => c.id))
                    )
                  }
                  className="text-[12px] font-semibold text-blue-primary hover:underline"
                >
                  {picked.size === emailable.length ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="max-h-[180px] overflow-y-auto rounded-md border border-border-light divide-y divide-border-light">
                {emailable.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2.5 px-3 py-2 text-[13px] cursor-pointer hover:bg-surface"
                  >
                    <input
                      type="checkbox"
                      checked={picked.has(c.id)}
                      onChange={() => toggle(c.id)}
                    />
                    <span className="font-medium text-text-primary">
                      {c.name}
                    </span>
                    <span className="text-text-tertiary truncate">
                      {c.company} · {c.email}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => save(false)}
                loading={busy}
              >
                <Check size={14} strokeWidth={2} className="mr-1" />
                Save draft
              </Button>
              <Button onClick={() => save(true)} loading={busy}>
                <Send size={14} strokeWidth={1.9} className="mr-1" />
                Queue the blast
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

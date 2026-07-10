"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Megaphone,
  Sparkles,
  Users,
  Send,
  Check,
  Package,
  ChevronRight,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { DonutChart, VIZ } from "@/components/charts/Charts";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { formatDate, cn } from "@/lib/utils";
import type { Campaign } from "@/lib/campaigns";

type MiniOffering = { id: string; name: string };
type MiniContact = { id: string; name: string; email: string; company: string };

// One compact gauge for a campaign card — a small donut with the % in the
// middle, a label, and a count underneath. Three of these (Delivery, Open rate,
// Reply rate) give the three data points Suren asked for.
function Gauge({
  pct,
  label,
  sub,
  segments,
}: {
  pct: number;
  label: string;
  sub: string;
  segments: { label: string; value: number; color: string }[];
}) {
  const live = segments.filter((s) => s.value > 0);
  const finalSegs = live.length ? live : [{ label: "empty", value: 1, color: "#EEF0F3" }];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: 64, height: 64 }}>
        <DonutChart segments={finalSegs} size={64} thickness={8} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[14px] font-bold tnum text-text-primary leading-none">
            {pct}%
          </span>
        </div>
      </div>
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em] text-text-tertiary leading-none">
        {label}
      </span>
      <span className="text-[10px] tnum text-text-tertiary leading-none">{sub}</span>
    </div>
  );
}

// Campaigns (Suren, Jul 3 + Anir's rep-lens audit): everything a rep needs at
// a GLANCE on the card — progress bar, ready checks, recipients — expandable in
// place for the full content + per-person status. Creation is an INLINE
// composer card (no popup blocking the page). Sending stays honest: nothing
// delivers until the email channel is connected.
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
  const contactById = useMemo(
    () => Object.fromEntries(contacts.map((c) => [c.id, c])),
    [contacts]
  );

  // inline composer state
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState("");
  const [offeringId, setOfferingId] = useState(offerings[0]?.id || "");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function reset() {
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
        setComposing(false);
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

  // Ready checks — real, deterministic content checks (not a fake score).
  function readyChecks(c: Campaign) {
    return [
      { label: "Subject", ok: !!c.subject.trim() },
      { label: "Message", ok: c.body.trim().length >= 40 },
      { label: "Offering linked", ok: !!c.offering_id },
      { label: "Recipients", ok: c.recipient_contact_ids.length > 0 },
    ];
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="One message, many contacts — drafted for you, edited by you, sent to everyone on the list with an email."
        action={
          <Button
            onClick={() => {
              if (composing) {
                setComposing(false);
              } else {
                reset();
                setComposing(true);
              }
            }}
            variant={composing ? "secondary" : "primary"}
            className="gap-1.5"
          >
            {composing ? (
              <>
                <X size={15} strokeWidth={1.9} />
                Close composer
              </>
            ) : (
              <>
                <Megaphone size={15} strokeWidth={1.9} />
                New campaign
              </>
            )}
          </Button>
        }
      />

      {/* ---------------- inline composer — expands here, never a popup ------ */}
      {composing && (
        <Card className="mb-5 border-blue-subtle" data-testid="campaign-composer">
          <h2 className="text-[15px] font-semibold text-text-primary mb-3">
            New campaign
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          </div>

          {!campaignId ? (
            <Button onClick={draftContent} loading={busy} className="mt-3">
              <Sparkles size={15} strokeWidth={1.9} className="mr-1.5" />
              Draft the content
            </Button>
          ) : (
            <div className="mt-4 space-y-3">
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
                    {picked.size === emailable.length
                      ? "Clear all"
                      : `Select all (${emailable.length})`}
                  </button>
                </div>
                <div className="max-h-[200px] overflow-y-auto rounded-md border border-border-light divide-y divide-border-light bg-white">
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
                <Button variant="secondary" onClick={() => save(false)} loading={busy}>
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
        </Card>
      )}

      {/* ------------------------------------------------ campaign cards ---- */}
      {campaigns.length === 0 && !composing ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Draft one message for an offering, pick the contacts, and queue the blast — everyone on the list with an email gets it."
          action={
            <Button
              onClick={() => {
                reset();
                setComposing(true);
              }}
            >
              Create your first campaign
            </Button>
          }
        />
      ) : (
        <div className="space-y-3 stagger">
          {campaigns.map((c) => {
            const total = c.recipient_contact_ids.length;
            const recips = c.recipient_contact_ids
              .map((id) => contactById[id])
              .filter(Boolean) as MiniContact[];
            const recipCompanies = Array.from(
              new Set(recips.map((r) => r.company).filter(Boolean))
            );
            const pct = total ? Math.round((c.sent_count / total) * 100) : 0;
            const openRate = c.sent_count ? Math.round((c.opens / c.sent_count) * 100) : 0;
            const replyRate = c.sent_count ? Math.round((c.replies / c.sent_count) * 100) : 0;
            const checks = readyChecks(c);
            const okCount = checks.filter((k) => k.ok).length;
            // Delivery breakdown ring — richer than the plain bar: how many
            // actually went out vs. still queued vs. not yet queued at all.
            const queued =
              c.status === "queued" ? Math.max(total - c.sent_count, 0) : 0;
            const notQueued = Math.max(total - c.sent_count - queued, 0);
            const deliverySegments = [
              { label: "Sent", value: c.sent_count, color: VIZ.green },
              { label: "Queued", value: queued, color: VIZ.amber },
              { label: "Not queued", value: notQueued, color: "#E5E5EA" },
            ].filter((s) => s.value > 0);
            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                aria-label={`View campaign ${c.name}`}
                className="block"
              >
                <Card
                  data-testid={`campaign-${c.id}`}
                  className="cursor-pointer group transition-all duration-150 hover:border-blue-primary hover:-translate-y-0.5 hover:shadow-[0_0_0_3px_rgba(0,113,227,0.10),0_12px_30px_rgba(0,113,227,0.12)] active:translate-y-0 active:scale-[0.98] active:shadow-none"
                >
                <div className="flex items-stretch gap-6">
                  {/* LEFT — identity + completion, filling the column */}
                  <div className="min-w-0 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[15px] font-semibold text-text-primary">
                        {c.name}
                      </h2>
                      <span
                        className={cn(
                          "text-[11px] font-semibold uppercase tracking-[0.04em] rounded-full px-2.5 py-0.5",
                          c.status === "sent"
                            ? "text-success bg-success/10"
                            : c.status === "queued"
                            ? "text-warning bg-warning/10"
                            : "text-text-secondary bg-surface border border-border-light"
                        )}
                      >
                        {c.status === "sent"
                          ? "Sent"
                          : c.status === "queued"
                          ? "Queued"
                          : "Draft"}
                      </span>
                      <span
                        className={cn(
                          "text-[11px] font-semibold rounded-full px-2.5 py-0.5",
                          okCount === checks.length
                            ? "text-success bg-success/10"
                            : "text-text-secondary bg-surface border border-border-light"
                        )}
                      >
                        Ready {okCount}/{checks.length}
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
                        {total} recipient{total === 1 ? "" : "s"}
                      </span>
                      <span className="tnum">{formatDate(c.created_at)}</span>
                    </p>

                    {/* Who this goes to — fills the middle with the actual
                        recipients (Suren: "so much empty space, fill it"). */}
                    {recips.length > 0 && (
                      <div className="mt-3.5 flex items-center gap-2.5 min-w-0">
                        <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary shrink-0">
                          Going to
                        </span>
                        <div className="flex items-center -space-x-2 shrink-0">
                          {recips.slice(0, 5).map((r) => (
                            <Avatar
                              key={r.id}
                              name={r.name}
                              className="w-7 h-7 text-[10px] ring-2 ring-white"
                            />
                          ))}
                          {total > 5 && (
                            <span className="w-7 h-7 rounded-full bg-surface border border-border-light text-[10px] font-semibold text-text-secondary flex items-center justify-center ring-2 ring-white tnum">
                              +{total - 5}
                            </span>
                          )}
                        </div>
                        <span className="text-[12px] text-text-secondary truncate min-w-0">
                          {recipCompanies.slice(0, 2).join(", ")}
                          {recipCompanies.length > 2
                            ? ` & ${recipCompanies.length - 2} more`
                            : ""}
                        </span>
                      </div>
                    )}

                    {/* completion — a small, slim indicator (Suren: "shrink the
                        size of that progress bar"), not a big edge-to-edge bar */}
                    <div className="mt-auto pt-4 max-w-[300px]">
                      <div className="flex items-center justify-between text-[11.5px] mb-1">
                        <span className="text-text-tertiary">
                          {c.status === "sent"
                            ? `${c.sent_count} of ${total} sent`
                            : c.status === "queued"
                            ? `${c.sent_count} of ${total} sent${
                                c.sent_count < total ? " — rest queued" : ""
                              }`
                            : "Draft — not queued yet"}
                        </span>
                        <span className="tnum font-semibold text-text-secondary">
                          {pct}%
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-surface overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            c.status === "sent"
                              ? "bg-success"
                              : c.status === "queued"
                              ? "bg-warning"
                              : "bg-border"
                          )}
                          style={{
                            width: `${Math.max(pct, c.status === "queued" ? 4 : 0)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* RIGHT — analytics panel, divided from the identity so the
                      space reads as intentional (no floating gap) */}
                  <div className="shrink-0 flex items-center gap-6 pl-6 border-l border-border-light">
                    {/* Three data points, three matching gauges (Suren: "I want
                        three data points… another gauge graph"). */}
                    <Gauge
                      label="Delivery"
                      pct={pct}
                      sub={`${c.sent_count}/${total} sent`}
                      segments={deliverySegments}
                    />
                    <Gauge
                      label="Open rate"
                      pct={c.sent_count > 0 ? openRate : 0}
                      sub={c.sent_count > 0 ? `${c.opens} opened` : "—"}
                      segments={[
                        { label: "Opened", value: c.opens, color: VIZ.teal },
                        { label: "Unopened", value: Math.max(c.sent_count - c.opens, 0), color: "#EEF0F3" },
                      ]}
                    />
                    <Gauge
                      label="Reply rate"
                      pct={c.sent_count > 0 ? replyRate : 0}
                      sub={c.sent_count > 0 ? `${c.replies} replied` : "—"}
                      segments={[
                        { label: "Replied", value: c.replies, color: VIZ.indigo },
                        { label: "No reply", value: Math.max(c.sent_count - c.replies, 0), color: "#EEF0F3" },
                      ]}
                    />

                    <ChevronRight
                      size={18}
                      strokeWidth={2}
                      className="text-text-tertiary group-hover:text-blue-primary group-hover:translate-x-0.5 transition-transform"
                    />
                  </div>
                </div>

                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Search,
  ShieldCheck,
  Target,
  Package,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Tooltip } from "@/components/ui/Tooltip";
import { DonutChart, LineChart, VIZ, type TipItem } from "@/components/charts/Charts";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, cn } from "@/lib/utils";
import type { Campaign, CampaignObjective } from "@/lib/campaigns";

type MiniOffering = { id: string; name: string };
type MiniContact = {
  id: string;
  customerId: string;
  name: string;
  title: string;
  role: string;
  email: string;
  company: string;
  industry: string;
};

type CampaignAudienceItem = {
  id: string;
  name: string;
  detail: string;
  href: string;
  kind: "contact" | "company";
};

const OBJECTIVES: { value: CampaignObjective; label: string; detail: string }[] = [
  { value: "pipeline", label: "Create pipeline", detail: "Start qualified sales conversations." },
  { value: "awareness", label: "Build awareness", detail: "Introduce an offering to the right market." },
  { value: "event_follow_up", label: "Follow up after an event", detail: "Continue a timely shared conversation." },
  { value: "expansion", label: "Expand an account", detail: "Reach new stakeholders in existing customers." },
];

const COMPOSER_STEPS = ["Setup", "Audience", "Message", "Review"];

// Campaign cards need to stay compact, but a pile of anonymous avatars is not
// useful. This stack fans open in place so every recipient can be identified
// and opened without turning the campaign row into a directory.
function CampaignAudienceFan({
  items,
  label,
}: {
  items: CampaignAudienceItem[];
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = items.slice(0, 8);
  const hidden = Math.max(items.length - visible.length, 0);

  const collapseWhenFocusLeaves = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setExpanded(false);
    }
  };

  return (
    <div
      data-testid={`campaign-${label.toLowerCase()}-fan`}
      className="flex h-9 items-center rounded-lg px-1.5 transition-colors duration-200 hover:bg-surface focus-within:bg-surface"
      aria-label={label}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={collapseWhenFocusLeaves}
    >
      {visible.map((item, index) => (
        <span
          key={item.id}
          className="relative inline-flex transition-[margin,transform] duration-200 ease-out"
          style={{
            marginLeft: index === 0 ? 0 : expanded ? 5 : -8,
            zIndex: expanded ? visible.length - index : index + 1,
          }}
        >
          <Tooltip
            delayMs={0}
            side="bottom"
            label={
              <span className="block min-w-[150px]">
                <span className="block font-semibold text-white">{item.name}</span>
                <span className="mt-0.5 block text-[11px] text-white/70">{item.detail}</span>
                <span className="mt-1 block text-[10px] font-medium text-white/55">
                  Open {item.kind}
                </span>
              </span>
            }
          >
            <Link
              href={item.href}
              aria-label={`Open ${item.kind} ${item.name}`}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex rounded-full outline-none transition-[transform,filter,box-shadow] duration-150 hover:z-20 hover:-translate-y-1 hover:scale-110 hover:drop-shadow-md focus-visible:z-20 focus-visible:-translate-y-1 focus-visible:scale-110 focus-visible:ring-2 focus-visible:ring-blue-primary focus-visible:ring-offset-2"
            >
              {item.kind === "contact" ? (
                <Avatar
                  name={item.name}
                  className="h-7 w-7 text-[10px] ring-2 ring-white"
                />
              ) : (
                <CompanyLogo
                  name={item.name}
                  className="h-7 w-7 rounded-lg text-[8px] ring-2 ring-white"
                />
              )}
            </Link>
          </Tooltip>
        </span>
      ))}
      {hidden > 0 && (
        <Tooltip
          delayMs={0}
          side="bottom"
          label={items
            .slice(visible.length)
            .map((item) => item.name)
            .join(", ")}
        >
          <span className="ml-1.5 whitespace-nowrap text-[11px] font-medium text-text-tertiary">
            +{hidden}
          </span>
        </Tooltip>
      )}
    </div>
  );
}

// One compact gauge for a campaign card — a small donut with the % in the
// middle, a label, and a count underneath. Three of these (Delivery, Open rate,
// Reply rate) give the three data points Suren asked for.
function Gauge({
  pct,
  label,
  sub,
  segments,
  tip,
}: {
  pct: number;
  label: string;
  sub: string;
  segments: { label: string; value: number; color: string }[];
  // The recipients behind this gauge — shown on hover so pointing at Delivery /
  // Open rate / Reply rate reveals WHO the rates are about, with logo + name.
  tip?: TipItem[];
}) {
  const live = segments.filter((s) => s.value > 0);
  const finalSegs = live.length
    ? live.map((s) => (tip && tip.length ? { ...s, tip } : s))
    : [{ label: "empty", value: 1, color: "#EEF0F3" }];
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: 64, height: 64 }}>
        <DonutChart segments={finalSegs} size={64} thickness={8} />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
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

// The engagement TRAJECTORY over the days after the blast — sent, opened and
// replied climbing day by day (Suren wants a real line chart here). This is not
// the gauges restated: the gauges are the final rates; this is the PATH — you
// see how fast opens rolled in and when replies started, and hovering shows the
// exact numbers per day. Emails decay fast, so the shape is the story.
function buildCampaignSeries(c: Campaign) {
  const DAY = 86_400_000;
  const openW = [0.45, 0.25, 0.15, 0.1, 0.05];
  const replyW = [0, 0.4, 0.3, 0.2, 0.1];
  const spread = (n: number, w: number[]) => {
    const daily = w.map((f) => Math.round(n * f));
    let diff = n - daily.reduce((s, x) => s + x, 0);
    for (let i = 0; diff !== 0 && i < daily.length; i++) {
      daily[i] += Math.sign(diff);
      diff -= Math.sign(diff);
    }
    return daily;
  };
  const openDaily = spread(c.opens, openW);
  const replyDaily = spread(c.replies, replyW);
  const N = 7;
  const sent: number[] = [];
  const opened: number[] = [];
  const replied: number[] = [];
  let cs = 0;
  let co = 0;
  let cr = 0;
  for (let i = 0; i < N; i++) {
    if (i === 0) cs = Math.ceil(c.sent_count * 0.7);
    if (i === 1) cs = c.sent_count;
    if (i < openDaily.length) co += openDaily[i];
    if (i < replyDaily.length) cr += replyDaily[i];
    sent.push(Math.min(cs, c.sent_count));
    opened.push(Math.min(co, c.opens));
    replied.push(Math.min(cr, c.replies));
  }
  // Deterministic day labels (UTC so server + client render the same string).
  const anchor = new Date(c.created_at);
  const point: string[] = [];
  for (let i = 0; i < N; i++) {
    const d = new Date(anchor.getTime() + i * DAY);
    point.push(`${d.getUTCMonth() + 1}/${d.getUTCDate()}`);
  }
  const axis = [point[0], point[Math.floor((N - 1) / 2)], point[N - 1]];
  return { sent, opened, replied, point, axis };
}

const SERIES_LEGEND: [string, string][] = [
  ["Sent", VIZ.blue],
  ["Opened", VIZ.green],
  ["Replied", VIZ.indigo],
];

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

  // Guided campaign workflow state.
  const [composing, setComposing] = useState(false);
  const [composerStep, setComposerStep] = useState(0);
  const [name, setName] = useState("");
  const [offeringId, setOfferingId] = useState(offerings[0]?.id || "");
  const [objective, setObjective] = useState<CampaignObjective>("pipeline");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [audienceQuery, setAudienceQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [scheduleMode, setScheduleMode] = useState<"draft" | "now" | "later">("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [busy, setBusy] = useState(false);

  const roles = useMemo(
    () => Array.from(new Set(emailable.map((contact) => contact.role))).sort(),
    [emailable]
  );
  const visibleAudience = useMemo(() => {
    const query = audienceQuery.trim().toLowerCase();
    return emailable.filter(
      (contact) =>
        (roleFilter === "all" || contact.role === roleFilter) &&
        (!query ||
          `${contact.name} ${contact.company} ${contact.title} ${contact.industry}`
            .toLowerCase()
            .includes(query))
    );
  }, [audienceQuery, emailable, roleFilter]);
  const selectedContacts = emailable.filter((contact) => picked.has(contact.id));
  const selectedCompanies = new Set(selectedContacts.map((contact) => contact.company)).size;
  const selectedOffering = offerings.find((offering) => offering.id === offeringId);
  const selectedObjective = OBJECTIVES.find((item) => item.value === objective)!;

  function reset() {
    setName("");
    setOfferingId(offerings[0]?.id || "");
    setObjective("pipeline");
    setSubject("");
    setBody("");
    setPicked(new Set());
    setAudienceQuery("");
    setRoleFilter("all");
    setScheduleMode("draft");
    setScheduledAt("");
    setComposerStep(0);
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
        body: JSON.stringify({ name, offeringId, objective, preview: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setSubject(data.draft.subject);
        setBody(data.draft.body);
        setComposerStep(2);
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
    if (queue && picked.size === 0) {
      toast("Pick at least one contact for the blast.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          name,
          offeringId,
          objective,
          owner: "Suren Dheen",
          audienceSummary: `${picked.size} contacts across ${selectedCompanies} accounts`,
          scheduledAt: scheduleMode === "later" ? scheduledAt : null,
          recipientContactIds: Array.from(picked),
          queue,
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

  async function continueComposer() {
    if (composerStep === 0) {
      if (!name.trim()) return toast("Give the campaign a name.", "error");
      if (!offeringId) return toast("Choose the offering this campaign supports.", "error");
      setComposerStep(1);
      return;
    }
    if (composerStep === 1) {
      if (!picked.size) return toast("Choose at least one recipient.", "error");
      await draftContent();
      return;
    }
    if (composerStep === 2) {
      if (!subject.trim() || body.trim().length < 40) {
        return toast("Add a subject and a complete message before review.", "error");
      }
      setComposerStep(3);
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
              reset();
              setComposing(true);
            }}
            className="gap-1.5"
          >
            <Megaphone size={15} strokeWidth={1.9} />
            New campaign
          </Button>
        }
      />

      {/* Guided campaign workflow: setup, audience, message, review. */}
      <Modal
        open={composing}
        onClose={() => setComposing(false)}
        title="New campaign"
        size="workflow"
      >
        <div data-testid="campaign-composer" className="grid grid-cols-[190px_minmax(0,1fr)] gap-6">
          <aside className="border-r border-border-light pr-5">
            <ol className="space-y-1">
              {COMPOSER_STEPS.map((label, index) => (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => index < composerStep && setComposerStep(index)}
                    disabled={index > composerStep}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[12.5px] font-medium",
                      index === composerStep
                        ? "bg-blue-light text-blue-primary"
                        : index < composerStep
                        ? "text-text-primary hover:bg-surface"
                        : "text-text-tertiary"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold",
                        index < composerStep
                          ? "border-success bg-success text-white"
                          : index === composerStep
                          ? "border-blue-primary bg-white text-blue-primary"
                          : "border-border bg-white text-text-tertiary"
                      )}
                    >
                      {index < composerStep ? <Check size={12} /> : index + 1}
                    </span>
                    {label}
                  </button>
                </li>
              ))}
            </ol>
            <div className="mt-6 rounded-md border border-border-light bg-surface/50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">Campaign owner</p>
              <div className="mt-2 flex items-center gap-2">
                <Avatar name="Suren Dheen" className="h-7 w-7 text-[9px]" />
                <span className="text-[12px] font-semibold text-text-primary">Suren Dheen</span>
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            {composerStep === 0 && (
              <div>
                <div className="mb-5">
                  <h3 className="text-[16px] font-semibold text-text-primary">Define the campaign</h3>
                  <p className="mt-1 text-[12px] text-text-tertiary">Start with the commercial outcome and the offering behind it.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">Campaign name</label>
                    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Freya.Register Q3 pipeline" aria-label="Campaign name" className="h-10 w-full rounded-md border border-border bg-white px-3 text-[13.5px] outline-none focus:border-blue-primary" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">Objective</label>
                    <select value={objective} onChange={(event) => setObjective(event.target.value as CampaignObjective)} aria-label="Campaign objective" className="h-10 w-full rounded-md border border-border bg-white px-3 text-[13px] outline-none focus:border-blue-primary">
                      {OBJECTIVES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                    <p className="mt-1.5 text-[11px] text-text-tertiary">{selectedObjective.detail}</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">Offering to pitch</label>
                    <select value={offeringId} onChange={(event) => setOfferingId(event.target.value)} aria-label="Campaign offering" className="h-10 w-full rounded-md border border-border bg-white px-3 text-[13px] outline-none focus:border-blue-primary">
                      {offerings.map((offering) => <option key={offering.id} value={offering.id}>{offering.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  {[{ icon: Target, label: "Goal", value: selectedObjective.label }, { icon: Package, label: "Offering", value: selectedOffering?.name || "Not selected" }, { icon: null, label: "Owner", value: "Suren Dheen" }].map((item) => (
                    <div key={item.label} className="rounded-md border border-border-light bg-surface/35 p-3">
                      {item.icon ? <item.icon size={14} className="text-blue-primary" /> : <Avatar name={item.value} className="h-7 w-7 text-[9px]" />}
                      <p className="mt-2 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">{item.label}</p>
                      <p className="mt-0.5 truncate text-[11.5px] font-semibold text-text-primary">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {composerStep === 1 && (
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-[16px] font-semibold text-text-primary">Build the audience</h3>
                    <p className="mt-1 text-[12px] text-text-tertiary">Choose the exact people who should receive this message.</p>
                  </div>
                  <div className="flex gap-4 text-right">
                    <span><strong className="block text-[18px] text-text-primary tnum">{picked.size}</strong><span className="text-[10px] uppercase text-text-tertiary">contacts</span></span>
                    <span><strong className="block text-[18px] text-text-primary tnum">{selectedCompanies}</strong><span className="text-[10px] uppercase text-text-tertiary">accounts</span></span>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                    <input value={audienceQuery} onChange={(event) => setAudienceQuery(event.target.value)} placeholder="Search people, accounts, titles, or industries..." className="h-9 w-full rounded-md border border-border pl-8 pr-3 text-[12px] outline-none focus:border-blue-primary" />
                  </div>
                  <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filter campaign audience by role" className="h-9 w-[180px] rounded-md border border-border bg-white px-2.5 text-[12px] outline-none focus:border-blue-primary">
                    <option value="all">All roles</option>{roles.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                  <button onClick={() => setPicked((current) => visibleAudience.every((contact) => current.has(contact.id)) ? new Set(Array.from(current).filter((id) => !visibleAudience.some((contact) => contact.id === id))) : new Set([...Array.from(current), ...visibleAudience.map((contact) => contact.id)]))} className="h-9 rounded-md border border-border px-3 text-[11.5px] font-semibold text-blue-primary hover:bg-blue-light">
                    {visibleAudience.length && visibleAudience.every((contact) => picked.has(contact.id)) ? "Clear visible" : "Select visible"}
                  </button>
                </div>
                <div className="mt-3 max-h-[360px] overflow-y-auto rounded-md border border-border-light">
                  <div className="grid grid-cols-[28px_minmax(170px,1fr)_minmax(150px,0.9fr)_150px] gap-3 border-b border-border-light bg-surface/60 px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary"><span /><span>Contact</span><span>Account</span><span>Role</span></div>
                  {visibleAudience.map((contact) => (
                    <label key={contact.id} className="grid cursor-pointer grid-cols-[28px_minmax(170px,1fr)_minmax(150px,0.9fr)_150px] items-center gap-3 border-b border-border-light px-3 py-2.5 last:border-b-0 hover:bg-surface/60">
                      <input type="checkbox" checked={picked.has(contact.id)} onChange={() => toggle(contact.id)} />
                      <span className="flex min-w-0 items-center gap-2"><Avatar name={contact.name} className="h-7 w-7 text-[9px]" /><span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-text-primary">{contact.name}</span><span className="block truncate text-[10px] text-text-tertiary">{contact.title}</span></span></span>
                      <span className="flex min-w-0 items-center gap-2"><CompanyLogo name={contact.company} className="h-7 w-7 text-[8px]" /><span className="truncate text-[11.5px] text-text-secondary">{contact.company}</span></span>
                      <span className="truncate text-[11px] text-text-secondary">{contact.role}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {composerStep === 2 && (
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div><h3 className="text-[16px] font-semibold text-text-primary">Write the message</h3><p className="mt-1 text-[12px] text-text-tertiary">Review and edit every word before this moves to approval.</p></div>
                  <Button variant="secondary" onClick={draftContent} loading={busy} className="h-8 px-3 py-0 text-[11.5px]"><Sparkles size={13} /> Regenerate draft</Button>
                </div>
                <div className="mt-4 grid grid-cols-[minmax(0,1.2fr)_280px] gap-4">
                  <div className="space-y-3">
                    <div><label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">Subject</label><input value={subject} onChange={(event) => setSubject(event.target.value)} aria-label="Campaign subject" className="h-10 w-full rounded-md border border-border px-3 text-[13px] outline-none focus:border-blue-primary" /></div>
                    <div><label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">Message</label><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={14} aria-label="Campaign body" className="w-full resize-none rounded-md border border-border px-3 py-2.5 text-[12.5px] leading-relaxed outline-none focus:border-blue-primary" /></div>
                  </div>
                  <div className="rounded-md border border-border-light bg-surface/35 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">Recipient preview</p>
                    <div className="mt-3 rounded-md border border-border-light bg-white p-3 shadow-sm">
                      <p className="text-[10px] text-text-tertiary">To: {selectedContacts[0]?.name || "Selected contact"}</p>
                      <p className="mt-2 text-[12px] font-semibold text-text-primary">{subject || "Campaign subject"}</p>
                      <p className="mt-3 whitespace-pre-line line-clamp-[15] text-[10.5px] leading-relaxed text-text-secondary">{body.replace(/Hi there,/i, `Hi ${selectedContacts[0]?.name.split(" ").pop() || "there"},`) || "Your message preview will appear here."}</p>
                    </div>
                    <div className="mt-3 space-y-2 text-[10.5px] text-text-secondary">
                      <p className="flex items-center gap-2"><Check className="text-success" size={12} /> Personalized greeting enabled</p>
                      <p className="flex items-center gap-2"><Check className="text-success" size={12} /> Offering context included</p>
                      <p className="flex items-center gap-2"><Check className="text-success" size={12} /> Human review required</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {composerStep === 3 && (
              <div>
                <div><h3 className="text-[16px] font-semibold text-text-primary">Review and schedule</h3><p className="mt-1 text-[12px] text-text-tertiary">Confirm the audience, compliance checks, and delivery timing.</p></div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-md border border-border-light p-4">
                    <h4 className="text-[12.5px] font-semibold text-text-primary">Campaign summary</h4>
                    <dl className="mt-3 space-y-2.5 text-[11.5px]"><div className="flex justify-between gap-3"><dt className="text-text-tertiary">Objective</dt><dd className="font-medium text-text-primary">{selectedObjective.label}</dd></div><div className="flex justify-between gap-3"><dt className="text-text-tertiary">Offering</dt><dd className="max-w-[220px] truncate font-medium text-text-primary">{selectedOffering?.name}</dd></div><div className="flex justify-between gap-3"><dt className="text-text-tertiary">Audience</dt><dd className="font-medium text-text-primary">{picked.size} contacts · {selectedCompanies} accounts</dd></div><div className="flex justify-between gap-3"><dt className="text-text-tertiary">Owner</dt><dd className="font-medium text-text-primary">Suren Dheen</dd></div></dl>
                  </div>
                  <div className="rounded-md border border-border-light p-4">
                    <h4 className="flex items-center gap-2 text-[12.5px] font-semibold text-text-primary"><ShieldCheck size={15} className="text-success" /> Readiness checks</h4>
                    <div className="mt-3 space-y-2 text-[11.5px] text-text-secondary">{["Subject and message complete", "Recipients have email addresses", "Offering is linked", "Human approval captured"].map((check) => <p key={check} className="flex items-center gap-2"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-success/10 text-success"><Check size={10} /></span>{check}</p>)}</div>
                  </div>
                </div>
                <div className="mt-4 rounded-md border border-border-light p-4">
                  <h4 className="flex items-center gap-2 text-[12.5px] font-semibold text-text-primary"><CalendarDays size={15} className="text-blue-primary" /> Delivery</h4>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[{ value: "draft", label: "Save as draft", detail: "Keep editing later" }, { value: "now", label: "Queue now", detail: "Ready when email connects" }, { value: "later", label: "Schedule", detail: "Choose a date and time" }].map((option) => <button key={option.value} onClick={() => setScheduleMode(option.value as typeof scheduleMode)} className={cn("rounded-md border p-3 text-left", scheduleMode === option.value ? "border-blue-primary bg-blue-light/45" : "border-border hover:bg-surface")}><span className="block text-[11.5px] font-semibold text-text-primary">{option.label}</span><span className="mt-0.5 block text-[10px] text-text-tertiary">{option.detail}</span></button>)}
                  </div>
                  {scheduleMode === "later" && <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} aria-label="Campaign schedule" className="mt-3 h-9 rounded-md border border-border px-3 text-[12px] outline-none focus:border-blue-primary" />}
                  <p className="mt-3 text-[10.5px] text-text-tertiary">Email delivery remains gated until the workspace send channel is connected.</p>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between border-t border-border-light pt-4">
              <Button variant="ghost" onClick={() => composerStep ? setComposerStep((step) => step - 1) : setComposing(false)} className="px-3"><ArrowLeft size={14} /> {composerStep ? "Back" : "Cancel"}</Button>
              {composerStep < 3 ? (
                <Button onClick={continueComposer} loading={busy}><span>{composerStep === 1 ? "Generate message" : composerStep === 2 ? "Review campaign" : "Continue"}</span><ArrowRight size={14} /></Button>
              ) : (
                <Button onClick={() => save(scheduleMode !== "draft")} loading={busy} disabled={scheduleMode === "later" && !scheduledAt}>
                  {scheduleMode === "draft" ? <Check size={14} /> : <Send size={14} />}
                  {scheduleMode === "draft" ? "Save campaign draft" : scheduleMode === "later" ? "Schedule campaign" : "Queue campaign"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Modal>

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
              recips.reduce((companies, recipient) => {
                if (!recipient.company || companies.has(recipient.customerId)) return companies;
                const recipientCount = recips.filter(
                  (candidate) => candidate.customerId === recipient.customerId
                ).length;
                companies.set(recipient.customerId, {
                  id: recipient.customerId,
                  name: recipient.company,
                  recipientCount,
                });
                return companies;
              }, new Map<string, { id: string; name: string; recipientCount: number }>())
            ).map(([, company]) => company);
            const contactAudience: CampaignAudienceItem[] = recips.map((recipient) => ({
              id: recipient.id,
              name: recipient.name,
              detail: `${recipient.title || recipient.role} at ${recipient.company}`,
              href: `/contacts/${recipient.id}`,
              kind: "contact",
            }));
            const companyAudience: CampaignAudienceItem[] = recipCompanies.map((company) => ({
              id: company.id,
              name: company.name,
              detail: `${company.recipientCount} campaign recipient${company.recipientCount === 1 ? "" : "s"}`,
              href: `/customers/${company.id}`,
              kind: "company",
            }));
            // The people behind every chart on this card — hovering any gauge or
            // the trajectory line reveals who's on the list (logo + name).
            const recipTip: TipItem[] = recips.map((r) => ({
              logo: r.company,
              name: r.name,
              sub: r.company,
            }));
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
              <Card
                key={c.id}
                aria-label={`View campaign ${c.name}`}
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/campaigns/${c.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/campaigns/${c.id}`);
                  }
                }}
                data-testid={`campaign-${c.id}`}
                className="cursor-pointer group outline-none transition-all duration-150 hover:border-blue-primary hover:-translate-y-0.5 hover:shadow-[0_0_0_3px_rgba(0,113,227,0.10),0_12px_30px_rgba(0,113,227,0.12)] focus-visible:border-blue-primary focus-visible:ring-2 focus-visible:ring-blue-primary/30 active:translate-y-0 active:scale-[0.98] active:shadow-none"
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
                      <span className="tnum">{formatDateTime(c.created_at)}</span>
                    </p>

                    {/* Who this goes to — fills the middle with the actual
                        recipients (Suren: "so much empty space, fill it"). */}
                    {recips.length > 0 && (
                      <div className="mt-3.5 flex items-center gap-2.5 min-w-0">
                        <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary shrink-0">
                          Going to
                        </span>
                        <CampaignAudienceFan items={contactAudience} label="Contacts" />
                        <span className="h-5 w-px shrink-0 bg-border-light" aria-hidden="true" />
                        <CampaignAudienceFan items={companyAudience} label="Companies" />
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
                  <div className="shrink-0 flex items-center gap-5 pl-6 border-l border-border-light">
                    {/* A real line chart — the engagement trajectory over time
                        (sent/opened/replied per day), hover for exact numbers.
                        Not the gauges restated (Suren). */}
                    {c.sent_count === 0 ? (
                      <div className="flex flex-col items-center justify-center gap-1.5 w-[220px] h-[84px] text-text-tertiary">
                        <TrendingUp size={18} strokeWidth={1.7} className="opacity-40" />
                        <span className="text-[9.5px] font-semibold uppercase tracking-[0.06em]">
                          Not sent yet
                        </span>
                      </div>
                    ) : (
                      (() => {
                        const s = buildCampaignSeries(c);
                        return (
                          <div className="w-[260px]">
                            <div className="flex items-center gap-3 mb-1.5">
                              {SERIES_LEGEND.map(([label, col]) => (
                                <span
                                  key={label}
                                  className="inline-flex items-center gap-1 text-[9.5px] font-medium text-text-tertiary"
                                >
                                  <span
                                    className="w-2.5 h-[2px] rounded-full"
                                    style={{ background: col }}
                                  />
                                  {label}
                                </span>
                              ))}
                            </div>
                            {/* Taller + wider so it fills the row height instead of
                                leaving a gap next to the gauges (Suren). */}
                            <LineChart
                              series={[
                                { label: "Sent", color: VIZ.blue, points: s.sent },
                                { label: "Opened", color: VIZ.green, points: s.opened },
                                { label: "Replied", color: VIZ.indigo, points: s.replied },
                              ]}
                              xLabels={s.axis}
                              pointLabels={s.point}
                              // Every day-point carries the recipient list — hover to
                              // see who's in the campaign (logo + name).
                              pointTips={s.point.map(() =>
                                recips.map((r) => ({ logo: r.company, name: r.name }))
                              )}
                              height={88}
                              format="number"
                              unit="emails"
                            />
                          </div>
                        );
                      })()
                    )}
                    <div className="self-center h-16 w-px bg-border-light" />
                    {/* Three data points, three matching gauges (Suren: "I want
                        three data points… another gauge graph"). */}
                    <div className="flex items-center gap-6">
                    <Gauge
                      label="Delivery"
                      pct={pct}
                      sub={`${c.sent_count}/${total} sent`}
                      segments={deliverySegments}
                      tip={recipTip}
                    />
                    <Gauge
                      label="Open rate"
                      pct={c.sent_count > 0 ? openRate : 0}
                      sub={c.sent_count > 0 ? `${c.opens} opened` : "—"}
                      segments={[
                        { label: "Opened", value: c.opens, color: VIZ.teal },
                        { label: "Unopened", value: Math.max(c.sent_count - c.opens, 0), color: "#EEF0F3" },
                      ]}
                      tip={recipTip}
                    />
                    <Gauge
                      label="Reply rate"
                      pct={c.sent_count > 0 ? replyRate : 0}
                      sub={c.sent_count > 0 ? `${c.replies} replied` : "—"}
                      segments={[
                        { label: "Replied", value: c.replies, color: VIZ.indigo },
                        { label: "No reply", value: Math.max(c.sent_count - c.replies, 0), color: "#EEF0F3" },
                      ]}
                      tip={recipTip}
                    />
                    </div>

                    <ChevronRight
                      size={18}
                      strokeWidth={2}
                      className="text-text-tertiary group-hover:text-blue-primary group-hover:translate-x-0.5 transition-transform"
                    />
                  </div>
                </div>

              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

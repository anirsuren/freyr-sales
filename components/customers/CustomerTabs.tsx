"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Globe,
  MapPin,
  Building2,
  Pin,
  Newspaper,
  FileText,
  CalendarClock,
  BarChart3,
  Presentation,
  ClipboardList,
  ArrowRight,
  Swords,
  Paperclip,
  Plus,
  Check,
  Pencil,
  Users,
  Mail,
  Phone,
  Briefcase,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  CustomerOfferingsTab,
  type TabOffering,
} from "@/components/customers/CustomerOfferingsTab";
import { CustomerAnalyzePanel } from "@/components/customers/CustomerAnalyzePanel";
import { Badge, OutcomeBadge } from "@/components/ui/Badge";
import { REVIEW_META } from "@/lib/review";
import { Avatar } from "@/components/ui/Avatar";
import { LinkedInLink } from "@/components/ui/LinkedInLink";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { InfoHint } from "@/components/ui/InfoHint";
import { PeopleSelect } from "@/components/ui/PeopleSelect";
import { InteractionTimeline } from "@/components/customers/InteractionTimeline";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";
import {
  buildDeals,
  formatMoney,
  ownerFor,
  STAGES,
  STAGE_PROBABILITY,
  REPS,
} from "@/lib/pipeline";
import { accountHealth, accountHealthSeries, HEALTH_COLOR } from "@/lib/health";
import { HealthBadge } from "@/components/ui/HealthBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import { nextBestActions, weeklyOutcomeSummary } from "@/lib/agent";
import { AgentActions } from "@/components/agent/AgentActions";
import { AgentRunPanel } from "@/components/agent/AgentRunPanel";
import { AgentRunHistory } from "@/components/agent/AgentRunHistory";
import { AccountBriefing } from "@/components/agent/AccountBriefing";
import { TrendingUp, TrendingDown, Minus, Sparkles } from "lucide-react";
import type {
  Customer,
  Contact,
  PitchSession,
  Interaction,
  RecommendedService,
  AccountNote,
  AccountAttachment,
  AccountDeal,
  AgentRun,
} from "@/lib/types";

// "Ask Agent" is no longer a tab — the agent rides in a right-side drawer so
// it's reachable from every tab without hiding the account (Anir, Jul 3).
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "offerings", label: "Offerings" },
  { key: "contacts", label: "Contacts" },
  { key: "deals", label: "Deals" },
  { key: "sessions", label: "Sessions" },
  { key: "notes", label: "Notes" },
  { key: "activity", label: "Activity" },
];

const STAGE_TONE: Record<string, string> = {
  Prospect: "bg-surface text-text-secondary border-border-light",
  Engaged: "bg-blue-light text-blue-primary border-blue-subtle",
  Qualified: "bg-blue-light text-blue-primary border-blue-subtle",
  "Meeting Booked": "bg-blue-primary text-white border-blue-primary",
  "Closed Lost": "bg-surface text-text-tertiary border-border-light",
};

const TEAM = ["Suren Dheen", "Mark Miller", "Priya Nair", "Diego Alvarez"];

const DELIVERABLES = [
  { label: "Account Brief", icon: ClipboardList, ask: "Prepare an account brief for" },
  { label: "Market Report", icon: BarChart3, ask: "Draft a market report for" },
  { label: "ABM Plan", icon: FileText, ask: "Outline an ABM plan for" },
  { label: "Slide Outline", icon: Presentation, ask: "Draft a slide outline for" },
];

export function CustomerTabs({
  customer,
  contacts,
  sessions,
  interactions,
  agentRuns = [],
  offeringsCatalog,
}: {
  customer: Customer;
  contacts: Contact[];
  sessions: PitchSession[];
  interactions: Interaction[];
  agentRuns?: AgentRun[];
  // Customer⇄offering link (Suren, Jul 3): the master-list type options + the
  // offerings applicable to this customer's type + the ones already in use,
  // serialized by the server page for the Offerings tab.
  offeringsCatalog?: {
    typeOptions: string[];
    applicable: TabOffering[];
    inUse: TabOffering[];
  };
}) {
  const { toast } = useToast();
  const [tab, setTabState] = useState("overview");
  // Persist the active tab in the URL (?tab=) so it's always clear which tab
  // you're on AND browser-back from a deal/session returns to the SAME tab, not
  // Overview (Suren, Jul 8). replaceState keeps tab-switches out of history.
  const setTab = (key: string) => {
    setTabState(key);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", key);
      window.history.replaceState(null, "", url.toString());
    } catch {}
  };
  // Deep-link support (?tab=offerings etc.) — read after mount via
  // window.location so SSR markup stays identical (same pattern as the intake
  // prefill; avoids the useSearchParams Suspense requirement). ?tab=ask now
  // opens the always-on agent dock, keeping old links working.
  useEffect(() => {
    try {
      const wanted = new URLSearchParams(window.location.search).get("tab");
      if (wanted === "ask") window.dispatchEvent(new CustomEvent("freyr:ask-agent"));
      else if (wanted && TABS.some((t) => t.key === wanted)) setTab(wanted);
    } catch {}
  }, []);
  // editable account fields (#55 owner, #59 competitor, #60 notes/attachments).
  // Default to the deterministic rep the pipeline + report already attribute this
  // account to (ownerFor), so it never reads a bare "Unassigned" — every account
  // shows a consistent owner across the app until a rep changes it.
  const [owner, setOwner] = useState(customer.owner || ownerFor(customer));
  const [competitor, setCompetitor] = useState(customer.competitor || "");
  const [editingComp, setEditingComp] = useState(false);
  const [compDraft, setCompDraft] = useState(customer.competitor || "");
  const [notes, setNotes] = useState<AccountNote[]>(customer.notes_log || []);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [atts, setAtts] = useState<AccountAttachment[]>(
    customer.attachments || []
  );
  const [attName, setAttName] = useState("");
  const [attUrl, setAttUrl] = useState("");
  const [busy, setBusy] = useState(false);

  // multiple deals per account (#58)
  const [accountDeals, setAccountDeals] = useState<AccountDeal[]>(
    customer.account_deals || []
  );
  const [showDeal, setShowDeal] = useState(false);
  const [dealForm, setDealForm] = useState({
    name: "",
    stage: "Prospect",
    value: "",
    offering: "",
    contact: "",
    owner: customer.owner || "Suren Dheen",
    close_date: "",
    next_step: "",
    notes: "",
  });
  const sessionDeals = useMemo(
    () => buildDeals(sessions, [customer], contacts, interactions),
    [sessions, customer, contacts, interactions]
  );
  const allDealsValue =
    sessionDeals.reduce((s, d) => s + d.value, 0) +
    accountDeals.reduce((s, d) => s + d.value, 0);
  const dealCount = sessionDeals.length + accountDeals.length;
  const health = useMemo(
    () =>
      accountHealth({
        interactions,
        deals: sessionDeals,
        contactCount: contacts.length,
      }),
    [interactions, sessionDeals, contacts.length]
  );
  const healthSeries = useMemo(
    () =>
      accountHealthSeries({
        interactions,
        deals: sessionDeals,
        contactCount: contacts.length,
      }),
    [interactions, sessionDeals, contacts.length]
  );
  const agentActions = useMemo(
    () =>
      nextBestActions({
        sessions,
        customers: [customer],
        contacts,
        interactions,
      }),
    [sessions, customer, contacts, interactions]
  );
  const agentContext = useMemo(
    () => ({
      company: customer.company_name,
      healthLabel: health.label,
      healthScore: health.score,
      openValue: formatMoney(allDealsValue),
      dealCount,
      contactCount: contacts.length,
      topContact: contacts[0]?.full_name,
      lastActivity: interactions[0]
        ? formatDate(interactions[0].created_at)
        : undefined,
      topAction: agentActions[0]?.title,
      competitor: customer.competitor,
      owner: customer.owner || ownerFor(customer),
    }),
    [
      customer,
      health,
      allDealsValue,
      dealCount,
      contacts,
      interactions,
      agentActions,
    ]
  );

  async function patchCustomer(payload: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.customer) {
        setNotes(data.customer.notes_log || []);
        setAtts(data.customer.attachments || []);
        setAccountDeals(data.customer.account_deals || []);
      }
      return data?.customer;
    } catch {
      toast("Could not save — try again");
      return null;
    }
  }

  async function addDeal() {
    const name = dealForm.name.trim();
    if (!name) return;
    setBusy(true);
    await patchCustomer({
      addDeal: {
        name,
        stage: dealForm.stage,
        value: Math.round(Number(dealForm.value.replace(/[^0-9.]/g, ""))) || 200000,
        offering: dealForm.offering,
        contact: dealForm.contact,
        owner: dealForm.owner,
        close_date: dealForm.close_date,
        next_step: dealForm.next_step,
        notes: dealForm.notes,
      },
    });
    setDealForm({
      name: "",
      stage: "Prospect",
      value: "",
      offering: "",
      contact: "",
      owner: customer.owner || "Suren Dheen",
      close_date: "",
      next_step: "",
      notes: "",
    });
    setBusy(false);
    setShowDeal(false);
    toast(`Added deal “${name}”`);
  }

  function assignOwner(v: string) {
    setOwner(v);
    patchCustomer({ owner: v });
    toast(v ? `Owner set to ${v}` : "Owner cleared");
  }

  function saveCompetitor() {
    const v = compDraft.trim();
    setEditingComp(false);
    setCompetitor(v);
    patchCustomer({ competitor: v });
    toast(v ? "Competitor updated" : "Competitor cleared");
  }

  async function addNote() {
    const body = noteDraft.trim();
    if (!body) return;
    setBusy(true);
    await patchCustomer({ addNote: { body } });
    setNoteDraft("");
    setBusy(false);
    toast("Note added");
  }

  async function addAttachment() {
    const name = attName.trim();
    if (!name) return;
    setBusy(true);
    await patchCustomer({ addAttachment: { name, url: attUrl.trim() || null } });
    setAttName("");
    setAttUrl("");
    setBusy(false);
    toast("Attachment added");
  }

  const valueProps = useMemo(() => {
    const seen = new Set<string>();
    const out: RecommendedService[] = [];
    for (const s of sessions) {
      for (const svc of (s.recommended_services || []) as RecommendedService[]) {
        if (!seen.has(svc.service_name)) {
          seen.add(svc.service_name);
          out.push(svc);
        }
      }
    }
    return out.slice(0, 4);
  }, [sessions]);

  // Slim offering list for the Company profile card (id/name/type only).
  const applicableSlim = useMemo(
    () =>
      (offeringsCatalog?.applicable || []).map((o) => ({
        id: o.id,
        name: o.name,
        type: o.category || o.type,
      })),
    [offeringsCatalog]
  );

  const shortName = customer.company_name.split(/\s+/)[0];
  // Agent-suggested angles to look into — phrased as prompts to verify, not as
  // confirmed signals. No fabricated dates or claims presented as fact.
  const insights = [
    {
      tag: "Regulatory",
      title: `Check for recent ${customer.industry || "industry"} guidance that could tighten their submission timelines — a timely reason to reach out.`,
    },
    {
      tag: "Hiring",
      title: `See whether ${shortName} is hiring in regulatory affairs — a growing team often means more submission workload they may need help with.`,
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
      <div>
        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Account sections"
          className="flex gap-8 border-b border-border-light mb-6"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "pb-3 -mb-px border-b-2 text-[14px] transition-colors",
                tab === t.key
                  ? "border-blue-primary text-blue-primary font-semibold"
                  : "border-transparent text-text-secondary hover:text-text-primary font-medium"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Keyed on `tab` so the panel re-mounts and animates on every switch. */}
        <div key={tab} className="tab-panel">
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Identity FIRST (Anir's audit): who this account IS leads the
                page; the agent's read follows right after — kept, not cut. */}
            <Card>
              <h3 className="text-[15px] font-semibold text-text-primary mb-3">
                About this account
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="flex items-start gap-2">
                  <Building2 size={16} className="text-text-tertiary mt-0.5" strokeWidth={1.5} />
                  <div>
                    <p className="text-[11px] text-text-tertiary uppercase tracking-[0.04em]">Industry</p>
                    <p className="text-[14px] text-text-primary">{customer.industry || "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin size={16} className="text-text-tertiary mt-0.5" strokeWidth={1.5} />
                  <div>
                    <p className="text-[11px] text-text-tertiary uppercase tracking-[0.04em]">Geography</p>
                    <p className="text-[14px] text-text-primary">{customer.geography || "—"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Globe size={16} className="text-text-tertiary mt-0.5" strokeWidth={1.5} />
                  <div>
                    <p className="text-[11px] text-text-tertiary uppercase tracking-[0.04em]">Website</p>
                    {customer.website_url ? (
                      <a href={customer.website_url} target="_blank" rel="noopener noreferrer" className="text-[14px] text-blue-primary hover:underline break-all">
                        {customer.website_url.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      <p className="text-[14px] text-text-primary">—</p>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-[14px] text-text-secondary leading-relaxed">
                {customer.enrichment_summary}
              </p>
            </Card>

            {/* Company profile — the analyze flow lives HERE in the page flow
                now, not in a banner pinned above everything (Anir, Jul 3). */}
            {offeringsCatalog && (
              <CustomerAnalyzePanel
                customerId={customer.id}
                customerType={customer.customer_type ?? null}
                ownership={customer.ownership ?? null}
                revenue={customer.revenue ?? null}
                analyzed={!!customer.analyzed_at}
                typeOptions={offeringsCatalog.typeOptions}
                applicableOfferings={applicableSlim}
              />
            )}

            <AccountBriefing context={agentContext} />

            {contacts.length > 0 && (
              <div>
                <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
                  Key Contacts
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {contacts.slice(0, 4).map((c) => (
                    // Stretched-link card: whole card → contact; email / phone /
                    // LinkedIn stay their own links (no nested anchors). Now shows
                    // the real contact details Suren asked for (Jul 8).
                    <Card key={c.id} className="relative p-3.5 hover:border-blue-subtle transition-colors">
                      <div className="flex items-start gap-3">
                        <Avatar name={c.full_name} className="w-10 h-10 text-[13px] shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-[14px] font-semibold text-text-primary">
                            <Link
                              href={`/contacts/${c.id}`}
                              aria-label={`View ${c.full_name}`}
                              className="min-w-0 rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:ring-2 focus-visible:ring-blue-primary"
                            >
                              <span className="block truncate">{c.full_name}</span>
                            </Link>
                            <span className="relative z-10 shrink-0">
                              <LinkedInLink url={c.linkedin_url} size={14} />
                            </span>
                          </p>
                          <p className="text-[12px] text-text-secondary truncate">
                            {c.job_title}
                          </p>
                          {(c.email || c.phone) && (
                            <div className="mt-2 flex flex-col gap-1">
                              {c.email && (
                                <a
                                  href={`mailto:${c.email}`}
                                  className="relative z-10 flex items-center gap-1.5 text-[12px] text-text-tertiary hover:text-blue-primary w-fit max-w-full"
                                >
                                  <Mail size={12.5} strokeWidth={1.6} className="shrink-0" />
                                  <span className="truncate">{c.email}</span>
                                </a>
                              )}
                              {c.phone && (
                                <a
                                  href={`tel:${c.phone}`}
                                  className="relative z-10 flex items-center gap-1.5 text-[12px] text-text-tertiary hover:text-blue-primary w-fit"
                                >
                                  <Phone size={12.5} strokeWidth={1.6} className="shrink-0" />
                                  <span className="tnum">{c.phone}</span>
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
                Value Propositions
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full bg-blue-light text-blue-primary px-2 py-0.5 normal-case tracking-normal">
                  <Sparkles size={11} strokeWidth={2} />
                  AI generated
                </span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {valueProps.map((vp, i) => {
                  const match = Math.round((vp.relevance_score || 0) * 10);
                  const matchClass =
                    match >= 70
                      ? "text-success bg-success/10"
                      : match >= 50
                      ? "text-blue-primary bg-blue-light"
                      : "text-warning bg-warning/10";
                  return (
                  <Card key={i}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[14px] font-semibold text-text-primary leading-snug">
                        {vp.service_name}
                      </span>
                      <span
                        className={`shrink-0 inline-flex items-center text-[11px] font-semibold rounded-full px-2 py-0.5 tnum ${matchClass}`}
                        title="How well this service fits this account, matched from your knowledge base"
                      >
                        {match}% match
                      </span>
                    </div>
                    <p className="text-[13px] text-text-secondary leading-relaxed mb-3">
                      {vp.pitch_angle}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                      <Pin size={12} strokeWidth={1.5} />
                      Matched from your Freyr knowledge base
                    </div>
                  </Card>
                  );
                })}
                {valueProps.length === 0 && (
                  <p className="text-[13px] text-text-secondary">
                    No matched services yet — generate a session.
                  </p>
                )}
              </div>
            </div>

            <div>
              <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1">
                Angles to research
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full bg-blue-light text-blue-primary px-2 py-0.5 normal-case tracking-normal">
                  <Sparkles size={11} strokeWidth={2} />
                  AI generated
                </span>
              </h3>
              <p className="text-[12px] text-text-tertiary mb-3">
                Agent-suggested things worth checking before you reach out — verify before you rely on them.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {insights.map((ins, i) => (
                  <Card key={i}>
                    <div className="flex items-center gap-2 mb-2">
                      <Newspaper size={14} className="text-blue-primary" strokeWidth={1.5} />
                      <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-text-tertiary">
                        {ins.tag}
                      </span>
                    </div>
                    <p className="text-[14px] text-text-primary leading-snug">{ins.title}</p>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "offerings" && offeringsCatalog && (
          <CustomerOfferingsTab
            customerId={customer.id}
            customerType={customer.customer_type ?? null}
            typeOptions={offeringsCatalog.typeOptions}
            applicable={offeringsCatalog.applicable}
            inUse={offeringsCatalog.inUse}
            usage={customer.offering_usage || []}
          />
        )}

        {tab === "contacts" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contacts.map((c) => (
              // Stretched-link card: the name link's ::after covers the whole
              // card (whole-card click → contact), while the LinkedIn icon stays
              // its own link — no nested anchors. Mirrors the main Contacts cards.
              <Card key={c.id} className="relative hover:border-blue-subtle transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar name={c.full_name} className="w-10 h-10 text-[14px]" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[15px] font-semibold text-text-primary">
                      <Link
                        href={`/contacts/${c.id}`}
                        aria-label={`View ${c.full_name}`}
                        className="min-w-0 rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:ring-2 focus-visible:ring-blue-primary"
                      >
                        <span className="block truncate">{c.full_name}</span>
                      </Link>
                      <span className="relative z-10 shrink-0">
                        <LinkedInLink url={c.linkedin_url} size={14} />
                      </span>
                    </p>
                    <p className="text-[13px] text-text-secondary truncate">{c.job_title}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  {c.role_bucket ? (
                    <Badge label={c.role_bucket} bg="rgba(0,113,227,0.10)" color="#0040A0" className="!normal-case tracking-normal shrink-0" />
                  ) : (
                    <span />
                  )}
                  {c.email && (
                    <span className="flex items-center gap-1.5 min-w-0 text-[12px] text-text-tertiary">
                      <Mail size={12} strokeWidth={1.6} className="shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </span>
                  )}
                </div>
              </Card>
            ))}
            {contacts.length === 0 && (
              <EmptyState
                icon={Users}
                title="No contacts yet"
                description="Add the people you work with at this account and they'll show up here."
                className="md:col-span-2"
              />
            )}
          </div>
        )}

        {tab === "deals" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-text-secondary">
                <span className="font-semibold text-text-primary tnum">
                  {dealCount}
                </span>{" "}
                {dealCount === 1 ? "deal" : "deals"} ·{" "}
                <span className="font-semibold text-text-primary tnum">
                  {formatMoney(allDealsValue)}
                </span>{" "}
                total value
              </p>
              <Button
                onClick={() => setShowDeal(true)}
                className="px-3 py-2 text-[13px]"
              >
                <Plus size={15} strokeWidth={2.2} />
                New deal
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sessionDeals.map((d) => (
                <Link key={d.sessionId} href={`/deals/${d.sessionId}`}>
                  <Card className="p-4 hover:border-blue-subtle transition-colors h-full">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span
                        className={cn(
                          "text-[11px] font-semibold rounded-full px-2 py-0.5 border",
                          STAGE_TONE[d.stage] || STAGE_TONE.Prospect
                        )}
                      >
                        {d.stage}
                      </span>
                      <span className="text-[14px] font-bold text-text-primary tnum">
                        {formatMoney(d.value)}
                      </span>
                    </div>
                    <p className="text-[14px] font-semibold text-text-primary truncate">
                      {d.service}
                    </p>
                    <p className="text-[12px] text-text-secondary mt-0.5">
                      {Math.round((STAGE_PROBABILITY[d.stage] ?? 0) * 100)}% ·
                      weighted {formatMoney(d.value * (STAGE_PROBABILITY[d.stage] ?? 0))}
                    </p>
                  </Card>
                </Link>
              ))}
              {accountDeals.map((d) => (
                <Card key={d.id} className="p-4 h-full">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={cn(
                        "text-[11px] font-semibold rounded-full px-2 py-0.5 border",
                        STAGE_TONE[d.stage] || STAGE_TONE.Prospect
                      )}
                    >
                      {d.stage}
                    </span>
                    <span className="text-[14px] font-bold text-text-primary tnum">
                      {formatMoney(d.value)}
                    </span>
                  </div>
                  <p className="text-[14px] font-semibold text-text-primary truncate">
                    {d.name}
                  </p>
                  <p className="text-[12px] text-text-tertiary mt-0.5">
                    Added {formatDate(d.created_at)}
                  </p>
                </Card>
              ))}
              {dealCount === 0 && (
                <EmptyState
                  icon={Briefcase}
                  title="No deals yet"
                  description="Add a deal or generate a session to start building pipeline for this account."
                />
              )}
            </div>
          </div>
        )}

        {tab === "sessions" && (
          <Card className="p-0 overflow-hidden">
            <div className="divide-y divide-border-light">
              {sessions.map((s) => {
                const svc = (s.recommended_services || []) as RecommendedService[];
                // What actually happened on this session + where it stands in
                // review — so the row reads like the main Sessions table, not just
                // a title + date.
                const outcome = interactions.find(
                  (i) => i.pitch_session_id === s.id
                )?.outcome;
                const review = s.review_status
                  ? REVIEW_META[s.review_status]
                  : null;
                const sessContact = contacts.find((c) => c.id === s.contact_id);
                return (
                  <Link
                    key={s.id}
                    href={`/sessions/${s.id}`}
                    className="flex items-center gap-3.5 px-5 py-4 hover:bg-surface transition-colors group"
                  >
                    <span className="w-10 h-10 rounded-xl bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                      <CalendarClock size={19} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-text-primary truncate">
                        {svc[0]?.service_name || "Pitch session"}
                      </p>
                      <p className="text-[12px] text-text-tertiary">
                        {formatDate(s.created_at)}
                        {svc.length > 1 && (
                          <span> · {svc.length} offerings pitched</span>
                        )}
                        {sessContact && <span> · for {sessContact.full_name}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {outcome && <OutcomeBadge outcome={outcome} />}
                      {review && (
                        <span
                          className="text-[10px] font-bold uppercase tracking-[0.04em] px-2 py-1 rounded"
                          style={{ background: review.bg, color: review.color }}
                        >
                          {review.label}
                        </span>
                      )}
                      {!outcome && !review && (
                        <span className="text-[11px] font-semibold text-text-secondary bg-surface border border-border-light rounded-full px-2.5 py-1">
                          Pitch ready
                        </span>
                      )}
                      <ArrowRight
                        size={16}
                        className="text-text-tertiary group-hover:text-blue-primary group-hover:translate-x-0.5 transition-transform"
                        strokeWidth={1.5}
                      />
                    </div>
                  </Link>
                );
              })}
              {sessions.length === 0 && (
                <EmptyState
                  icon={FileText}
                  title="No sessions yet"
                  description="Generate a pitch session for this account and it'll appear here."
                />
              )}
            </div>
          </Card>
        )}

        {tab === "notes" && (
          <div className="space-y-6">
            {/* Header + single "Add note" button. The composer is a popup now
                (Suren, Jul 8) — no always-open textarea box cluttering the tab. */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-text-primary">
                  Notes
                </h3>
                <p className="text-[12px] text-text-tertiary mt-0.5">
                  Call summaries, next steps, and internal context.
                </p>
              </div>
              <Button
                onClick={() => setNoteModalOpen(true)}
                className="px-3.5 py-2 text-[13px] shrink-0"
              >
                <Plus size={15} strokeWidth={2.2} />
                Add note
              </Button>
            </div>

            {notes.length === 0 ? (
              <Card className="py-10 flex flex-col items-center text-center">
                <span className="w-11 h-11 rounded-full bg-blue-light flex items-center justify-center mb-3">
                  <FileText size={20} strokeWidth={1.7} className="text-blue-primary" />
                </span>
                <p className="text-[14px] font-semibold text-text-primary">
                  No notes yet
                </p>
                <p className="text-[13px] text-text-secondary mt-1 mb-4 max-w-xs">
                  Jot down a call summary, a next step, or anything the team should
                  know about this account.
                </p>
                <Button
                  onClick={() => setNoteModalOpen(true)}
                  variant="secondary"
                  className="px-3.5 py-2 text-[13px]"
                >
                  <Plus size={15} strokeWidth={2.2} />
                  Add the first note
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {notes.map((n) => (
                  <Card key={n.id} className="p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Avatar name={n.author} className="w-6 h-6 text-[11px]" />
                      <span className="text-[13px] font-semibold text-text-primary">
                        {n.author}
                      </span>
                      <span className="text-[12px] text-text-tertiary tnum">
                        · {formatDate(n.created_at)}
                      </span>
                    </div>
                    <p className="text-[14px] text-text-secondary leading-relaxed whitespace-pre-wrap">
                      {n.body}
                    </p>
                  </Card>
                ))}
              </div>
            )}

            {/* Add-note popup */}
            <Modal
              open={noteModalOpen}
              onClose={() => setNoteModalOpen(false)}
              title="Add a note"
            >
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Log a call summary, next step, or internal context…"
                rows={5}
                autoFocus
                className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-blue-primary resize-y"
              />
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="secondary"
                  onClick={() => setNoteModalOpen(false)}
                  className="px-4 py-2 text-[13px]"
                >
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    await addNote();
                    setNoteModalOpen(false);
                  }}
                  loading={busy}
                  disabled={!noteDraft.trim()}
                  className="px-4 py-2 text-[13px]"
                >
                  <Plus size={15} strokeWidth={2.2} />
                  Save note
                </Button>
              </div>
            </Modal>

            <Card>
              <h3 className="text-[15px] font-semibold text-text-primary mb-1">
                Attachments
              </h3>
              <p className="text-[12px] text-text-tertiary mb-3">
                Paste a link to a document or reference (e.g. a contract or deck).
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={attName}
                  onChange={(e) => setAttName(e.target.value)}
                  placeholder="Name (e.g. MSA draft)"
                  className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary"
                />
                <input
                  value={attUrl}
                  onChange={(e) => setAttUrl(e.target.value)}
                  placeholder="https://… (optional)"
                  className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary"
                />
                <Button
                  onClick={addAttachment}
                  loading={busy}
                  disabled={!attName.trim()}
                  variant="secondary"
                  className="px-3 py-2 text-[13px]"
                >
                  <Paperclip size={15} strokeWidth={1.8} />
                  Attach
                </Button>
              </div>
              {atts.length > 0 && (
                <ul className="mt-4 divide-y divide-border-light">
                  {atts.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-2 py-2.5 text-[13px]"
                    >
                      <Paperclip
                        size={14}
                        strokeWidth={1.6}
                        className="text-text-tertiary shrink-0"
                      />
                      {a.url ? (
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-primary hover:underline truncate"
                        >
                          {a.name}
                        </a>
                      ) : (
                        <span className="text-text-primary truncate">{a.name}</span>
                      )}
                      <span className="ml-auto text-[12px] text-text-tertiary tnum shrink-0">
                        {formatDate(a.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {tab === "activity" && (
          <InteractionTimeline interactions={interactions} />
        )}
        </div>
      </div>

      {/* Right rail — decision-first: the agent entry, the health picture,
          then the working cards. One glance, no wall of boxes (Anir, Jul 3). */}
      <aside className="space-y-4">
        {/* No standalone "Ask the agent" button — the always-on dock (bottom
            right, by the notification bell) is the single agent entry now
            (Anir, Jul 8). Draft-it-for-me actions still open the drawer. */}

        {/* Account snapshot — health ring + trend + why + the glance numbers,
            one visual card instead of two stacked text boxes. */}
        <Card>
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
            Account snapshot
          </h3>
          <div className="flex items-center gap-4 mb-3">
            {(() => {
              const ringR = 30;
              const ringC = 2 * Math.PI * ringR;
              const color = HEALTH_COLOR[health.band].color;
              return (
                <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0">
                  <circle cx="38" cy="38" r={ringR} fill="none" stroke="#E5E5EA" strokeWidth="7" />
                  <circle
                    cx="38" cy="38" r={ringR} fill="none"
                    stroke={color} strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={`${ringC * (health.score / 100)} ${ringC}`}
                    transform="rotate(-90 38 38)"
                  />
                  <text x="38" y="43" textAnchor="middle" className="tnum" fontSize="20" fontWeight="700" fill={color}>
                    {health.score}
                  </text>
                </svg>
              );
            })()}
            <div className="min-w-0">
              <HealthBadge health={health} showScore={false} />
              <span
                className="mt-1.5 flex items-center gap-1 text-[12px] font-semibold tnum"
                style={{
                  color:
                    healthSeries.delta > 0
                      ? "#1A7A35"
                      : healthSeries.delta < 0
                      ? "#B02020"
                      : "#8A8A8E",
                }}
              >
                {healthSeries.delta > 0 ? (
                  <TrendingUp size={13} strokeWidth={2} />
                ) : healthSeries.delta < 0 ? (
                  <TrendingDown size={13} strokeWidth={2} />
                ) : (
                  <Minus size={13} strokeWidth={2} />
                )}
                {healthSeries.delta > 0 ? "+" : ""}
                {healthSeries.delta} pts · 4 wk
              </span>
              <div className="mt-1.5">
                <Sparkline
                  points={healthSeries.points}
                  color={HEALTH_COLOR[health.band].color}
                />
              </div>
            </div>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
            Why
          </p>
          <ul className="space-y-1">
            {health.factors.map((f, i) => (
              <li key={i} className="flex items-center justify-between text-[12px]">
                <span className="text-text-secondary">{f.label}</span>
                <span
                  className="font-semibold tnum"
                  style={{ color: f.delta > 0 ? "#1A7A35" : "#B02020" }}
                >
                  {f.delta > 0 ? "+" : ""}
                  {f.delta}
                </span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 pt-3 border-t border-border-light">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                  Contacts
                </dt>
                <dd className="text-[16px] font-bold text-text-primary tnum">
                  {contacts.length}
                </dd>
              </div>
              <div>
                <dt className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                  Sessions
                </dt>
                <dd className="text-[16px] font-bold text-text-primary tnum">
                  {sessions.length}
                </dd>
              </div>
            </div>
            {/* Latest gets a full row — outcome chips ("MEETING BOOKED") are
                too wide for a third-column and were bleeding off the card. */}
            <div className="flex items-center justify-between gap-2 mt-2.5">
              <dt className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                Latest
              </dt>
              <dd className="min-w-0">
                {interactions[0] ? (
                  <OutcomeBadge outcome={interactions[0].outcome} />
                ) : (
                  <span className="text-[13px] text-text-tertiary">—</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary flex items-center gap-1.5">
              <Sparkles size={14} strokeWidth={1.8} className="text-blue-primary" />
              Agent
            </h3>
            <AgentRunPanel customerId={customer.id} company={customer.company_name} />
          </div>
          {agentActions.length > 0 ? (
            <AgentActions actions={agentActions} compact />
          ) : (
            <p className="text-[12px] text-text-secondary">
              No suggested actions — run a play to start outreach.
            </p>
          )}
          {agentRuns.length > 0 &&
            (() => {
              const wk = weeklyOutcomeSummary(agentRuns);
              if (wk.runs === 0) return null;
              const parts = [
                wk.handled > 0 && `${wk.handled} handled`,
                wk.sent > 0 && `${wk.sent} sent`,
                wk.escalated > 0 && `${wk.escalated} escalated`,
              ].filter(Boolean) as string[];
              return (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-blue-light/50 px-3 py-2">
                  <Sparkles
                    size={13}
                    strokeWidth={1.9}
                    className="text-blue-primary shrink-0"
                  />
                  <p className="text-[12px] text-text-secondary">
                    <span className="font-semibold text-text-primary">
                      This week:
                    </span>{" "}
                    {wk.runs} run{wk.runs === 1 ? "" : "s"}
                    {parts.length > 0 && ` · ${parts.join(" · ")}`}
                  </p>
                </div>
              );
            })()}
          {agentRuns.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5">
                Recent agent runs
              </p>
              <AgentRunHistory runs={agentRuns} />
            </div>
          )}
        </div>
        <Card>
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
            Account
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5">
                Owner
              </label>
              <PeopleSelect
                value={owner}
                options={TEAM}
                onChange={assignOwner}
                placeholder="Unassigned"
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5">
                Competitor / incumbent
                <InfoHint text="Who this account currently uses for this work, or who you're up against to win it (their existing vendor or a rival you're displacing). Knowing the incumbent shapes how you pitch." />
              </label>
              {editingComp ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    aria-label="Competitor"
                    value={compDraft}
                    onChange={(e) => setCompDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveCompetitor();
                      if (e.key === "Escape") setEditingComp(false);
                    }}
                    placeholder="e.g. Veeva, IQVIA"
                    className="flex-1 bg-surface border border-blue-primary rounded-md px-2.5 py-1.5 text-[13px] outline-none"
                  />
                  <button
                    aria-label="Save competitor"
                    onClick={saveCompetitor}
                    className="text-blue-primary"
                  >
                    <Check size={16} strokeWidth={2} />
                  </button>
                </div>
              ) : (
                <button
                  aria-label="Edit competitor"
                  onClick={() => {
                    setCompDraft(competitor);
                    setEditingComp(true);
                  }}
                  className="w-full flex items-center gap-2 text-left text-[13px] text-text-primary border border-border-light rounded-md px-2.5 py-1.5 hover:border-blue-subtle transition-colors"
                >
                  <Swords size={14} strokeWidth={1.6} className="text-text-tertiary shrink-0" />
                  {competitor ? (
                    <span className="truncate">{competitor}</span>
                  ) : (
                    <span className="text-text-tertiary">Add competitor</span>
                  )}
                  <Pencil size={13} strokeWidth={1.6} className="ml-auto text-text-tertiary shrink-0" />
                </button>
              )}
            </div>
          </div>
        </Card>
        <Card>
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
            Deliverables
          </h3>
          <p className="text-[11.5px] text-text-tertiary -mt-2 mb-3">
            One click — the agent drafts it right in your chat.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DELIVERABLES.map((d) => {
              const Icon = d.icon;
              return (
                <button
                  key={d.label}
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("freyr:ask-agent", {
                        detail: { prompt: `${d.ask} ${customer.company_name}` },
                      })
                    )
                  }
                  className="flex flex-col items-start gap-1.5 px-2.5 py-2.5 rounded-lg border border-border-light text-[12.5px] font-medium text-text-primary hover:border-blue-subtle hover:bg-blue-light/40 transition-colors text-left"
                >
                  <Icon size={16} strokeWidth={1.6} className="text-blue-primary" />
                  {d.label}
                </button>
              );
            })}
          </div>
        </Card>
      </aside>

      {/* New deal modal (#58) — full deal detail, not just name/stage/value */}
      <Modal
        open={showDeal}
        onClose={() => setShowDeal(false)}
        title="New deal"
        size="wide"
      >
        {(() => {
          const fld =
            "w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary";
          const lbl =
            "block text-[11px] font-semibold uppercase tracking-[0.03em] text-text-tertiary mb-1";
          const set = (k: string, v: string) =>
            setDealForm({ ...dealForm, [k]: v });
          const stageProb =
            (STAGE_PROBABILITY as Record<string, number>)[dealForm.stage] ?? 0;
          const weighted = Math.round(
            (Number(dealForm.value.replace(/[^0-9.]/g, "")) || 0) * stageProb
          );
          return (
            <div className="space-y-3.5">
              <div>
                <label className={lbl}>Deal name</label>
                <input
                  autoFocus
                  value={dealForm.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. EU MDR remediation — 2026"
                  className={fld}
                />
              </div>
              <div>
                <label className={lbl}>Offering</label>
                <select
                  value={dealForm.offering}
                  onChange={(e) => set("offering", e.target.value)}
                  className={fld}
                >
                  <option value="">Select an offering…</option>
                  {applicableSlim.map((o) => (
                    <option key={o.id} value={o.name}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Stage</label>
                  <select
                    value={dealForm.stage}
                    onChange={(e) => set("stage", e.target.value)}
                    className={fld}
                  >
                    {STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Value ($)</label>
                  <input
                    inputMode="numeric"
                    value={dealForm.value}
                    onChange={(e) => set("value", e.target.value)}
                    placeholder="350000"
                    className={`${fld} tnum`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Primary contact</label>
                  <select
                    value={dealForm.contact}
                    onChange={(e) => set("contact", e.target.value)}
                    className={fld}
                  >
                    <option value="">Select a contact…</option>
                    {contacts.map((c) => (
                      <option key={c.id} value={c.full_name}>
                        {c.full_name}
                        {c.job_title ? ` · ${c.job_title}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Expected close</label>
                  <input
                    type="date"
                    value={dealForm.close_date}
                    onChange={(e) => set("close_date", e.target.value)}
                    className={fld}
                  />
                </div>
              </div>
              <div>
                <label className={lbl}>Owner</label>
                <select
                  value={dealForm.owner}
                  onChange={(e) => set("owner", e.target.value)}
                  className={fld}
                >
                  {REPS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>Next step</label>
                <input
                  value={dealForm.next_step}
                  onChange={(e) => set("next_step", e.target.value)}
                  placeholder="e.g. Send the technical proposal by Friday"
                  className={fld}
                />
              </div>
              <div>
                <label className={lbl}>Notes</label>
                <textarea
                  value={dealForm.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={3}
                  placeholder="Context, decision criteria, competition…"
                  className={`${fld} resize-y leading-relaxed`}
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[12px] text-text-tertiary">
                  {Math.round(stageProb * 100)}% win chance
                  {weighted > 0 && (
                    <>
                      {" · "}weighted{" "}
                      <span className="font-semibold text-text-secondary tnum">
                        {formatMoney(weighted)}
                      </span>
                    </>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setShowDeal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={addDeal}
                    loading={busy}
                    disabled={!dealForm.name.trim()}
                  >
                    Add deal
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

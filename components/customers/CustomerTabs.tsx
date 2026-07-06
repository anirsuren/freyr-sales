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
  Briefcase,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  CustomerOfferingsTab,
  type TabOffering,
} from "@/components/customers/CustomerOfferingsTab";
import { AskAgentDrawer } from "@/components/customers/AskAgentDrawer";
import { CustomerAnalyzePanel } from "@/components/customers/CustomerAnalyzePanel";
import { Badge, OutcomeBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { InteractionTimeline } from "@/components/customers/InteractionTimeline";
import { useToast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";
import {
  buildDeals,
  formatMoney,
  ownerFor,
  STAGES,
  STAGE_PROBABILITY,
} from "@/lib/pipeline";
import { accountHealth, accountHealthSeries, HEALTH_COLOR } from "@/lib/health";
import { HealthBadge } from "@/components/ui/HealthBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import { nextBestActions, weeklyOutcomeSummary } from "@/lib/agent";
import { AgentActions } from "@/components/agent/AgentActions";
import { AgentRunPanel } from "@/components/agent/AgentRunPanel";
import { AgentRunHistory } from "@/components/agent/AgentRunHistory";
import { AccountAgentChat } from "@/components/agent/AccountAgentChat";
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
  const [tab, setTab] = useState("overview");
  // The Ask Agent drawer — always one click away, over any tab.
  const [askOpen, setAskOpen] = useState(false);
  // Deep-link support (?tab=offerings etc.) — read after mount via
  // window.location so SSR markup stays identical (same pattern as the intake
  // prefill; avoids the useSearchParams Suspense requirement). ?tab=ask now
  // opens the drawer, keeping old links working.
  useEffect(() => {
    try {
      const wanted = new URLSearchParams(window.location.search).get("tab");
      if (wanted === "ask") setAskOpen(true);
      else if (wanted && TABS.some((t) => t.key === wanted)) setTab(wanted);
    } catch {}
  }, []);
  // A deliverable request handed to the agent to draft (see the Deliverables
  // rail) — pre-loaded into the drawer's composer.
  const [askPrefill, setAskPrefill] = useState("");

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
      },
    });
    setDealForm({ name: "", stage: "Prospect", value: "" });
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
                    <Link key={c.id} href={`/contacts/${c.id}`}>
                      <Card className="p-3 hover:border-blue-subtle transition-colors flex items-center gap-3">
                        <Avatar name={c.full_name} className="w-9 h-9 text-[13px]" />
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-text-primary truncate">
                            {c.full_name}
                          </p>
                          <p className="text-[12px] text-text-secondary truncate">
                            {c.job_title}
                          </p>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
                Value Propositions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {valueProps.map((vp, i) => (
                  <Card key={i}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[14px] font-semibold text-text-primary">
                        {vp.service_name}
                      </span>
                      <span className="text-blue-primary font-bold text-[12px] tnum">
                        {Math.round((vp.relevance_score || 0) * 10)}%
                      </span>
                    </div>
                    <p className="text-[13px] text-text-secondary leading-relaxed mb-3">
                      {vp.pitch_angle}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                      <Pin size={12} strokeWidth={1.5} />
                      Source: Freyr knowledge base · matched
                    </div>
                  </Card>
                ))}
                {valueProps.length === 0 && (
                  <p className="text-[13px] text-text-secondary">
                    No matched services yet — generate a session.
                  </p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1">
                Angles to research
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
              <Link key={c.id} href={`/contacts/${c.id}`}>
                <Card className="hover:border-blue-subtle transition-colors">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.full_name} className="w-10 h-10 text-[14px]" />
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-text-primary truncate">
                        {c.full_name}
                      </p>
                      <p className="text-[13px] text-text-secondary truncate">{c.job_title}</p>
                    </div>
                  </div>
                  {c.role_bucket && (
                    <div className="mt-3">
                      <Badge label={c.role_bucket} bg="rgba(0,113,227,0.10)" color="#0040A0" className="!normal-case tracking-normal" />
                    </div>
                  )}
                </Card>
              </Link>
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
                return (
                  <Link
                    key={s.id}
                    href={`/sessions/${s.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface transition-colors"
                  >
                    <div>
                      <p className="text-[14px] font-medium text-text-primary">
                        {svc[0]?.service_name || "Pitch session"}
                      </p>
                      <p className="text-[12px] text-text-tertiary tnum">
                        {formatDate(s.created_at)}
                      </p>
                    </div>
                    <ArrowRight size={16} className="text-text-tertiary" strokeWidth={1.5} />
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
            <Card>
              <h3 className="text-[15px] font-semibold text-text-primary mb-3">
                Add a note
              </h3>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Log a call summary, next step, or internal context…"
                rows={3}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[14px] outline-none focus:border-blue-primary resize-y"
              />
              <div className="flex justify-end mt-3">
                <Button
                  onClick={addNote}
                  loading={busy}
                  disabled={!noteDraft.trim()}
                  className="px-4 py-2 text-[13px]"
                >
                  <Plus size={15} strokeWidth={2.2} />
                  Add note
                </Button>
              </div>
            </Card>

            <div className="space-y-3">
              {notes.length === 0 && (
                <p className="text-[13px] text-text-secondary">
                  No notes yet. Add the first one above.
                </p>
              )}
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

      {/* Right rail — decision-first: the agent entry, the health picture,
          then the working cards. One glance, no wall of boxes (Anir, Jul 3). */}
      <aside className="space-y-4">
        {/* The agent is ALWAYS one click away — opens the right-side drawer */}
        <button
          onClick={() => {
            setAskPrefill("");
            setAskOpen(true);
          }}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-primary text-white text-[13.5px] font-semibold px-4 py-2.5 hover:bg-blue-hover transition-all shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
        >
          <Sparkles size={15} strokeWidth={2} />
          Ask the agent
        </button>

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
              <div className="flex items-center gap-2">
                {owner && (
                  <Avatar name={owner} className="w-7 h-7 text-[11px] shrink-0" />
                )}
                <select
                  aria-label="Account owner"
                  value={owner}
                  onChange={(e) => assignOwner(e.target.value)}
                  className="flex-1 bg-surface border border-border rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-blue-primary"
                >
                  <option value="">Unassigned</option>
                  {TEAM.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5">
                Competitor / incumbent
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
            One click — the agent drafts it in the drawer.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DELIVERABLES.map((d) => {
              const Icon = d.icon;
              return (
                <button
                  key={d.label}
                  onClick={() => {
                    setAskPrefill(`${d.ask} ${customer.company_name}`);
                    setAskOpen(true);
                  }}
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

      {/* The Ask Agent drawer — same chat, reachable from every tab */}
      <AskAgentDrawer
        open={askOpen}
        onClose={() => setAskOpen(false)}
        company={customer.company_name}
        actions={
          offeringsCatalog ? (
            <CustomerAnalyzePanel
              variant="action"
              customerId={customer.id}
              customerType={customer.customer_type ?? null}
              ownership={customer.ownership ?? null}
              revenue={customer.revenue ?? null}
              analyzed={!!customer.analyzed_at}
              typeOptions={offeringsCatalog.typeOptions}
              applicableOfferings={applicableSlim}
            />
          ) : undefined
        }
      >
        <AccountAgentChat
          context={agentContext}
          customerId={customer.id}
          initialInput={askPrefill}
          embedded
        />
      </AskAgentDrawer>

      {/* New deal modal (#58) */}
      <Modal open={showDeal} onClose={() => setShowDeal(false)} title="New deal">
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-text-secondary mb-1">
              Deal name
            </label>
            <input
              autoFocus
              value={dealForm.name}
              onChange={(e) => setDealForm({ ...dealForm, name: e.target.value })}
              placeholder="e.g. EU MDR remediation — 2026"
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1">
                Stage
              </label>
              <select
                value={dealForm.stage}
                onChange={(e) => setDealForm({ ...dealForm, stage: e.target.value })}
                className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-text-secondary mb-1">
                Value ($)
              </label>
              <input
                inputMode="numeric"
                value={dealForm.value}
                onChange={(e) => setDealForm({ ...dealForm, value: e.target.value })}
                placeholder="350000"
                className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary tnum"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={() => setShowDeal(false)}>
            Cancel
          </Button>
          <Button onClick={addDeal} loading={busy} disabled={!dealForm.name.trim()}>
            Add deal
          </Button>
        </div>
      </Modal>
    </div>
  );
}

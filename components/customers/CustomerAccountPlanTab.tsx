"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  FileText,
  Flag,
  Link2,
  Pencil,
  Route,
  Search,
  Target,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { BarChart, DonutChart } from "@/components/charts/Charts";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { Modal } from "@/components/ui/Modal";
import { PeopleSelect } from "@/components/ui/PeopleSelect";
import type { TabOffering } from "@/components/customers/CustomerOfferingsTab";
import type { Contact, Customer, Interaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { tint } from "@/lib/tint";
import {
  ACCESS_LEVEL_META,
  JOURNEY_STAGE_META,
  MATERIAL_COLOR,
  MATERIAL_ICON,
  asAccessLevel,
  asJourneyStage,
  asMaterialKind,
} from "@/lib/offeringMaterials";

type PlanStatus = "Active" | "Needs review" | "Draft";
type PlayStage = "Explore" | "Shape" | "Validate" | "Commit";
type ActionStatus = "Next" | "In progress" | "Done" | "Blocked";

type OfferingPlay = {
  id: string;
  offering: string;
  priority: "P1" | "P2" | "P3";
  stage: PlayStage;
  why: string;
  strategy: string;
  target: number;
  targetDate: string;
  contacts: string[];
  materials: string[];
  progress: number;
};

type Stakeholder = {
  id: string;
  name: string;
  title: string;
  reportsTo: string;
  buyingRole: "Introducer" | "Champion" | "Decision-maker" | "Influencer" | "Blocker";
  priority: "High" | "Medium" | "Low";
  relationship: "Strong" | "Developing" | "Unclear";
  position: "Supportive" | "Neutral" | "Concerned";
  introducer: string;
  approach: string;
  nextAction: string;
};

type PlanAction = {
  id: string;
  action: string;
  owner: string;
  due: string;
  status: ActionStatus;
  play: string;
};

type PersistedPlan = {
  status: PlanStatus;
  owner: string;
  reviewDate: string;
  target: number;
  targetDate: string;
  objective: string;
  currentPosition: string;
  plays: OfferingPlay[];
  actions: PlanAction[];
};

const BLUE = "var(--ink-bright-blue)";
const TEAL = "var(--ink-teal-deep)";
const VIOLET = "var(--ink-violet-soft)";
const GREEN = "var(--ink-green)";
const ORANGE = "var(--ink-orange)";

function money(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`;
  return `$${Math.round(value / 1_000)}K`;
}

function prettyDate(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function seedFor(value: string) {
  return [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 17);
}

function addMonths(months: number) {
  const d = new Date(Date.UTC(2026, 8 + months, 30));
  return d.toISOString().slice(0, 10);
}

function statusMeta(status: PlanStatus | ActionStatus | PlayStage) {
  const map: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
    Active: { color: GREEN, icon: CheckCircle2 },
    "Needs review": { color: ORANGE, icon: AlertCircle },
    Draft: { color: BLUE, icon: Pencil },
    Next: { color: VIOLET, icon: Circle },
    "In progress": { color: BLUE, icon: CalendarClock },
    Done: { color: GREEN, icon: CheckCircle2 },
    Blocked: { color: ORANGE, icon: AlertCircle },
    Explore: { color: VIOLET, icon: Search },
    Shape: { color: BLUE, icon: Pencil },
    Validate: { color: TEAL, icon: Check },
    Commit: { color: GREEN, icon: Flag },
  };
  return map[status] || { color: BLUE, icon: Circle };
}

function StatusPill({ status }: { status: PlanStatus | ActionStatus | PlayStage }) {
  const meta = statusMeta(status);
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ color: meta.color, background: tint(meta.color, 8), borderColor: tint(meta.color, 24) }}
    >
      <Icon size={11} strokeWidth={2.4} />
      {status}
    </span>
  );
}

function roleColor(role: Stakeholder["buyingRole"]) {
  if (role === "Introducer") return TEAL;
  if (role === "Champion") return BLUE;
  if (role === "Decision-maker") return VIOLET;
  if (role === "Blocker") return ORANGE;
  return "#0E7490";
}

function RolePill({ role }: { role: Stakeholder["buyingRole"] }) {
  const color = roleColor(role);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ color, background: tint(color, 9) }}
    >
      <Users size={11} strokeWidth={2.2} />
      {role}
    </span>
  );
}

function fallbackContacts(customer: Customer): Contact[] {
  const names = [
    ["Maya Chen", "VP, Regulatory Affairs"],
    ["Daniel Foster", "Chief Operating Officer"],
    ["Priya Nair", "Director, Regulatory Operations"],
    ["Elena Rossi", "Head of Digital Transformation"],
  ];
  return names.map(([full_name, job_title], i) => ({
    id: `plan-contact-${customer.id}-${i}`,
    customer_id: customer.id,
    full_name,
    job_title,
    email: null,
    linkedin_url: null,
    phone: null,
    role_bucket: null,
    career_summary: null,
    enrichment_summary: null,
    created_at: "2026-08-01T00:00:00.000Z",
    last_enriched_at: "2026-08-01T00:00:00.000Z",
  }));
}

function initialPlan(customer: Customer, contacts: Contact[], offerings: TabOffering[]): PersistedPlan {
  const seed = seedFor(customer.id);
  const people = contacts.length >= 3 ? contacts : [...contacts, ...fallbackContacts(customer)].slice(0, 4);
  const choices = offerings.length
    ? offerings.slice(0, 4)
    : [
        { id: "mock-1", name: "Freya.RegIntel", materials: [] },
        { id: "mock-2", name: "Freya.Submit", materials: [] },
        { id: "mock-3", name: "Freya.Publishing", materials: [] },
      ];
  const owner = customer.owner || "Elena Rossi";
  const target = 1_500_000 + (seed % 8) * 250_000;
  const plays: OfferingPlay[] = choices.map((offering, i) => {
    const person = people[i % people.length];
    const materials = (offering.materials || []).slice(0, 2).map((material) => material.label);
    return {
      id: `play-${offering.id}`,
      offering: offering.name,
      priority: i === 0 ? "P1" : i < 3 ? "P2" : "P3",
      stage: (["Validate", "Shape", "Explore", "Explore"] as PlayStage[])[i] || "Explore",
      why:
        i === 0
          ? `Matches ${customer.company_name}'s active regulatory transformation priorities.`
          : `Extends the account into an adjacent workflow with a clear operational owner.`,
      strategy:
        i === 0
          ? "Prove value with one high-visibility workflow, then expand across regions."
          : "Use the current relationship to validate the problem and sponsor before proposing scope.",
      target: Math.round(target * ([0.42, 0.3, 0.18, 0.1][i] || 0.1)),
      targetDate: addMonths(i + 1),
      contacts: person ? [person.full_name] : [owner],
      materials: materials.length ? materials : [`${offering.name} overview`, "Relevant customer story"],
      progress: [68, 42, 20, 10][i] || 10,
    };
  });
  return {
    status: "Active",
    owner,
    reviewDate: "2026-10-01",
    target,
    targetDate: "2027-03-31",
    objective: `Build an executive-backed path to expand ${customer.company_name} across the highest-fit Freyr offerings while proving measurable value in the first workflow.`,
    currentPosition: `${customer.company_name} has ${customer.offerings_in_use?.length || 1} offering in use and ${customer.account_deals?.length || 2} active commercial threads. The next move is to align the buying group around one funded expansion path.`,
    plays,
    actions: [
      {
        id: "action-1",
        action: `Confirm the executive sponsor and success measure for ${plays[0]?.offering || "the priority play"}`,
        owner,
        due: "2026-09-23",
        status: "In progress",
        play: plays[0]?.offering || "Priority play",
      },
      {
        id: "action-2",
        action: "Run a stakeholder alignment session with the champion and decision-maker",
        owner,
        due: "2026-09-29",
        status: "Next",
        play: plays[0]?.offering || "Priority play",
      },
      {
        id: "action-3",
        action: `Prepare the value story and proof package for ${plays[1]?.offering || "the second play"}`,
        owner,
        due: "2026-10-06",
        status: "Next",
        play: plays[1]?.offering || plays[0]?.offering || "Priority play",
      },
    ],
  };
}

function buildStakeholders(customer: Customer, contacts: Contact[], owner: string): Stakeholder[] {
  const people = contacts.length >= 4 ? contacts.slice(0, 6) : [...contacts, ...fallbackContacts(customer)].slice(0, 5);
  const roles: Stakeholder["buyingRole"][] = ["Champion", "Decision-maker", "Influencer", "Introducer", "Blocker"];
  return people.map((person, i) => ({
    id: person.id,
    name: person.full_name,
    title: person.job_title || person.role_bucket || "Role not recorded",
    reportsTo: i === 0 ? people[1]?.full_name || "Unknown" : i === 1 ? "Board / executive team" : people[1]?.full_name || "Unknown",
    buyingRole: roles[i] || "Influencer",
    priority: i < 2 ? "High" : i < 4 ? "Medium" : "Low",
    relationship: i === 0 ? "Strong" : i < 3 ? "Developing" : "Unclear",
    position: i === 0 ? "Supportive" : i === 4 ? "Concerned" : "Neutral",
    introducer: i === 0 ? owner : people[0]?.full_name || owner,
    approach:
      i === 0
        ? "Co-create the value case and map the internal approval path."
        : i === 1
          ? "Lead with risk reduction, measurable value and a phased commitment."
          : "Validate priorities and earn a specific next introduction.",
    nextAction: i === 0 ? "Review the account hypothesis" : i === 1 ? "Secure a 30-minute value review" : "Confirm influence and priorities",
  }));
}

export function CustomerAccountPlanTab({
  customer,
  contacts,
  interactions,
  offerings,
  ownerOptions,
}: {
  customer: Customer;
  contacts: Contact[];
  interactions: Interaction[];
  offerings: TabOffering[];
  ownerOptions: string[];
}) {
  const basePlan = useMemo(() => initialPlan(customer, contacts, offerings), [customer, contacts, offerings]);
  const storageKey = `freyr.mock.account-plan.${customer.id}`;
  const [plan, setPlan] = useState<PersistedPlan>(basePlan);
  const [draft, setDraft] = useState<PersistedPlan>(basePlan);
  const [editing, setEditing] = useState(false);
  const [expandedPlay, setExpandedPlay] = useState<string | null>(basePlan.plays[0]?.id || null);
  const [stakeholderSearch, setStakeholderSearch] = useState("");
  const [expandedStakeholder, setExpandedStakeholder] = useState<string | null>(null);
  const [planView, setPlanView] = useState<"plays" | "people" | "actions">("plays");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as PersistedPlan;
      setPlan(saved);
      setDraft(saved);
      setExpandedPlay(saved.plays[0]?.id || null);
    } catch {
      // A malformed local mock fixture should never stop the customer page.
    }
  }, [storageKey]);

  const stakeholders = useMemo(
    () => buildStakeholders(customer, contacts, plan.owner),
    [customer, contacts, plan.owner]
  );
  const visibleStakeholders = stakeholders.filter((person) =>
    `${person.name} ${person.title} ${person.buyingRole}`.toLowerCase().includes(stakeholderSearch.toLowerCase())
  );
  const champion = stakeholders.find((person) => person.buyingRole === "Champion") || stakeholders[0];
  const decisionMaker = stakeholders.find((person) => person.buyingRole === "Decision-maker") || stakeholders[1];
  const decisionPath = [
    { label: "Internal introducer", name: plan.owner, detail: "Account owner", color: TEAL, mapped: true },
    { label: "Champion", name: champion?.name || "Champion not mapped", detail: champion?.title || "Relationship gap", color: BLUE, mapped: !!champion },
    { label: "Decision-maker", name: decisionMaker?.name || "Decision-maker not mapped", detail: decisionMaker?.title || "Relationship gap", color: VIOLET, mapped: !!decisionMaker },
    { label: "Economic approver", name: "Not confirmed", detail: "Approval path open", color: ORANGE, mapped: false },
    { label: "Procurement", name: "Not mapped", detail: "Needed for the P1 play", color: ORANGE, mapped: false },
  ];
  const mappedDecisionSteps = decisionPath.filter((step) => step.mapped).length;
  const weightedValue = plan.plays.reduce((sum, play) => sum + play.target * (play.progress / 100), 0);
  const completedActions = plan.actions.filter((action) => action.status === "Done").length;

  function savePlan() {
    setPlan(draft);
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
    setEditing(false);
  }

  function cancelEdit() {
    setDraft(plan);
    setEditing(false);
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-blue-subtle p-0">
        <div className="relative bg-gradient-to-r from-blue-light/70 via-white to-white px-5 py-5">
          <div className="min-w-0 max-w-3xl sm:pr-28">
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <StatusPill status={plan.status} />
              <span className="text-[11.5px] text-text-tertiary">Reviewed Sep 14, 2026</span>
            </div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.09em] text-blue-primary">Account objective</p>
            <h2 className="mt-1.5 text-[20px] font-semibold leading-7 tracking-[-0.02em] text-text-primary">
              {plan.objective}
            </h2>
            <p className="mt-2 max-w-2xl text-[12.5px] leading-5 text-text-secondary">{plan.currentPosition}</p>
          </div>
          <Button variant="secondary" className="mt-4 px-3 py-2 text-[12.5px] sm:absolute sm:right-5 sm:top-5 sm:mt-0" onClick={() => { setDraft(plan); setEditing(true); }}>
            <Pencil size={14} />
            Edit plan
          </Button>
        </div>

        <div className="grid border-t border-border-light sm:grid-cols-3 sm:divide-x sm:divide-border-light">
          <div className="flex items-center gap-2.5 px-5 py-3">
            <Avatar name={plan.owner} className="h-8 w-8 shrink-0" />
            <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-tertiary">Plan owner</p><p className="truncate text-[12.5px] font-semibold text-text-primary">{plan.owner}</p></div>
          </div>
          <div className="flex items-center gap-2.5 border-t border-border-light px-5 py-3 sm:border-t-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(124,58,237,0.09)] text-[color:var(--ink-violet-soft)]"><Target size={16} /></span>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-tertiary">Growth target</p><p className="text-[12.5px] font-semibold text-text-primary"><span className="tnum">{money(plan.target)}</span> by {prettyDate(plan.targetDate)}</p></div>
          </div>
          <div className="flex items-center gap-2.5 border-t border-border-light px-5 py-3 sm:border-t-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary"><CalendarClock size={16} /></span>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-text-tertiary">Next review</p><p className="text-[12.5px] font-semibold text-text-primary">{prettyDate(plan.reviewDate)}</p></div>
          </div>
        </div>

      </Card>

      <Modal
        open={editing}
        onClose={cancelEdit}
        title="Edit account plan"
        size="workflow"
        dialogClassName="h-[min(680px,calc(100dvh-3rem))]"
        bodyClassName="!p-0"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="mb-5 rounded-xl border border-blue-subtle bg-blue-light/35 px-4 py-3">
              <p className="text-[12.5px] font-semibold text-text-primary">Plan direction and ownership</p>
              <p className="mt-0.5 text-[12px] text-text-secondary">Keep the objective, commercial target, owner, and review cadence current.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                Status
                <ColorSelect
                  value={draft.status}
                  onChange={(value) => setDraft({ ...draft, status: value as PlanStatus })}
                  options={[
                    { value: "Active", label: "Active", color: GREEN, icon: CheckCircle2 },
                    { value: "Needs review", label: "Needs review", color: ORANGE, icon: AlertCircle },
                    { value: "Draft", label: "Draft", color: BLUE, icon: Pencil },
                  ]}
                  fill
                  minWidth={0}
                  className="mt-1.5 normal-case tracking-normal"
                />
              </label>
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                Plan owner
                <PeopleSelect value={draft.owner} options={ownerOptions} onChange={(owner) => setDraft({ ...draft, owner })} allowUnassigned={false} className="mt-1.5 normal-case tracking-normal" />
              </label>
            </div>

            <div className="my-5 border-t border-border-light" />

            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                Revenue target
                <div className="relative mt-1.5"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-text-tertiary">$</span><input type="number" min={0} step={50000} value={draft.target} onChange={(e) => setDraft({ ...draft, target: Number(e.target.value) || 0 })} className="h-10 w-full rounded-lg border border-border bg-white pl-7 pr-3 text-[13px] font-medium normal-case tracking-normal text-text-primary outline-none transition-colors focus:border-blue-primary focus:ring-2 focus:ring-blue-primary/10" /></div>
              </label>
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                Next review
                <input type="date" value={draft.reviewDate} onChange={(e) => setDraft({ ...draft, reviewDate: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-medium normal-case tracking-normal text-text-primary outline-none transition-colors focus:border-blue-primary focus:ring-2 focus:ring-blue-primary/10" />
              </label>
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                Target date
                <input type="date" value={draft.targetDate} onChange={(e) => setDraft({ ...draft, targetDate: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-medium normal-case tracking-normal text-text-primary outline-none transition-colors focus:border-blue-primary focus:ring-2 focus:ring-blue-primary/10" />
              </label>
            </div>

            <div className="my-5 border-t border-border-light" />

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                Account objective
                <textarea value={draft.objective} onChange={(e) => setDraft({ ...draft, objective: e.target.value })} className="mt-1.5 min-h-[128px] w-full resize-none rounded-lg border border-border bg-white p-3 text-[13px] font-normal leading-5 normal-case tracking-normal text-text-primary outline-none transition-colors focus:border-blue-primary focus:ring-2 focus:ring-blue-primary/10" />
              </label>
              <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                Current position
                <textarea value={draft.currentPosition} onChange={(e) => setDraft({ ...draft, currentPosition: e.target.value })} className="mt-1.5 min-h-[128px] w-full resize-none rounded-lg border border-border bg-white p-3 text-[13px] font-normal leading-5 normal-case tracking-normal text-text-primary outline-none transition-colors focus:border-blue-primary focus:ring-2 focus:ring-blue-primary/10" />
              </label>
            </div>

            <div className="my-5 border-t border-border-light" />

            <div>
              <div className="mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">Next actions</p>
                <p className="mt-0.5 text-[12px] text-text-tertiary">Update the work, owner, timing, and status here. The page remains read-only.</p>
              </div>
              <div className="space-y-3">
                {draft.actions.map((action, index) => (
                  <div key={action.id} className="rounded-xl border border-border-light bg-surface/40 p-3.5">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-light text-[10.5px] font-bold text-blue-primary">{index + 1}</span>
                      <span className="text-[11.5px] font-semibold text-blue-primary">{action.play}</span>
                    </div>
                    <label className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                      Action
                      <input value={action.action} onChange={(e) => setDraft({ ...draft, actions: draft.actions.map((item) => item.id === action.id ? { ...item, action: e.target.value } : item) })} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-[13px] font-medium normal-case tracking-normal text-text-primary outline-none transition-colors focus:border-blue-primary focus:ring-2 focus:ring-blue-primary/10" />
                    </label>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                        Owner
                        <PeopleSelect value={action.owner} options={ownerOptions} onChange={(owner) => setDraft({ ...draft, actions: draft.actions.map((item) => item.id === action.id ? { ...item, owner } : item) })} allowUnassigned={false} className="mt-1.5 normal-case tracking-normal" />
                      </label>
                      <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                        Due date
                        <input type="date" value={action.due} onChange={(e) => setDraft({ ...draft, actions: draft.actions.map((item) => item.id === action.id ? { ...item, due: e.target.value } : item) })} className="mt-1.5 h-9 w-full rounded-md border border-border bg-white px-2.5 text-[13px] font-medium normal-case tracking-normal text-text-primary outline-none focus:border-blue-primary" />
                      </label>
                      <label className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                        Status
                        <ColorSelect
                          value={action.status}
                          onChange={(status) => setDraft({ ...draft, actions: draft.actions.map((item) => item.id === action.id ? { ...item, status: status as ActionStatus } : item) })}
                          options={[
                            { value: "Next", label: "Next", color: VIOLET, icon: Circle },
                            { value: "In progress", label: "In progress", color: BLUE, icon: CalendarClock },
                            { value: "Done", label: "Done", color: GREEN, icon: CheckCircle2 },
                            { value: "Blocked", label: "Blocked", color: ORANGE, icon: AlertCircle },
                          ]}
                          fill
                          minWidth={0}
                          className="mt-1.5 normal-case tracking-normal"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-light bg-surface/40 px-5 py-3.5">
            <Button variant="secondary" className="px-4 py-2 text-[12.5px]" onClick={cancelEdit}>Cancel</Button>
            <Button className="px-4 py-2 text-[12.5px]" onClick={savePlan}><Check size={14} />Save plan</Button>
          </div>
        </div>
      </Modal>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(310px,0.75fr)]">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-5 py-3.5">
            <div>
              <div className="flex items-center gap-2"><Target size={16} className="text-blue-primary" /><h3 className="text-[15px] font-semibold text-text-primary">Growth play momentum</h3></div>
              <p className="mt-0.5 text-[12px] text-text-secondary">Progress across the prioritized expansion plays.</p>
            </div>
            <div className="text-right"><p className="tnum text-[15px] font-bold text-text-primary">{money(weightedValue)}</p><p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">Weighted value</p></div>
          </div>
          <div className="px-4 pb-3 pt-4">
            <BarChart
              data={plan.plays.map((play) => ({
                label: play.offering,
                value: play.progress,
                color: statusMeta(play.stage).color,
                dotColor: statusMeta(play.stage).color,
                caption: `${money(play.target)} target`,
                tip: play.contacts.map((name) => ({ name, sub: `Key contact for ${play.offering}` })),
              }))}
              height={190}
              format="percent"
              maxBarWidth={48}
              hideTipStats
              hideFullHeightGhost
            />
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-border-light px-5 py-3.5">
            <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[color:var(--ink-teal-deep)]" /><h3 className="text-[15px] font-semibold text-text-primary">Plan coverage</h3></div>
            <p className="mt-0.5 text-[12px] text-text-secondary">Commercial progress and execution readiness.</p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border-light px-2 py-4">
            <div className="flex min-w-0 flex-col items-center px-2 text-center">
              <DonutChart
                size={108}
                thickness={11}
                segments={[
                  { label: "Weighted value", value: weightedValue, color: BLUE },
                  { label: "Remaining target", value: Math.max(0, plan.target - weightedValue), color: "#E5E5EA" },
                ]}
                centerLabel={`${Math.round((weightedValue / Math.max(plan.target, 1)) * 100)}%`}
                centerSub="covered"
                format="money"
              />
              <p className="mt-2 text-[11.5px] font-semibold text-text-primary">Revenue coverage</p>
              <p className="mt-0.5 text-[10.5px] text-text-tertiary">{money(weightedValue)} of {money(plan.target)}</p>
            </div>
            <div className="flex min-w-0 flex-col items-center px-2 text-center">
              <DonutChart
                size={108}
                thickness={11}
                segments={[
                  { label: "Complete", value: completedActions, color: GREEN },
                  { label: "Still open", value: Math.max(0, plan.actions.length - completedActions), color: "#E5E5EA" },
                ]}
                centerLabel={`${completedActions}/${plan.actions.length}`}
                centerSub="done"
                format="number"
              />
              <p className="mt-2 text-[11.5px] font-semibold text-text-primary">Action readiness</p>
              <p className="mt-0.5 text-[10.5px] text-text-tertiary">{plan.actions.length - completedActions} actions still open</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-border-light bg-white shadow-card">
          {([
            { key: "plays", label: "Growth plays", count: plan.plays.length, icon: Target },
            { key: "people", label: "Stakeholders", count: stakeholders.length, icon: Users },
            { key: "actions", label: "Next actions", count: plan.actions.filter((action) => action.status !== "Done").length, icon: CheckCircle2 },
          ] as const).map((item) => {
            const Icon = item.icon;
            const active = planView === item.key;
            return (
              <button key={item.key} type="button" onClick={() => setPlanView(item.key)} className={cn("flex min-w-0 items-center justify-center gap-2 border-r border-border-light px-3 py-3 text-[12.5px] font-semibold transition-colors last:border-r-0", active ? "bg-blue-light text-blue-primary" : "text-text-secondary hover:bg-surface hover:text-text-primary")}>
                <Icon size={15} /><span className="truncate">{item.label}</span><span className={cn("rounded-full px-1.5 py-0.5 text-[10px] tnum", active ? "bg-white text-blue-primary" : "bg-surface text-text-tertiary")}>{item.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {planView === "plays" && <div>
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border-light px-5 py-3.5">
            <div>
              <div className="flex items-center gap-2"><Target size={16} className="text-blue-primary" /><h3 className="text-[15px] font-semibold text-text-primary">Offering plays</h3></div>
              <p className="mt-0.5 text-[12px] text-text-secondary">Where the account can grow and how each move advances.</p>
            </div>
            <span className="text-[12px] font-medium text-text-tertiary">{plan.plays.length} prioritized</span>
          </div>
          <div className="overflow-x-auto bg-surface/30 p-3">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[minmax(280px,1.8fr)_110px_90px_115px_150px_32px] items-center gap-3 px-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                <span>Priority & offering</span><span>Stage</span><span>Target</span><span>Target date</span><span>Progress</span><span />
              </div>
              <div className="space-y-2">
                {plan.plays.map((play) => {
                  const expanded = expandedPlay === play.id;
                  const playIndex = plan.plays.findIndex((entry) => entry.id === play.id);
                  const linkedOpportunity =
                    customer.account_deals?.find((deal) => deal.offering === play.offering) ||
                    (playIndex === 0 ? customer.account_deals?.[0] : undefined);
                  const linkedActivities = playIndex === 0 ? interactions.slice(0, 2) : [];
                  return (
                    <div
                      key={play.id}
                      className={cn(
                        "overflow-hidden rounded-xl border text-left transition-[border-color,background-color,box-shadow] duration-200",
                        expanded
                          ? "border-blue-subtle bg-white shadow-[0_7px_22px_rgba(0,82,204,0.10)]"
                          : "border-border-light bg-white hover:border-blue-subtle"
                      )}
                    >
                      <button
                        type="button"
                        tabIndex={0}
                        aria-expanded={expanded}
                        onClick={() => setExpandedPlay(expanded ? null : play.id)}
                        className={cn(
                          "grid w-full cursor-pointer grid-cols-[minmax(280px,1.8fr)_110px_90px_115px_150px_32px] items-center gap-3 px-4 py-3 text-left text-[12.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-primary/30",
                          expanded ? "bg-blue-light/55" : "hover:bg-surface/70"
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className={cn("inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg px-1.5 text-[10.5px] font-bold", play.priority === "P1" ? "bg-blue-primary text-white" : play.priority === "P2" ? "bg-[rgba(124,58,237,0.1)] text-[color:var(--ink-violet-soft)]" : "bg-[rgba(15,118,110,0.1)] text-[color:var(--ink-teal-deep)]")}>{play.priority}</span>
                          <span className="min-w-0 truncate font-semibold text-text-primary">{play.offering}</span>
                        </span>
                        <span><StatusPill status={play.stage} /></span>
                        <span className="tnum font-semibold text-text-primary">{money(play.target)}</span>
                        <span className="text-text-secondary">{prettyDate(play.targetDate)}</span>
                        <span className="flex min-w-[108px] items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border-light"><span className="block h-full rounded-full bg-blue-primary" style={{ width: `${play.progress}%` }} /></span><span className="tnum text-[11px] font-semibold text-text-secondary">{play.progress}%</span></span>
                        <span className={cn("inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-[border-color,color,transform]", expanded ? "border-blue-subtle text-blue-primary" : "border-border-light text-text-secondary")}><ChevronDown size={15} strokeWidth={2.2} className={cn("transition-transform duration-200", expanded && "rotate-180")} /></span>
                      </button>
                      <div className="freyr-fold" data-open={expanded ? "true" : "false"}>
                        <div className="border-t border-blue-subtle bg-white px-5 pb-5 pt-4 [box-shadow:inset_3px_0_0_0_var(--ink-bright-blue)]">
                            <div className="tab-panel">
                              <div className="grid gap-x-10 gap-y-5 lg:grid-cols-2">
                                <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Why this fits</p><p className="mt-1.5 text-[13px] leading-5 text-text-primary">{play.why}</p></div>
                                <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Strategy</p><p className="mt-1.5 text-[13px] leading-5 text-text-primary">{play.strategy}</p></div>
                              </div>
                              <div className="mt-4 border-t border-border-light pt-4">
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">People & linked work</p>
                                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                                    {play.contacts.map((name) => <span key={name} className="inline-flex min-w-0 items-center gap-2 text-[12.5px] font-semibold text-text-primary"><Avatar name={name} className="h-7 w-7 shrink-0" /><span className="truncate">{name}</span></span>)}
                                  </div>
                                  <div className="mt-3 overflow-hidden rounded-xl border border-border-light bg-white">
                                    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 bg-surface px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-text-tertiary"><span>Type</span><span>Linked record</span></div>
                                    <div className="divide-y divide-border-light">
                                      {linkedOpportunity && <a href={`/opportunities/${linkedOpportunity.id}`} className="group grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-blue-light/25"><span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-blue-primary"><Briefcase size={12} />Opportunity</span><span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-text-primary group-hover:text-blue-primary">{linkedOpportunity.name}</span><span className="mt-0.5 block text-[10.5px] text-text-tertiary">{linkedOpportunity.stage} · {money(linkedOpportunity.value)}</span></span></a>}
                                      {linkedActivities.map((activity) => {
                                        const contact = contacts.find((person) => person.id === activity.contact_id);
                                        const outcome = activity.outcome.replaceAll("_", " ");
                                        return <a key={activity.id} href="/activity" className="group grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-blue-light/25"><span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-[color:var(--ink-teal-deep)]"><CalendarClock size={12} />Activity</span><span className="min-w-0"><span className="block truncate text-[12px] font-semibold text-text-primary group-hover:text-blue-primary">{activity.notes || `${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}${contact ? ` with ${contact.full_name}` : ""}`}</span><span className="mt-0.5 block text-[10.5px] capitalize text-text-tertiary">{outcome} · {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(activity.created_at))}</span></span></a>;
                                      })}
                                      {!linkedOpportunity && linkedActivities.length === 0 && <div className="px-3 py-3 text-[11.5px] text-text-tertiary">No opportunity or activity is linked to this play yet.</div>}
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-5 min-w-0 border-t border-border-light pt-4">
                                  <div className="mb-2 flex items-center justify-between gap-3"><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Sales materials</p><span className="text-[10.5px] font-medium text-text-tertiary">{play.materials.length} {play.materials.length === 1 ? "file" : "files"}</span></div>
                                  <div className="overflow-hidden rounded-xl border border-border-light bg-white">
                                    <div className="grid min-w-[760px] grid-cols-[minmax(260px,460px)_150px_190px_34px] items-center justify-start gap-3 bg-surface px-3 py-2 text-[9.5px] font-semibold uppercase tracking-[0.07em] text-text-tertiary">
                                      <span>File name</span><span>Format</span><span>Viewing</span><span />
                                    </div>
                                    <div className="divide-y divide-border-light">
                                      {play.materials.map((item) => {
                                        const offering = offerings.find((entry) => entry.name === play.offering);
                                        const material = offering?.materials.find((entry) => entry.label === item);
                                        const kind = asMaterialKind(material?.kindKey);
                                        const Icon = kind ? MATERIAL_ICON[kind] : FileText;
                                        const tone = kind ? MATERIAL_COLOR[kind] : BLUE;
                                        const stage = asJourneyStage(material?.journeyStage);
                                        const access = asAccessLevel(material?.accessLevel);
                                        const href = material?.url || (offering ? `/offerings/${offering.id}?tab=materials` : "/offerings");
                                        return (
                                          <a key={item} href={href} target={material?.url ? "_blank" : undefined} rel={material?.url ? "noopener noreferrer" : undefined} className="group grid min-w-[760px] grid-cols-[minmax(260px,460px)_150px_190px_34px] items-center justify-start gap-3 px-3 py-2.5 transition-colors hover:bg-blue-light/25">
                                            <span className="flex min-w-0 items-center gap-2.5"><Icon size={14} strokeWidth={2} className="shrink-0 text-blue-primary" /><span className="min-w-0 truncate text-[12px] font-semibold text-text-primary group-hover:text-blue-primary">{item}</span></span>
                                            <span className="text-[11px] font-semibold" style={{ color: tone }}>{material?.kind || "Document"}</span>
                                            <span className="flex min-w-0 flex-wrap gap-1">{stage && <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold" style={{ color: JOURNEY_STAGE_META[stage].color, background: tint(JOURNEY_STAGE_META[stage].color, 8) }}>{JOURNEY_STAGE_META[stage].label}</span>}{access && <span className="rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold" style={{ color: ACCESS_LEVEL_META[access].color, background: tint(ACCESS_LEVEL_META[access].color, 8) }}>{ACCESS_LEVEL_META[access].label}</span>}{!stage && !access && <span className="text-[10.5px] text-text-tertiary">Not tagged</span>}</span>
                                            <ExternalLink size={13} strokeWidth={1.8} className="justify-self-end text-text-tertiary group-hover:text-blue-primary" />
                                          </a>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

      </div>}

      {planView === "people" && <div className="space-y-4">
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-5 py-3.5">
            <div>
              <div className="flex items-center gap-2"><Route size={16} className="text-[color:var(--ink-violet-soft)]" /><h3 className="text-[15px] font-semibold text-text-primary">Decision path</h3></div>
              <p className="mt-0.5 text-[12px] text-text-secondary">The relationship route to a funded decision.</p>
            </div>
            <div className="flex items-center gap-2.5 rounded-full border border-border-light bg-surface/55 px-3 py-1.5">
              <span className="flex gap-1" aria-hidden="true">
                {decisionPath.map((step) => <span key={step.label} className="h-1.5 w-4 rounded-full" style={{ background: step.mapped ? step.color : tint(ORANGE, 22) }} />)}
              </span>
              <span className="text-[10.5px] font-semibold text-text-secondary"><strong className="text-text-primary">{mappedDecisionSteps} of 5</strong> mapped</span>
            </div>
          </div>

          <div className="overflow-x-auto px-5 pb-6 pt-5">
            <div className="relative mx-auto min-w-[850px] max-w-[1120px]">
              <div className="absolute left-[10%] right-[10%] top-[52px] h-[3px] rounded-full bg-border-light" />
              <div
                className="absolute left-[10%] top-[52px] h-[3px] rounded-full"
                style={{
                  width: `${Math.max(0, (mappedDecisionSteps - 1) * 20)}%`,
                  background: `linear-gradient(90deg, ${TEAL}, ${BLUE} 52%, ${VIOLET})`,
                  boxShadow: `0 1px 5px ${tint(BLUE, 35)}`,
                }}
              />
              <div
                className="absolute top-[52px] h-0 border-t-[3px] border-dashed"
                style={{ left: `${10 + Math.max(0, mappedDecisionSteps - 1) * 20}%`, right: "10%", borderColor: tint(ORANGE, 38) }}
              />

              <div className="grid grid-cols-5">
                {decisionPath.map((node, index) => (
                  <div key={node.label} className="relative z-10 min-w-0 px-3 text-center">
                    <p className="h-5 text-[9.5px] font-bold uppercase tracking-[0.1em]" style={{ color: node.mapped ? node.color : ORANGE }}>{node.label}</p>

                    <div className="mt-2 flex h-12 items-center justify-center">
                      {node.mapped ? (
                        <div className="relative rounded-full bg-white p-[3px]" style={{ boxShadow: `0 0 0 2px ${node.color}, 0 6px 18px rgba(15,23,42,0.14)` }}>
                          <Avatar name={node.name} className="h-10 w-10" />
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white text-white" style={{ background: node.color }}>
                            {index === mappedDecisionSteps - 1 ? <Target size={8} strokeWidth={3} /> : <Check size={8} strokeWidth={3.5} />}
                          </span>
                        </div>
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed bg-white shadow-[0_4px_14px_rgba(15,23,42,0.06)]" style={{ borderColor: tint(ORANGE, 46), color: ORANGE }}>
                          <AlertCircle size={17} strokeWidth={2.2} />
                        </div>
                      )}
                    </div>

                    <div className={cn("mx-auto mt-3 min-h-[60px] rounded-xl px-2.5 py-2", node.mapped ? "bg-surface/65" : "border border-dashed bg-white")} style={node.mapped ? undefined : { borderColor: tint(ORANGE, 24) }}>
                      <p className={cn("text-[12.5px] font-semibold leading-4", node.mapped ? "text-text-primary" : "text-[color:var(--ink-orange)]")}>{node.name}</p>
                      <p className="mt-1 text-[10.5px] leading-4 text-text-tertiary">{node.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-light px-5 py-3.5">
          <div><div className="flex items-center gap-2"><Users size={16} className="text-[color:var(--ink-teal-deep)]" /><h3 className="text-[15px] font-semibold text-text-primary">Stakeholder map</h3></div><p className="mt-0.5 text-[12px] text-text-secondary">Who matters, where they stand and the next relationship move.</p></div>
          <div className="relative w-full sm:w-64"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" /><input value={stakeholderSearch} onChange={(e) => setStakeholderSearch(e.target.value)} placeholder="Search stakeholders…" className="h-9 w-full rounded-md border border-border bg-white pl-8 pr-3 text-[12.5px] outline-none focus:border-blue-primary" /></div>
        </div>
        <div className="max-h-[430px] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-white"><tr className="border-b border-border-light text-[10.5px] uppercase tracking-[0.08em] text-text-tertiary"><th className="px-5 py-2.5">Stakeholder</th><th className="px-3 py-2.5">Buying role</th><th className="px-3 py-2.5">Relationship</th><th className="px-3 py-2.5">Next move</th><th className="w-10 px-3 py-2.5" /></tr></thead>
            <tbody>{visibleStakeholders.map((person) => {
              const expanded = expandedStakeholder === person.id;
              return <Fragment key={person.id}>
                <tr tabIndex={0} aria-expanded={expanded} onClick={() => setExpandedStakeholder(expanded ? null : person.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpandedStakeholder(expanded ? null : person.id); } }} className={cn("cursor-pointer border-b border-border-light text-[12px] outline-none transition-colors focus-visible:bg-blue-light/55 focus-visible:[box-shadow:inset_3px_0_0_0_var(--ink-teal-deep)]", expanded ? "bg-blue-light/45" : "hover:bg-surface/60")}><td className="px-5 py-3"><div className="flex items-center gap-2.5"><Avatar name={person.name} className="h-8 w-8" /><div><p className="font-semibold text-text-primary">{person.name}</p><p className="text-[11px] text-text-secondary">{person.title}</p></div></div></td><td className="px-3 py-3"><RolePill role={person.buyingRole} /></td><td className="px-3 py-3"><p className="font-semibold text-text-primary">{person.relationship}</p><p className="text-[11px] text-text-tertiary">{person.position} · {person.priority} priority</p></td><td className="max-w-[260px] px-3 py-3 font-medium text-blue-primary">{person.nextAction}</td><td className="px-3 py-3"><button aria-label={`${expanded ? "Collapse" : "Expand"} ${person.name}`} aria-expanded={expanded} onClick={(event) => { event.stopPropagation(); setExpandedStakeholder(expanded ? null : person.id); }} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white transition-colors", expanded ? "border-blue-subtle text-blue-primary" : "border-border-light text-text-secondary hover:border-blue-subtle hover:bg-blue-light/50 hover:text-blue-primary")}><ChevronDown size={15} strokeWidth={2.2} className={cn("transition-transform duration-200", expanded && "rotate-180")} /></button></td></tr>
                {expanded && <tr key={`${person.id}-detail`} className="border-b border-border-light bg-white"><td colSpan={5} className="px-5 pb-5 pt-3 [box-shadow:inset_3px_0_0_0_var(--ink-teal-deep)]"><div className="tab-panel grid gap-x-8 gap-y-4 sm:grid-cols-[0.8fr_0.9fr_1.7fr]"><div><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Reports to</p><p className="mt-1.5 text-[12.5px] font-semibold text-text-primary">{person.reportsTo}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Introduced by</p><p className="mt-1.5 inline-flex min-w-0 items-center gap-2 text-[12.5px] font-semibold text-text-primary"><Avatar name={person.introducer} className="h-6 w-6 shrink-0" /><span className="truncate">{person.introducer}</span></p></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">Recommended approach</p><p className="mt-1.5 text-[12.5px] leading-5 text-text-primary">{person.approach}</p></div></div></td></tr>}
              </Fragment>;
            })}</tbody>
          </table>
        </div>
        </Card>
      </div>}

      {planView === "actions" && <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border-light px-5 py-3.5">
          <div><div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-blue-primary" /><h3 className="text-[15px] font-semibold text-text-primary">Next actions</h3></div><p className="mt-0.5 text-[12px] text-text-secondary">The short list that moves the account plan forward.</p></div>
          <span className="text-[12px] font-medium text-text-tertiary">{plan.actions.filter((action) => action.status !== "Done").length} open</span>
        </div>
        <div className="divide-y divide-border-light">{plan.actions.map((action) => <div key={action.id} className="grid items-center gap-3 px-5 py-3.5 sm:grid-cols-[24px_minmax(0,1fr)_170px_130px]"><span className={cn("flex h-5 w-5 items-center justify-center rounded-full border", action.status === "Done" ? "border-[color:var(--ink-green)] bg-[color:var(--ink-green)] text-white" : "border-border bg-surface text-transparent")}><Check size={12} strokeWidth={3} /></span><div className="min-w-0"><p className={cn("text-[12.5px] font-semibold text-text-primary", action.status === "Done" && "line-through opacity-60")}>{action.action}</p><p className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-blue-primary"><Link2 size={11} />{action.play}</p></div><span className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary"><Avatar name={action.owner} className="h-6 w-6" />{action.owner}</span><div className="sm:text-right"><StatusPill status={action.status} /><p className="mt-1 text-[11px] text-text-tertiary">Due {prettyDate(action.due)}</p></div></div>)}</div>
      </Card>}
    </div>
  );
}

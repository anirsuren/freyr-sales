"use client";

import { EditableFact } from "@/components/opportunities/EditableFact";
import { Customer360 } from "@/components/customers/Customer360";
import type { Customer360Band } from "@/lib/customer360Shared";
import { formatMoney as fmtMoney } from "@/lib/pipeline";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { DateEcho } from "@/components/ui/DateEcho";
import { useRouter } from "next/navigation";
import {
  Pin,
  Newspaper,
  FileText,
  CalendarClock,
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
import { CustomerDigitalComponents } from "@/components/customers/CustomerDigitalComponents";
import { Badge, OutcomeBadge } from "@/components/ui/Badge";
import { REVIEW_META } from "@/lib/review";
import { Avatar } from "@/components/ui/Avatar";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { LinkedInLink } from "@/components/ui/LinkedInLink";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Input";
import { InfoHint } from "@/components/ui/InfoHint";
import { PeopleSelect } from "@/components/ui/PeopleSelect";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { InteractionTimeline } from "@/components/customers/InteractionTimeline";
import { CustomerActivityTab } from "@/components/customers/CustomerActivityTab";
import {
  CustomerDealRow,
  type CustomerDealRowData,
} from "@/components/customers/CustomerDealRow";
import { useToast } from "@/components/ui/Toast";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { cn, formatDate, formatDateTime, OUTCOME_META, OUTCOME_CHART_COLOR, SIZE_TIER_LABEL, titleCase } from "@/lib/utils";
import { AreaChart, DonutChart, DonutLegend, LineChart, Sparkline, type TipItem } from "@/components/charts/Charts";
import { ExpandedChartModal } from "@/components/charts/ExpandedChartModal";
import {
  buildDeals,
  formatMoney,
  ownerFor,
  STAGES,
  STAGE_PROBABILITY,
  STAGE_COLOR,
  STAGE_ICON,
  repOptionsFor,
} from "@/lib/pipeline";
import { accountHealth, accountHealthSeries, HEALTH_COLOR } from "@/lib/health";
import { HealthBadge, HealthBar } from "@/components/ui/HealthBadge";
import { TrendingUp, TrendingDown, Minus, Sparkles, Package } from "lucide-react";
import { AttributeTag } from "@/components/ui/AttributeTag";

import { industryMeta } from "@/components/ui/IndustryTag";
import {
  countryOnlyGeography,
  flagForGeography,
} from "@/lib/countryFlags";
import type {
  Customer,
  Contact,
  PitchSession,
  Interaction,
  RecommendedService,
  AccountNote,
  AccountAttachment,
  AccountDeal,
} from "@/lib/types";
import type { FdlComponent } from "@/lib/offerings";

// "Ask Agent" is no longer a tab — the agent rides in a right-side drawer so
// it's reachable from every tab without hiding the account (Anir, Jul 3).
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "analytics", label: "Analytics" },
  { key: "offerings", label: "Offerings" },
  { key: "components", label: "Digital components" },
  { key: "contacts", label: "Contacts" },
  { key: "deals", label: "Deals" },
  { key: "sessions", label: "Sessions" },
  { key: "notes", label: "Notes" },
  { key: "activity", label: "Activity" },
];

/**
 * WHAT A REAL ACCOUNT SHOWS TODAY. Suren, walking through Opella (Aug 9): "I
 * don't want to see overview analytics nothing — I will see digital components
 * and activity." Offerings comes off too, because an offering now arrives
 * through the activity you log against it: "in the activity itself there is an
 * offering activity and all the offering activities come here, I don't want to
 * see the offerings here."
 *
 * Nothing is deleted. Mock mode keeps every tab — that is what "remove" means
 * from him (Anir, Aug 9: "if he says remove, it's still gonna be on Mock-mode").
 * These come back in real mode as each one earns its place.
 */
/* OVERVIEW IS ALWAYS THERE (Anir, Aug 30: "where is overview", and "there has
   to be an overview tab on all of them, literally everything that has those
   tabs"). Real mode used to hide every tab whose content was invented for the
   demo, and Overview went with them — so a real account opened onto its Team
   band with nowhere to read who the account IS. Its content is the customer's
   own record, which is as real as anything on the page. */
const REAL_MODE_TABS = new Set(["overview", "components", "activity"]);

const NOTE_KINDS = [
  { key: "call" as const, label: "Call", icon: Phone },
  { key: "email" as const, label: "Email", icon: Mail },
  { key: "meeting" as const, label: "Meeting", icon: Users },
  { key: "note" as const, label: "Note", icon: FileText },
];
const NOTE_KIND_META: Record<
  string,
  { label: string; icon: typeof Phone; color: string }
> = {
  call: { label: "Call", icon: Phone, color: "#0071E3" },
  email: { label: "Email", icon: Mail, color: "#19C3B1" },
  meeting: { label: "Meeting", icon: Users, color: "#7C3AED" },
  note: { label: "Note", icon: FileText, color: "#8E98A8" },
};

// Last slot renders as chip TEXT on a 6% tint of itself — amber was the banned
// yellow there (Suren, Jul 27). Burnt orange is the only warm hue in the set,
// so it still reads distinct from the rose beside it, and it is legible.
const SERVICE_TAG_COLORS = ["#0071E3", "#0D9488", "#7C3AED", "#E11D48", "#C2410C"];

// No DELIVERABLES tiles here any more. "Account Brief / Market Report / ABM
// Plan / Slide Outline — one click, the agent drafts it right in your chat" was
// an agent surface sitting on an account page, and the standing rule is that the
// ONLY agent surfaces in the app are the chat bubble bottom-right and the /agent
// pages (Anir, Jul 27). The dock still takes any of those asks.

/**
 * Geography is ONE chip: the flag and the country, nothing else.
 *
 * The raw field is free text carrying cities and prose — "United States
 * (Princeton, NJ) — offices in London, Singapore" is a real value — and this
 * used to spell all of it out across two lines. Suren, Jul 27: "I don't think
 * you need to see Cambridge. I don't think we care about cities. We only care
 * about countries, so just remove cities." `countryOnlyGeography` does the
 * reducing at the source, so every geography in the app reads the same.
 */
function GeographyValue({ value }: { value: string }) {
  const country = countryOnlyGeography(value);
  const flag = flagForGeography(country);

  return (
    <div className="mt-0.5 min-w-0">
      <span
        className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-normal break-words"
        // Inline because the palette is a runtime value, not a Tailwind class.
        // 1A ≈ 10% alpha — a tint that stays readable in both themes.
        style={{ color: "#0891B2", background: "#0891B21A" }}
        title={`Geography: ${country}`}
      >
        <span className="sr-only">Geography: </span>
        {flag && <span aria-hidden="true">{flag}</span>}
        {country}
      </span>
    </div>
  );
}

export function CustomerTabs({
  canEditFacts,
  customer,
  contacts,
  sessions,
  interactions,
  offeringsCatalog,
  fdlComponents = [],
  canEditComponents = false,
  includeDemoTeam,
  bands = [],
  bandActions,
}: {
  /**
   * MAY THEY CHANGE THE ACCOUNT'S OWN FACTS.
   *
   * The Overview's editable fields were hardcoded on, so "Click a value to
   * change it" rendered for every role — including Solutioning Member and View
   * all, whose Customers row is *view*, and whose every save the API refuses.
   * The same shape as Priyanka's upload button: a control that cannot work
   * (found Aug 31 walking the detail pages, which the first sweep never
   * opened).
   */
  canEditFacts: boolean;
  customer: Customer;
  contacts: Contact[];
  sessions: PitchSession[];
  interactions: Interaction[];
  includeDemoTeam: boolean;
  /**
   * THE CONNECTIONS, AS TABS ON THIS PAGE'S OWN ROW (Suren, Aug 28: "all the
   * tabs have to be on one line... there's no point having two tabs. The
   * entire thing should be just one big page").
   *
   * They used to be a second tab row inside a card above this one. Same tabs,
   * same panels, one row.
   */
  bands?: Customer360Band[];
  bandActions?: Record<string, React.ReactNode>;
  // Customer⇄offering link (Suren, Jul 3): the master-list type options + the
  // offerings applicable to this customer's type + the ones already in use,
  // serialized by the server page for the Offerings tab.
  fdlComponents?: FdlComponent[];
  canEditComponents?: boolean;
  offeringsCatalog?: {
    typeOptions: string[];
    applicable: TabOffering[];
    inUse: TabOffering[];
    /** Every offering in the catalogue, unfiltered by classification. */
    all?: TabOffering[];
  };
}) {
  const { toast } = useToast();
  const router = useRouter();
  const currentUser = useCurrentUser();
  const ownerOptions = repOptionsFor(currentUser.name, includeDemoTeam);
  const defaultDealOwner = includeDemoTeam
    ? customer.owner || currentUser.name
    : currentUser.name;
  /* OVERVIEW OPENS THE PAGE, in both modes. It used to be skipped in real
     mode because it was not rendered there at all; now that it is, landing
     anywhere else means arriving at a band instead of at the account. */
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
      /* A connection tab is a real tab now, so its deep link has to survive a
         reload like any other — the row writes ?tab=band:meetings and the page
         has to read it back. */
      else if (wanted?.startsWith("band:")) setTab(wanted);
      else if (
        wanted &&
        TABS.some((t) => t.key === wanted) &&
        (includeDemoTeam || REAL_MODE_TABS.has(wanted))
      )
        setTab(wanted);
    } catch {}
  }, []);
  // editable account fields (#55 owner, #59 competitor, #60 notes/attachments).
  // Seeded demo accounts keep their deterministic sample owner. Live and newly
  // created accounts remain unassigned until a real teammate claims them.
  const [owner, setOwner] = useState(customer.owner || ownerFor(customer));
  const [competitor, setCompetitor] = useState(customer.competitor || "");
  const [editingComp, setEditingComp] = useState(false);
  const [compDraft, setCompDraft] = useState(customer.competitor || "");
  const [notes, setNotes] = useState<AccountNote[]>(customer.notes_log || []);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteKind, setNoteKind] = useState<"call" | "email" | "meeting" | "note">("note");
  const [noteNext, setNoteNext] = useState("");
  const [noteFollow, setNoteFollow] = useState("");
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [atts, setAtts] = useState<AccountAttachment[]>(
    customer.attachments || []
  );
  const [attName, setAttName] = useState("");
  const [attModalOpen, setAttModalOpen] = useState(false);
  const [attUrl, setAttUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactForm, setContactForm] = useState({
    fullName: "",
    jobTitle: "",
    role: "",
    email: "",
    phone: "",
    linkedinUrl: "",
  });

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
    owner: defaultDealOwner,
    close_date: "",
    next_step: "",
    notes: "",
  });
  // Reset per-account UI state only when switching to a DIFFERENT account.
  // Keyed on customer.id — NOT the customer object: router.refresh() after any
  // save sends a fresh object, and resetting then threw you back to the
  // Overview tab mid-flow (classify, add deal, save revenue…).
  useEffect(() => {
    let wanted: string | null = null;
    try {
      wanted = new URLSearchParams(window.location.search).get("tab");
    } catch {}
    /* A CONNECTION TAB IS A VISIBLE TAB TOO. This reset only recognised the
       old TABS list, so it fell back to Overview and quietly overwrote the
       deep link the effect above had just honoured — ?tab=band:team opened on
       Digital components. Found in the browser, Aug 28: the first effect was
       right and this one undid it a tick later. */
    const visible = (key: string | null) =>
      !!key &&
      (key.startsWith("band:")
        ? bands.some((b) => `band:${b.key}` === key)
        : TABS.some((t) => t.key === key) &&
          (includeDemoTeam || REAL_MODE_TABS.has(key)));
    /* OVERVIEW IS THE FALLBACK IN BOTH MODES. This reset ran on every
       customer change and sent real-mode visitors to Digital components,
       which is why the landing tab kept coming back after the state default
       was fixed — two places decided it and only one had been changed. */
    setTabState(visible(wanted) ? (wanted as string) : "overview");
    setOwner(customer.owner || ownerFor(customer));
    setCompetitor(customer.competitor || "");
    setEditingComp(false);
    setCompDraft(customer.competitor || "");
    setNoteDraft("");
    setNoteKind("note");
    setNoteNext("");
    setNoteFollow("");
    setNoteModalOpen(false);
    setAttName("");
    setAttUrl("");
    setBusy(false);
    setContactModalOpen(false);
    setContactBusy(false);
    setContactForm({
      fullName: "",
      jobTitle: "",
      role: "",
      email: "",
      phone: "",
      linkedinUrl: "",
    });
    setShowDeal(false);
    setDealForm({
      name: "",
      stage: "Prospect",
      value: "",
      offering: "",
      contact: "",
      owner: defaultDealOwner,
      close_date: "",
      next_step: "",
      notes: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id, currentUser.id]);
  const sessionDeals = useMemo(
    () => buildDeals(sessions, [customer], contacts, interactions),
    [sessions, customer, contacts, interactions]
  );
  const allDealsValue =
    sessionDeals.reduce((s, d) => s + d.value, 0) +
    accountDeals.reduce((s, d) => s + d.value, 0);
  const dealCount = sessionDeals.length + accountDeals.length;
  const dealRows = useMemo<CustomerDealRowData[]>(
    () => [
      ...sessionDeals.map((deal) => ({
        id: deal.sessionId,
        href: `/deals/${deal.sessionId}`,
        name: deal.service,
        offering: "Pitch-session opportunity",
        stage: deal.stage,
        value: deal.value,
        contact: deal.contactName,
        owner: deal.owner,
        createdAt: deal.createdAt,
        lastActivity: deal.lastActivity,
        nextStep:
          deal.stage === "Meeting Booked"
            ? "Prepare the meeting brief and confirm the decision process."
            : "Review the latest session and move the opportunity to its next qualified stage.",
      })),
      ...accountDeals.map((deal) => ({
        id: deal.id,
        name: deal.name,
        offering: deal.offering,
        stage: deal.stage,
        value: deal.value,
        contact: deal.contact,
        owner: deal.owner,
        createdAt: deal.created_at,
        closeDate: deal.close_date,
        nextStep: deal.next_step,
        notes: deal.notes,
      })),
    ],
    [sessionDeals, accountDeals]
  );
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
  // Per-touch tooltip row: who we spoke to (their headshot), the account, and
  // how the touch landed — so hovering any chart reveals the real interactions
  // behind the number, not just a metric (Suren: "show me who's behind it").
  const contactNameById = useMemo(
    () => new Map(contacts.map((c) => [c.id, c.full_name])),
    [contacts]
  );
  const touchTip = (i: Interaction, withDate: boolean): TipItem => {
    const name = contactNameById.get(i.contact_id);
    return {
      avatar: name,
      name: name || customer.company_name,
      sub: OUTCOME_META[i.outcome]?.label || i.outcome,
      ...(withDate ? { value: formatDateTime(i.created_at) } : {}),
    };
  };
  // This account's touches by outcome — a quick read for a rep of how the
  // relationship has actually landed (Suren: "what would I need to see here?").
  // Each segment carries the actual touches behind it for the hover tooltip.
  const outcomeMix = useMemo(() => {
    const counts = new Map<string, number>();
    const tips = new Map<string, TipItem[]>();
    for (const i of interactions) {
      counts.set(i.outcome, (counts.get(i.outcome) || 0) + 1);
      const name = contactNameById.get(i.contact_id);
      const item: TipItem = {
        avatar: name,
        name: name || customer.company_name,
        sub: customer.company_name,
        value: OUTCOME_META[i.outcome]?.label || i.outcome,
      };
      const arr = tips.get(i.outcome);
      if (arr) arr.push(item);
      else tips.set(i.outcome, [item]);
    }
    return Array.from(counts.entries())
      .map(([k, v]) => ({
        label: OUTCOME_META[k]?.label || k,
        value: v,
        color: OUTCOME_CHART_COLOR[k] || "#AF9BF5",
        tip: tips.get(k) || [],
      }))
      .sort((a, b) => b.value - a.value);
  }, [interactions, contactNameById, customer.company_name]);
  // Weekly touch buckets aligned to the health series' weeks — each plotted
  // point tips the touches logged that week (Suren: chart hovers must show the
  // actual entities behind the point).
  const healthPointTips: TipItem[][] = (() => {
    const now = Date.now();
    const weeks = healthSeries.points.length;
    const WK = 7 * 86400000;
    return Array.from({ length: weeks }, (_, k) => {
      const end = now - (weeks - 1 - k) * WK;
      const start = end - WK;
      return interactions
        .filter((i) => {
          const t = new Date(i.created_at).getTime();
          return t > start && t <= end;
        })
        .map((i) => touchTip(i, false));
    });
  })();
  async function patchCustomer(payload: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data?.error || "Could not save: try again", "error");
        return null;
      }
      if (data?.customer) {
        setNotes(data.customer.notes_log || []);
        setAtts(data.customer.attachments || []);
        setAccountDeals(data.customer.account_deals || []);
      }
      /* THE PAGE HAS TO RE-READ. `customer` is a server prop, so the fields on
         the Overview kept showing the value they were rendered with even after
         the write landed — the API returned the new record and the screen
         showed the old one, which is the same failure as a save that silently
         does nothing (found by editing Geography, Aug 30). */
      router.refresh();
      return data?.customer;
    } catch {
      toast("Could not save: try again");
      return null;
    }
  }

  function closeContactModal() {
    if (contactBusy) return;
    setContactModalOpen(false);
    setContactForm({
      fullName: "",
      jobTitle: "",
      role: "",
      email: "",
      phone: "",
      linkedinUrl: "",
    });
  }

  async function addContact() {
    const fullName = contactForm.fullName.trim();
    if (!fullName || contactBusy) return;
    setContactBusy(true);
    try {
      const response = await fetch(`/api/customers/${customer.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          job_title: contactForm.jobTitle,
          role_bucket: contactForm.role,
          email: contactForm.email,
          phone: contactForm.phone,
          linkedin_url: contactForm.linkedinUrl,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast(data.error || "Could not add the contact.", "error");
        return;
      }
      toast(`${fullName} added`);
      setContactModalOpen(false);
      setContactForm({
        fullName: "",
        jobTitle: "",
        role: "",
        email: "",
        phone: "",
        linkedinUrl: "",
      });
      router.refresh();
    } catch {
      toast("Could not add the contact.", "error");
    } finally {
      setContactBusy(false);
    }
  }

  async function addDeal() {
    const name = dealForm.name.trim();
    if (!name) return;
    setBusy(true);
    const updated = await patchCustomer({
      addDeal: {
        name,
        stage: dealForm.stage,
        value: Math.round(Number(dealForm.value.replace(/[^0-9.]/g, ""))) || 200000,
        offering: dealForm.offering,
        contact: dealForm.contact,
        owner: dealForm.owner,
        owner_user_id:
          dealForm.owner === currentUser.name
            ? currentUser.memberId || undefined
            : undefined,
        close_date: dealForm.close_date,
        next_step: dealForm.next_step,
        notes: dealForm.notes,
      },
    });
    if (!updated) {
      setBusy(false);
      return;
    }
    setDealForm({
      name: "",
      stage: "Prospect",
      value: "",
      offering: "",
      contact: "",
      owner: defaultDealOwner,
      close_date: "",
      next_step: "",
      notes: "",
    });
    setBusy(false);
    setShowDeal(false);
    toast(`Added deal “${name}”`);
  }

  async function assignOwner(v: string) {
    const previous = owner;
    setOwner(v);
    const updated = await patchCustomer({
      owner: v,
      owner_user_id:
        v && v === currentUser.name
          ? currentUser.memberId || undefined
          : undefined,
    });
    if (!updated) {
      setOwner(previous);
      return;
    }
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
    await patchCustomer({
      addNote: {
        body,
        kind: noteKind,
        next_step: noteNext.trim() || null,
        follow_up_date: noteFollow || null,
      },
    });
    setNoteDraft("");
    setNoteKind("note");
    setNoteNext("");
    setNoteFollow("");
    setBusy(false);
    toast(noteKind === "note" ? "Note added" : "Interaction logged");
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
      title: `Check for recent ${customer.industry || "industry"} guidance that could tighten their submission timelines: a timely reason to reach out.`,
    },
    {
      tag: "Hiring",
      title: `See whether ${shortName} is hiring in regulatory affairs: a growing team often means more submission workload they may need help with.`,
    },
  ];

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-8",
        // The right rail exists only in mock: in real mode the Components and
        // Activity tables take the entire width instead of being squeezed by
        // the snapshot/owner cards (Anir, Aug 12: "the table has to take up
        // the entire space... move it to Mock-mode").
        includeDemoTeam && "lg:grid-cols-[1fr_280px]"
      )}
    >
      <div>
        {/* Tabs */}
        {/* ONE LINE, SCROLLED — never wrapped (Suren, Aug 28: "all the tabs
            have to be on one line... obviously you have to scroll left and
            right to click on it"). Wrapping to a second row is what made the
            page read as two tab systems in the first place. */}
        <div
          role="tablist"
          aria-label="Account sections"
          /* SCROLLS, WITHOUT A SCROLLBAR (Anir, Aug 28: "the scroll bar is a
             problem... it's just a problem, I don't like it"). Hidden in every
             engine rather than styled thin — a visible bar under a tab row
             reads as a second UI element, and on a trackpad the row already
             scrolls by feel.

             overflow-y-hidden with it: a scrollable box scrolls in BOTH axes
             by default, so the row had picked up a vertical wobble of its own
             ("because of the scroll bar now I can scroll vertically on this
             little panel, which is kind of annoying"). */
          /* gap-5, NOT gap-8 (Anir, Aug 29: "the activity is too much to the
             right, like it's awkward"). Thirteen tabs at 32px apart spent
             384px on nothing but air, which stranded the last two — Digital
             components and Activity — nearly 400px past the right edge of a
             row with no visible scrollbar to say so. 20px pulls the strip
             144px in and makes it read as one row of tabs rather than items
             marooned from each other.

             It still scrolls, and it has to: the labels alone are 1217px in a
             1208px row, so no gap on earth fits thirteen of them on one line.
             He chose scrolling over wrapping ("obviously you have to scroll
             left and right to click on it"); this makes the scroll shorter. */
          className="mb-6 flex flex-nowrap gap-5 overflow-x-auto overflow-y-hidden border-b border-border-light [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* OVERVIEW LEADS THE ROW (Anir, Aug 30: "where is overview").
              It was rendered after every band, so on an account with eleven
              of them it sat past the right edge of a scrolling row — present,
              and findable only by scrolling to the end of a list that looks
              like it is all there is. Who the account IS comes before what is
              attached to it. */}
          {(includeDemoTeam || REAL_MODE_TABS.has("overview")) && (
            <button
              key="overview"
              role="tab"
              aria-selected={tab === "overview"}
              onClick={() => setTab("overview")}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-3 text-[14px] transition-colors",
                tab === "overview"
                  ? "border-blue-primary font-semibold text-blue-primary"
                  : "border-transparent font-medium text-text-secondary hover:text-text-primary"
              )}
            >
              Overview
            </button>
          )}
          {bands.map((b) => (
            <button
              key={`band:${b.key}`}
              role="tab"
              aria-selected={tab === `band:${b.key}`}
              onClick={() => setTab(`band:${b.key}`)}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-3 text-[14px] transition-colors",
                tab === `band:${b.key}`
                  ? "border-blue-primary font-semibold text-blue-primary"
                  : "border-transparent font-medium text-text-secondary hover:text-text-primary"
              )}
            >
              {b.label}
              <b className="tnum font-semibold">{b.count}</b>
              {b.total !== undefined && b.total > 0 && (
                <span className="tnum text-[12px] text-text-secondary">
                  · {fmtMoney(b.total)}
                </span>
              )}
            </button>
          ))}
          {TABS.filter(
            (t) => t.key !== "overview" && (includeDemoTeam || REAL_MODE_TABS.has(t.key))
          ).map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "shrink-0 whitespace-nowrap pb-3 -mb-px border-b-2 text-[14px] transition-colors",
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
        {tab.startsWith("band:") && (
          <Customer360
            chromeless
            forceKey={tab.slice(5)}
            company={customer.company_name}
            bands={bands}
            bandActions={bandActions}
          />
        )}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Identity FIRST (Anir's audit): who this account IS leads the
                page; the agent's read follows right after, kept, not cut. */}
            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[15px] font-semibold text-text-primary">
                  About this account
                </h3>
                {/* THE ACCOUNT'S OWN FACTS, CHANGED WHERE THEY ARE READ (Anir,
                    Aug 30: "why can't I edit"). Every other thing on this page
                    was writable and the five that say who the account IS were
                    not, so the Overview could show them and offer no way to
                    correct one. Same owner-or-manager rule the route already
                    enforced. */}
                <span className="text-[11.5px] text-text-tertiary">
                  Click a value to change it
                </span>
              </div>
              <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-x-6 gap-y-2.5">
                <EditableFact
                  label="Company name"
                  value={customer.company_name ?? ""}
                  canEdit={canEditFacts}
                  onSave={async (v) =>
                    (await patchCustomer({ company_name: v })) ? null : "That didn't save."
                  }
                />
                <EditableFact
                  label="Industry"
                  value={customer.industry ?? ""}
                  canEdit={canEditFacts}
                  renderValue={(v) => (
                    <AttributeTag
                      value={v}
                      icon={industryMeta(v).icon}
                      label="Industry"
                      className="max-w-full"
                      color={industryMeta(v).color}
                    />
                  )}
                  onSave={async (v) =>
                    (await patchCustomer({ industry: v })) ? null : "That didn't save."
                  }
                />
                <EditableFact
                  label="Size"
                  value={customer.size_tier ?? ""}
                  canEdit={canEditFacts}
                  /* THE STORED WORDS, NOT INVENTED ONES. Every account holds
                     "small" / "mid" / "large" (lib/utils SIZE_TIER_LABEL), and
                     this picker shipped offering Small / Medium / Large /
                     Enterprise. None of those matched, so a select on an
                     account sized "large" fell back to its first option and
                     saving would have quietly rewritten a correct value to
                     blank (found Aug 30 on Opella). */
                  options={[
                    { value: "", label: "Not set" },
                    ...Object.entries(SIZE_TIER_LABEL).map(([value, label]) => ({
                      value,
                      label,
                    })),
                  ]}
                  format={(v) => SIZE_TIER_LABEL[v.toLowerCase()] ?? titleCase(v)}
                  onSave={async (v) =>
                    (await patchCustomer({ size_tier: v })) ? null : "That didn't save."
                  }
                />
                <EditableFact
                  label="Geography"
                  value={customer.geography ?? ""}
                  canEdit={canEditFacts}
                  renderValue={(v) => <GeographyValue value={v} />}
                  onSave={async (v) =>
                    (await patchCustomer({ geography: v })) ? null : "That didn't save."
                  }
                />
                <EditableFact
                  label="Website"
                  value={customer.website_url ?? ""}
                  canEdit={canEditFacts}
                  format={(v) => v.replace(/^https?:\/\//, "")}
                  onSave={async (v) =>
                    (await patchCustomer({ website_url: v })) ? null : "That didn't save."
                  }
                />
                <EditableFact
                  label="Customer type"
                  value={customer.customer_type ?? ""}
                  canEdit={canEditFacts}
                  onSave={async (v) =>
                    (await patchCustomer({ customer_type: v })) ? null : "That didn't save."
                  }
                />
              </div>
              {/* THE CHIPS MOVED UP, ONTO THE FACTS THEMSELVES.
                  Industry, Geography and Website used to be printed twice:
                  once as an editable line and again as a chip block right
                  underneath, so an account showed its industry two rows apart
                  (found Aug 30 walking this page as a BD Member). EditableFact
                  takes a renderValue now, so the colour + icon chip IS the
                  value you click to change — one row, still a chip. */}
              {/* No customer-type chip here. Its family half is the SAME word
                  as the Industry chip directly above it, so a classified pharma
                  account showed "Pharmaceutical" twice, one under the other
                  (Suren, Jul 27: "where are the tags?… same thing", one chip,
                  once). Customer type now has one home: the colour + icon chip
                  on the Company profile card below, where it sits beside
                  Ownership and Revenue and carries its full value. */}
              <p className="text-[14px] text-text-secondary leading-relaxed">
                {customer.enrichment_summary}
              </p>
            </Card>

            {/* Account analytics — what a rep needs to read the relationship at a
                glance (Suren: "imagine I was a sales agent looking at this
                customer, what would I need to see?"): how health is trending and
                how our touches have actually landed. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[15px] font-semibold text-text-primary">
                    Relationship health
                  </h3>
                  <ExpandedChartModal
                    title="Relationship health"
                    subtitle={`${customer.company_name} health over the last five weeks.`}
                    chart={{
                      kind: "area",
                      label: "Health score",
                      color: HEALTH_COLOR[health.band].color,
                      data: healthSeries.points,
                      format: "number",
                      unit: "pts",
                      yMax: 100,
                      xLabels: healthSeries.points.map((_, index) =>
                        index === healthSeries.points.length - 1
                          ? "this week"
                          : `${healthSeries.points.length - 1 - index}w ago`
                      ),
                      pointTips: healthPointTips,
                    }}
                    className="h-8 px-2.5 text-[11px]"
                  />
                </div>
                <p className="text-[12px] text-text-tertiary mb-3">
                  How this account&apos;s health has moved over the last 5 weeks.
                </p>
                {/* The score used to be a number you had to interpret. A filled
                    bar says how far along the account is before you read it. */}
                <HealthBar health={health} className="mb-4" />
                <div className="flex-1 flex items-end min-h-[150px]">
                  <AreaChart
                    data={healthSeries.points}
                    height={150}
                    color={HEALTH_COLOR[health.band].color}
                    format="number"
                    unit="pts"
                    yMax={100}
                    xLabels={healthSeries.points.map((_, index) =>
                      index === healthSeries.points.length - 1
                        ? "this week"
                        : `${healthSeries.points.length - 1 - index}w ago`
                    )}
                    pointTips={healthPointTips}
                    className="w-full"
                  />
                </div>
              </Card>
              <Card className="flex flex-col">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <h3 className="text-[15px] font-semibold text-text-primary">
                    How touches have landed
                  </h3>
                  {outcomeMix.length > 0 && (
                    <ExpandedChartModal
                      title="How touches have landed"
                      subtitle={`Every logged touch with ${customer.company_name}, by outcome.`}
                      chart={{
                        kind: "donut",
                        segments: outcomeMix,
                        centerLabel: String(interactions.length),
                        centerSub: "touches",
                      }}
                      className="h-8 px-2.5 text-[11px]"
                    />
                  )}
                </div>
                <p className="text-[12px] text-text-tertiary mb-4">
                  Every logged touch with {customer.company_name}, by outcome.
                </p>
                {outcomeMix.length > 0 ? (
                  <div className="flex-1 flex items-center gap-5">
                    <DonutChart
                      syncId="cust-outcomes-overview"
                      segments={outcomeMix}
                      size={140}
                      thickness={15}
                      centerLabel={String(interactions.length)}
                      centerSub="touches"
                    />
                    <DonutLegend items={outcomeMix} syncId="cust-outcomes-overview" />
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center gap-2.5 rounded-md border border-dashed border-border bg-surface/45 px-6 py-8 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
                      <CalendarClock size={18} strokeWidth={1.8} />
                    </span>
                    <p className="text-[13px] font-semibold text-text-primary">No activity yet</p>
                    <p className="max-w-[300px] text-[11.5px] leading-relaxed text-text-tertiary">The first call, email, meeting, or note will build this account&apos;s outcome mix.</p>
                  </div>
                )}
              </Card>
            </div>

            {/* The "Company profile / Analyze the customer" card is GONE (Anir,
                Jul 30: "why do you have this thing here? Remove it" — the
                latest of several passes stripping AI-branded surfaces from this
                page; see also the removed Analyze banner and 'Let the agent
                work' button). The analyze API route still exists for the
                agent's own use; the page simply no longer advertises it. */}

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
                              <span className="block break-words">{c.full_name}</span>
                            </Link>
                            <span className="relative z-10 shrink-0">
                              <LinkedInLink url={c.linkedin_url} size={14} />
                            </span>
                          </p>
                          <p className="text-[12px] text-text-secondary break-words">
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
                                  <span className="break-all">{c.email}</span>
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
                  const color = SERVICE_TAG_COLORS[i % SERVICE_TAG_COLORS.length];
                  const matchClass =
                    match >= 70
                      ? "text-success bg-success/10"
                      : match >= 50
                      ? "text-blue-primary bg-blue-light"
                      : "text-warning bg-warning/10";
                  return (
                  <Card
                    key={i}
                    className="relative overflow-hidden"
                    style={{ borderLeftWidth: 3, borderLeftColor: color }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                          style={{ color, background: `${color}14` }}
                        >
                          <Sparkles size={14} strokeWidth={1.9} />
                        </span>
                        <span className="text-[14px] font-semibold leading-snug text-text-primary">
                          {vp.service_name}
                        </span>
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
                    No matched services yet, generate a session.
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
                Agent-suggested things worth checking before you reach out, verify before you rely on them.
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

        {/* Dedicated analytics tab — the key metrics for THIS account as charts
            (Suren: "a separate analytics tab, look at all our graphs and show the
            key metrics"). */}
        {tab === "analytics" && (
          <div className="space-y-6">
            {(() => {
              // Keep the WHO/WHICH on each deal (company + contact) so the
              // stage donut can tip the actual deals behind a slice — they were
              // computed then thrown away before (Suren: wire the entities).
              const acctDeals = [
                ...sessionDeals.map((d) => ({
                  stage: d.stage,
                  value: d.value,
                  company: d.company,
                  contactName: d.contactName,
                  createdAt: d.createdAt,
                })),
                ...accountDeals.map((d) => ({
                  stage: d.stage,
                  value: d.value,
                  company: customer.company_name,
                  contactName: d.contact || "",
                  createdAt: d.created_at,
                })),
              ];
              const dealsByStage = STAGES.map((stage) => {
                const ds = acctDeals.filter((d) => d.stage === stage);
                return {
                  label: stage,
                  value: ds.reduce((s, d) => s + d.value, 0),
                  count: ds.length,
                  color: STAGE_COLOR[stage as keyof typeof STAGE_COLOR] || "#0071E3",
                  tip: ds.map(
                    (d): TipItem => ({
                      logo: d.company,
                      avatar: d.contactName,
                      name: d.company,
                      sub: d.contactName,
                      value: formatMoney(d.value),
                    })
                  ),
                };
              }).filter((s) => s.count > 0);
              const totalOpen = acctDeals.reduce((s, d) => s + d.value, 0);
              const WEEK = 7 * 86400000;
              const nowMs = Date.now();
              const activity = Array.from({ length: 12 }, (_, w) => {
                const start = nowMs - (11 - w) * WEEK;
                return interactions.filter((i) => {
                  const t = new Date(i.created_at).getTime();
                  return t >= start && t < start + WEEK;
                }).length;
              });
              // Same 12 weekly buckets, but carrying the touches behind each
              // point for the Activity chart's hover.
              const activityTips: TipItem[][] = Array.from({ length: 12 }, (_, w) => {
                const start = nowMs - (11 - w) * WEEK;
                return interactions
                  .filter((i) => {
                    const t = new Date(i.created_at).getTime();
                    return t >= start && t < start + WEEK;
                  })
                  .map((i) => touchTip(i, true));
              });
              const pipelinePointLabels = Array.from({ length: 12 }, (_, w) => {
                const end = nowMs - (11 - w) * WEEK;
                return formatDate(new Date(end).toISOString());
              });
              const pipelineTrend = pipelinePointLabels.map((_, w) => {
                const end = nowMs - (11 - w) * WEEK;
                return acctDeals
                  .filter((deal) => new Date(deal.createdAt).getTime() <= end)
                  .reduce((sum, deal) => sum + deal.value, 0);
              });
              const pipelineTrendTips: TipItem[][] = pipelinePointLabels.map((_, w) => {
                const end = nowMs - (11 - w) * WEEK;
                return acctDeals
                  .filter((deal) => new Date(deal.createdAt).getTime() <= end)
                  .map((deal) => ({
                    logo: deal.company,
                    avatar: deal.contactName,
                    name: deal.company,
                    sub: [deal.contactName, deal.stage].filter(Boolean).join(" · "),
                    value: formatMoney(deal.value),
                  }));
              });
              const kpis = [
                { label: "Open pipeline", value: formatMoney(totalOpen), sub: "current open value" },
                { label: "Open deals", value: String(acctDeals.length), sub: "active opportunities" },
                { label: "Health", value: `${health.score}/100`, sub: health.band.replace("_", " "), color: HEALTH_COLOR[health.band].color },
                { label: "Touches", value: String(interactions.length), sub: "logged interactions" },
              ];
              const H3 = ({
                children,
                action,
              }: {
                children: React.ReactNode;
                action?: React.ReactNode;
              }) => (
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-[15px] font-semibold text-text-primary">{children}</h3>
                  {action}
                </div>
              );
              return (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {kpis.map((k) => (
                      <Card key={k.label} className="h-[100px] flex flex-col justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                          {k.label}
                        </p>
                        <p
                          className="text-[24px] font-bold tnum leading-none"
                          style={k.color ? { color: k.color } : undefined}
                        >
                          {k.value}
                        </p>
                        <p className="text-[10.5px] capitalize text-text-tertiary">{k.sub}</p>
                      </Card>
                    ))}
                  </div>

                  <Card className="p-5">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-[16px] font-semibold text-text-primary">
                          Account pipeline momentum
                        </h3>
                        <p className="mt-0.5 text-[12px] text-text-tertiary">
                          Open value accumulated over the last 12 weeks. Hover any week for the deals, contacts, and stage behind it.
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div className="text-right">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Current</p>
                          <p className="text-[19px] font-bold text-text-primary tnum">{formatMoney(totalOpen)}</p>
                        </div>
                        <ExpandedChartModal
                          title="Account pipeline momentum"
                          subtitle={`${customer.company_name} open value accumulated over the last 12 weeks.`}
                          chart={{
                            kind: "line",
                            series: [{ label: "Open pipeline", color: "#0071E3", points: pipelineTrend }],
                            format: "money",
                            pointLabels: pipelinePointLabels,
                            xLabels: [pipelinePointLabels[0], pipelinePointLabels[5], pipelinePointLabels[11]],
                            pointTips: pipelineTrendTips,
                          }}
                          className="h-8 px-2.5 text-[11px]"
                        />
                      </div>
                    </div>
                    <LineChart
                      series={[{ label: "Open pipeline", color: "#0071E3", points: pipelineTrend }]}
                      height={220}
                      format="money"
                      pointLabels={pipelinePointLabels}
                      xLabels={[pipelinePointLabels[0], pipelinePointLabels[5], pipelinePointLabels[11]]}
                      pointTips={pipelineTrendTips}
                    />
                  </Card>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                    <Card className="flex flex-col p-5">
                      <div>
                        <H3
                          action={dealsByStage.length > 0 ? (
                            <ExpandedChartModal
                              title="Pipeline composition"
                              subtitle={`${customer.company_name} current open value by selling stage.`}
                              chart={{
                                kind: "donut",
                                segments: dealsByStage.map((s) => ({
                                  label: s.label,
                                  value: s.value,
                                  color: s.color,
                                  tip: s.tip,
                                })),
                                centerLabel: formatMoney(totalOpen),
                                centerSub: "open",
                                format: "money",
                              }}
                              className="h-8 px-2.5 text-[11px]"
                            />
                          ) : undefined}
                        >
                          Pipeline composition
                        </H3>
                        <p className="-mt-3 mb-3 text-[11.5px] text-text-tertiary">Current open value by selling stage.</p>
                      </div>
                      {dealsByStage.length > 0 ? (
                        <div className="flex-1 flex items-center gap-4">
                          <DonutChart
                            syncId="cust-deals-stage"
                            segments={dealsByStage.map((s) => ({ label: s.label, value: s.value, color: s.color, tip: s.tip }))}
                            size={132}
                            thickness={14}
                            centerLabel={formatMoney(totalOpen)}
                            centerSub="open"
                            format="money"
                          />
                          <DonutLegend
                            syncId="cust-deals-stage"
                            items={dealsByStage.map((s) => ({ label: s.label, value: s.value, color: s.color }))}
                            format="money"
                          />
                        </div>
                      ) : (
                        <p className="flex-1 flex items-center text-[13px] text-text-tertiary">
                          No open deals on this account yet.
                        </p>
                      )}
                    </Card>
                    <Card className="flex flex-col p-5">
                      <div>
                        <H3
                          action={outcomeMix.length > 0 ? (
                            <ExpandedChartModal
                              title="Touch outcome mix"
                              subtitle={`${customer.company_name} outcomes across every logged interaction.`}
                              chart={{
                                kind: "donut",
                                segments: outcomeMix,
                                centerLabel: String(interactions.length),
                                centerSub: "touches",
                              }}
                              className="h-8 px-2.5 text-[11px]"
                            />
                          ) : undefined}
                        >
                          Touch outcome mix
                        </H3>
                        <p className="-mt-3 mb-3 text-[11.5px] text-text-tertiary">What happened across every logged interaction.</p>
                      </div>
                      {outcomeMix.length > 0 ? (
                        <div className="flex-1 flex items-center gap-4">
                          <DonutChart
                            syncId="cust-outcomes-analytics"
                            segments={outcomeMix}
                            size={132}
                            thickness={14}
                            centerLabel={String(interactions.length)}
                            centerSub="touches"
                          />
                          <DonutLegend items={outcomeMix} syncId="cust-outcomes-analytics" />
                        </div>
                      ) : (
                        <p className="flex-1 flex items-center text-[13px] text-text-tertiary">
                          No touches logged yet.
                        </p>
                      )}
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                    <Card className="flex flex-col">
                      <H3
                        action={
                          <ExpandedChartModal
                            title="Relationship health"
                            subtitle={`${customer.company_name} health over the last five weeks.`}
                            chart={{
                              kind: "area",
                              label: "Health score",
                              color: HEALTH_COLOR[health.band].color,
                              data: healthSeries.points,
                              format: "number",
                              unit: "pts",
                              yMax: 100,
                              xLabels: healthSeries.points.map((_, index) =>
                                index === healthSeries.points.length - 1
                                  ? "this week"
                                  : `${healthSeries.points.length - 1 - index}w ago`
                              ),
                              pointTips: healthPointTips,
                            }}
                            className="h-8 px-2.5 text-[11px]"
                          />
                        }
                      >
                        Relationship health · last 5 weeks
                      </H3>
                      <div className="flex-1 flex items-end min-h-[160px]">
                        <AreaChart
                          data={healthSeries.points}
                          height={160}
                          color={HEALTH_COLOR[health.band].color}
                          format="number"
                          unit="pts"
                          yMax={100}
                          xLabels={healthSeries.points.map((_, index) =>
                            index === healthSeries.points.length - 1
                              ? "this week"
                              : `${healthSeries.points.length - 1 - index}w ago`
                          )}
                          pointTips={healthPointTips}
                          className="w-full"
                        />
                      </div>
                    </Card>
                    <Card className="flex flex-col">
                      <H3
                        action={
                          <ExpandedChartModal
                            title="Activity"
                            subtitle={`${customer.company_name} logged touches over the last 12 weeks.`}
                            chart={{
                              kind: "area",
                              label: "Touches",
                              color: "#0071E3",
                              data: activity,
                              format: "number",
                              unit: "touches",
                              pointTips: activityTips,
                              xLabels: activity.map((_, i) =>
                                i === activity.length - 1 ? "now" : `${activity.length - 1 - i}w`
                              ),
                            }}
                            className="h-8 px-2.5 text-[11px]"
                          />
                        }
                      >
                        Activity · last 12 weeks
                      </H3>
                      <div className="flex-1 flex items-end min-h-[160px]">
                        <AreaChart
                          data={activity}
                          height={160}
                          format="number"
                          unit="touches"
                          pointTips={activityTips}
                          xLabels={activity.map((_, i) =>
                            i === activity.length - 1 ? "now" : `${activity.length - 1 - i}w`
                          )}
                          className="w-full"
                        />
                      </div>
                    </Card>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {tab === "components" && (
          <CustomerDigitalComponents
            customerId={customer.id}
            links={customer.digital_components || []}
            components={fdlComponents}
            canEdit={canEditComponents}
          />
        )}

        {tab === "offerings" && offeringsCatalog && (
          <CustomerOfferingsTab
            customerId={customer.id}
            customerName={customer.company_name}
            customerType={customer.customer_type ?? null}
            typeOptions={offeringsCatalog.typeOptions}
            applicable={offeringsCatalog.applicable}
            inUse={offeringsCatalog.inUse}
            usage={customer.offering_usage || []}
          />
        )}

        {tab === "contacts" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] text-text-secondary">
                <span className="font-semibold text-text-primary tnum">
                  {contacts.length}
                </span>{" "}
                {contacts.length === 1 ? "contact" : "contacts"} at this account
              </p>
              <Button
                onClick={() => setContactModalOpen(true)}
                className="px-3 py-2 text-[13px]"
              >
                <Plus size={15} strokeWidth={2.2} />
                Add contact
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                        <span className="block break-words">{c.full_name}</span>
                      </Link>
                      <span className="relative z-10 shrink-0">
                        <LinkedInLink url={c.linkedin_url} size={14} />
                      </span>
                    </p>
                    <p className="text-[13px] text-text-secondary break-words">{c.job_title}</p>
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
                      <span className="break-all">{c.email}</span>
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
          </div>
        )}

        {tab === "deals" && (() => {
          const orderedDeals = [...dealRows].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          let runningValue = 0;
          const valueTimeline = [0, ...orderedDeals.map((deal) => (runningValue += deal.value))];
          const dealPointLabels = ["Account opened", ...orderedDeals.map((deal) => formatDate(deal.createdAt))];
          const dealPointTips: TipItem[][] = [
            [],
            ...orderedDeals.map((_, index) =>
              orderedDeals.slice(0, index + 1).map((deal) => ({
                name: deal.name,
                sub: [deal.contact, deal.stage].filter(Boolean).join(" · "),
                avatar: deal.contact || undefined,
                value: formatMoney(deal.value),
              }))
            ),
          ];
          const stageMix = STAGES.map((stage) => {
            const rows = dealRows.filter((deal) => deal.stage === stage);
            return {
              label: stage,
              value: rows.length,
              color: STAGE_COLOR[stage],
              tip: rows.map((deal) => ({
                name: deal.name,
                sub: deal.contact || deal.owner || "Unassigned",
                avatar: deal.contact || deal.owner || undefined,
                value: formatMoney(deal.value),
              })),
            };
          }).filter((segment) => segment.value > 0);
          const weightedTotal = dealRows.reduce(
            (sum, deal) => sum + deal.value * (STAGE_PROBABILITY[deal.stage as keyof typeof STAGE_PROBABILITY] || 0),
            0
          );
          return (
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

            {dealCount > 0 && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.7fr_1fr]">
                <Card className="p-4">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-[15px] font-semibold text-text-primary">Pipeline value over time</h3>
                      <p className="mt-0.5 text-[11.5px] text-text-tertiary">
                        Cumulative open value as opportunities entered this account.
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-[0.05em] text-text-tertiary">Weighted</p>
                        <p className="text-[17px] font-bold text-text-primary tnum">{formatMoney(weightedTotal)}</p>
                      </div>
                      <ExpandedChartModal
                        title="Pipeline value over time"
                        subtitle={`${customer.company_name} cumulative open value as opportunities entered the account.`}
                        chart={{
                          kind: "line",
                          series: [{ label: "Open pipeline", color: "#0071E3", points: valueTimeline }],
                          format: "money",
                          pointLabels: dealPointLabels,
                          xLabels: [dealPointLabels[0], dealPointLabels[dealPointLabels.length - 1]],
                          pointTips: dealPointTips,
                        }}
                        className="h-8 px-2.5 text-[11px]"
                      />
                    </div>
                  </div>
                  <LineChart
                    series={[{ label: "Open pipeline", color: "#0071E3", points: valueTimeline }]}
                    height={118}
                    format="money"
                    pointLabels={dealPointLabels}
                    xLabels={[dealPointLabels[0], dealPointLabels[dealPointLabels.length - 1]]}
                    pointTips={dealPointTips}
                  />
                </Card>
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[15px] font-semibold text-text-primary">Stage mix</h3>
                    <ExpandedChartModal
                      title="Stage mix"
                      subtitle={`${customer.company_name} active opportunities by current stage.`}
                      chart={{
                        kind: "donut",
                        segments: stageMix,
                        centerLabel: String(dealCount),
                        centerSub: dealCount === 1 ? "deal" : "deals",
                      }}
                      className="h-8 px-2.5 text-[11px]"
                    />
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-text-tertiary">Where every active opportunity sits now.</p>
                  <div className="mt-3 grid grid-cols-[124px_minmax(0,1fr)] items-center gap-5">
                    <DonutChart
                      segments={stageMix}
                      size={124}
                      thickness={14}
                      centerLabel={String(dealCount)}
                      centerSub={dealCount === 1 ? "deal" : "deals"}
                    />
                    <ul className="min-w-0 space-y-2">
                      {stageMix.map((segment) => {
                        const percentage = Math.round((segment.value / dealCount) * 100);
                        return (
                          <li key={segment.label} className="min-w-0">
                            <div className="flex items-center gap-2 text-[11.5px]">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: segment.color }}
                              />
                              <span className="min-w-0 flex-1 font-medium text-text-secondary">
                                {segment.label}
                              </span>
                              <span className="font-semibold text-text-primary tnum">
                                {segment.value}
                              </span>
                              <span className="w-9 text-right text-text-tertiary tnum">
                                {percentage}%
                              </span>
                            </div>
                            <div className="ml-[18px] mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
                              <span
                                className="block h-full rounded-full"
                                style={{ width: `${percentage}%`, background: segment.color }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </Card>
              </div>
            )}

            <div className="space-y-3">
              {dealRows.map((deal) => (
                <CustomerDealRow key={deal.id} deal={deal} />
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
          );
        })()}

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
                    className="group block px-5 py-4 hover:bg-surface transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {/* Who the pitch is for — their headshot leads, so the row
                          reads like a real person, not a blank strip. */}
                      {sessContact ? (
                        <Avatar
                          name={sessContact.full_name}
                          className="w-12 h-12 text-[15px] shrink-0"
                        />
                      ) : (
                        <span className="w-12 h-12 rounded-xl bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                          <CalendarClock size={22} strokeWidth={1.7} />
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[15px] font-semibold text-text-primary">
                            {svc[0]?.service_name || "Pitch session"}
                          </p>
                          {outcome ? (
                            <OutcomeBadge outcome={outcome} />
                          ) : review ? (
                            <span
                              className="semantic-color-pill inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.04em] px-2 py-0.5 rounded-full"
                              style={
                                {
                                  "--semantic-color": review.color,
                                  "--semantic-bg": review.bg,
                                } as CSSProperties
                              }
                            >
                              <review.icon size={10} strokeWidth={2.4} />
                              {review.label}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.04em] text-success bg-success/10 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-success" />
                              Ready to send
                            </span>
                          )}
                        </div>
                        <p className="text-[12.5px] text-text-tertiary mt-0.5">
                          {sessContact ? (
                            <>
                              Pitched to{" "}
                              <span className="font-medium text-text-secondary">
                                {sessContact.full_name}
                              </span>
                              {sessContact.job_title ? ` · ${sessContact.job_title}` : ""}
                            </>
                          ) : (
                            "Pitch session"
                          )}
                          {" · "}
                          {formatDateTime(s.created_at)}
                        </p>
                        {/* The offerings this pitch covers — fills the middle with
                            real content instead of dead space. */}
                        {svc.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {svc.slice(0, 3).map((sv, i) => (
                              <span
                                key={i}
                                className="semantic-color-pill inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium"
                                style={{
                                  "--semantic-color":
                                    SERVICE_TAG_COLORS[i % SERVICE_TAG_COLORS.length],
                                  "--semantic-bg":
                                    `${SERVICE_TAG_COLORS[i % SERVICE_TAG_COLORS.length]}0F`,
                                } as CSSProperties}
                              >
                                <OfferingIcon name={sv.service_name} className="h-4 w-4 rounded text-[6px]" />
                                {sv.service_name}
                              </span>
                            ))}
                            {svc.length > 3 && (
                              <span className="text-[11.5px] text-text-tertiary font-medium">
                                +{svc.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* The action — a real blue CTA, not a dead grey chip. */}
                      <span className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-lg bg-blue-primary text-white shadow-[0_1px_2px_rgba(0,113,227,0.20)] group-hover:bg-blue-hover group-hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)] transition-all shrink-0">
                        Open pitch
                        <ArrowRight
                          size={15}
                          strokeWidth={2}
                          className="group-hover:translate-x-0.5 transition-transform"
                        />
                      </span>
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
                (Suren, Jul 8), no always-open textarea box cluttering the tab. */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-text-primary">
                  Notes
                </h3>
                <p className="text-[12px] text-text-tertiary mt-0.5">
                  Call summaries, next steps, and internal context.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Attach is a button + popup, same as Add note — the
                    always-open paste-a-link form read as clutter (Anir:
                    "I would probably just have a button for that"). */}
                <Button
                  variant="secondary"
                  onClick={() => setAttModalOpen(true)}
                  className="px-3.5 py-2 text-[13px]"
                >
                  <Paperclip size={14} strokeWidth={1.8} />
                  Attach
                </Button>
                <Button
                  onClick={() => setNoteModalOpen(true)}
                  className="px-3.5 py-2 text-[13px]"
                >
                  <Plus size={15} strokeWidth={2.2} />
                  Add note
                </Button>
              </div>
            </div>

            <Modal
              open={attModalOpen}
              onClose={() => setAttModalOpen(false)}
              title="Attach a document"
            >
              <div className="space-y-3">
                <p className="text-[12.5px] text-text-secondary">
                  Paste a link to a document or reference (e.g. a contract or deck).
                </p>
                <input
                  value={attName}
                  onChange={(e) => setAttName(e.target.value)}
                  placeholder="Name (e.g. MSA draft)"
                  className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary"
                />
                <input
                  value={attUrl}
                  onChange={(e) => setAttUrl(e.target.value)}
                  placeholder="https://… (optional)"
                  className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary"
                />
                <div className="flex justify-end">
                  <Button
                    onClick={async () => {
                      await addAttachment();
                      setAttModalOpen(false);
                    }}
                    loading={busy}
                    disabled={!attName.trim()}
                    className="px-4 py-2 text-[13px]"
                  >
                    <Paperclip size={15} strokeWidth={1.8} />
                    Attach
                  </Button>
                </div>
              </div>
            </Modal>

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
                {notes.map((n) => {
                  const meta = NOTE_KIND_META[n.kind || "note"];
                  const KIcon = meta.icon;
                  return (
                  <Card key={n.id} className="p-4">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      {n.kind && n.kind !== "note" && (
                        <span
                          className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5"
                          style={{ background: `${meta.color}1A`, color: meta.color }}
                        >
                          <KIcon size={11} strokeWidth={2.2} />
                          {meta.label}
                        </span>
                      )}
                      <Avatar name={n.author} className="w-6 h-6 text-[11px]" />
                      <span className="text-[13px] font-semibold text-text-primary">
                        {n.author}
                      </span>
                      <span className="text-[12px] text-text-tertiary tnum">
                        · {formatDateTime(n.created_at)}
                      </span>
                    </div>
                    <p className="text-[14px] text-text-secondary leading-relaxed whitespace-pre-wrap">
                      {n.body}
                    </p>
                    {(n.next_step || n.follow_up_date) && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 pt-2.5 border-t border-border-light text-[12.5px]">
                        {n.next_step && (
                          <span className="inline-flex items-center gap-1.5 text-text-secondary">
                            <ArrowRight size={13} strokeWidth={2} className="text-blue-primary" />
                            <span className="font-medium text-text-primary">Next:</span>{" "}
                            {n.next_step}
                          </span>
                        )}
                        {n.follow_up_date && (
                          <span className="inline-flex items-center gap-1.5 text-text-tertiary tnum">
                            <CalendarClock size={13} strokeWidth={1.8} />
                            Follow-up {formatDate(n.follow_up_date)}
                          </span>
                        )}
                      </div>
                    )}
                  </Card>
                  );
                })}
              </div>
            )}

            {/* Add-note popup — log a real interaction (#96) */}
            <Modal
              open={noteModalOpen}
              onClose={() => setNoteModalOpen(false)}
              title="Log an interaction"
            >
              <div className="space-y-3.5">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.03em] text-text-tertiary mb-1.5">
                    Type
                  </label>
                  <div className="inline-flex rounded-lg bg-surface p-1 flex-wrap gap-1">
                    {NOTE_KINDS.map((k) => {
                      const KIcon = k.icon;
                      const on = noteKind === k.key;
                      return (
                        <button
                          key={k.key}
                          onClick={() => setNoteKind(k.key)}
                          className={cn(
                            "inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-md transition-colors",
                            on
                              ? "bg-white text-blue-primary font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                              : "text-text-secondary hover:text-text-primary"
                          )}
                        >
                          <KIcon size={14} strokeWidth={1.9} />
                          {k.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.03em] text-text-tertiary mb-1.5">
                    {noteKind === "note" ? "Note" : "What happened"}
                  </label>
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder={
                      noteKind === "call"
                        ? "Summary of the call…"
                        : noteKind === "email"
                        ? "What you sent / their reply…"
                        : noteKind === "meeting"
                        ? "Meeting notes and decisions…"
                        : "Internal context…"
                    }
                    rows={4}
                    autoFocus
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-blue-primary resize-y"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.03em] text-text-tertiary mb-1.5">
                      Next step
                    </label>
                    <input
                      value={noteNext}
                      onChange={(e) => setNoteNext(e.target.value)}
                      placeholder="e.g. Send the proposal"
                      className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.03em] text-text-tertiary mb-1.5">
                      Follow-up date
                    </label>
                    <input
                      type="date"
                      value={noteFollow}
                      onChange={(e) => setNoteFollow(e.target.value)}
                      className="w-full bg-surface border border-border rounded-md px-3 py-2 text-[13px] outline-none focus:border-blue-primary"
                    />
                    <DateEcho value={noteFollow} />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
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
                  {noteKind === "note" ? "Save note" : "Log it"}
                </Button>
              </div>
            </Modal>

            <Card>
              <h3 className="text-[15px] font-semibold text-text-primary mb-1">
                Attachments
              </h3>
              {atts.length === 0 && (
                <p className="text-[12px] text-text-tertiary">
                  Nothing attached yet, use the Attach button above.
                </p>
              )}
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
                          className="min-w-0 text-blue-primary hover:underline break-words"
                        >
                          {a.name}
                        </a>
                      ) : (
                        <span className="min-w-0 text-text-primary break-words">{a.name}</span>
                      )}
                      <span className="ml-auto text-[12px] text-text-tertiary tnum shrink-0">
                        {formatDateTime(a.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}

        {/* THE FIVE ACTIVITIES LIVE HERE. Suren opened this tab looking for
            Lead / Opportunity / Pilot / Contract / Delivery and found the
            interaction log — a different thing wearing the same word — while
            the only way to log one was buried in a card on the Offerings tab
            (Anir, Aug 9: "he went to this page and he expected me to have it
            so that I could create a new activity"). The interaction log is
            still here, below, under its own name. */}
        {tab === "activity" && (
          <CustomerActivityTab
            customerId={customer.id}
            usage={customer.offering_usage || []}
            /* EVERY offering, in-use ones first. A Lead is by definition
               something they do not use yet, and "applicable" needs the
               account to be classified first, so filtering here left a brand
               new customer with an empty picker and no way out. */
            offerings={[
              ...(offeringsCatalog?.inUse || []),
              ...(
                offeringsCatalog?.all ||
                offeringsCatalog?.applicable ||
                []
              ).filter(
                (o) => !(offeringsCatalog?.inUse || []).some((u) => u.id === o.id)
              ),
            ].map((o) => ({
              id: o.id,
              name: o.name,
              category: o.category ?? null,
            }))}
            canEdit
          >
            <InteractionTimeline
              interactions={interactions}
              contactNames={Object.fromEntries(contacts.map((contact) => [contact.id, contact.full_name]))}
            />
          </CustomerActivityTab>
        )}
        </div>
      </div>

      {/* Right rail — decision-first: the agent entry, the health picture,
          then the working cards. One glance, no wall of boxes (Anir, Jul 3).
          Mock only — see the grid above. */}
      {includeDemoTeam && (
      <aside className="space-y-4">
        {/* Per-account agent entry — opens the account-scoped drawer (chat +
            quick actions) over the page, reachable from any tab. The global
            dock stays for cross-app asks; this one is pre-loaded with THIS
            account's context (Anir). */}
        {/* The "Ask the agent" launcher is gone from the account rail —
            the dock in the bottom-right is the one way to reach the agent. */}

        {/* Account snapshot — health ring + trend + why + the glance numbers,
            one visual card instead of two stacked text boxes. */}
        <Card>
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-3">
            Account snapshot
          </h3>
          <div className="flex items-center gap-4 mb-3">
            {(() => {
              const color = HEALTH_COLOR[health.band].color;
              return (
                <DonutChart
                  segments={[
                    {
                      label: `${health.band} health`,
                      value: health.score,
                      color,
                      tip: health.factors.slice(0, 5).map((factor) => ({
                        name: factor.label,
                        value: `${factor.delta > 0 ? "+" : ""}${factor.delta} pts`,
                      })),
                    },
                    {
                      label: "Gap to full health",
                      value: Math.max(0, 100 - health.score),
                      color: "#E5E5EA",
                    },
                  ]}
                  size={76}
                  thickness={7}
                  centerLabel={String(health.score)}
                  format="percent"
                />
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
                  format="number"
                  unit="pts"
                  label="Account health"
                  xLabels={healthSeries.points.map((_, index) =>
                    index === healthSeries.points.length - 1
                      ? "this week"
                      : `${healthSeries.points.length - 1 - index}w ago`
                  )}
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
                  <span className="text-[13px] text-text-tertiary">-</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        {/* No Agent block on an account page any more — no suggested
            actions, no "This week" run summary, no "Recent agent runs"
            (Anir, Jul 27: "only agent stuff should be the chat bot in the
            bottom right and the agent tab"). */}
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
                options={ownerOptions}
                onChange={assignOwner}
                placeholder="Unassigned"
                ariaLabel="Account owner"
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5">
                Competitor / incumbent
                <InfoHint text="Who they use for this work today, or who you are up against to win it. Knowing that changes how you pitch." />
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
                    <span className="min-w-0 break-words">{competitor}</span>
                  ) : (
                    <span className="text-text-tertiary">Add competitor</span>
                  )}
                  <Pencil size={13} strokeWidth={1.6} className="ml-auto text-text-tertiary shrink-0" />
                </button>
              )}
            </div>
          </div>
        </Card>
        {/* The Deliverables tiles that used to sit here are gone — see the note
            at the top of this file. Agent asks belong in the dock. */}
      </aside>
      )}

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
                  placeholder="e.g. EU MDR remediation. 2026"
                  className={fld}
                />
              </div>
              <div>
                <label className={lbl}>Offering</label>
                {/* Dropdown-standard sweep (Anir, Jul 30): every native
                    <select> in this form becomes the app's own picker —
                    ColorSelect for categoricals, PeopleSelect for people. */}
                <ColorSelect
                  ariaLabel="Offering"
                  value={dealForm.offering}
                  onChange={(v) => set("offering", v)}
                  className="w-full"
                  collapsible={false}
                  options={[
                    { value: "", label: "Select an offering…", icon: Package },
                    ...applicableSlim.map((o) => ({
                      value: o.name,
                      label: o.name,
                      icon: Package,
                      color: "#0071E3",
                    })),
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Stage</label>
                  <ColorSelect
                    ariaLabel="Stage"
                    value={dealForm.stage}
                    onChange={(v) => set("stage", v)}
                    className="w-full"
                    collapsible={false}
                    options={STAGES.map((s) => ({
                      value: s,
                      label: s,
                      color: STAGE_COLOR[s],
                      icon: STAGE_ICON[s],
                    }))}
                  />
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
                  <PeopleSelect
                    ariaLabel="Primary contact"
                    value={dealForm.contact}
                    onChange={(v) => set("contact", v)}
                    placeholder="Select a contact…"
                    options={contacts.map((c) => ({
                      name: c.full_name,
                      sub: c.job_title || undefined,
                    }))}
                  />
                </div>
                <div>
                  <label className={lbl}>Expected close</label>
                  <input
                    type="date"
                    value={dealForm.close_date}
                    onChange={(e) => set("close_date", e.target.value)}
                    className={fld}
                  />
                  <DateEcho value={dealForm.close_date} />
                </div>
              </div>
              <div>
                <label className={lbl}>Owner</label>
                <PeopleSelect
                  ariaLabel="Deal owner"
                  value={dealForm.owner}
                  onChange={(v) => set("owner", v)}
                  options={ownerOptions}
                  allowUnassigned={false}
                />
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

      <Modal
        open={contactModalOpen}
        onClose={closeContactModal}
        title={`Add a contact at ${customer.company_name}`}
        size="wide"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input
                autoFocus
                value={contactForm.fullName}
                onChange={(event) =>
                  setContactForm((form) => ({
                    ...form,
                    fullName: event.target.value,
                  }))
                }
                placeholder="e.g. Priya Shah"
                maxLength={120}
              />
            </Field>
            <Field label="Job title">
              <Input
                value={contactForm.jobTitle}
                onChange={(event) =>
                  setContactForm((form) => ({
                    ...form,
                    jobTitle: event.target.value,
                  }))
                }
                placeholder="e.g. VP, Regulatory Affairs"
                maxLength={160}
              />
            </Field>
            <Field label="Role">
              <Input
                value={contactForm.role}
                onChange={(event) =>
                  setContactForm((form) => ({
                    ...form,
                    role: event.target.value,
                  }))
                }
                placeholder="e.g. Decision maker"
                maxLength={120}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={contactForm.email}
                onChange={(event) =>
                  setContactForm((form) => ({
                    ...form,
                    email: event.target.value,
                  }))
                }
                placeholder="name@company.com"
                maxLength={254}
              />
            </Field>
            <Field label="Phone">
              <Input
                type="tel"
                value={contactForm.phone}
                onChange={(event) =>
                  setContactForm((form) => ({
                    ...form,
                    phone: event.target.value,
                  }))
                }
                placeholder="+44 20 0000 0000"
                maxLength={60}
              />
            </Field>
            <Field label="LinkedIn URL">
              <Input
                type="url"
                value={contactForm.linkedinUrl}
                onChange={(event) =>
                  setContactForm((form) => ({
                    ...form,
                    linkedinUrl: event.target.value,
                  }))
                }
                placeholder="https://www.linkedin.com/in/…"
                maxLength={500}
              />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border-light pt-4">
            <Button
              onClick={addContact}
              loading={contactBusy}
              disabled={!contactForm.fullName.trim()}
            >
              Add contact
            </Button>
          </div>
        </div>
      </Modal>

      {/* The account-scoped agent drawer is gone with its launcher — the
          bottom-right dock is the only agent surface outside /agent
          (Anir, Jul 27). */}
    </div>
  );
}

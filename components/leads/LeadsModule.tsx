"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BadgeCheck,
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleEllipsis,
  ClipboardList,
  Globe2,
  Handshake,
  Mail,
  ExternalLink,
  MapPin,
  Megaphone,
  MessageCircle,
  Pencil,
  Clock3,
  Phone,
  RadioTower,
  Rows3,
  Plus,
  SearchCheck,
  Send,
  Sparkles,
  Sprout,
  Download,
  Trash2,
  UserPlus,
  UserRoundCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";
import { Modal } from "@/components/ui/Modal";
import {
  countryOptions,
  countryFlag,
  countryFromDialOption,
  dialCodeFromOption,
  dialOptionValue,
  dialOptions,
  dialTriggerLabel,
  joinPhone,
  splitPhone,
} from "@/lib/countries";
import { formatPhoneNumber, phoneProblem, nationalDigitBudget, phoneDigits } from "@/lib/phone";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Field, Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { cn, todayISO } from "@/lib/utils";
import { leadLinkedInUrl } from "@/lib/leadLinkedIn";
import { downloadCSV, toCSV } from "@/lib/csv";
import { PinnableTable } from "@/components/ui/PinnableTable";
import { PriorityLabel, PriorityTooltip } from "@/components/ui/SearchPriority";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  isOpenLead,
  leadAgeDays,
  leadSourceColor,
  leadStatusColor,
  type Lead,
  type LeadSource,
  type LeadStatus,
  type LeadsState,
} from "@/lib/leadsShared";

/**
 * THE LEADS ROOM (Suren, Aug 25): the thousands that come in, before the
 * hundreds that become deals. "There will be thousands of leads… out of those
 * only hundreds can be your opportunities. That is why you want to keep
 * something as a lead — so that you don't discuss those 3000 items, you
 * discuss only the opportunity."
 *
 * The page is built around the two questions a lead list is actually for: what
 * came in that nobody has touched, and what is going stale. Everything else is
 * a filter.
 *
 * A lead is qualified with a MEETING or a PRESENTATION and never a submission
 * — his rule — so the row's action is "Request a meeting or presentation",
 * which hands off to Solutioning with the lead already named.
 */

import { NewRequestDialog } from "@/components/solutioning/SolutioningModule";
import { tint } from "@/lib/tint";
import { DateText } from "@/components/ui/DateText";
import { LeadAnalytics } from "@/components/leads/LeadAnalytics";
import { LeadPersonInsights } from "@/components/leads/LeadPersonInsights";
import { LeadJourney } from "@/components/leads/LeadJourney";
import { LeadLinkedInProfile } from "@/components/leads/LeadLinkedInProfile";
import { repSlug } from "@/lib/team";

type CustomerOption = { id: string; name: string };

/**
 * A source or status should explain itself before the label is read. Generic
 * colour dots made Website, Referral, Qualifying and Converted look like the
 * same kind of choice; these marks carry the channel or workflow meaning while
 * preserving the app's existing semantic colours.
 */
const LEAD_SOURCE_ICONS: Record<LeadSource, LucideIcon> = {
  Website: Globe2,
  Conference: CalendarDays,
  Referral: UserRoundCheck,
  Campaign: Megaphone,
  "Inbound email": Mail,
  Partner: Handshake,
  Outbound: Send,
  Other: CircleEllipsis,
};

const LEAD_STATUS_ICONS: Record<LeadStatus, LucideIcon> = {
  New: Sparkles,
  Contacted: MessageCircle,
  Qualifying: SearchCheck,
  Nurturing: Sprout,
  Converted: BadgeCheck,
  Disqualified: Ban,
};

function leadSourceIcon(source: LeadSource): LucideIcon {
  return LEAD_SOURCE_ICONS[source];
}

function leadStatusIcon(status: LeadStatus): LucideIcon {
  return LEAD_STATUS_ICONS[status];
}

const BLANK = {
  id: "",
  name: "",
  company: "",
  title: "",
  email: "",
  phone: "",
  country: "",
  linkedinUrl: "",
  source: "Website",
  interest: "",
  status: "New",
  owner: "",
  note: "",
  customerId: "",
  disqualifiedReason: "",
  /* The person chose the explicit blue "Add a company not on the list"
     action, so keep the text box open even while the name is still empty.
     This UI-only flag is never saved. */
  companyOther: false,
  /* The dialling code lives beside the number rather than inside it, so
     choosing a country can set the code before any digits are typed. A phone
     with no number is still no phone: `phone` stays empty until there are
     digits, and this only drives the picker. */
  dialCode: "+1",
};

type Draft = typeof BLANK;

const PHONE_EXAMPLE_BY_DIAL: Record<string, string> = {
  "+1": "202 555 0123",
  "+44": "20 7946 0000",
  "+91": "98765 43210",
};

export function LeadsModule({
  state: initial,
  live,
  members,
  customers,
  canWrite,
  canCreate = false,
  canDelete = false,
}: {
  state: LeadsState;
  live: boolean;
  members: string[];
  customers: CustomerOption[];
  canWrite: boolean;
  /** May start a new lead. The route asks CREATE for that and only WRITE to
   *  change one that exists, so the button asks the same question. */
  canCreate?: boolean;
  /** May remove one. The routes ask CREATE-level access to delete (see
   *  canDelete in lib/privileges), so a member who may edit is refused; the
   *  control has to ask the same question or it lies. */
  canDelete?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState(initial);
  /** The lead a solutioning request is being raised for — the dialog opens
   *  HERE (Anir, Aug 27: "it takes me to another place, which is super
   *  annoying... just leave me there and just give me the pop-up"). */
  const [requestingFor, setRequestingFor] = useState<Lead | null>(null);
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [sort, setSort] = useState<"newest" | "oldest" | "stalest">("newest");
  const [groupBy, setGroupBy] = useState<"none" | "status" | "owner" | "source">("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null);
  /** Which lead is folded open. Same mechanic as every other list here. */
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => {
    const leadRef = new URLSearchParams(window.location.search).get("lead");
    const sourceLead = leadRef && initial.leads.find((lead) => lead.ref === leadRef);
    if (!sourceLead) return;
    setQuery(sourceLead.ref);
    setOpenRow(sourceLead.id);
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        const row = [...document.querySelectorAll("[data-lead-row]")]
          .find((element) => element.getAttribute("data-lead-row") === sourceLead.id);
        row?.scrollIntoView({ block: "center" });
      });
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [initial.leads]);

  const leads = state.leads;
  const open = leads.filter(isOpenLead);
  const untouched = open.filter((l) => l.status === "New");
  /* "Going stale" is the finding a lead list exists to produce: nobody has
     moved this in three weeks and it is still open. Amber, never red — a
     quiet lead is a nudge, not a failure. */
  const stale = open.filter((l) => leadAgeDays(l) >= 21);
  const converted = leads.filter((l) => l.status === "Converted");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = leads.filter((l) => {
      if (statuses.length && !statuses.includes(l.status)) return false;
      if (sources.length && !sources.includes(l.source)) return false;
      if (owners.length && !owners.includes(l.owner ?? "__none")) return false;
      if (!q) return true;
      return [l.ref, l.name, l.company, l.email ?? "", l.interest ?? "", l.title ?? "", l.linkedinProfile?.headline ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    return rows.sort((a, b) => {
      if (sort === "stalest") return leadAgeDays(b) - leadAgeDays(a);
      const at = Date.parse(a.createdAt) || 0;
      const bt = Date.parse(b.createdAt) || 0;
      return sort === "oldest" ? at - bt : bt - at;
    });
  }, [leads, query, statuses, sources, owners, sort]);

  /* GROUPING, like the other directories (Anir, Sep 9: "I need it
     consistent"). Sections follow whatever the sort put the rows in, so
     changing one never fights the other, and a lead with nothing in the
     grouped field lands in a named section rather than vanishing. */
  const sections = useMemo(() => {
    if (groupBy === "none") return null;
    const order: string[] = [];
    const buckets = new Map<string, typeof shown>();
    for (const lead of shown) {
      const key =
        groupBy === "status"
          ? lead.status
          : groupBy === "owner"
            ? lead.owner || "No owner"
            : lead.source || "No source";
      if (!buckets.has(key)) {
        buckets.set(key, []);
        order.push(key);
      }
      buckets.get(key)!.push(lead);
    }
    return order.map((key) => ({ key, items: buckets.get(key)! }));
  }, [shown, groupBy]);

  /** The list as it is filtered and sorted right now, not the whole store —
   *  exporting something other than what is on screen is a lie. */
  /* NOTHING ON SCREEN, NOTHING TO EXPORT (Anir, Aug 14, on the Reports
     button doing exactly this): it stayed live on an empty page and handed
     back a spreadsheet holding one row of headings. Reports learned that;
     this did not. `shown` is the FILTERED list, so this also covers having
     filtered everything away. */
  const nothingToExport = shown.length === 0;

  function exportCsv() {
    downloadCSV(
      `freyr-leads-${todayISO()}.csv`,
      toCSV(
        ["Name", "Title", "Company", "Source", "Status", "Owner",
         "Email", "Phone", "LinkedIn", "Country", "Asked about", "Came in", "Last moved"],
        shown.map((l) => [
          l.name, l.title ?? "", l.company, l.source, l.status,
          l.owner ?? "", l.email ?? "", l.phone ?? "", l.linkedinUrl ?? "", l.country ?? "",
          l.interest ?? "", l.createdAt.slice(0, 10), l.updatedAt.slice(0, 10),
        ])
      )
    );
    toast(`${shown.length} ${shown.length === 1 ? "lead" : "leads"} exported.`);
  }

  async function post(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That didn't save.", "error");
        return false;
      }
      if (data.state) setState(data.state);
      toast(success);
      router.refresh();
      return (data.lead as Lead | undefined) ?? true;
    } catch {
      toast("That didn't save.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openEditor(lead?: Lead) {
    setEditing(
      lead
        ? {
            ...BLANK,
            ...Object.fromEntries(
              Object.entries(lead).map(([k, v]) => [k, v ?? ""])
            ),
            dialCode: splitPhone(lead.phone).dial ||
              (lead.country
                ? dialCodeFromOption(
                    dialOptions().find((option) => option.label.endsWith(lead.country!))?.value ?? ""
                  )
                : undefined) ||
              "+1",
          } as Draft
        : { ...BLANK }
    );
  }

  /** WHY ADD LEAD IS WAITING, or null. The same four rules save() enforces,
   *  in the order the form is filled, so the answer arrives before the press
   *  rather than one toast at a time. */
  function leadProblemFor(d: typeof editing): string | null {
    if (!d) return null;
    if (!d.name.trim()) return "Who got in touch? A lead needs a person.";
    if (!d.company.trim()) return "Which organisation are they from?";
    const parsed = splitPhone(d.phone);
    const digits = phoneDigits(parsed.number);
    const email = d.email.trim();
    if (!email && !digits)
      return "Add an email or a phone number, so somebody can follow up.";
    const why = phoneProblem(d.dialCode || parsed.dial, parsed.number);
    if (why) return why;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return "Enter a valid email address, or leave it empty.";
    if (leadLinkedInUrl(d.linkedinUrl) === null)
      return "Enter a LinkedIn profile link, such as linkedin.com/in/name.";
    return null;
  }

  async function enrichLead(id: string) {
    setEnrichingId(id);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "enrich-linkedin", id }),
      });
      const data = await res.json();
      if (data.state) setState(data.state);
      if (!res.ok) {
        toast(data.error || "The LinkedIn profile could not be read.", "error");
        const fresh = await fetch("/api/leads").then((response) => response.json());
        if (fresh.state) setState(fresh.state);
      } else {
        toast("LinkedIn profile facts saved to the lead.");
      }
    } catch {
      toast("The LinkedIn profile could not be read. The link is still saved.", "error");
    } finally {
      setEnrichingId(null);
    }
  }

  async function save() {
    if (!editing) return;
    /* MANDATORY, AND STARRED TO MATCH (Anir, Sep 4: "we need some mandatory
       fields here... And show the asterisk"). It used to accept either a
       person or a company, which let a lead in carrying a name and nothing
       else to act on. Person and company are both needed to know who this is;
       a way to reach them is needed to do anything about it, and either
       channel will do. */
    if (!editing.name.trim()) {
      toast("Who got in touch? A lead needs a person.", "error");
      return;
    }
    if (!editing.company.trim()) {
      toast("Which organisation are they from?", "error");
      return;
    }
    const phoneDigitsOnly = phoneDigits(splitPhone(editing.phone).number);
    if (!editing.email.trim() && !phoneDigitsOnly) {
      toast("Add an email or a phone number, so somebody can follow up.", "error");
      return;
    }
    /* A number that is present has to be a real length — the box already stops
       at the ceiling, but a pasted value arrives whole. */
    const parsedPhone = splitPhone(editing.phone);
    const phoneWhy = phoneProblem(editing.dialCode || parsedPhone.dial, parsedPhone.number);
    if (phoneWhy) {
      toast(phoneWhy, "error");
      return;
    }
    /* type="email" is on the box, but nothing in this dialog is a form, so the
       browser never validates it — "not-an-email" saved happily and sat in the
       record until somebody tried to write to it. Optional, but if it is filled
       in it has to be an address. Same test the session form uses. */
    const email = editing.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast("Enter a valid email address, or leave it empty.", "error");
      return;
    }
    if (leadLinkedInUrl(editing.linkedinUrl) === null) {
      toast("Enter a LinkedIn profile link, such as linkedin.com/in/name.", "error");
      return;
    }
    const priorUrl = state.leads.find((lead) => lead.id === editing.id)?.linkedinUrl || "";
    const nextUrl = leadLinkedInUrl(editing.linkedinUrl) || "";
    const ok = await post(
      { op: "save", lead: { ...editing, id: editing.id || undefined } },
      editing.id ? "Lead updated." : "Lead added."
    );
    if (ok) {
      setEditing(null);
      if (typeof ok === "object" && nextUrl && priorUrl !== nextUrl) void enrichLead(ok.id);
    }
  }

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Everything that came in before it is a deal. Qualify with a meeting or a presentation; when it turns real, it becomes an opportunity."
        action={
          canWrite ? (
            /* WRITE IS NOT CREATE. A BD Member may work a lead that exists but
               not start one — the route refuses that with a 403 — so the
               button belongs to whoever may create. */
            canCreate ? (
              <button
                type="button"
                onClick={() => openEditor()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Plus size={15} strokeWidth={2.4} /> New lead
              </button>
            ) : null
          ) : (
            /* THE SHIELD IN THE TOP BAR ALREADY SAYS THIS (Anir, Sep 1: "I don't
               want you to say that... I want there to be somewhere on the page
               where, depending on the role I have... I should see an icon.
               When I hover over the icon, it shows me exactly what I can do").

               A pill announcing what you CANNOT do is a permanent apology
               taking header space on every page a view-only account opens, and
               it repeats what the access shield answers on hover. The mock
               notice stays — that one tells you the DATA is not real, which
               nothing else says. */
            null
          )
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Users}
          label="Open leads"
          value={String(open.length)}
          sub={open.length === 0 ? "nothing waiting" : "not yet qualified or dropped"}
        />
        <StatTile
          icon={UserPlus}
          label="Nobody has touched"
          value={String(untouched.length)}
          color="var(--ink-bright-blue)"
          warn={untouched.length > 0}
          sub="still sitting at New"
        />
        <StatTile
          icon={Clock3}
          label="Going stale"
          value={String(stale.length)}
          color="var(--ink-amber)"
          warn={stale.length > 0}
          sub="open, untouched 21+ days"
        />
        <StatTile
          icon={CheckCircle2}
          label="Became opportunities"
          value={String(converted.length)}
          color="#16A34A"
          sub={
            leads.length
              ? `${Math.round((converted.length / leads.length) * 100)}% of every lead`
              : "none yet"
          }
        />
      </div>

      <LeadAnalytics leads={leads} />

      {/* The toolbar needs air under the stat tiles (Anir, Aug 26: "the search
          bar is touching the cards"). Every other list page spaces this row;
          these three called PageToolbar bare and it sat flush against the
          tiles above it. */}
      <PageToolbar
        className="mt-4"
        query={query}
        onQuery={setQuery}
        placeholder="Search leads by name, company or what they asked about"
        searchAriaLabel="Search leads"
        onClearAll={() => {
          setStatuses([]);
          setSources([]);
          setOwners([]);
        }}
        groups={[
          {
            key: "status",
            label: "Status",
            values: statuses,
            onChange: setStatuses,
            options: LEAD_STATUSES.map((s) => ({
              value: s,
              label: s,
              color: leadStatusColor(s),
              icon: leadStatusIcon(s),
            })),
          },
          {
            key: "source",
            label: "Source",
            values: sources,
            onChange: setSources,
            options: LEAD_SOURCES.map((s) => ({
              value: s,
              label: s,
              color: leadSourceColor(s),
              icon: leadSourceIcon(s),
            })),
          },
          {
            key: "owner",
            label: "Owner",
            values: owners,
            onChange: setOwners,
            options: [
              { value: "__none", label: "Unassigned", color: "#8E98A8" },
              ...[...new Set(leads.map((l) => l.owner).filter(Boolean))].map(
                (o) => ({
                  value: o as string,
                  label: o as string,
                  avatarName: o as string,
                })
              ),
            ],
          },
        ]}
        display={
          /* EXPORT, LIKE CUSTOMERS AND CONTACTS ALREADY HAVE. A list people
             work from is a list they take into a meeting; every other roster
             in this app lets you take it with you. */
          <PriorityTooltip label="Export CSV">
            <button
              type="button"
              onClick={exportCsv}
              aria-label="Export CSV"
              disabled={nothingToExport}
              title={
                nothingToExport
                  ? "Nothing to export yet: no leads are showing."
                  : undefined
              }
              className="flex items-center rounded-md border border-border px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={16} strokeWidth={1.5} />
              <PriorityLabel>Export CSV</PriorityLabel>
            </button>
          </PriorityTooltip>
        }
        filtersAfter={
          <div className="flex items-center gap-2">
            <ColorSelect
              value={groupBy}
              onChange={(v) => setGroupBy(v as typeof groupBy)}
              ariaLabel="Group leads"
              minWidth={160}
              dense
              collapsible={false}
              options={[
                { value: "none", label: "No grouping", color: "#64748B", icon: Rows3 },
                { value: "status", label: "By status", color: "var(--ink-orange)", icon: SearchCheck },
                { value: "owner", label: "By owner", color: "var(--ink-teal-deep)", icon: UserRound },
                { value: "source", label: "By source", color: "#0F6E56", icon: Megaphone },
              ]}
            />
            {sections && (
              <button
                type="button"
                onClick={() => {
                  const allClosed = sections.every((section) =>
                    collapsedGroups.has(`${groupBy}:${section.key}`)
                  );
                  setCollapsedGroups(
                    allClosed
                      ? new Set()
                      : new Set(sections.map((section) => `${groupBy}:${section.key}`))
                  );
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 text-[11.5px] font-semibold text-text-secondary transition-colors hover:bg-surface hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary"
              >
                {sections.every((section) =>
                  collapsedGroups.has(`${groupBy}:${section.key}`)
                ) ? (
                  <><ChevronDown size={14} /> Open all</>
                ) : (
                  <><ChevronDown size={14} className="-rotate-90" /> Close all</>
                )}
              </button>
            )}
          </div>
        }
        sort={
          <ColorSelect
            value={sort}
            onChange={(v) => setSort(v as typeof sort)}
            ariaLabel="Sort leads"
            minWidth={160}
            dense
            collapsible={false}
            options={[
              { value: "newest", label: "By newest", color: "var(--ink-bright-blue)", icon: CalendarDays },
              { value: "oldest", label: "By oldest", color: "#64748B", icon: Clock3 },
              /* The stale list is the reason to open this page in the
                 morning, so it is one click away, not a mental sort. */
              { value: "stalest", label: "By stalest", color: "var(--ink-amber)", icon: CircleEllipsis },
            ]}
          />
        }
      />

      {shown.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={leads.length === 0 ? "No leads yet" : "Nothing matches those filters"}
          description={
            leads.length === 0
              ? canCreate
              ? "A lead is anyone who got in touch before there is a real deal. A demo request from the website, a card from a conference, a referral. Press New lead at the top to add the first one."
              : "A lead is anyone who got in touch before there is a real deal. An owner adds them; you can work any lead once it is here."
              : "Clear a filter to see the rest."
          }
        />
      ) : (
        <div className="mt-4 space-y-5">
        {(sections ?? [{ key: "__all", items: shown }]).map(sec => (
        <section key={sec.key} className="overflow-hidden rounded-xl border border-border-light bg-white shadow-card">
          {sections && (
            <button type="button"
              aria-expanded={!collapsedGroups.has(`${groupBy}:${sec.key}`)}
              onClick={() => setCollapsedGroups(previous => {
                const next = new Set(previous);
                const key = `${groupBy}:${sec.key}`;
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
              })}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-blue-primary">
              {groupBy === "owner" ? (
                sec.key === "No owner"
                  ? <UserRound size={20} className="text-text-tertiary" />
                  : <Avatar name={sec.key} className="h-8 w-8 shrink-0 text-[10px]" />
              ) : (() => {
                const groupedByStatus = groupBy === "status";
                const color = groupedByStatus
                  ? leadStatusColor(sec.items[0].status)
                  : leadSourceColor(sec.items[0].source);
                const Icon = groupedByStatus
                  ? leadStatusIcon(sec.items[0].status)
                  : leadSourceIcon(sec.items[0].source);
                return (
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                    style={{ background: tint(color, 10), color }}
                    aria-hidden="true"
                  >
                    <Icon size={14} strokeWidth={2.2} />
                  </span>
                );
              })()}
              <span className="text-[14px] font-semibold text-text-primary">{sec.key}</span>
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-text-secondary tnum">{sec.items.length} {sec.items.length === 1 ? "lead" : "leads"}</span>
              <ChevronDown size={17} className={cn("ml-auto shrink-0 text-text-tertiary transition-transform", collapsedGroups.has(`${groupBy}:${sec.key}`) && "-rotate-90")} />
            </button>
          )}
          {/* The header row stays put while you scroll, the same as Team and
              Solutioning (Anir, Aug 9: "there should be an option to pin the
              row headers and the column headers if I want"). */}
          {(!sections || !collapsedGroups.has(`${groupBy}:${sec.key}`)) && (
          <div className={sections ? "border-t border-border-light" : undefined}>
          <PinnableTable id={sections ? `leads-table-${groupBy}-${sec.key}` : "leads-table"}>
          <table className="w-full min-w-[960px] text-left">
            <thead>
              <tr className="border-b border-border-light bg-surface/40 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-2.5">
                <th className="w-[22%]">Person</th>
                <th className="w-[18%]">Company</th>
                <th className="w-[13%]">Source</th>
                <th className="w-[13%]">Status</th>
                <th className="w-[15%]">Owner</th>
                <th className="w-[11%]">Last moved</th>
                <th className="w-[8%] text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {sec.items.map((lead) => {
                const age = leadAgeDays(lead);
                const isStale = isOpenLead(lead) && age >= 21;
                const open = openRow === lead.id;
                const linkedCustomer = customers.find(
                  (customer) => customer.name.toLowerCase() === lead.company.trim().toLowerCase()
                );
                return (
                  <Fragment key={lead.id}>
                    {/* THE ROW FOLDS OPEN, like every other list in this app
                        (Anir, Aug 25: "should be a dropdown bro — didn't I
                        specifically say it has to be consistent with every
                        other thing and every other page"). The first cut
                        opened a modal and put a bare arrow in Actions that
                        jumped to Solutioning, so clicking a lead took you to
                        a different module entirely. Clicking a lead now opens
                        the lead; the handoff is a named button inside. */}
                    <tr
                      data-lead-row={lead.id}
                      onClick={() => setOpenRow(open ? null : lead.id)}
                      aria-expanded={open}
                      className={cn(
                        "cursor-pointer transition-[background-color,opacity] duration-200",
                        open
                          ? "bg-surface [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                          : "hover:bg-surface",
                        openRow !== null && !open && "opacity-45 hover:opacity-100"
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <Avatar
                            name={lead.name || lead.company}
                            initialsOnly
                            className="h-7 w-7 shrink-0 text-[9px]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-text-primary">
                              {lead.name || "—"}
                            </span>
                            {lead.title && (
                              <span className="block truncate text-[11.5px] text-text-secondary">
                                {lead.title}
                              </span>
                            )}
                            {lead.linkedinUrl && (
                              <span className="mt-0.5 flex items-center gap-1 text-[10.5px] font-medium text-blue-primary">
                                <LinkedInIcon size={11} aria-hidden="true" />
                                {enrichingId === lead.id ? "Reading profile…" : lead.linkedinStatus === "ready" ? "LinkedIn saved" : lead.linkedinStatus === "unavailable" ? "Lookup unavailable" : "LinkedIn linked"}
                              </span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {linkedCustomer ? (
                          <Link
                            href={`/customers/${linkedCustomer.id}`}
                            onClick={(event) => event.stopPropagation()}
                            className="group/customer inline-flex max-w-full items-center gap-2 text-[12.5px] text-text-secondary"
                          >
                            <CompanyLogo name={lead.company} className="h-6 w-6 shrink-0" />
                            <span className="truncate transition-colors group-hover/customer:text-blue-primary group-hover/customer:underline">
                              {lead.company || "—"}
                            </span>
                          </Link>
                        ) : (
                          <span className="flex items-center gap-2 text-[12.5px] text-text-secondary">
                            <CompanyLogo name={lead.company} className="h-6 w-6 shrink-0" />
                            <span className="truncate">{lead.company || "—"}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
                          style={{
                            background: tint(leadSourceColor(lead.source), 9),
                            color: leadSourceColor(lead.source),
                          }}
                        >
                          {(() => {
                            const Icon = leadSourceIcon(lead.source);
                            return <Icon size={12} strokeWidth={2.2} aria-hidden="true" />;
                          })()}
                          {lead.source}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
                          style={{
                            background: tint(leadStatusColor(lead.status), 9),
                            color: leadStatusColor(lead.status),
                          }}
                        >
                          {(() => {
                            const Icon = leadStatusIcon(lead.status);
                            return <Icon size={12} strokeWidth={2.2} aria-hidden="true" />;
                          })()}
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {lead.owner ? (
                          <Link
                            href={`/analytics/reps/${repSlug(lead.owner)}`}
                            onClick={(event) => event.stopPropagation()}
                            className="group/owner flex items-center gap-1.5 text-[12.5px] text-text-secondary"
                          >
                            <Avatar name={lead.owner} className="h-5 w-5 shrink-0 text-[8px]" />
                            <span className="truncate transition-colors group-hover/owner:text-blue-primary group-hover/owner:underline">
                              {lead.owner}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-[12px] text-text-tertiary">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[12px] tnum">
                        <span className={cn(isStale && "font-semibold text-[color:var(--ink-amber)]")}>
                          {/* "Last moved" in days tells you nothing about
                              WHEN; the hover gives the moment (Anir, Sep 7). */}
                          <DateText value={lead.updatedAt || lead.createdAt}>
                            {age === 0 ? "Today" : age === 1 ? "Yesterday" : `${age}d ago`}
                          </DateText>
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {/* Same cluster the pipeline row uses: the tools, then
                            the chevron that says the row opens. */}
                        <span className="flex items-center justify-start gap-1">
                          {canWrite && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditor(lead);
                                }}
                                title="Edit this lead"
                                className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                              >
                                <Pencil size={13} strokeWidth={2.2} />
                              </button>
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete(lead);
                                  }}
                                  title="Delete this lead"
                                  className="rounded-md p-1.5 text-[color:var(--status-red)] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
                                >
                                  <Trash2 size={13} strokeWidth={2.2} />
                                </button>
                              )}
                            </>
                          )}
                          <ChevronDown
                            size={15}
                            strokeWidth={2.2}
                            aria-hidden="true"
                            className={cn(
                              "text-text-tertiary transition-transform",
                              open && "rotate-180 text-blue-primary"
                            )}
                          />
                        </span>
                      </td>
                    </tr>

                    {open && (
                      <tr className="!border-t-0 bg-surface">
                        <td
                          colSpan={7}
                          className="pb-4 pl-7 pr-4 pt-1 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                        >
                          <div className="tab-panel overflow-hidden rounded-xl border border-border-light bg-white">
                            <div className="flex flex-col gap-4 border-b border-border-light p-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 max-w-3xl">
                                <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                                  What they asked about
                                </span>
                                <p className="mt-1 text-[13.5px] font-medium leading-relaxed text-text-primary">
                                  {lead.interest || "No request or interest has been recorded yet."}
                                </p>
                              </div>

                              {lead.status === "Converted" && lead.convertedOpportunityId ? (
                                <Link
                                  href={`/opportunities/${lead.convertedOpportunityId}`}
                                  onClick={(event) => event.stopPropagation()}
                                  className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-[rgba(22,163,74,0.1)] px-3 py-2 text-[12.5px] font-semibold text-[#15803D] hover:underline"
                                >
                                  <CheckCircle2 size={14} strokeWidth={2.2} />
                                  Open opportunity
                                </Link>
                              ) : lead.status !== "Disqualified" ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setRequestingFor(lead);
                                  }}
                                  className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-blue-primary px-3 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                                >
                                  <ClipboardList size={14} strokeWidth={2.2} />
                                  Request meeting or presentation
                                </button>
                              ) : null}
                            </div>

                            <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                              <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(380px,.9fr)]">
                                <section className="rounded-xl border border-border-light bg-white p-4">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                                    Contact & account
                                  </span>
                                  {canWrite && (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openEditor(lead);
                                      }}
                                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-blue-primary hover:bg-blue-light"
                                    >
                                      <Pencil size={12} strokeWidth={2.2} /> Edit details
                                    </button>
                                  )}
                                </div>
                                <div className="mt-3 grid grid-cols-2 items-start gap-x-6 gap-y-4">
                                  <span className="flex min-w-0 flex-col">
                                    <span className="flex h-4 shrink-0 items-center gap-1.5 whitespace-nowrap text-[10.5px] leading-4 font-semibold uppercase tracking-[0.05em] text-text-tertiary"><Mail size={12} strokeWidth={2} aria-hidden="true" /> Email</span>
                                    {lead.email ? (
                                      <a href={`mailto:${lead.email}`} onClick={(event) => event.stopPropagation()} className="mt-1 flex min-h-5 min-w-0 items-start leading-5 text-[12.5px] font-semibold text-blue-primary hover:underline">
                                        <span className="min-w-0 truncate">{lead.email}</span>
                                      </a>
                                    ) : <span className="mt-1 flex min-h-5 items-center text-[12px] leading-5 text-text-tertiary">Not added</span>}
                                  </span>
                                  <span className="flex min-w-0 flex-col">
                                    <span className="flex h-4 shrink-0 items-center gap-1.5 whitespace-nowrap text-[10.5px] leading-4 font-semibold uppercase tracking-[0.05em] text-text-tertiary"><Phone size={12} strokeWidth={2} aria-hidden="true" /> Phone</span>
                                    {lead.phone ? (
                                      <a href={`tel:${lead.phone}`} onClick={(event) => event.stopPropagation()} className="mt-1 flex min-h-5 min-w-0 items-start leading-5 text-[12.5px] font-semibold text-blue-primary hover:underline">
                                        <span className="min-w-0">{formatPhoneNumber(lead.phone)}</span>
                                      </a>
                                    ) : <span className="mt-1 flex min-h-5 items-center text-[12px] leading-5 text-text-tertiary">Not added</span>}
                                  </span>
                                  <span className="flex min-w-0 flex-col">
                                    <span className="flex h-4 shrink-0 items-center gap-1.5 whitespace-nowrap text-[10.5px] leading-4 font-semibold uppercase tracking-[0.05em] text-text-tertiary"><LinkedInIcon size={12} aria-hidden="true" /> LinkedIn</span>
                                    {lead.linkedinUrl ? (
                                      <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()} className="mt-1 inline-flex min-h-5 items-center gap-1 text-[12.5px] font-semibold text-blue-primary hover:underline">
                                        Open profile <ExternalLink size={12} aria-hidden="true" />
                                      </a>
                                    ) : <span className="mt-1 text-[12px] text-text-tertiary">Not added</span>}
                                  </span>
                                  <span className="flex min-w-0 flex-col">
                                    <span className="flex h-4 shrink-0 items-center gap-1.5 whitespace-nowrap text-[10.5px] leading-4 font-semibold uppercase tracking-[0.05em] text-text-tertiary"><MapPin size={12} strokeWidth={2} aria-hidden="true" /> Country</span>
                                    {lead.country ? (
                                      <span className="mt-1 flex min-h-5 min-w-0 leading-5 items-center gap-1.5 text-[12.5px] font-semibold text-text-primary">
                                        <span className="text-[17px] leading-none" role="img" aria-label={`${lead.country} flag`}>{countryFlag(lead.country)}</span>
                                        <span className="min-w-0 truncate">{lead.country}</span>
                                      </span>
                                    ) : <span className="mt-1 flex min-h-5 items-center text-[12px] leading-5 text-text-tertiary">Not added</span>}
                                  </span>
                                  <span className="flex min-w-0 flex-col">
                                    <span className="flex h-4 shrink-0 items-center gap-1.5 whitespace-nowrap text-[10.5px] leading-4 font-semibold uppercase tracking-[0.05em] text-text-tertiary"><RadioTower size={12} strokeWidth={2} aria-hidden="true" /> Source</span>
                                    <span className="mt-1 flex min-h-5 min-w-0 leading-5 items-center gap-1.5 text-[12.5px] font-semibold text-text-primary">
                                      {(() => {
                                        const Icon = leadSourceIcon(lead.source);
                                        return <Icon size={14} strokeWidth={2.2} style={{ color: leadSourceColor(lead.source) }} aria-hidden="true" />;
                                      })()}
                                      <span className="min-w-0 truncate">{lead.source}</span>
                                    </span>
                                  </span>
                                  {linkedCustomer && (
                                    <span className="flex min-w-0 flex-col">
                                      <span className="flex h-4 shrink-0 items-center whitespace-nowrap text-[10.5px] leading-4 font-semibold uppercase tracking-[0.05em] text-text-tertiary">Customer account</span>
                                      <Link href={`/customers/${linkedCustomer.id}`} onClick={(event) => event.stopPropagation()} className="mt-1 flex min-h-5 min-w-0 leading-5 items-center gap-1.5 text-[12.5px] font-semibold text-blue-primary hover:underline">
                                        <CompanyLogo name={linkedCustomer.name} className="h-5 w-5 shrink-0 rounded-md text-[7px]" />
                                        <span className="min-w-0 truncate">{linkedCustomer.name}</span>
                                      </Link>
                                    </span>
                                  )}
                                  <span className="flex min-w-0 flex-col">
                                    <span className="flex h-4 shrink-0 items-center gap-1.5 whitespace-nowrap text-[10.5px] leading-4 font-semibold uppercase tracking-[0.05em] text-text-tertiary"><UserRound size={12} strokeWidth={2} aria-hidden="true" /> Owner</span>
                                    {lead.owner ? (
                                      <Link href={`/analytics/reps/${repSlug(lead.owner)}`} onClick={(event) => event.stopPropagation()} className="mt-1 flex min-h-5 min-w-0 leading-5 items-center gap-1.5 text-[12.5px] font-semibold text-blue-primary hover:underline">
                                        <Avatar name={lead.owner} className="h-5 w-5 shrink-0 text-[7px]" />
                                        <span className="min-w-0 truncate">{lead.owner}</span>
                                      </Link>
                                    ) : <span className="mt-1 flex min-h-5 items-center text-[12px] leading-5 text-text-tertiary">Unassigned</span>}
                                  </span>
                                </div>

                                {lead.linkedinUrl && <LeadLinkedInProfile
                                  lead={lead}
                                  refreshing={enrichingId === lead.id}
                                  canWrite={canWrite}
                                  onRefresh={() => void enrichLead(lead.id)}
                                />}

                                {lead.note && (
                                  <div className="mt-4 rounded-lg bg-surface px-3 py-2.5">
                                    <span className="block text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">Internal note</span>
                                    <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary">{lead.note}</p>
                                  </div>
                                )}

                                {lead.status === "Disqualified" && lead.disqualifiedReason && (
                                  <div className="mt-4 rounded-lg bg-[rgba(220,38,38,0.07)] px-3 py-2.5">
                                    <span className="block text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[color:var(--status-red)]">Why it stopped</span>
                                    <p className="mt-1 text-[12.5px] font-medium leading-relaxed text-text-secondary">{lead.disqualifiedReason}</p>
                                  </div>
                                )}
                              </section>

                              <LeadPersonInsights
                                lead={lead}
                                onEdit={canWrite ? () => openEditor(lead) : undefined}
                              />
                              </div>

                              <LeadJourney lead={lead} />
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
                })}
            </tbody>
          </table>
          </PinnableTable>
          </div>
          )}
        </section>
        ))}
        </div>
      )}

      {requestingFor && (
        <NewRequestDialog
          room="requests"
          customers={customers}
          opportunities={[]}
          members={members}
          prefillCustomerId={requestingFor.customerId ?? null}
          prefillOpportunityId={null}
          prefillCompany={requestingFor.company || null}
          prefillLead={requestingFor.ref || null}
          prefillLeadName={requestingFor.name}
          prefillLeadInterest={requestingFor.interest || null}
          onClose={() => setRequestingFor(null)}
          onCreate={async (input) => {
            try {
              const res = await fetch("/api/solutioning", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ op: "create", type: "request", ...input }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok || !data.request) {
                toast(data.error || "That did not save.", "error");
                return false;
              }
              /* Raised from HERE, and you STAY here (Anir, Aug 27: "just
                 leave me there and just give me the pop-up"). The toast
                 carries the ref so the request is findable when wanted. */
              toast(`${data.request.ref} raised for ${requestingFor.company}.`);
              setRequestingFor(null);
              return true;
            } catch {
              toast("That did not save.", "error");
              return false;
            }
          }}
        />
      )}

      {editing && (() => {
        const leadProblem = leadProblemFor(editing);
        return (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing.id ? `Edit ${editing.name || editing.company}` : "New lead"}
          /* ONE SIZE FOR EVERY FORM DIALOG (Anir, Aug 26: "all the pop-ups,
             let's just make it a set size"). These were "wide" (640px), which
             is too narrow for a two-column form — the fields stacked and the
             dialog came out tall and thin. "workflow" is 980px, the width the
             Solutioning request dialog already uses, and the floor below stops
             a short form collapsing into a strip. */
          size="workflow"
        >
          {/* ONE COLUMN ON A PHONE. Two columns were held at every width, and
              the Phone cell holds two controls of its own — a dialling code
              picker and the number. At 375px that left the number box THIRTY
              FIVE PIXELS wide: you could not read what you typed, let alone
              type it. The dialog itself fitted fine; the grid inside it did
              not. min-h keeps the frame from resizing as fields come and go,
              which is the standing rule for these popups. */}
          <div className="grid min-h-[420px] grid-cols-1 content-start gap-3 sm:grid-cols-2">
            <Field label="Person" required>
              {/* THE CAP THE SERVER ALREADY KEEPS, said out loud. lib/leads
                  trims a name to 120 characters on the way in, so a longer one
                  was accepted, saved short, and nobody was told — paste a job
                  title into the name box and half of it vanishes on save.
                  Declaring it here stops the typing at the same place the
                  server would have cut it. */}
              <Input
                value={editing.name}
                maxLength={120}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Who got in touch"
              />
            </Field>
            <Field label="Company" required hint="A company typed here is saved on this lead only; it does not create a customer account.">
              {/* THE ACCOUNT, WITH ITS OWN LOGO (Anir, Aug 26: "Company:
                  you're not doing that either" — on the picker showing no
                  logos). This was an <input list> wearing a datalist, which
                  renders as the browser's grey autocomplete and looks nothing
                  like the rest of the app. Pick a customer account, or use the
                  explicit blue add action to type a company name on this lead.
                  Typed names do not silently create customer accounts. */}
              {(() => {
                const known = customers.find((c) => c.name === editing.company);
                const typing = editing.companyOther || (!!editing.company && !known);
                if (typing)
                  return (
                    <div className="relative">
                      <Input
                        value={editing.company}
                        onChange={(e) =>
                          setEditing({ ...editing, company: e.target.value, companyOther: true })
                        }
                        placeholder="Type the company name…"
                        className="pr-28"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({ ...editing, company: "", companyOther: false })
                        }
                        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md border border-border-light bg-white px-2 py-1.5 text-[11px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                      >
                        Pick from list
                      </button>
                    </div>
                  );
                return (
                  <ColorSelect
                    value={editing.company}
                    ariaLabel="Company"
                    className="w-full"
                    collapsible={false}
                    fill
                    onChange={(v) =>
                      setEditing({ ...editing, company: v, companyOther: false })
                    }
                    createLabel="Add a company not on the list"
                    onCreate={(query) =>
                      setEditing({ ...editing, company: query, companyOther: true })
                    }
                    options={[
                      { value: "", label: "Choose a company", noMark: true },
                      ...customers.map((c) => ({
                        value: c.name,
                        label: c.name,
                        logoName: c.name,
                        href: `/customers/${c.id}`,
                      })),
                    ]}
                  />
                );
              })()}
            </Field>
            <Field label="Job title">
              {/* EVERY EMPTY BOX SAYS WHAT GOES IN IT (Anir, Aug 26: "I need
                  placeholders on all of em tbh"). A blank field with only a
                  label above it makes you guess the format. */}
              <Input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="Head of Regulatory Affairs"
              />
            </Field>
            <Field label="Country">
              {/* "Countries should just be like a flag" (Anir, Aug 26). The
                  flag rides in the option label, so the trigger shows it too. */}
              <ColorSelect
                value={editing.country}
                ariaLabel="Country"
                className="w-full"
                collapsible={false}
                fill
                onChange={(v) => {
                  const hit = dialOptions().find((d) => d.label.endsWith(v));
                  const parsed = splitPhone(editing.phone);
                  const dial = editing.dialCode || parsed.dial;
                  /* With no number entered, follow the selected country instead of
                     retaining the initial default. Preserve existing numbers. */
                  const nextDial = parsed.number
                    ? dial
                    : dialCodeFromOption(hit?.value ?? "") || dial;
                  setEditing({
                    ...editing,
                    country: v,
                    dialCode: nextDial,
                    phone: joinPhone(nextDial, parsed.number),
                  });
                }}
                options={[
                  { value: "", label: "Pick a country", color: "#C7CDD6" },
                  ...countryOptions(),
                ]}
              />
            </Field>
            {/* NEITHER OF THESE IS REQUIRED ON ITS OWN, so neither wears the
                star. The rule the form actually enforces is "an email OR a
                phone" — filling just one enables Add lead — but both fields
                carried the same asterisk Person and Company do, which in this
                app means mandatory. Somebody holding only a phone number reads
                "Email *" and either gives up or invents an address. The hint
                now sits on both, and the button still says what is missing
                until one of them is filled. */}
            <Field label="Email" hint="Email or phone — at least one way to reach them.">
              <Input
                type="email"
                value={editing.email}
                maxLength={200}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                placeholder="name@company.com"
              />
            </Field>
            <Field label="Phone" hint="Email or phone — at least one way to reach them.">
              {/* A dialling code beside the number, not one free-text box
                  (Anir, Aug 26: "For phone, it's obviously gonna be different,
                  like countries and stuff"). Stored as one string, so nothing
                  downstream has to know it was entered in two parts. */}
              {(() => {
                const parsed = splitPhone(editing.phone);
                const dial = editing.dialCode || parsed.dial;
                const number = parsed.number;
                return (
                  <div className="flex items-center gap-1.5">
                    <ColorSelect
                      value={dialOptionValue(dial, editing.country)}
                      ariaLabel="Country dialling code"
                      collapsible={false}
                      minWidth={104}
                      triggerLabel={dialTriggerLabel(dial, editing.country)}
                      onChange={(v) => {
                        const nextDial = dialCodeFromOption(v);
                        const nextCountry = countryFromDialOption(v);
                        setEditing({
                          ...editing,
                          dialCode: nextDial,
                          country: nextCountry?.name ?? editing.country,
                          phone: joinPhone(nextDial, number),
                        });
                      }}
                      options={dialOptions()}
                    />
                    <Input
                      value={formatPhoneNumber(number)}
                      inputMode="tel"
                      onChange={(e) => {
                        /* SPACES AS YOU TYPE, AND A CEILING (Anir, Sep 4:
                           "show the spaces and also i cant just type in
                           anything"). The box keeps only digits, groups them
                           for reading, and stops accepting once E.164's
                           fifteen are used up — refusing the keystroke is
                           kinder than letting somebody fill the box and then
                           telling them it is wrong. */
                        const digits = phoneDigits(e.target.value).slice(
                          0,
                          nationalDigitBudget(dial)
                        );
                        setEditing({
                          ...editing,
                          dialCode: dial,
                          phone: joinPhone(dial, digits),
                        });
                      }}
                      placeholder={PHONE_EXAMPLE_BY_DIAL[dial] ?? "Phone number"}
                      aria-label="Phone number"
                    />
                  </div>
                );
              })()}
              {(() => {
                const parsed = splitPhone(editing.phone);
                const why = phoneProblem(editing.dialCode || parsed.dial, parsed.number);
                return why ? (
                  <p className="mt-1 text-[12px] text-error">{why}</p>
                ) : null;
              })()}
            </Field>
            <div className="sm:col-span-2">
              <Field label="LinkedIn profile" hint="Add a personal profile URL. Available public profile facts are saved on this lead for AI answers; lookup may be incomplete.">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"><LinkedInIcon size={18} /></span>
                  <Input
                    type="url"
                    value={editing.linkedinUrl}
                    maxLength={300}
                    onChange={(e) => setEditing({ ...editing, linkedinUrl: e.target.value })}
                    placeholder="https://www.linkedin.com/in/name"
                    className="pl-10"
                  />
                </div>
              </Field>
            </div>
            <Field label="Source">
              <ColorSelect
                value={editing.source}
                ariaLabel="Lead source"
                className="w-full"
                collapsible={false}
                dense
                onChange={(v) => setEditing({ ...editing, source: v })}
                options={LEAD_SOURCES.map((s) => ({
                  value: s,
                  label: s,
                  color: leadSourceColor(s),
                  icon: leadSourceIcon(s),
                }))}
              />
            </Field>
            <Field label="Status">
              <ColorSelect
                value={editing.status}
                ariaLabel="Lead status"
                className="w-full"
                collapsible={false}
                dense
                onChange={(v) => setEditing({ ...editing, status: v })}
                options={LEAD_STATUSES.map((s) => ({
                  value: s,
                  label: s,
                  color: leadStatusColor(s),
                  icon: leadStatusIcon(s),
                }))}
              />
            </Field>
            <Field label="Owner">
              <ColorSelect
                value={editing.owner}
                ariaLabel="Lead owner"
                className="w-full"
                collapsible={false}
                dense
                onChange={(v) => setEditing({ ...editing, owner: v })}
                fill
                options={[
                  { value: "", label: "Unassigned", color: "#8E98A8" },
                  /* The person's own face, not a blue dot for everybody
                     (Anir, Aug 26: "Owner: you're not even showing the
                     profile pictures"). */
                  ...members.map((m) => ({ value: m, label: m, avatarName: m })),
                ]}
              />
            </Field>
            <div className="col-span-2">
              <Field label="What they asked about">
                <Textarea
                  rows={2}
                  value={editing.interest}
                  maxLength={500}
                  onChange={(e) =>
                    setEditing({ ...editing, interest: e.target.value })
                  }
                  placeholder="Asked for a Freya.Label demo through the website"
                />
              </Field>
            </div>
            {editing.status === "Disqualified" && (
              <div className="col-span-2">
                <Field label="Why it was dropped">
                  <Input
                    value={editing.disqualifiedReason}
                    onChange={(e) =>
                      setEditing({ ...editing, disqualifiedReason: e.target.value })
                    }
                    placeholder="No budget this financial year"
                  />
                </Field>
              </div>
            )}
          </div>
          {/* THE BUTTON WAITS AND SAYS WHY (Anir, Sep 4: "don't make it like u
              can press the button and then it throws error. just dont let them
              click in the first place and give reason").
              Add lead was live on an empty form and save() answered with a
              toast for each missing field in turn, so finding out what a lead
              needs took four presses. Same four conditions save() enforces —
              it stays as the backstop — named one at a time. Validation belongs
              inside the action row, immediately before Cancel, so the footer
              reads as one right-aligned decision instead of a loose message
              floating above the controls (Anir, Sep 14). */}
          <div className="mt-4 flex min-h-9 items-center justify-end gap-2">
            <p
              aria-live="polite"
              className="min-w-0 max-w-[560px] text-right text-[12.5px] font-semibold leading-4 text-[color:var(--ink-orange)]"
            >
              {leadProblem}
            </p>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="shrink-0 rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !!leadProblem}
              title={leadProblem ?? undefined}
              onClick={save}
              className="shrink-0 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {editing.id ? "Save changes" : "Add lead"}
            </button>
          </div>
        </Modal>
        );
      })()}

      <ConfirmDialog
        open={!!confirmDelete}
        person={confirmDelete?.name || null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          await post({ op: "delete", id: confirmDelete.id }, "Lead deleted.");
          setConfirmDelete(null);
        }}
        title="Delete this lead?"
        body={
          confirmDelete
            ? `${confirmDelete.name || confirmDelete.company} (${confirmDelete.ref}) goes for good. If they simply went quiet, set the status to Disqualified instead so the history stays.`
            : ""
        }
        confirmLabel="Delete lead"
      />
    </div>
  );
}

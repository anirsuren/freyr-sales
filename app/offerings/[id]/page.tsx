import type { CSSProperties } from "react";
import Link from "next/link";
import { SmartBack } from "@/components/ui/BackButton";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Plus,
  ChevronRight,
  Layers,
  Package,
  Building2,
  Globe,
  type LucideIcon,
  CalendarClock,
  Info,
} from "lucide-react";
import { SIZE_TIER_META } from "@/components/ui/Badge";
import { AvailabilityPill } from "@/components/ui/AvailabilityPill";
import { SectionCard } from "@/components/ui/SectionCard";
import { CreatedStamp } from "@/components/ui/CreatedStamp";
import { Tooltip } from "@/components/ui/Tooltip";
import { Avatar } from "@/components/ui/Avatar";
import { RecordView } from "@/components/RecordView";
import {
  OfferingOverviewMain,
  SectionHeading,
} from "@/components/offerings/OfferingOverviewMain";
import { OfferingActions } from "@/components/offerings/OfferingActions";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { canEditOffering } from "@/lib/offeringOwnership";
import {
  listAssignablePeople,
  redactUnverifiedOfferingPeople,
} from "@/lib/assignablePeople";
import { canManageOfferings, getRole, isAdmin } from "@/lib/role";
import { moduleWriteRefusal } from "@/lib/moduleAccessServer";
import {
  customerFamiliesPresent,
  customerFamilyColor,
} from "@/lib/customerFamilies";
import { getCurrentUser } from "@/lib/currentUser";
import { OfferingOwners } from "@/components/offerings/OfferingOwners";
import { OfferingMaterialsTab } from "@/components/offerings/OfferingMaterialsTab";
import { OfferingReports } from "@/components/offerings/OfferingReports";
import { ConnectedComponents } from "@/components/offerings/ConnectedComponents";
import { OfferingCompetition } from "@/components/offerings/OfferingCompetition";
import { readCompetition } from "@/lib/offeringCompetition";
import { readMarketIntelTracking } from "@/lib/marketIntelTracking";
import { readMarketIntelFeed } from "@/lib/marketIntelFeed";
import { OfferingAgentButton } from "@/components/offerings/OfferingAgentButton";
import { getDataMode } from "@/lib/dataMode";
import { isOfferingsOnly } from "@/lib/release";
import { getDb } from "@/lib/db";
import { formatMoney } from "@/lib/pipeline";
import { REVENUE_TYPE_META } from "@/lib/revenue";
import { reportForOffering } from "@/lib/revenue";
import { cn } from "@/lib/utils";
import {
  getOffering,
  hydrateOffering,
  listFdlComponents,
  listOfferings,
  listOfferingTypes,
  type FdlComponent,
} from "@/lib/offerings";
import { FILTER_PALETTE } from "@/components/offerings/filterPalette";
import { canViewNextCustomerVersion } from "@/lib/roadmapAccess";
import { redactAgentOnlyMaterials } from "@/lib/materialAccess";
import { OfferingOpportunities } from "@/components/offerings/OfferingOpportunities";
import { readOpportunities } from "@/lib/opportunities";
import type { Opportunity as OpportunityRecord } from "@/lib/opportunitiesShared";
import {
  OfferingCustomers,
  type OfferingCustomerRow,
} from "@/components/offerings/OfferingCustomers";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const o = getOffering((await params).id);
  return { title: o ? `${o.offering_name} · Offerings` : "Offering" };
}


export default async function OfferingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string; edit?: string }>;
}) {
  const query = await searchParams;
  const raw = getOffering((await params).id);
  if (!raw) notFound();
  const people = await listAssignablePeople();
  const hydrated = hydrateOffering(
    redactUnverifiedOfferingPeople(raw, people)
  );
  const me = await getCurrentUser();
  /**
   * BOTH GATES THE API ASKS, IN THE API'S ORDER.
   *
   * This was canEditOffering alone, which asks only "are you an owner of this
   * offering". PATCH /api/offerings/[id] asks the privilege table FIRST, and
   * Suren's map gives BD Owner *view* on Offerings — so Priyanka, an assigned
   * owner of Freya.Label and a BD Owner, was shown the full upload UI, watched
   * three files reach 100%, and had the save refused (Saras, Aug 31: "the file
   * upload bar reaches 100% but none of the new files show up").
   *
   * The upload genuinely succeeds; it is the step that attaches the file to
   * the offering that is refused, so the file lands in storage with nothing
   * pointing at it. Asking the same question the server asks means the control
   * is only ever on screen when the save will land.
   */
  const admin =
    !(await moduleWriteRefusal("/offerings")) && (await canEditOffering(raw));
  // Agent-only rows must never be serialized into a non-owner's client tree.
  // Filtering only inside MaterialsSection would hide pixels while leaving the
  // full metadata in the RSC payload.
  const o = redactAgentOnlyMaterials(hydrated, me.memberId, me.role === "admin");

  /**
   * REPORTS IS BACK, MOCK ONLY. The Aug 4 offering-page rebuild rebuilt the
   * tab bar to the pilot's three tabs and silently dropped the Reports tab
   * Suren asked for ("I need a reports tab in offering") — nobody noticed
   * until Anir did (Aug 8: "where did the report section go?"). It returns
   * under the Aug 7 ruling that commercial views live in Mock; Real mode
   * neither shows the chip nor honours the URL.
   */
  const showReports = getDataMode() !== "live";
  /* SALES REPS DON'T SEE THE CUSTOMERS TAB — FOR NOW (Suren via Anir,
   * Aug 13: "anyone with the Sales Rep access should currently NOT be able
   * to see the 'Customers' tab within an Offering Page", so reps aren't
   * confused by the thin beta customer list). Managers and admins keep it.
   * Deliberately temporary: delete this flag to give it back to everyone. */
  const showOfferingCustomers = me.role !== "bd_member";
  // The package's contents: FDL components connected by id.
  const allComponents = listFdlComponents();
  const connectedComponents = (o.component_ids ?? [])
    .map((id) => allComponents.find((c) => c.id === id))
    .filter((c): c is FdlComponent => !!c);
  const tab =
    query?.tab === "reports" && showReports
      ? "reports"
      : query?.tab === "materials"
        ? "materials"
        : (query?.tab === "opportunities" || query?.tab === "customers") &&
            showOfferingCustomers
          ? "opportunities"
          : query?.tab === "competition"
            ? "competition"
          : query?.tab === "components" ||
              query?.tab === "roadmap" ||
              query?.tab === "releases"
            ? "components"
            : "overview";
  const allCustomers = await getDb().customers.list();

  // Competition intel for this offering + the tracked competitors from
  // Market Intel as quick picks in the add flow.
  const competitionRows = await readCompetition(o.id).catch(() => []);
  const competitorSuggestions =
    getDataMode() === "live"
      ? (await readMarketIntelTracking().catch(() => ({ companies: [], people: [] }))).companies
          .filter((c) => c.group === "competitor")
          .map((c) => ({ id: c.id, name: c.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
  // Real LinkedIn page logos for competitors linked to Market Intel, so the
  // competition views show the actual company mark, not generated initials.
  const competitionLogos: Record<string, string> = {};
  if (getDataMode() === "live") {
    const feed = await readMarketIntelFeed().catch(() => null);
    for (const c of Object.values(feed?.companies ?? {})) {
      if (c.author?.logoUrl) competitionLogos[c.id] = c.author.logoUrl;
    }
  }

  // WHO IS ON THIS OFFERING (Suren, Aug 9: "in the offering angle, I want to
  // also know all the customers of this offering"). An account counts if the
  // offering is recorded in use OR it has any activity logged against it, so
  // a Lead shows up here before anything is signed. "Which release is going
  // on" is per component, read off the same digital_components record the
  // customer page and the component page both write.
  const componentNames = new Map(allComponents.map((c) => [c.id, c.name]));
  const offeringComponentIds = new Set(o.component_ids ?? []);
  const offeringCustomers: OfferingCustomerRow[] = allCustomers
    .map((customer) => {
      const usage = (customer.offering_usage || []).find(
        (u) => u.offering_id === raw.id
      );
      const inUse = (customer.offerings_in_use || []).includes(raw.id);
      const engagements = usage?.engagement_versions || [];
      if (!inUse && engagements.length === 0) return null;
      const versions = (customer.digital_components || [])
        .filter((link) => offeringComponentIds.has(link.component_id))
        .map((link) => {
          const component = allComponents.find((c) => c.id === link.component_id);
          const release = component?.releases.find((r) => r.id === link.release_id);
          return {
            component: componentNames.get(link.component_id) || "Component",
            version: release?.version ?? null,
          };
        });
      return {
        id: customer.id,
        name: customer.company_name,
        current: engagements.find((v) => v.linked) || null,
        versions,
      };
    })
    .filter((row): row is OfferingCustomerRow => row !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  /**
   * THE DEALS ON THIS OFFERING (Suren, Aug 25: "as an offering owner I want to
   * see all the opportunities in my offering that I am working against — I
   * don't have to go to the opportunities module to see them").
   *
   * An opportunity carries its offering in two places: `offeringIds` on the
   * deal, and `offeringId` on its single offering row. Both are read, because
   * an imported row and a hand-made one do not always fill the same one.
   * Grouped by customer so an account's deals sit together, then by value.
   */
  const offeringOpportunities = showOfferingCustomers
    ? (
        await readOpportunities().catch(() => ({
          opportunities: [] as OpportunityRecord[],
        }))
      ).opportunities
        .filter((deal: OpportunityRecord) => {
          if ((deal.offeringIds ?? []).includes(raw.id)) return true;
          return (deal.lines ?? []).some((l) => l.offeringId === raw.id);
        })
        .map((deal: OpportunityRecord) => {
          /* When the deal has a row for THIS offering, that row's own numbers
             are the truthful ones — a multi-row legacy deal's top-line value
             covers offerings this page is not about. */
          const line = (deal.lines ?? []).find((l) => l.offeringId === raw.id);
          return {
            id: deal.id,
            name: deal.name,
            customer: deal.customer,
            customerId: deal.customerId,
            level: deal.level,
            status: line?.status ?? deal.status,
            value: line?.value ?? deal.value ?? 0,
            confidence: line?.confidence ?? deal.confidence,
            estSignDate: line?.estSignDate ?? deal.estSignDate,
            owner: deal.owner,
          };
        })
        .sort(
          (a: { customer: string; value: number }, b: { customer: string; value: number }) =>
            a.customer.localeCompare(b.customer) || (b.value || 0) - (a.value || 0)
        )
    : [];

  // Contract lines for this offering, nearest expiry first — the rail's
  // second card.
  const nowMs = Date.now();
  const renewalWatch = allCustomers
    .flatMap((customer) =>
      (customer.offering_usage || [])
        .filter((usage) => usage.offering_id === raw.id)
        .flatMap((usage) => usage.revenue_lines || [])
        .filter((line) => !!line.end_date)
        .map((line) => {
          const ends = Date.parse(line.end_date as string);
          const days = Math.ceil((ends - nowMs) / 86_400_000);
          const tone =
            days < 0
              ? { color: "#B02020", bg: "rgba(176,32,32,0.10)" }
              : days <= 90
                ? // Caution reads in orange-700, never the yellow band, this
                  // status renders as TEXT and amber failed on white.
                  { color: "#C2410C", bg: "rgba(194,65,12,0.12)" }
                : { color: "#1A7A35", bg: "rgba(26,122,53,0.10)" };
          // How much of the contract's OWN term is left. When a line carries
          // no start date the term is unknown, so it falls back to a 12-month
          // assumption rather than inventing a specific one — same rule the
          // Reports tab's renewal list already uses, so the two never disagree.
          const startMs = line.start_date
            ? Date.parse(line.start_date)
            : ends - 365 * 86_400_000;
          const runway =
            ends <= nowMs
              ? 0
              : Math.max(0.04, Math.min(1, (ends - nowMs) / Math.max(ends - startMs, 1)));
          return {
            id: line.id,
            customer: customer.company_name,
            customerId: customer.id,
            runway,
            days,
            label: line.description || REVENUE_TYPE_META[line.revenue_type].short,
            when: new Date(ends).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            status: days < 0 ? "Expired" : days <= 90 ? `${days}d left` : "Active",
            sortKey: ends,
            tone,
          };
        })
    )
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(0, 5);
  const report = reportForOffering(allCustomers, o.id);
  const customerPickList = allCustomers.map((c) => ({
    id: c.id,
    name: c.company_name,
  }));

  /**
   * SIBLINGS OF THE SAME CATEGORY, NOT THE SAME TYPE (Suren, Aug 13, with Anir:
   * "instead show only those offerings which are a part of the offering
   * category… Freya.Register comes under Regulatory Information Management, it
   * has 3 other offerings inside it, so let's just show only those 3").
   *
   * This matched on offering_type, which is the commercial packaging — "Freya
   * Fusion (Module)" — so opening Freya.Register offered eight things drawn
   * from four unrelated categories: labelling, submissions, intelligence. It
   * looked arbitrary because, as a suggestion for the same account, it was.
   * The category is what actually says "these solve neighbouring problems".
   */
  /* Category is the default; the editor's deltas adjust it (Saras, Aug 27:
     the related section is editable). Pins may come from any category. */
  const relatedHide = new Set(raw.related_hide ?? []);
  const relatedPins = raw.related_add ?? [];
  const everyOffering = listOfferings();
  const relatedBase = raw.offering_category
    ? everyOffering.filter(
        (x) =>
          x.id !== raw.id &&
          x.offering_category === raw.offering_category &&
          !relatedHide.has(x.id)
      )
    : [];
  const pinned = relatedPins
    .map((pinId) => everyOffering.find((x) => x.id === pinId))
    .filter((x): x is NonNullable<typeof x> => Boolean(x && x.id !== raw.id))
    .filter((x) => !relatedBase.some((b) => b.id === x.id));
  const related = [...relatedBase, ...pinned]
    .map((x) => redactUnverifiedOfferingPeople(x, people))
    .map((x) => redactAgentOnlyMaterials(x, me.memberId, me.role === "admin"));

  const isMapped =
    o.customerTypes.length > 0 || o.markets.length > 0 || o.materials.length > 0;
  // Editing this offering's content is open to workspace admins/editors AND to
  // the person who OWNS it, so an offering owner can upload their own sales
  // materials without waiting for an admin grant (Anir, Jul 28: "make sure that
  // someone can edit the content of the Freyr.Register offering page to upload
  // his sales materials, etc., if he owns that offering"). Owning one offering
  // never grants rights over any other.
  // Real accounts, so assigning a contact assigns a PERSON, not a typed name.
  // Assigning and approving owners is an admin action; editing content is
  // open to the owners they grant.
  const workspaceAdmin = await canManageOfferings();
  const canSeeNextCustomerVersion = await canViewNextCustomerVersion(o);
  const role = await getRole();
  const dataMode = getDataMode();
  const commercialActionsEnabled = !isOfferingsOnly(dataMode);

  // A POC name copied from the catalogue is useful sample/catalogue context,
  // but it is not proof that the person has a workspace account. In live mode
  // this card must show accounts, not plausible-looking names. Keep a contact

  // Each market + size band reads as its own color so they scan at a glance
  // (Anir: "USA, Europe, Japan, China, Korea each a different color; same for
  // small, mid, large"). Keyed loosely so labels like "United States" match.
  const marketStyle = (name: string): { bg: string; color: string } => {
    const n = name.toLowerCase();
    if (n.includes("usa") || n.includes("united states") || n.includes("us"))
      return { bg: "rgba(0,113,227,0.10)", color: "#0071E3" };
    if (n.includes("europe") || n.includes("eu"))
      return { bg: "rgba(94,92,230,0.12)", color: "#5E5CE6" };
    if (n.includes("japan")) return { bg: "rgba(219,39,119,0.10)", color: "#C81E67" };
    if (n.includes("china")) return { bg: "rgba(255,59,48,0.10)", color: "#C0362C" };
    if (n.includes("korea")) return { bg: "rgba(15,158,142,0.12)", color: "#0F9E8E" };
    return { bg: "rgba(142,152,168,0.14)", color: "#5B6472" };
  };
  // Country flag per market (Suren: "put some flags here").
  const marketFlag = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes("usa") || n.includes("united states") || n === "us") return "🇺🇸";
    if (n.includes("europe") || n.includes("eu")) return "🇪🇺";
    if (n.includes("japan")) return "🇯🇵";
    if (n.includes("china")) return "🇨🇳";
    if (n.includes("korea")) return "🇰🇷";
    if (n.includes("canada")) return "🇨🇦";
    if (n.includes("united kingdom") || n.includes("uk") || n.includes("britain")) return "🇬🇧";
    if (n.includes("india")) return "🇮🇳";
    if (n.includes("brazil")) return "🇧🇷";
    if (n.includes("australia")) return "🇦🇺";
    if (n.includes("switzerland")) return "🇨🇭";
    if (n.includes("germany")) return "🇩🇪";
    return "🌐";
  };
  // Two colour dimensions on Target segments (Suren): the FAMILY and the SIZE —
  // distinct hues so they never clash when shown together. Family colours come
  // from the shared map the editor and the master list already use; the local
  // copy knew only three families and painted every other one gray, which is a
  // colour identity is never allowed to be.
  const familyStyle = customerFamilyColor;
  // One size system app-wide (SizeBadge's). The old local palette painted
  // small in sky and mid in cyan — two blues nobody can tell apart (Anir:
  // "small and mid-sized, literally the same color").
  const sizeStyle = (size: string): { bg: string; color: string; icon: LucideIcon } => {
    const s = size.toLowerCase();
    if (s.includes("small")) return SIZE_TIER_META.small;
    if (s.includes("large")) return SIZE_TIER_META.large;
    return SIZE_TIER_META.mid;
  };

  return (
    <div>
      <RecordView
        type="Offering"
        label={o.offering_name}
        sublabel={o.offering_type || ""}
        href={`/offerings/${o.id}`}
      />
      {/* The page had no entrance at all — clicking an offering swapped one
          static screen for another (Suren: "even when I just click on an
          offering, there's no transition"). The identity block + tab bar lift
          in with the app's shared `rise-in`; the panel below carries
          `tab-panel`, so it also replays on every Overview↔Reports switch.
          Existing classes only, the reduced-motion guards in globals.css
          already cover both. */}
      <SmartBack
        fallback="/offerings"
        className="rise-in inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All offerings
      </SmartBack>

      {/* Header: identity on the left, primary actions on the right */}
      <div className="rise-in flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
        <div className="min-w-0">
          {/* NO GLYPH BESIDE THE NAME (Anir, Sep 2: "can you just remove
              these icons from all the offering names? They're not really
              needed"). The gradient tile used to sit here, which is why the
              heading was a flex row with a gap. The name is the heading now,
              so it is a plain block again. */}
          <h1 className="min-w-0 text-[30px] font-semibold tracking-[-0.02em] text-text-primary leading-tight">
            {o.offering_name}
          </h1>
          {/* THE DATE ONLY WHEN SOMEBODY IS NAMED (Anir, Aug 25: "this new
              thing pops up, the date the offering was added on — can we get
              this removed? This isn't really needed. It comes up under all the
              offerings").

              He asked for who-and-when on Aug 23, and every offering predates
              the field, so the line printed a bare seeded timestamp under every
              title — provenance with the provenance missing. It appears again
              the moment an offering is created by a real person, which is what
              he actually asked for. */}
          {/* WHO ADDED IT, ON HOVER, NOT ON THE PAGE.
              Anir, Sep 2: "whenever a new offering is added it gives this
              tagline, can this be removed? It's not really needed, so it's
              added by who, on which date, at what time. None of this is
              needed, just the offering name... or hide it somewhere so when I
              hover over, it'll show up."

              It is a provenance fact, not a headline: useful once, when
              somebody asks who put this here, and noise on every other visit.
              It sat on its own line under the title of every offering.

              Kept, not deleted, because "who added this" is exactly the
              question that comes up about a catalogue entry nobody recognises.
              It now rides on a small mark beside the name and says itself on
              hover. Not a question mark: he was explicit that a question mark
              is the wrong glyph, and a question mark means "what is this
              feature" everywhere else in this app. */}
          {o.created_by ? (
            <Tooltip
              label={`Added by ${o.created_by}${
                o.created_at
                  ? ` on ${new Date(o.created_at).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}`
                  : ""
              }`}
            >
              <span className="ml-2 inline-flex h-5 w-5 cursor-default items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface hover:text-text-secondary">
                <Info size={13} strokeWidth={2.1} aria-hidden="true" />
                <span className="sr-only">
                  Added by {o.created_by}
                  {o.created_at
                    ? ` on ${new Date(o.created_at).toLocaleDateString()}`
                    : ""}
                </span>
              </span>
            </Tooltip>
          ) : null}
        </div>

        {/* All actions on one line (Anir: single line to save space) —
            OfferingActions keeps its two + the admin buttons as `extra`. */}
        <div className="shrink-0">
          <OfferingActions
            offeringId={o.id}
            offeringName={o.offering_name}
            customers={customerPickList}
            commercialActionsEnabled={commercialActionsEnabled}
            extra={
              <>
                {/* Stay on the offering and open the shared assistant with
                    explicit offering context. No invisible ambient memory and
                    no automatic LLM call just for opening the panel. */}
                <OfferingAgentButton
                  offeringId={o.id}
                  offeringName={o.offering_name}
                />
                {/* Duplicate is gone (Suren, Jul 27: "the duplicate button is
                    useless"). Editing is the only admin action left up here. */}
                {admin ? (
                  /* Icon only: a fourth worded button made the row read as a
                     wall (Anir, Aug 8). Editing is an admin's occasional
                     action, not the headline one. */
                  <Link
                    href={`/offerings/${o.id}/edit`}
                    title="Edit this offering"
                    /* SAYS EDIT, AND WEARS THE APP'S BLUE (Anir, Sep 2: "blue
                       with white for edit button, and say Edit properly").
                       It was a bare outlined pencil, which asked the reader to
                       know what a pencil does next to a gradient button that
                       spells out what IT does. */
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-blue-primary px-3.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    <Pencil size={15} strokeWidth={2.1} />
                    Edit
                  </Link>
                ) : null}
              </>
            }
          />
        </div>
      </div>
      {/* The tags own their own line. Sharing the row with the four
          actions left roughly 400px, so "Available now" kept falling to
          a row by itself (Anir, Aug 8). Full width, one line. */}
      <div className="rise-in flex flex-wrap items-center gap-2 mt-3">
          {o.offering_category && (
            <Link
              href={`/offerings?cat=${o.offeringCategory?.id ?? ""}`}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-primary bg-blue-light rounded-full px-2.5 py-1 hover:bg-blue-subtle/60 transition-colors"
            >
              <Layers size={12} strokeWidth={1.9} />
              {o.offering_category}
            </Link>
          )}
          {o.offering_type && (() => {
            const typeIndex = listOfferingTypes().findIndex(
              (t) => t.name === o.offering_type
            );
            const typeColor =
              typeIndex >= 0
                ? FILTER_PALETTE[(typeIndex + 3) % FILTER_PALETTE.length]
                : "#0071E3";
            return (
              <span
                className="semantic-color-pill inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-2.5 py-1"
                style={
                  {
                    "--semantic-color": typeColor,
                    "--semantic-bg": `${typeColor}14`,
                  } as CSSProperties
                }
              >
                {/* No leading dot. The pill is already the type's colour,
                    so the bullet restated the hue and nothing else (Anir,
                    Aug 7, on the same dots in the list view: "remove these
                    bullet points, they are not needed"). */}
                {o.offering_type}
              </span>
            );
          })()}
          <AvailabilityPill value={o.current_availability} />
          {!isMapped && (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-tertiary bg-surface border border-border-light rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full border border-text-tertiary" />
              Awaiting details
            </span>
          )}
        </div>

      {/* Reports remains implemented but hidden until real customer data makes
          the tab useful, per change-log item 28. */}
      <div
        role="tablist"
        aria-label="Offering sections"
        className="rise-in flex gap-8 border-b border-border-light mt-6"
      >
        {[
          { key: "overview", label: "Overview", href: `/offerings/${o.id}` },
          // SALES MATERIALS IS ITS OWN DESTINATION (Suren, Jul 30: "the heavy
          // traffic item, I don't want to be a scroll function… I have another
          // tab called sales materials").
          {
            key: "materials",
            // The count is always visible, zero included (Anir, Aug 8: "If
            // there's zero, then say zero") — an empty library should say so
            // before anyone clicks into it.
            label: `Sales Materials (${o.materials.length})`,
            href: `/offerings/${o.id}?tab=materials`,
          },
          // The roadmap left the offering: an offering is a package of FDL
          // components, and each component carries its own versions and
          // features (Suren via Anir, Aug 8: "take the roadmap off from
          // here… components will have features and roadmap, not the
          // offering").
          {
            key: "components",
            /* "FDL Components", not "Components" (Saras, Aug 21: "one or
               two reps got confused about what components means — can you
               just rename this to say FDL Components"). It is the name the
               sidebar and the components page already use; only this tab was
               still saying the ambiguous half of it. */
            label: `FDL Components (${(o.component_ids ?? []).length})`,
            href: `/offerings/${o.id}?tab=components`,
          },
          ...(showOfferingCustomers
            ? [
                {
                  key: "opportunities",
                  // Zero says zero, the same as Sales Materials and Components
                  // above (Anir, Aug 8: "If there's zero, then say zero").
                  // Hiding it made one tab bar use two conventions at once, so
                  // a new offering read "Sales Materials (0) · Components (0) ·
                  // Customers · Competition" (found Aug 14 walking the flows).
                  /* Suren, Aug 25: "instead of saying customers you should
                     say opportunities here… as an offering owner I want to see
                     all the opportunities in my offering." ?tab=customers still
                     resolves here so old links and bookmarks land right. */
                  label: `Opportunities (${offeringOpportunities.length})`,
                  href: `/offerings/${o.id}?tab=opportunities`,
                },
              ]
            : []),
          // COMPETITION (Suren, Aug 11): "for that particular product, list
          // the competitive companies and their product names" — the fifth tab.
          {
            key: "competition",
            // Zero says zero, same rule as every other tab in this bar.
            label: `Competition (${competitionRows.length})`,
            href: `/offerings/${o.id}?tab=competition`,
          },
          ...(showReports
            ? [
                {
                  key: "reports",
                  label:
                    report.customerCount > 0
                      ? `Reports (${report.customerCount})`
                      : "Reports",
                  href: `/offerings/${o.id}?tab=reports`,
                },
              ]
            : []),
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            role="tab"
            aria-selected={tab === t.key}
            className={cn(
              "pb-3 -mb-px border-b-2 text-[14px] transition-colors",
              tab === t.key
                ? "border-blue-primary text-blue-primary font-semibold"
                : "border-transparent text-text-secondary hover:text-text-primary font-medium"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Keyed on the active tab so React re-mounts the panel and the
          `tabPanelIn` keyframes replay on every switch, the tabs had no
          transition at all before. */}
      <div key={tab} className="tab-panel">
        {tab === "materials" ? (
          <OfferingMaterialsTab
            offering={o}
            admin={admin}
            /* Renaming a folder is admin-only (change log #38), narrower than
               `admin` above, which is "may edit this offering" and includes
               its owners. Passing canManageOfferings() here would show the
               pencil to managers and then 403 them at the API. */
            workspaceAdmin={await isAdmin()}
            preferenceOwnerId={me.memberId || me.id}
          />
        ) : tab === "opportunities" ? (
          <>
            <OfferingOpportunities
              rows={offeringOpportunities}
              offeringName={o.offering_name}
            />
            {/* The delivery half of the same question, kept rather than
                deleted: who is live on this offering and on which version
                (Suren, Aug 9: "for all the customers, along with which release
                is going on"). Deals lead because that is what the offering
                owner opens the tab for. */}
            <OfferingCustomers
              rows={offeringCustomers}
              offeringName={o.offering_name}
            />
          </>
        ) : tab === "competition" ? (
          <OfferingCompetition
            offeringId={o.id}
            offeringName={o.offering_name}
            initialRows={competitionRows}
            suggestions={competitorSuggestions}
            logos={competitionLogos}
            live={getDataMode() === "live"}
          />
        ) : tab === "reports" ? (
          <OfferingReports report={report} offeringName={o.offering_name} />
        ) : tab === "components" ? (
          <ConnectedComponents
            offeringId={o.id}
            connected={connectedComponents}
            all={allComponents}
            versions={o.component_versions ?? {}}
            canEdit={admin}
          />
        ) : (
        /* 75/25, NOT 1fr + A FIXED RAIL (Anir, Aug 25: "make this side of the
           page a bit smaller so that this side can be bigger... the majority of
           the main data is on this side, this is just supplementary data, so we
           don't need to give it that much space. 75-25 of these two"). A fixed
           340px rail took a third of a 1100px content column and grew
           proportionally worse the narrower the window. */
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-6 mt-6 items-start">
          {/* ---------------------------------------------------- MAIN column */}
          <OfferingOverviewMain
            offering={o}
            report={report}
            related={related}
            admin={admin}
            canSeeNextVersion={canSeeNextCustomerVersion}
            realMode={dataMode === "live"}
            /* WHO IT IS FOR AND WHERE IT SELLS ARE MAIN-COLUMN FACTS (Saras,
               Aug 21: "for any offering, can we move the target segments and
               also the markets on this side of the page — the main side of the
               page, above related offerings"). In a 340px rail the families
               wrapped to a column of stubs; in the main column they get the
               width they were always drawn for. */
            beforeRelated={
              <>
            {/* WHO IT IS FOR AND WHERE IT SELLS, SIDE BY SIDE, IN THE PAGE'S
                OWN SECTION SHAPE (Saras, Aug 24: "can we keep the target
                segment section and the market section the same format as these
                sections — the headings — and have everything uniform? They're
                currently in boxes, the ones above them are not, so just
                standardise that. Can we put them side by side? ... there's a
                lot of white space here, so cut this in half and put the
                markets here").

                They were the last two SectionCards on a page where every other
                block is a bordered-bottom <section> with an icon heading, so
                they read as a different page stapled onto the end of this one.
                Markets is a short chip list that was spending a full-width row
                on four flags; paired with the segments it fills the gap the
                segments column leaves. */}
            <section className="py-7 border-b border-border-light">
              <div className="grid gap-8 lg:grid-cols-2">
                <div>
                  <SectionHeading
                    icon={Building2}
                    /* Anir, Sep 2: "from Target Segments to Target Customer
                       Types". His words for the thing, so his words on the
                       heading. */
                    title="Target Customer Types"
                    description="The kinds of company this is sold to, and at what size."
                  />
                  <div className="mt-5 pl-11">
                    {o.customerTypes.length === 0 ? (
                      admin ? (
                        <Link
                          href={`/offerings/${o.id}/edit`}
                          className="inline-flex items-center gap-1 text-[13px] text-blue-primary hover:underline"
                        >
                          <Plus size={13} strokeWidth={2} /> Add customer types
                        </Link>
                      ) : (
                        <p className="text-[13px] text-text-tertiary">Not specified yet</p>
                      )
                    ) : (
                      <div className="space-y-2.5">
                        {customerFamiliesPresent(o.customerTypes).map((fam) => {
                          const types = o.customerTypes.filter((c) => c.family === fam);
                          if (types.length === 0) return null; // hide families that don't apply
                          return (
                            /* THE FAMILY NAME IS BLACK AND THE EDGE IS PLAIN
                               (Anir, Aug 24: "let's also remove the font
                               colours of the segment headings, you can just
                               keep them black — these five segment headings...
                               even this box, you don't need to have this colour
                               bifurcation here, this is on the very left. You
                               can retain the colours of the sizes themselves:
                               Small can still be blue, Mid size green, Large
                               purple").

                               Two colour dimensions in one small block meant
                               the heading's hue and the chips' hues argued
                               about which one you were meant to read. The size
                               chips keep theirs because size is the fact being
                               compared; the family is only the label above
                               them. */
                            <div
                              key={fam}
                              className="rounded-xl border border-border-light bg-surface/30 p-3"
                            >
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-primary">
                                {fam}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {types.map((c) => (
                                  <Tooltip
                                    key={c.id}
                                    label={`${c.product_type} · Revenue ${c.revenue} · ${c.employees} employees · ${c.operational_focus}`}
                                    side="top"
                                    align="left"
                                  >
                                    <Link
                                      href={`/offerings?type=${c.id}`}
                                      style={{
                                        background: sizeStyle(c.size).bg,
                                        color: sizeStyle(c.size).color,
                                      }}
                                      /* SMALLER, SO THE THREE SIZES SIT ON ONE
                                         ROW (Anir, Aug 25: "can we reduce the
                                         font size of these boxes? If I'm at
                                         100% zoom they spill over. What I want
                                         is for these three to fit together in
                                         one row: small, mid-size and large").
                                         The segments column halved when the
                                         page went 75/25, so three chips at
                                         12px wrapped after two. */
                                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold transition-opacity hover:opacity-80"
                                    >
                                      {(() => {
                                        const TierIcon = sizeStyle(c.size).icon;
                                        return <TierIcon size={10} strokeWidth={2.3} aria-hidden="true" />;
                                      })()}
                                      {c.size}
                                    </Link>
                                  </Tooltip>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <SectionHeading
                    icon={Globe}
                    /* Anir, Sep 2: "from Markets it should say Applicable
                       Markets". */
                    title={`Applicable Markets (${o.markets.length})`}
                    description="The regions this offering is cleared to sell into."
                  />
                  <div className="mt-5 pl-11">
                    {o.markets.length === 0 ? (
                      admin ? (
                        <Link
                          href={`/offerings/${o.id}/edit`}
                          className="inline-flex items-center gap-1 text-[13px] text-blue-primary hover:underline"
                        >
                          <Plus size={13} strokeWidth={2} /> Add markets
                        </Link>
                      ) : (
                        <p className="text-[13px] text-text-tertiary">Not specified yet</p>
                      )
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {o.markets.map((m) => {
                          const st = marketStyle(m.name);
                          return (
                            <Link
                              key={m.id}
                              href={`/offerings?market=${m.id}`}
                              style={{ background: st.bg, color: st.color }}
                              className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-md px-2.5 py-1 transition-opacity hover:opacity-80"
                            >
                              <span aria-hidden="true" className="text-[13px] leading-none">{marketFlag(m.name)}</span>
                              {m.name}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
              </>
            }
          />
          {/* ---------------------------------------------------- SIDE rail */}
          {/* `stagger` — the rail's cards lift in one after another, the same
              entrance the dashboard's lists use. */}
          <div className="space-y-5 stagger">
            {/* NO SECOND CHAT HERE. Suren asked for context-aware chat on the
                offering (Jul 30: "the context is already set that the question
                is related to Register") — but the always-on dock bottom-right
                already does exactly that: it reads the page's H1 as the subject
                and sends the whole offering page as context. He simply had not
                noticed it was there. A panel in the rail was the same feature
                twice (Anir, Jul 30: "he did not know that there was literally a
                chatbot at the very bottom right... so we don't need that").

                The cards below stay collapsed regardless — he asked for that on
                its own merits. */}

            {/* Internal owner — only when a real person is on file */}
            {/* WHO CAN EDIT THIS. Real accounts, granted by an admin, not the
                contact name off the spreadsheet. */}
            <OfferingOwners
              offeringId={o.id}
              offeringName={o.offering_name}
              owners={o.owners ?? []}
              isAdmin={workspaceAdmin}
              people={people}
              myMemberId={me.memberId ?? null}
            />

            {/* Offering Category — its plain-English description + the family
                link. Titled in full ("Offering Category", not "Category") at
                Saras' request, item 7, the page carries several kinds of
                category and this one is the offering's own. */}
            {o.offeringCategory && (
              <SectionCard title="Offering Category" icon={Layers}>
                <p className="text-[13.5px] font-semibold text-text-primary">
                  {o.offeringCategory.name}
                </p>
                {o.offeringCategory.description && (
                  <p className="text-[13px] text-text-secondary leading-relaxed mt-1.5">
                    {o.offeringCategory.description}
                  </p>
                )}
                {o.offeringCategory.owner && (
                  <p className="inline-flex items-center gap-1.5 text-[12.5px] text-text-secondary mt-2.5">
                    <Avatar name={o.offeringCategory.owner} className="h-6 w-6 text-[8px]" />
                    Offering owner: {o.offeringCategory.owner}
                  </p>
                )}
                <Link
                  href={`/offerings?cat=${o.offeringCategory.id}`}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline mt-3"
                >
                  See all offerings in this category
                  <ChevronRight size={13} strokeWidth={2} />
                </Link>
              </SectionCard>
            )}

            {/* Offering Type — the twin of the box above it (Saras, item 8:
                the page named the type but never explained it). Same card,
                same type scale, same spacing, same link shape as Offering
                Category, two boxes doing the same job must not read as two
                different components. `Package` is the icon the offerings
                browser already uses for the offering-type filter.
                The description is Freyr's own copy from the offering-types
                master list: when a type carries none, the box shows the name
                and the link and stays silent rather than inventing one. */}
            {o.offeringType && (
              <SectionCard title="Offering Type" icon={Package}>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold"
                  style={{ color: "#6D28D9", background: "rgba(109,40,217,0.10)" }}
                >
                  <Package size={13} strokeWidth={2.2} />
                  {o.offeringType.name}
                </span>
                {o.offeringType.description && (
                  <p className="text-[13px] text-text-secondary leading-relaxed mt-1.5">
                    {o.offeringType.description}
                  </p>
                )}
                {/* `otype` is the offerings list's own offering-type filter
                    param (OfferingsBrowser reads it alongside `cat`), so this
                    lands on the list already filtered to this type. */}
                <Link
                  href={`/offerings?otype=${o.offeringType.id}`}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline mt-3"
                >
                  See all offerings in this offering type
                  <ChevronRight size={13} strokeWidth={2} />
                </Link>
              </SectionCard>
            )}


            {/* NOT FOR REPS (Saras, Aug 21: "let's remove this — we had
                removed the Customers tab for reps, but they're still able to
                see this, so this shouldn't be visible to them directly").
                Hiding the Customers page and then naming its accounts, with
                revenue, in a rail card was the same data through a side door.
                Managers and admins still see it. */}
            {report.customers.length > 0 && role !== "bd_member" && (
              <SectionCard
                title={`Current customers (${report.customers.length})`}
                icon={Building2}
              >
                <div className="space-y-2.5">
                  {report.customers.map((c) => (
                    <Link
                      key={c.id}
                      href={`/customers/${c.id}?tab=offerings`}
                      className="group flex items-center gap-2.5"
                    >
                      <CompanyLogo name={c.name} className="w-7 h-7 shrink-0 text-[10px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-medium leading-snug text-text-primary group-hover:text-blue-primary">
                          {c.name}
                        </span>
                        <span className="block text-[10.5px] text-text-tertiary">
                          {c.licenses ? `${c.licenses} seats · ` : ""}
                          {c.lines.length} {c.lines.length === 1 ? "line" : "lines"}
                        </span>
                      </span>
                      <span className="shrink-0 text-[12px] font-semibold text-text-primary tnum">
                        {formatMoney(c.revenue)}
                      </span>
                    </Link>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* The rail ran out of content halfway down the page while the
                left column kept going (Anir: "empty space on the bottom
                right… add some more shit"). Renewals are the most useful
                thing a seller can see here: what's expiring and when. */}
            {renewalWatch.length > 0 && (
              <SectionCard title="Renewal watch" icon={CalendarClock}>
                <div className="space-y-3">
                  {renewalWatch.map((item) => (
                    <Link
                      key={`${item.customerId}-${item.id}`}
                      href={`/customers/${item.customerId}?tab=offerings`}
                      className="group flex items-start gap-2.5 rounded-md -mx-1 px-1 py-1 transition-colors hover:bg-[var(--surface)]"
                    >
                      <CompanyLogo name={item.customer} className="mt-0.5 h-7 w-7 shrink-0 text-[10px]" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="min-w-0 text-[13px] font-medium leading-snug text-text-primary group-hover:text-blue-primary">
                            {item.customer}
                          </span>
                          <span
                            className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em]"
                            style={{ color: item.tone.color, background: item.tone.bg }}
                          >
                            {item.status}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[10.5px] leading-snug text-text-tertiary">
                          {item.label} · {item.when}
                        </span>
                        {/* Contract runway, drawn. A date alone makes you do the
                            arithmetic; the bar shows how much of the term is
                            left before anyone has to decide (Anir, Jul 28: "if
                            it says renewal watch, I want to see a progress
                            bar"). It carries the same colour as the status pill
                            above it, so the row is never two different warnings. */}
                        <span className="mt-1.5 flex items-center gap-2">
                          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border-light">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${Math.round(item.runway * 100)}%`,
                                background: item.tone.color,
                              }}
                            />
                          </span>
                          <span
                            className="shrink-0 text-[10px] font-semibold tnum"
                            style={{ color: item.tone.color }}
                          >
                            {item.days < 0
                              ? "term ended"
                              : `${item.days}d of term left`}
                          </span>
                        </span>
                      </span>
                    </Link>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

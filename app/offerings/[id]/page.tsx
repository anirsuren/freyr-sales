import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Pencil,
  Plus,
  ChevronRight,
  UserRound,
  Layers,
  Building2,
  Globe,
  type LucideIcon,
  CalendarClock,
} from "lucide-react";
import { SIZE_TIER_META } from "@/components/ui/Badge";
import { AvailabilityPill } from "@/components/ui/AvailabilityPill";
import { SectionCard } from "@/components/ui/SectionCard";
import { Tooltip } from "@/components/ui/Tooltip";
import { Avatar } from "@/components/ui/Avatar";
import { RecordView } from "@/components/RecordView";
import { OfferingOverviewMain } from "@/components/offerings/OfferingOverviewMain";
import { OfferingReports } from "@/components/offerings/OfferingReports";
import { OfferingActions } from "@/components/offerings/OfferingActions";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { canManageOfferings } from "@/lib/role";
import { getDataMode } from "@/lib/dataMode";
import { isOfferingsOnly } from "@/lib/release";
import { getDb } from "@/lib/db";
import { formatMoney } from "@/lib/pipeline";
import { REVENUE_TYPE_META } from "@/lib/revenue";
import { reportForOffering } from "@/lib/revenue";
import { cn } from "@/lib/utils";
import { getOffering, hydrateOffering, listOfferings, listOfferingTypes } from "@/lib/offerings";
import { FILTER_PALETTE } from "@/components/offerings/filterPalette";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const o = getOffering((await params).id);
  return { title: o ? `${o.offering_name} · Offerings` : "Offering" };
}

const CT_FAMILIES = ["Pharmaceutical", "Biologics", "Bio Pharmaceutical"];

export default async function OfferingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const query = await searchParams;
  const raw = getOffering((await params).id);
  if (!raw) notFound();
  const o = hydrateOffering(raw);

  const tab = query?.tab === "reports" ? "reports" : "overview";
  const allCustomers = await getDb().customers.list();

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
                ? // Caution reads in orange-700, never the yellow band — this
                  // status renders as TEXT and amber failed on white.
                  { color: "#C2410C", bg: "rgba(194,65,12,0.12)" }
                : { color: "#1A7A35", bg: "rgba(26,122,53,0.10)" };
          return {
            id: line.id,
            customer: customer.company_name,
            customerId: customer.id,
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

  // Sibling offerings of the same type — Suren's catalog is variant-heavy, so a
  // quick way to compare the family (e.g. the Freya Register stack) is useful.
  const related = raw.offering_type
    ? listOfferings().filter(
        (x) => x.id !== raw.id && x.offering_type === raw.offering_type
      )
    : [];

  const isMapped =
    o.customerTypes.length > 0 || o.markets.length > 0 || o.materials.length > 0;
  const admin = await canManageOfferings();
  const commercialActionsEnabled = !isOfferingsOnly(getDataMode());

  // The internal person accountable for this offering — the category owner if
  // set, else the delivery POC. Only render the owner card when one is real.
  const ownerName = o.offeringCategory?.owner || o.poc || "";
  const ownerRole = o.offeringCategory?.owner
    ? `${o.offeringCategory.name} owner`
    : o.poc
    ? "Delivery contact"
    : "";

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
  // Two colour dimensions on Target segments (Suren): the FAMILY (blue / rose /
  // violet) and the SIZE (slate / amber / green) — distinct hues so they never
  // clash when shown together.
  const familyStyle = (fam: string): string => {
    const f = fam.toLowerCase();
    if (f.includes("bio pharma") || f.includes("biopharma")) return "#7C3AED"; // violet
    if (f.includes("biologic")) return "#E11D48"; // rose
    if (f.includes("pharma")) return "#0071E3"; // blue
    return "#8E98A8";
  };
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
          Existing classes only — the reduced-motion guards in globals.css
          already cover both. */}
      <Link
        href="/offerings"
        className="rise-in inline-flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary mb-4"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All offerings
      </Link>

      {/* Header: identity on the left, primary actions on the right */}
      <div className="rise-in flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-[30px] font-semibold tracking-[-0.02em] text-text-primary leading-tight">
            <OfferingIcon name={o.offering_name} className="w-11 h-11 shrink-0" />
            {o.offering_name}
          </h1>
          {/* All tags on one line (Anir: single line to save space) */}
          <div className="flex flex-wrap items-center gap-2 mt-2.5">
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
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-2.5 py-1"
                  style={{ color: typeColor, background: `${typeColor}14` }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: typeColor }}
                  />
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
              /* Duplicate is gone (Suren, Jul 27: "the duplicate button is
                 useless"). Editing is the only admin action left up here. */
              admin ? (
                <Link
                  href={`/offerings/${o.id}/edit`}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium rounded-md px-3 py-2 bg-white border border-border-light text-text-primary hover:bg-surface hover:border-blue-subtle transition-colors"
                >
                  <Pencil size={14} strokeWidth={1.8} /> Edit offering
                </Link>
              ) : null
            }
          />
        </div>
      </div>

      {/* Overview | Reports (Suren's "I need a reports tab in offering") */}
      <div
        role="tablist"
        aria-label="Offering sections"
        className="rise-in flex gap-8 border-b border-border-light mt-6"
      >
        {[
          { key: "overview", label: "Overview", href: `/offerings/${o.id}` },
          {
            key: "reports",
            label:
              report.customerCount > 0
                ? `Reports (${report.customerCount})`
                : "Reports",
            href: `/offerings/${o.id}?tab=reports`,
          },
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
          `tabPanelIn` keyframes replay on every switch — the tabs had no
          transition at all before. */}
      <div key={tab} className="tab-panel">
        {tab === "reports" ? (
          <OfferingReports
            report={report}
            offeringName={o.offering_name}
            // In-progress mode shows a labelled sample report when there's no
            // revenue yet, so people know what the tab will look like.
            showExample={getDataMode() === "mock"}
          />
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 mt-6 items-start">
          {/* ---------------------------------------------------- MAIN column */}
          <OfferingOverviewMain
            offering={o}
            report={report}
            related={related}
            admin={admin}
          />
          {/* ---------------------------------------------------- SIDE rail */}
          {/* `stagger` — the rail's cards lift in one after another, the same
              entrance the dashboard's lists use. */}
          <div className="space-y-5 stagger">
            {/* Internal owner — only when a real person is on file */}
            {ownerName && (
              <SectionCard title="Internal owner" icon={UserRound}>
                <div className="flex items-center gap-3">
                  <Avatar name={ownerName} className="w-10 h-10 text-[14px]" />
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-text-primary truncate">
                      {ownerName}
                    </p>
                    <p className="text-[12.5px] text-text-secondary truncate">
                      {ownerRole}
                    </p>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* Category — its plain-English description + the family link */}
            {o.offeringCategory && (
              <SectionCard title="Category" icon={Layers}>
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
                  See all in this category
                  <ChevronRight size={13} strokeWidth={2} />
                </Link>
              </SectionCard>
            )}

            {/* Target segments — customer types grouped by family */}
            <SectionCard title="Target segments" icon={Building2}>
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
                  {CT_FAMILIES.map((fam) => {
                    const types = o.customerTypes.filter((c) => c.family === fam);
                    if (types.length === 0) return null; // hide families that don't apply
                    const famColor = familyStyle(fam);
                    return (
                      // Each family is its own tidy block with a colour accent, and
                      // the sizes sit side-by-side — not a tall left-aligned stack
                      // (Suren: "I don't like how they're all stacked on the left").
                      <div
                        key={fam}
                        className="rounded-xl border border-border-light bg-surface/30 p-3"
                        style={{ borderLeft: `3px solid ${famColor}` }}
                      >
                        <p
                          className="text-[11px] font-semibold uppercase tracking-[0.05em] mb-2"
                          style={{ color: famColor }}
                        >
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
                                className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-md px-2.5 py-1 transition-opacity hover:opacity-80"
                              >
                                {(() => {
                                  const TierIcon = sizeStyle(c.size).icon;
                                  return <TierIcon size={11} strokeWidth={2.2} aria-hidden="true" />;
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
            </SectionCard>

            {/* Markets */}
            <SectionCard title={`Markets (${o.markets.length})`} icon={Globe}>
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
            </SectionCard>

            {/* Current customers — who already uses it (from the revenue book) */}
            {report.customers.length > 0 && (
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
                      className="group flex items-start gap-2.5"
                    >
                      <CompanyLogo name={item.customer} className="mt-0.5 h-7 w-7 shrink-0 text-[10px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium leading-snug text-text-primary group-hover:text-blue-primary">
                          {item.customer}
                        </span>
                        <span className="block text-[10.5px] text-text-tertiary">
                          {item.label} · {item.when}
                        </span>
                      </span>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.04em]"
                        style={{ color: item.tone.color, background: item.tone.bg }}
                      >
                        {item.status}
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

import Link from "next/link";
import {
  CheckSquare,
  CircleDashed,
  Square,
  TrendingUp,
  TrendingDown,
  Target,
  Package,
  MapPin,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { SizeBadge, OutcomeBadge, Badge } from "@/components/ui/Badge";
import { IndustryTag } from "@/components/ui/IndustryTag";
import { HoverExpandCard } from "@/components/ui/HoverExpandCard";
import {
  DonutChart,
  DonutLegend,
  Sparkline,
  type TipItem,
} from "@/components/charts/Charts";
import { formatDateTime } from "@/lib/utils";
import type { Customer } from "@/lib/types";
import { HEALTH_COLOR, type AccountHealth } from "@/lib/health";
import { geographyWithFlag } from "@/lib/countryFlags";
import { tint } from "@/lib/tint";

type MixSlice = { label: string; value: number; color: string; tip: TipItem[] };

const SIZE_OPP: Record<string, string> = {
  large: "High",
  mid: "Medium",
  small: "Low",
};

// Opportunity is a TIER, so it wears a colour + an icon like every other
// category chip in the app (standing rule) instead of sitting there as flat
// gray text. Semantic ramp — green for the biggest prize, blue for the middle,
// violet for the smallest. Deliberately no amber/yellow band (banned), and
// deliberately not red either: a small account is not a failing one.
const OPP_TIER: Record<string, { color: string; bg: string }> = {
  High: { color: "#15803D", bg: "rgba(21,128,61,0.12)" },
  Medium: { color: "var(--ink-bright-blue)", bg: "rgba(0,113,227,0.12)" },
  Low: { color: "var(--ink-violet-soft)", bg: "rgba(124,58,237,0.12)" },
};

/**
 * One fact tile in the hover panel's 2×2 grid. Every tile carries an icon and
 * a colour (Suren's chip rule); the value may also be a person, in which case
 * their face stands in for the icon.
 */
function FactTile({
  label,
  value,
  icon: Icon,
  color,
  bg,
  avatar,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  color: string;
  /** Tinted plate behind the icon — its own colour at ~12%. */
  bg: string;
  /** Render this person's headshot instead of the glyph. */
  avatar?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-surface px-2.5 py-2">
      {avatar ? (
        <Avatar name={avatar} className="h-[26px] w-[26px] shrink-0 text-[9px]" />
      ) : (
        <span
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md"
          style={{ color, background: bg }}
          aria-hidden="true"
        >
          <Icon size={14} strokeWidth={2.2} />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
          {label}
        </span>
        {/* Wraps rather than ellipsizes — a clipped region string is unusable
            (Suren's no-"…" rule). */}
        <span
          className="mt-0.5 block break-normal text-[12.5px] font-semibold leading-tight"
          style={{ color }}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

export function CustomerCard({
  customer,
  contactCount,
  contacts,
  lastOutcome,
  lastSessionDate,
  health,
  stageMix,
  outcomeMix,
  healthTrend,
  trendTips,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  customer: Customer;
  contactCount: number;
  contacts?: { id: string; name: string }[];
  lastOutcome?: string | null;
  lastSessionDate?: string | null;
  health?: AccountHealth;
  stageMix?: MixSlice[];
  outcomeMix?: MixSlice[];
  healthTrend?: number[];
  trendTips?: TipItem[][];
  /** Tile-view selection (Anir: checking off must work here too). */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  // The hover pie: pipeline mix when there's open money, else how the logged
  // touches landed — a rep's first two questions about an account.
  const hasPipeline = !!stageMix && stageMix.length > 0;
  const mix: MixSlice[] = hasPipeline ? stageMix! : outcomeMix ?? [];
  const mixCount = hasPipeline
    ? mix.reduce((s, m) => s + m.tip.length, 0)
    : mix.reduce((s, m) => s + m.value, 0);
  const opp = customer.size_tier ? SIZE_OPP[customer.size_tier] ?? "-" : "-";
  const oppTier = OPP_TIER[opp];
  const offeringsCount = customer.offerings_in_use?.length ?? 0;
  const owner = customer.owner || "Unassigned";
  // Every tile is a colour + icon chip, never flat gray text (Suren, Jul 27:
  // "for opportunity colour code, add an icon for region… I would use the
  // colour code for things like that"). Region keeps whatever
  // `geographyWithFlag` gives it — the flag, and country-only once that helper
  // changes — so nothing here parses the string itself.
  const facts = [
    {
      label: "Opportunity",
      value: opp,
      icon: Target,
      color: oppTier?.color ?? "#6E6E73",
      bg: oppTier?.bg ?? "rgba(110,110,115,0.12)",
    },
    {
      label: "Offerings in use",
      value: String(offeringsCount),
      icon: Package,
      color: "#0891B2",
      bg: "rgba(8,145,178,0.12)",
    },
    {
      label: "Region",
      value: geographyWithFlag(customer.geography),
      icon: MapPin,
      color: "#0D9488",
      bg: "rgba(13,148,136,0.12)",
    },
    {
      label: "Owner",
      value: owner,
      icon: UserRound,
      color: "#4F46E5",
      bg: "rgba(79,70,229,0.12)",
      // A person always shows a face (standing rule) — the glyph is only the
      // fallback for an unassigned account.
      avatar: customer.owner || undefined,
    },
  ];

  // Scale-up hover (Suren: "do what you did on the voice station for the
  // customers too") — the resting card is unchanged; on hover it pops out over
  // its neighbours and reveals WHAT'S MOVING this account's health plus the
  // quick facts a rep would otherwise have to open the account to see. The
  // company name is a stretched link (opens the account); each contact is its
  // own link lifted above it, so there are no nested anchors.
  return (
    <HoverExpandCard
      className={
        selected
          ? "h-full rounded-xl ring-2 ring-blue-primary ring-offset-1"
          : "h-full"
      }
      summary={
        <>
          {/* Select mode: one full-card click target ABOVE the stretched
              company link, so checking off works from the tiles view too
              (Anir: "I should be able to check it off... on normal view").
              The same Square/CheckSquare pair as the table rows. */}
          {selectMode && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleSelect?.();
              }}
              aria-label={`${selected ? "Deselect" : "Select"} ${customer.company_name}`}
              aria-pressed={selected}
              className="absolute inset-0 z-20 cursor-pointer rounded-xl"
            />
          )}
          <div className="flex items-start gap-3 mb-4">
            <CompanyLogo
              name={customer.company_name}
              className="w-10 h-10 text-[13px]"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/customers/${customer.id}`}
                  aria-label={`Open ${customer.company_name}`}
                  className="min-w-0 text-[16px] font-semibold text-text-primary truncate rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:ring-2 focus-visible:ring-blue-primary group-hover:text-blue-primary transition-colors"
                >
                  {customer.company_name}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  {selectMode &&
                    (selected ? (
                      <CheckSquare
                        size={18}
                        strokeWidth={1.9}
                        className="text-blue-primary"
                      />
                    ) : (
                      <Square
                        size={18}
                        strokeWidth={1.9}
                        className="text-text-tertiary"
                      />
                    ))}
                  <SizeBadge tier={customer.size_tier} />
                </span>
              </div>
              {/* Industry is a category, so it wears its colour + icon like
                  every other chip in the app, it was the last place still
                  rendering as flat gray text (Anir, Jul 27: "shouldn't that be
                  like a color and an icon? Like a tag?"). IndustryTag already
                  existed and is used on the customer detail header; the grid
                  card simply never adopted it. */}
              <div className="mt-1">
                {customer.industry ? (
                  <IndustryTag industry={customer.industry} />
                ) : (
                  <span className="text-[13px] text-text-tertiary">-</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-[13px] text-text-tertiary">
            {contacts && contacts.length > 0 ? (
              contacts.length === 1 ? (
                <Link
                  href={`/contacts/${contacts[0].id}`}
                  className="relative z-10 flex items-center gap-2 min-w-0 group/ct"
                >
                  <Avatar
                    name={contacts[0].name}
                    className="w-7 h-7 text-[10px] shrink-0"
                    tooltip={contacts[0].name}
                  />
                  <span className="truncate text-text-secondary group-hover/ct:text-blue-primary transition-colors">
                    {contacts[0].name}
                  </span>
                </Link>
              ) : (
                <span className="relative z-10 flex items-center min-w-0">
                  <span className="flex -space-x-2 shrink-0">
                    {contacts.slice(0, 4).map((ct) => (
                      <Link
                        key={ct.id}
                        href={`/contacts/${ct.id}`}
                        aria-label={`Open ${ct.name}`}
                        className="rounded-full hover:z-10 hover:-translate-y-0.5 transition-transform"
                      >
                        <Avatar
                          name={ct.name}
                          className="w-7 h-7 text-[10px] ring-2 ring-[color:var(--white)]"
                          tooltip={ct.name}
                        />
                      </Link>
                    ))}
                  </span>
                  <span className="ml-2 text-[12px] font-medium text-text-tertiary">
                    {contactCount > 4 ? `+${contactCount - 4} more` : `${contactCount} contacts`}
                  </span>
                </span>
              )
            ) : (
              <span>No contacts yet</span>
            )}
            <span className="flex items-center gap-2 shrink-0">
              {/* Outcome lives with the person it happened with (Anir: "the
                  outcome should be next to the name, it just looks awkward
                  at the bottom"). */}
              {lastOutcome ? (
                <OutcomeBadge outcome={lastOutcome} />
              ) : (
                <Badge
                  label="No outcome yet"
                  bg="rgba(100,116,139,0.12)"
                  color="#475569"
                  icon={CircleDashed}
                />
              )}
              {lastSessionDate && (
                <span className="shrink-0">Last session {formatDateTime(lastSessionDate)}</span>
              )}
            </span>
          </div>
          {/* Health as a bar (Suren: "same progress bar as the row view, on the
              grid cards too"), coloured by band. */}
          {health && (
            <div className="mt-3.5">
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-[10.5px] font-bold uppercase tracking-[0.03em]"
                  style={{ color: HEALTH_COLOR[health.band].color }}
                >
                  {health.label}
                </span>
                <span className="text-[11px] tnum text-text-tertiary">
                  {health.score}/100
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(health.score, 4)}%`,
                    background: HEALTH_COLOR[health.band].color,
                  }}
                />
              </div>
            </div>
          )}
        </>
      }
      extra={
        <>
          {/* Pie — where the money sits (or how touches landed when there's
              no open pipeline yet). Slices carry the actual deals/touches. */}
          {mix.length > 0 && (
            <div className="mb-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-2">
                {hasPipeline ? "Pipeline by stage" : "How touches landed"}
              </p>
              <div className="flex items-center gap-3">
                <DonutChart
                  syncId={`cust-card-${customer.id}`}
                  segments={mix}
                  size={76}
                  thickness={10}
                  format={hasPipeline ? "money" : "number"}
                  centerLabel={String(mixCount)}
                  centerSub={
                    hasPipeline
                      ? mixCount === 1
                        ? "deal"
                        : "deals"
                      : mixCount === 1
                      ? "touch"
                      : "touches"
                  }
                />
                <div className="flex-1 min-w-0">
                  <DonutLegend items={mix} format={hasPipeline ? "money" : "number"} syncId={`cust-card-${customer.id}`} />
                </div>
              </div>
            </div>
          )}

          {/* Line — is this relationship warming or cooling. Points carry the
              touches logged that week. */}
          {healthTrend && healthTrend.length > 1 && (
            <div className="mb-3.5">
              {/* The delta sits right after the heading it belongs to, not
                  pushed to the far edge (same canyon rule as the factor rows
                  below). */}
              <div className="mb-1.5 flex items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                  Health · last 5 weeks
                </p>
                <span
                  className="whitespace-nowrap rounded-full px-1.5 py-[1px] text-[10.5px] font-bold tnum"
                  style={{
                    color: health ? HEALTH_COLOR[health.band].color : undefined,
                    background: health
                      ? tint(HEALTH_COLOR[health.band].color, 12)
                      : undefined,
                  }}
                >
                  {healthTrend[healthTrend.length - 1] - healthTrend[0] >= 0 ? "+" : ""}
                  {healthTrend[healthTrend.length - 1] - healthTrend[0]} pts
                </span>
              </div>
              <Sparkline
                points={healthTrend}
                color={health ? HEALTH_COLOR[health.band].color : undefined}
                height={40}
                unit="pts"
                label={`${customer.company_name} health`}
                xLabels={healthTrend.map((_, index) =>
                  index === healthTrend.length - 1
                    ? "this week"
                    : `${healthTrend.length - 1 - index}w ago`
                )}
                pointTips={trendTips}
              />
            </div>
          )}

          {health && health.factors.length > 0 && (
            <div className="mb-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-2">
                What&apos;s moving this account&apos;s health
              </p>
              {/* Two columns, not one: a single column of short factors left a
                  half-card of dead space to the right (Suren). Paired up, the
                  rows fill the width and each factor's number sits right
                  beside its own words. */}
              <div className="grid grid-cols-2 gap-1.5">
                {health.factors.map((f) => {
                  const up = f.delta >= 0;
                  const color = up ? "var(--ink-green)" : "var(--ink-red)";
                  const Trend = up ? TrendingUp : TrendingDown;
                  return (
                    <div
                      key={f.label}
                      className="flex min-w-0 items-start gap-1.5 rounded-md bg-surface px-2 py-1.5 text-[12px]"
                    >
                      <Trend
                        size={13}
                        strokeWidth={2}
                        style={{ color }}
                        className="mt-[2px] shrink-0"
                      />
                      {/* The number rides WITH the words — never flung to the
                          opposite edge with a canyon in between (Suren, Jul
                          27: "the number here is way too far from the text on
                          the left. You can never do that"). It is a tinted
                          pill so the pair reads as one object, and the label
                          wraps instead of ellipsizing. */}
                      <span className="min-w-0 break-normal leading-snug text-text-secondary">
                        {f.label}{" "}
                        <span
                          className="ml-0.5 inline-block whitespace-nowrap rounded-full px-1.5 py-[1px] text-[11px] font-bold tnum align-[1px]"
                          style={{ color, background: tint(color, 12) }}
                        >
                          {up ? `+${f.delta}` : f.delta}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {facts.map((f) => (
              <FactTile
                key={f.label}
                label={f.label}
                value={f.value}
                icon={f.icon}
                color={f.color}
                bg={f.bg}
                avatar={"avatar" in f ? f.avatar : undefined}
              />
            ))}
          </div>
        </>
      }
    />
  );
}

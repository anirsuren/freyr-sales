import Link from "next/link";
import { CircleDashed, TrendingUp, TrendingDown } from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { SizeBadge, OutcomeBadge, Badge } from "@/components/ui/Badge";
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

type MixSlice = { label: string; value: number; color: string; tip: TipItem[] };

const SIZE_OPP: Record<string, string> = {
  large: "High",
  mid: "Medium",
  small: "Low",
};

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
}) {
  // The hover pie: pipeline mix when there's open money, else how the logged
  // touches landed — a rep's first two questions about an account.
  const hasPipeline = !!stageMix && stageMix.length > 0;
  const mix: MixSlice[] = hasPipeline ? stageMix! : outcomeMix ?? [];
  const mixCount = hasPipeline
    ? mix.reduce((s, m) => s + m.tip.length, 0)
    : mix.reduce((s, m) => s + m.value, 0);
  const opp = customer.size_tier ? SIZE_OPP[customer.size_tier] ?? "—" : "—";
  const offeringsCount = customer.offerings_in_use?.length ?? 0;
  const facts: { label: string; value: string }[] = [
    { label: "Opportunity", value: opp },
    { label: "Offerings in use", value: String(offeringsCount) },
    { label: "Region", value: customer.geography || "—" },
    { label: "Owner", value: customer.owner || "Unassigned" },
  ];

  // Scale-up hover (Suren: "do what you did on the voice station for the
  // customers too") — the resting card is unchanged; on hover it pops out over
  // its neighbours and reveals WHAT'S MOVING this account's health plus the
  // quick facts a rep would otherwise have to open the account to see. The
  // company name is a stretched link (opens the account); each contact is its
  // own link lifted above it, so there are no nested anchors.
  return (
    <HoverExpandCard
      className="h-full"
      summary={
        <>
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
                <SizeBadge tier={customer.size_tier} />
              </div>
              <p className="text-[13px] text-text-secondary mt-0.5">
                {customer.industry || "—"}
              </p>
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
                          className="w-7 h-7 text-[10px] ring-2 ring-white"
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
            {lastSessionDate && (
              <span className="shrink-0">Last session {formatDateTime(lastSessionDate)}</span>
            )}
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
          <div className="mt-3 flex items-center gap-2 flex-wrap">
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
          </div>
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
                  <DonutLegend items={mix} format={hasPipeline ? "money" : "number"} />
                </div>
              </div>
            </div>
          )}

          {/* Line — is this relationship warming or cooling. Points carry the
              touches logged that week. */}
          {healthTrend && healthTrend.length > 1 && (
            <div className="mb-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                  Health · last 5 weeks
                </p>
                <span
                  className="text-[10.5px] tnum font-semibold"
                  style={{
                    color: health ? HEALTH_COLOR[health.band].color : undefined,
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
              <div className="space-y-1.5">
                {health.factors.map((f) => {
                  const up = f.delta >= 0;
                  const color = up ? "#1A7A35" : "#B02020";
                  return (
                    <div key={f.label} className="flex items-center gap-2 text-[12.5px]">
                      {up ? (
                        <TrendingUp size={13} strokeWidth={2} style={{ color }} className="shrink-0" />
                      ) : (
                        <TrendingDown size={13} strokeWidth={2} style={{ color }} className="shrink-0" />
                      )}
                      <span className="text-text-secondary truncate">{f.label}</span>
                      <span className="ml-auto tnum font-semibold shrink-0" style={{ color }}>
                        {up ? `+${f.delta}` : f.delta}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {facts.map((f) => (
              <div key={f.label} className="rounded-lg bg-surface px-2.5 py-2">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                  {f.label}
                </p>
                <p className="text-[13px] font-semibold text-text-primary truncate mt-0.5">
                  {f.value}
                </p>
              </div>
            ))}
          </div>
        </>
      }
    />
  );
}

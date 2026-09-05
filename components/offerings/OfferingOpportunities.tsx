import Link from "next/link";
import {
  Building2,
  ChevronRight,
  Target,
  TrendingUp,
} from "lucide-react";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { InfoHint } from "@/components/ui/InfoHint";
import { EmptyState } from "@/components/ui/EmptyState";
import { Avatar } from "@/components/ui/Avatar";
import { formatMoney } from "@/lib/pipeline";
import { revenueTypeRule } from "@/lib/opportunitiesShared";
import type { Opportunity } from "@/lib/opportunitiesShared";
import { cn, formatDate, plural } from "@/lib/utils";
import { tint } from "@/lib/tint";

/**
 * EVERY DEAL RUNNING ON THIS OFFERING, ON THE OFFERING'S OWN PAGE.
 *
 * Suren, Aug 25: "instead of saying customers you should say opportunities
 * here, because as an offering owner I want to see all the opportunities in my
 * offering that I am working against — I don't have to go to the opportunities
 * module to see them, that filtering is not required."
 *
 * The tab used to be Customers, which answered a delivery question (who runs
 * which version). That table is still on this page, underneath — the offering
 * owner's first question is money and movement, not release numbers, so the
 * deals lead and the versions follow.
 *
 * Nothing here is a second copy of the pipeline: these ARE the opportunity
 * records, read by offering id, and every row opens the deal itself.
 */

const LEVEL_COLOR: Record<string, string> = {
  Pipeline: "var(--ink-bright-blue)",
  "Go get": "var(--ink-magenta)",
  "High confidence": "var(--ink-teal-deep)",
  Future: "var(--ink-violet-soft)",
};

const STATUS_COLOR: Record<string, string> = {
  Qualify: "#0891B2",
  Pilot: "#5E5CE6",
  Propose: "var(--ink-bright-blue)",
  "Submitted to client": "var(--ink-violet-soft)",
  "Under review": "var(--ink-magenta)",
  "On hold": "#8E98A8",
  Won: "#16A34A",
  Lost: "#DC2626",
};

export type OfferingOpportunityRow = {
  id: string;
  name: string;
  customer: string;
  customerId?: string;
  level: string;
  status?: string;
  value: number;
  confidence?: number;
  estSignDate?: string;
  owner?: string;
};

/** The deals on one offering, and what they add up to. */
export function OfferingOpportunities({
  rows,
  offeringName,
}: {
  rows: OfferingOpportunityRow[];
  offeringName: string;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="No opportunity is running on this offering yet"
        description={`Add an opportunity against ${offeringName} on the Opportunities page and it appears here, with its customer, its value and where it stands.`}
      />
    );
  }

  const total = rows.reduce((s, r) => s + (r.value || 0), 0);
  const open = rows.filter((r) => r.status !== "Won" && r.status !== "Lost");
  /* Grouped so the same account's deals sit together — the offering owner
     reads by customer even on the offering's own page. */
  const accounts = new Set(rows.map((r) => r.customer)).size;

  return (
    <section className="mt-4 rounded-xl border border-border-light bg-white p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
        <Target size={15} strokeWidth={2} className="text-blue-primary" />
        Opportunities on this offering
        <InfoHint text="Every deal in the pipeline that includes this offering, whoever owns it. These are the same deals you see on the Opportunities page, gathered here so you do not have to filter for them yourself." />
      </h2>
      <p className="mt-0.5 text-[12.5px] text-text-secondary">
        {rows.length} {rows.length === 1 ? "deal" : "deals"} across {accounts}{" "}
        {accounts === 1 ? "account" : "accounts"} on {offeringName}.
      </p>

      {/* The two numbers an offering owner actually opens this for. A third
          tile read "Weighted · value x confidence" until Anir, Sep 2: "they
          dont use weighted". */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {[
          { label: "Total value", value: formatMoney(total), sub: `${rows.length} ${plural(rows.length, "deal")}` },
          {
            label: "Still open",
            value: String(open.length),
            sub: formatMoney(open.reduce((s, r) => s + (r.value || 0), 0)),
          },
        ].map((t) => (
          <div
            key={t.label}
            className="rounded-lg border border-border-light bg-surface/50 px-3 py-2"
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              {t.label}
            </p>
            <p className="mt-0.5 text-[17px] font-bold tnum text-text-primary">
              {t.value}
            </p>
            <p className="text-[11.5px] text-text-secondary tnum">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead>
            <tr className="border-b border-border-light text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:whitespace-nowrap">
              {/* EVERY COLUMN LEFT (Anir, Aug 26: "just make sure the columns
                  are left-aligned, and the date should be on one line"). Value
                  and Confidence were right-aligned, so the row read as three
                  separate blocks. The table has a min-width and scrolls, which
                  he was explicit is fine: "it's okay if I have to scroll". */}
              <th className="w-[22%] py-2 pr-4">Opportunity</th>
              <th className="w-[16%] py-2 pr-4">Customer</th>
              <th className="w-[13%] py-2 pr-4">Revenue type</th>
              <th className="w-[12%] py-2 pr-4">Status</th>
              <th className="w-[10%] py-2 pr-4">Value</th>
              <th className="w-[9%] py-2 pr-4">Confidence</th>
              <th className="w-[14%] py-2 pr-4">Est. sign</th>
              <th className="w-[12%] py-2 pr-4">Owner</th>
              <th className="w-[2%] py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="group transition-colors hover:bg-blue-light/30"
              >
                <td className="py-2.5 pr-4">
                  <Link
                    href={`/opportunities?open=${encodeURIComponent(row.id)}`}
                    className="text-[13px] font-semibold text-text-primary group-hover:text-blue-primary"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="py-2.5 pr-4">
                  {row.customerId ? (
                    <Link
                      href={`/customers/${row.customerId}`}
                      className="flex items-center gap-2 text-[12.5px] text-text-secondary hover:text-blue-primary"
                    >
                      <CompanyLogo name={row.customer} className="h-6 w-6 shrink-0" />
                      {row.customer}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 text-[12.5px] text-text-secondary">
                      <CompanyLogo name={row.customer} className="h-6 w-6 shrink-0" />
                      {row.customer}
                    </span>
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  <span
                    title={revenueTypeRule(row.level as never)}
                    className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
                    style={{
                      background: tint(LEVEL_COLOR[row.level] ?? "#8E98A8", 9),
                      color: LEVEL_COLOR[row.level] ?? "#8E98A8",
                    }}
                  >
                    {row.level}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  {row.status ? (
                    <span
                      className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold"
                      style={{
                        background: tint(STATUS_COLOR[row.status] ?? "#8E98A8", 9),
                        color: STATUS_COLOR[row.status] ?? "#8E98A8",
                      }}
                    >
                      {row.status}
                    </span>
                  ) : (
                    <span className="text-[12px] text-text-tertiary">Not set</span>
                  )}
                </td>
                <td className="py-2.5 pr-4 text-[13px] font-semibold tnum text-text-primary">
                  {row.value ? formatMoney(row.value) : "—"}
                </td>
                <td className="py-2.5 pr-4 text-[12.5px] tnum text-text-secondary">
                  {row.confidence === undefined ? "—" : `${row.confidence}%`}
                </td>
                {/* whitespace-nowrap: "Aug 18, 2026" was breaking after the
                    comma and making the row two lines tall for no reason. */}
                <td className="whitespace-nowrap py-2.5 pr-4 text-[12.5px] tnum text-text-secondary">
                  {row.estSignDate ? formatDate(row.estSignDate) : "—"}
                </td>
                <td className="py-2.5 pr-4">
                  {row.owner ? (
                    <span className="flex items-center gap-1.5 text-[12.5px] text-text-secondary">
                      <Avatar name={row.owner} className="h-5 w-5 shrink-0 text-[8px]" />
                      <span className="truncate">{row.owner}</span>
                    </span>
                  ) : (
                    <span className="text-[12px] text-text-tertiary">Unassigned</span>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  <ChevronRight
                    size={15}
                    strokeWidth={2}
                    className="inline text-text-tertiary transition-colors group-hover:text-blue-primary"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

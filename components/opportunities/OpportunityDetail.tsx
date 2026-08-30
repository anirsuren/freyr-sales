"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CalendarClock, Package, Target } from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { InfoHint } from "@/components/ui/InfoHint";
import { Customer360 } from "@/components/customers/Customer360";
import type { Customer360Band } from "@/components/customers/Customer360";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { StatTile } from "@/components/ui/StatTile";
import {
  effectiveRevenueType,
  estimatedAcvOf,
  estimatedTcvOf,
  opportunityValue,
  signDateOf,
  weightedValue,
  type Opportunity,
} from "@/lib/opportunitiesShared";
import { cn } from "@/lib/utils";

/**
 * THE OPPORTUNITY PAGE.
 *
 * Suren asked for "the full opportunity page and these related things… all the
 * tabs connected to that opportunity", and Anir for a click that leaves the
 * list behind instead of opening a sheet on top of it.
 *
 * The band strip is the customer page's, unchanged — meetings, submissions,
 * presentations, contracts and documents already know how to render themselves
 * against a record, and a second implementation of that row would drift from
 * the first within a week.
 */

function money(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

const LEVEL_TONE: Record<string, string> = {
  "Go get": "#0F766E",
  "High confidence": "#0071E3",
  Pipeline: "#7C3AED",
  Future: "#B4318F",
};

export function OpportunityDetail({
  verdict,
  deal,
  bands,
  offerings,
  customerId,
  meetings,
}: {
  /** What this person may do to THIS deal — the privilege map joined to who is
   *  on the account and on the deal. Decided on the server. */
  verdict: { mayEdit: boolean; mayCreate: boolean; why: string };
  deal: Opportunity;
  bands: Customer360Band[];
  offerings: { id: string; name: string; type?: string }[];
  customerId: string | null;
  meetings: {
    id: string;
    ref: string;
    title: string;
    owner: string;
    meetingAt: string;
    status: string;
  }[];
}) {
  const value = opportunityValue(deal);
  const acv = estimatedAcvOf(deal);
  const tcv = estimatedTcvOf(deal);
  const level = effectiveRevenueType(deal);
  const signs = signDateOf(deal);
  const [tab, setTab] = useState<string>("overview");
  const offeringNames = [
    ...deal.offeringIds
      .map((id) => offerings.find((o) => o.id === id)?.name)
      .filter((n): n is string => !!n),
    ...deal.offeringLabels,
  ];

  return (
    <div>
      {/* Back to wherever you actually came from — the summary, the table, a
          customer page — with the pipeline as the fallback for a deep link. */}
      <SmartBack
        fallback="/opportunities"
        className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary"
      >
        <ArrowLeft size={15} strokeWidth={1.8} /> All opportunities
      </SmartBack>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <CompanyLogo name={deal.customer} className="mt-0.5 h-11 w-11 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
              {deal.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-secondary">
              {customerId ? (
                <Link
                  href={`/customers/${customerId}`}
                  className="inline-flex items-center gap-1 font-semibold text-text-primary hover:text-blue-primary"
                >
                  {deal.customer}
                  <ArrowUpRight size={12} strokeWidth={2.2} />
                </Link>
              ) : (
                <span className="font-semibold text-text-primary">{deal.customer}</span>
              )}
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{
                  background: `${LEVEL_TONE[level] ?? "#7C3AED"}14`,
                  color: LEVEL_TONE[level] ?? "#7C3AED",
                }}
              >
                {level}
              </span>
              {deal.status && <span>· {deal.status}</span>}
              {deal.externalId && (
                <span className="tnum text-text-tertiary">· {deal.externalId}</span>
              )}
            </p>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {/* WHY THIS IS OR IS NOT EDITABLE, in the person's own case. A page
              that simply refuses to save teaches nobody anything; the hint
              names the rule that decided it, so a wrong answer here is
              reportable rather than mysterious. */}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
              verdict.mayEdit
                ? "bg-[rgba(26,122,53,0.10)] text-[color:#1A7A35]"
                : "bg-surface text-text-secondary"
            )}
          >
            {verdict.mayEdit ? "You can edit this" : "View only"}
            <InfoHint text={verdict.why} />
          </span>
          <Link
            href="/opportunities"
            className="rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
          >
            Open in the pipeline
          </Link>
        </span>
      </div>

      {/* The money, in the three shapes the summary reads it in. */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          icon={Target}
          label="Estimated TCV"
          value={tcv === undefined ? "·" : money(tcv)}
          sub={
            deal.estimatedTcv === undefined
              ? "the deal's own value"
              : "entered on this deal"
          }
        />
        <StatTile
          icon={CalendarClock}
          label="Estimated ACV"
          value={acv === undefined ? "·" : money(acv)}
          sub={acv === undefined ? "not entered yet" : "one year of it"}
        />
        <StatTile
          icon={Package}
          label="Weighted"
          value={money(weightedValue(deal))}
          sub={`${money(value)} × confidence`}
        />
      </div>

      {/* THE CONNECTED AREAS ARE THE PAGE'S OWN TABS, full width — the same
          shape the customer page uses (Anir, Aug 30: "the entire thing has to
          be it, look at the page where you have it already").

          They were a Customer360 strip inside a bordered card inside the left
          column of a two-column grid: a box in a box in a column, with the
          tab row squeezed to about half the width it needed. Hoisted up here
          they behave like the customer page's — one scrolling row of tabs
          across the page, and the selected area fills everything under it. */}
      <div
        role="tablist"
        className="mb-6 mt-6 flex flex-nowrap gap-5 overflow-x-auto overflow-y-hidden border-b border-border-light [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
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
        {bands.map((b) => (
          <button
            key={b.key}
            role="tab"
            aria-selected={tab === b.key}
            onClick={() => setTab(b.key)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-3 text-[14px] transition-colors",
              tab === b.key
                ? "border-blue-primary font-semibold text-blue-primary"
                : "border-transparent font-medium text-text-secondary hover:text-text-primary"
            )}
          >
            {b.label}
            <b className="tnum font-semibold">{b.count}</b>
          </button>
        ))}
      </div>

      {/* Keyed so each area animates in, exactly as the customer page does. */}
      <div key={tab} className="tab-panel">
        {tab === "overview" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-4">
              {deal.nextSteps ? (
                <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                    Note from the sheet
                  </h2>
                  <p className="mt-1.5 max-w-[68ch] text-[13.5px] leading-relaxed text-text-primary">
                    {deal.nextSteps}
                  </p>
                </section>
              ) : (
                <section className="rounded-xl border border-border-light bg-white px-5 py-8 text-center text-[12.5px] text-text-secondary shadow-card">
                  Nothing was written on this deal. Everything connected to it is
                  in the tabs above.
                </section>
              )}
              {meetings.length > 0 && (
                <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                    Meetings held against this deal
                  </h2>
                  <ul className="mt-2.5 space-y-2">
                    {meetings.map((m) => (
                      <li key={m.id}>
                        <Link
                          href={`/meetings/${m.id}`}
                          className="block truncate text-[13px] font-semibold text-text-primary hover:text-blue-primary"
                        >
                          {m.title}
                        </Link>
                        <span className="text-[11.5px] text-text-tertiary tnum">
                          {m.ref} · {m.owner} · {m.meetingAt?.slice(0, 10)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <aside className="min-w-0">
              <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                  The deal
                </h2>
                <dl className="mt-2.5 space-y-2.5 text-[13px]">
                  <Row label="Owner" value={deal.owner || "Nobody yet"} />
                  <Row label="Offering" value={offeringNames.join(", ") || "None"} />
                  <Row label="Value" value={money(value)} />
                  <Row
                    label="Confidence"
                    value={deal.confidence === undefined ? "Not set" : `${deal.confidence}%`}
                  />
                  <Row label="Revenue type" value={deal.revenueType || "Not set"} />
                  <Row label="Est. sign" value={signs || "Not set"} />
                  <Row
                    label="Created"
                    value={new Date(deal.createdAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  />
                </dl>
              </section>
            </aside>
          </div>
        ) : (
          <Customer360
            chromeless
            forceKey={tab}
            company={deal.customer}
            bands={bands}
            emptyLine="Nothing is connected to this deal yet."
          />
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[12px] text-text-tertiary">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right font-semibold text-text-primary")}>
        {value}
      </dd>
    </div>
  );
}

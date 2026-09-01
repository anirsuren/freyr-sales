"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CalendarClock, Package, Pencil, Target } from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { InfoHint } from "@/components/ui/InfoHint";
import { useRouter } from "next/navigation";
import { EditableFact } from "./EditableFact";
import { EditDealDialog } from "./EditDealDialog";
import { AddToBandButton } from "./AddToBandButton";
import { NewContractDialog } from "./NewContractDialog";
import { NewRequestDialog } from "@/components/solutioning/SolutioningModule";
import { DEAL_TYPES, OPPORTUNITY_STATUSES, REVENUE_TYPES } from "@/lib/opportunitiesShared";
import { BAND_ICON_MAP, Customer360 } from "@/components/customers/Customer360";
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
  requestSolutioning = null,
  createOptions = null,
  deal,
  bands,
  offerings,
  customerId,
  meetings,
}: {
  /** What this person may do to THIS deal — the privilege map joined to who is
   *  on the account and on the deal. Decided on the server. */
  verdict: { mayEdit: boolean; mayCreate: boolean; why: string };
  /** Server-rendered so the page can ask the privilege table before drawing
   *  it. Null when this person may not raise one. */
  requestSolutioning?: React.ReactNode;
  /** What the create dialogs need. Absent when this person may not create. */
  createOptions?: {
    customers: { id: string; name: string }[];
    opportunities: {
      id: string;
      label: string;
      customer: string;
      customerId: string | null;
    }[];
    members: string[];
  } | null;
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
  const [editing, setEditing] = useState(false);
  /**
   * ONE DIALOG, TWO DOORS (Anir, Aug 31: "I can add it from the edit page, or
   * I can add it by actually going to that tab... Both ways have to be
   * there"). The tab button and the Edit screen's section button both set
   * this, so the two entry points cannot drift into behaving differently.
   */
  const [creating, setCreating] = useState<string | null>(null);
  const router = useRouter();

  /**
   * ONE FIELD AT A TIME, THROUGH THE SAME API THE FORM USES.
   *
   * The update merges, so a single key leaves the rest of the record alone.
   * The server re-checks the same verdict this page was rendered with — the
   * badge is a courtesy, the route is the rule.
   */
  async function saveField(patch: Record<string, unknown>): Promise<string | null> {
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "update", id: deal.id, ...patch }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return data?.error || "That didn't save.";
      router.refresh();
      return null;
    } catch {
      return "That didn't save.";
    }
  }

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^0-9]/g, "")));
  const offeringNames = [
    ...deal.offeringIds
      .map((id) => offerings.find((o) => o.id === id)?.name)
      .filter((n): n is string => !!n),
    ...deal.offeringLabels,
  ];

  return (
    <div>
      {/* THE CREATE DIALOGS. Opened from the tab strip or from the Edit
          screen's sections — same state, same dialog, so the two doors cannot
          behave differently. */}
      {creating === "contracts" && (
        <NewContractDialog
          deal={deal}
          onClose={() => setCreating(null)}
          onCreated={() => router.refresh()}
        />
      )}
      {creating && creating !== "contracts" && creating !== "meetings" && createOptions && (
        <NewRequestDialog
          room={
            creating === "submissions"
              ? "submissions"
              : creating === "presentations"
                ? "presentations"
                : "requests"
          }
          customers={createOptions.customers}
          opportunities={createOptions.opportunities}
          members={createOptions.members}
          prefillCustomerId={customerId}
          prefillOpportunityId={deal.id}
          prefillCompany={deal.customer}
          prefillLead={null}
          onClose={() => setCreating(null)}
          onCreate={async (input) => {
            const type =
              creating === "submissions"
                ? "submission"
                : creating === "presentations"
                  ? "presentation"
                  : "request";
            const res = await fetch("/api/solutioning", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ op: "create", type, ...input }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.request) return false;
            setCreating(null);
            router.refresh();
            return true;
          }}
        />
      )}
      {editing && (
        <EditDealDialog
          deal={deal}
          bands={bands}
          onClose={() => setEditing(false)}
          /**
           * ADDING FROM A SECTION.
           *
           * Contracts and meetings have their own forms with their own
           * required fields, so those go to the module with this deal named
           * rather than growing a second half-form in here. The four
           * solutioning areas share one dialog, and the page already carries
           * the control that opens it — so the edit screen closes and hands
           * over rather than stacking a modal on a modal.
           */
          onAdd={(key) => {
            /* The Edit screen stays open behind it, so closing the create
               dialog puts you back exactly where you were — one destination,
               two doors. */
            setCreating(key);
          }}
          onCreated={() => router.refresh()}
          onSave={saveField}
        />
      )}
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
          {/* A BUTTON WHEN YOU MAY PRESS ONE, A BADGE WHEN YOU MAY NOT.
              Anir, Aug 31: "saying i can edit this doesnt help me at all...
              if i can edit it show me the fucking button."

              It used to say "You can edit this" and stop there. Every fact WAS
              editable, but the pencil only appeared once you hovered the exact
              line, so the page announced a capability and then showed nothing
              to press. Telling somebody they have permission is not the same
              as giving them the control.

              View-only still gets the badge and the reason, because there the
              sentence IS the whole answer. */}
          {/* Ask the Solutioning team for work on THIS deal. Sits before Edit
              because it is the thing you came here wanting to do when the
              Submissions and Presentations tabs read zero. */}
          {requestSolutioning}
          {verdict.mayEdit ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Pencil size={14} strokeWidth={2.2} />
              Edit deal
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-text-secondary">
              View only
              <InfoHint text={verdict.why} />
            </span>
          )}
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
              {/* THE OVERVIEW IS THE DASHBOARD.
                  Suren, Aug 31: "I need a dashboard which says... total
                  contract value, estimated annual contract value, that's fine.
                  And then... dashboard wise, should we have all these small
                  boxes, contract 0, submission 0, presentation 0 and below
                  that, give a link so that... here also you can go to the
                  submission."

                  The counts were only in the tab strip, which reads as
                  navigation rather than as a figure — you had to notice a
                  small number beside a word to learn there were three decks on
                  this deal. Here they are the thing itself, and each one opens
                  the list behind it, so the overview answers "what is on this
                  deal" without a click and gets you there with one. */}
              {/* A rep whose role opens none of these modules gets no bands at
                  all, and a heading over an empty grid is worse than no
                  section — so it only exists when there is something in it. */}
              {bands.length > 0 && (
              <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                  What is on this deal
                </h2>
                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                  {bands.map((b) => {
                    const Icon =
                      BAND_ICON_MAP[b.icon as keyof typeof BAND_ICON_MAP] ?? Target;
                    return (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => setTab(b.key)}
                        className="group flex cursor-pointer flex-col items-start gap-1.5 rounded-lg border border-border-light bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-blue-primary hover:shadow-card"
                      >
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-md"
                          style={{ background: `${b.color}14`, color: b.color }}
                        >
                          <Icon size={15} strokeWidth={1.9} />
                        </span>
                        <span className="tnum text-[20px] font-semibold leading-none text-text-primary">
                          {b.count}
                        </span>
                        <span className="text-[11.5px] leading-snug text-text-secondary group-hover:text-blue-primary">
                          {b.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
              )}
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
            {/* ONE QUIET BLOCK. It had four levels of uppercase grey — a card
                title, three section headings, and a label over every value —
                which is a lot of shouting for ten short facts, and the pairs
                left a hole in the right column wherever a group had an odd
                number ("I hate the way that looks. Still.").

                No section headings now: the pairing already groups them and a
                hairline says where one group ends. Labels are sentence case at
                reading size rather than tracked-out capitals. The order fills
                both columns so the right side never sits empty. */}
            <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
              <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                <EditableFact
                  label="Value"
                  value={value ? String(value) : ""}
                  kind="money"
                  stacked
                  canEdit={verdict.mayEdit}
                  format={(v) => money(Number(v))}
                  onSave={(v) => saveField({ value: num(v) ?? 0 })}
                />
                <EditableFact
                  label="Estimated ACV"
                  value={deal.estimatedAcv === undefined ? "" : String(deal.estimatedAcv)}
                  kind="money"
                  stacked
                  canEdit={verdict.mayEdit}
                  format={(v) => money(Number(v))}
                  onSave={(v) => saveField({ estimatedAcv: num(v) })}
                />
                <EditableFact
                  label="Estimated TCV"
                  value={
                    deal.estimatedTcv === undefined
                      ? tcv === undefined
                        ? ""
                        : String(tcv)
                      : String(deal.estimatedTcv)
                  }
                  kind="money"
                  stacked
                  canEdit={verdict.mayEdit}
                  hint={
                    deal.estimatedTcv === undefined && tcv !== undefined
                      ? "follows the deal's value"
                      : undefined
                  }
                  format={(v) => money(Number(v))}
                  onSave={(v) => saveField({ estimatedTcv: num(v) })}
                />
                <EditableFact
                  label="Confidence"
                  value={deal.confidence === undefined ? "" : String(deal.confidence)}
                  kind="percent"
                  stacked
                  canEdit={verdict.mayEdit}
                  format={(v) => `${v}%`}
                  onSave={(v) => saveField({ confidence: num(v) })}
                />
              </div>

              <div className="my-4 h-px bg-border-light" />

              <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                <EditableFact
                  label="Status"
                  value={deal.status ?? ""}
                  stacked
                  canEdit={verdict.mayEdit}
                  options={[
                    { value: "", label: "Not set" },
                    ...OPPORTUNITY_STATUSES.map((x) => ({ value: x, label: x })),
                  ]}
                  onSave={(v) => saveField({ status: v })}
                />
                <EditableFact
                  label="Revenue type"
                  value={deal.revenueType ?? ""}
                  stacked
                  canEdit={verdict.mayEdit}
                  options={[
                    { value: "", label: "Not set" },
                    ...REVENUE_TYPES.map((x) => ({ value: x, label: x })),
                  ]}
                  onSave={(v) => saveField({ revenueType: v })}
                />
                {/* Suren, Aug 31: "opportunity is missing one thing, what
                    type of opportunity... new business, existing business,
                    renewal, all of that comes along, so it's all part of the
                    overview." Sits beside Revenue type because the two get
                    read together and answer different questions. */}
                <EditableFact
                  label="Type of opportunity"
                  value={deal.dealType ?? ""}
                  stacked
                  canEdit={verdict.mayEdit}
                  options={[
                    { value: "", label: "Not set" },
                    ...DEAL_TYPES.map((x) => ({ value: x, label: x })),
                  ]}
                  onSave={(v) => saveField({ dealType: v })}
                />
                <EditableFact
                  label="Expected to sign"
                  value={signs ?? ""}
                  kind="date"
                  stacked
                  canEdit={verdict.mayEdit}
                  onSave={(v) => saveField({ estSignDate: v })}
                />
                <EditableFact
                  label="Owner"
                  value={deal.owner ?? ""}
                  placeholder="Nobody yet"
                  stacked
                  canEdit={verdict.mayEdit}
                  onSave={(v) => saveField({ owner: v.trim() })}
                />
              </div>

              <div className="my-4 h-px bg-border-light" />

              <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                <Row label="Offering" value={offeringNames.join(", ") || "None"} />
                <Row
                  label="Added"
                  value={new Date(deal.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                />
              </div>
            </section>
          </aside>
          </div>
        ) : (
          <Customer360
            chromeless
            forceKey={tab}
            company={deal.customer}
            bands={bands}
            /* An add button in every tab, beside the way out to the module.
               The tab that tells you there are none is the place you look for
               the way to make one. */
            bandActions={Object.fromEntries(
              bands.map((b) => [
                b.key,
                <AddToBandButton
                  key={b.key}
                  bandKey={b.key}
                  label={b.label}
                  onAdd={setCreating}
                />,
              ])
            )}
            emptyLine="Nothing is connected to this deal yet."
          />
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] leading-4 text-text-tertiary">{label}</p>
      <p
        className="truncate text-[13.5px] leading-5 font-semibold text-text-primary"
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

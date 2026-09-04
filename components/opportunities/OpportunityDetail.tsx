"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarCheck, ArrowLeft, ArrowUpRight, CalendarClock, FileSignature, Package, Pencil, Plus, Target } from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";
import { InfoHint } from "@/components/ui/InfoHint";
import { useRouter } from "next/navigation";
import { EditDealDialog } from "./EditDealDialog";
/* THE OVERVIEW TAB IS THE EDIT FORM (Suren, Sep 1: "This overview can be the
   edit deal, actually, and within the overview, let them edit if you want").
   The same component the /edit page renders, so the two cannot drift. */
import { DealOverviewEditor } from "./DealOverviewEditor";
import type { DealTeam } from "./DealPeople";
import { AddToBandButton } from "./AddToBandButton";
import { NewContractDialog } from "./NewContractDialog";
import { NewRequestDialog } from "@/components/solutioning/SolutioningModule";
/* THE MEETINGS TAB HAD NO WAY TO MAKE ONE. Its Add button set `creating` to a
   key nothing rendered, so the one control on an empty Meetings tab did
   nothing at all. This is the module's own form, which has carried
   prefillOpportunityId since the day it was written — "opened from a deal, so
   it arrives already attached to that deal" — and had never been opened from
   one. */
import { NewMeetingDialog } from "@/components/meetings/NewMeetingDialog";
import { useToast } from "@/components/ui/Toast";
/* THE ACCRUAL PLANNER ITSELF, not a link to it (Suren, Sep 1: "it's just that
   same screen shows up here"). The Revenue accruals module mounts this exact
   component; so does the Revenue accruals tab below. */
import {
  AccrualPlanDialog,
  type DealOption,
} from "@/components/accruals/AccrualPlanDialog";
import type { AccrualPlan } from "@/lib/revenueAccrualsShared";
import { BAND_ICON_MAP, Customer360 } from "@/components/customers/Customer360";
import type { Customer360Band } from "@/components/customers/Customer360";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { StatTile } from "@/components/ui/StatTile";
import {
  effectiveRevenueType,
  estimatedAcvOf,
  estimatedTcvOf,
  weightedValue,
  signDateOf,
  type Opportunity,
  statusColor,
} from "@/lib/opportunitiesShared";
import { cn, formatDate } from "@/lib/utils";
import { tint } from "@/lib/tint";

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
  "Go get": "var(--ink-teal-deep)",
  "High confidence": "var(--ink-bright-blue)",
  Pipeline: "var(--ink-violet-soft)",
  Future: "var(--ink-magenta)",
};

export function OpportunityDetail({
  verdict,
  accrual = null,
  requestSolutioning = null,
  createOptions = null,
  deal,
  bands,
  offerings,
  customers = [],
  people = [],
  meName = "",
  team = null,
  mayChangeTeam = false,
  mayChangeOwner = false,
  customerId,
  meetings,
}: {
  /** What this person may do to THIS deal — the privilege map joined to who is
   *  on the account and on the deal. Decided on the server. */
  verdict: { mayEdit: boolean; mayCreate: boolean; why: string };
  /**
   * WHAT THE REVENUE ACCRUALS TAB NEEDS TO OPEN ITS PLANNER HERE.
   *
   * Suren, Sep 1: "Create revenue accrual, we should do it at this level only
   * ... It's NOT a revenue accrual tab... both the screens have to be the
   * same. It's just that same screen shows up here."
   *
   * `mayPlan` is the module's WRITE question, answered on the server, so a
   * view-only person gets no button rather than a form that fails on Save.
   * `plan` is what is already on this deal, so the dialog opens on its months
   * instead of a blank form that would overwrite them. Null when this person
   * cannot see the accruals module at all, and then the band is not built
   * either.
   */
  accrual?: {
    mayPlan: boolean;
    deal: DealOption;
    plan: AccrualPlan | null;
  } | null;
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
    /** Customer-side people, for the meeting form's attendee picker. */
    contacts: { id: string; name: string; customerId: string | null; title: string }[];
    meName: string;
  } | null;
  deal: Opportunity;
  bands: Customer360Band[];
  offerings: { id: string; name: string; type?: string }[];
  /** The accounts this deal may be moved between, for the Overview form's
   *  customer picker. Empty leaves that one field read-only. */
  customers?: { id: string; name: string }[];
  /** The roster the owner is picked from. Empty falls back to a typed name. */
  people?: string[];
  /** Whoever is looking, so they are the first name on the owner list. */
  meName?: string;
  /** Who is recorded on this deal, for the Overview's People section. */
  team?: DealTeam;
  /** May this person change that list. The server's own answer. */
  mayChangeTeam?: boolean;
  /** Only an admin may reassign a deal (item 6). */
  mayChangeOwner?: boolean;
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
  const acv = estimatedAcvOf(deal);
  const tcv = estimatedTcvOf(deal);
  const level = effectiveRevenueType(deal);
  const [tab, setTab] = useState<string>("overview");
  const [editing, setEditing] = useState(false);
  /**
   * ONE DIALOG, TWO DOORS (Anir, Aug 31: "I can add it from the edit page, or
   * I can add it by actually going to that tab... Both ways have to be
   * there"). The tab button and the Edit screen's section button both set
   * this, so the two entry points cannot drift into behaving differently.
   */
  const [creating, setCreating] = useState<string | null>(null);
  /** The accrual planner, open on THIS deal. Mounted only while it is open, so
   *  it seeds itself from the plan the server just handed us. */
  const [planningAccrual, setPlanningAccrual] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

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

  /**
   * A MONTH ON THE ACCRUAL BAND IS NOT A LINK ANY MORE.
   *
   * lib/opportunity360 gives every accrual row `/revenue-accruals/{deal}` —
   * the standalone planning page, which is the screen Suren threw out ("I
   * don't want a different screen") and which now redirects to the module. So
   * following it would do the one thing this whole change exists to stop:
   * take somebody off the deal they are planning. The row still shows the
   * month, its amount and its one-time/recurring split; the way to CHANGE it
   * is the button beside the band, which opens the planner here.
   */
  const shownBands = bands.map((b) =>
    b.key === "revenueAccruals"
      ? {
          ...b,
          items: b.items.map((item) => {
            const row = { ...item };
            delete row.href;
            return row;
          }),
        }
      : b
  );


  return (
    <div>
      {/* THE CREATE DIALOGS. Opened from the tab strip or from the Edit
          screen's sections — same state, same dialog, so the two doors cannot
          behave differently. */}
      {/* THE ACCRUAL PLANNER, IN PLACE (Suren, Sep 1: "Create revenue accrual,
          we should do it at this level only... It's NOT a revenue accrual tab.
          I think the same screen from there, both the screens have to be the
          same. It's just that same screen shows up here").

          This used to be a <Link> to /revenue-accruals/{deal} — a second
          editor on a second page, reached from the tab, which is exactly what
          he rejected. Somebody planning revenue for a deal now never leaves
          the deal: the same dialog the Revenue accruals module opens is
          mounted right here, and saving refreshes the band underneath it.

          The picker inside has nothing to offer, because on a deal's own page
          the deal is not a question — it shows which deal is being planned and
          there is nowhere else to go. */}
      {planningAccrual && accrual && (
        <AccrualPlanDialog
          dealId={accrual.deal.id}
          deals={[accrual.deal]}
          pickable={[]}
          plans={accrual.plan ? [accrual.plan] : []}
          onClose={() => setPlanningAccrual(false)}
          /* The band is server rendered, so its rows and its total move once
             the server has been asked again. The dialog does that refresh
             itself; there is nothing to navigate to. */
          onSaved={() => undefined}
        />
      )}
      {creating === "contracts" && (
        <NewContractDialog
          deal={deal}
          onClose={() => setCreating(null)}
          onCreated={() => router.refresh()}
        />
      )}
      {/* A MEETING, PLANNED FROM THE DEAL IT IS ABOUT.
          The Meetings tab's Add button has always existed and has never worked:
          it set `creating` to "meetings", which the block below explicitly
          skips and nothing else answered, so the click did nothing. Same dialog
          the Meetings module opens, same endpoint, with the deal and its
          account already filled in — which is the one thing the module cannot
          do for you. */}
      {creating === "meetings" && createOptions && (
        <NewMeetingDialog
          meName={createOptions.meName}
          members={createOptions.members}
          customers={createOptions.customers}
          contacts={createOptions.contacts}
          opportunities={createOptions.opportunities}
          prefillOpportunityId={deal.id}
          prefillCustomerName={deal.customer}
          onClose={() => setCreating(null)}
          onCreate={async (input) => {
            const res = await fetch("/api/meetings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ op: "create", ...input }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) {
              toast(data?.error || "That didn't save.", "error");
              return false;
            }
            setCreating(null);
            router.refresh();
            return true;
          }}
        />
      )}
      {/* The TAB door opens a dialog of its own — there is no parent frame to
          be a page of. The Edit screen's sections render the same forms
          chromeless, inside the dialog already open. */}
      {/* Revenue accruals is excluded because it has a dialog of its own,
          mounted above, so it must never fall through to the solutioning
          form. */}
      {creating &&
        creating !== "contracts" &&
        creating !== "meetings" &&
        creating !== "revenueAccruals" &&
        createOptions && (
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
          mayEdit={verdict.mayEdit}
          /* THE MONTHS AND THE SCHEDULER, BOTH HERE NOW. Manoj still gets the
             whole month-on-month thing beside the deal's own fields (his items
             3 and 5); it is simply on the screen you open to change something,
             not on the one you open to read. Still the identical component the
             accruals module mounts, so the two cannot drift. */
          accrualPlan={accrual?.plan ?? null}
          accrualScheduler={
            accrual?.mayPlan ? (
              <AccrualPlanDialog
                inline
                dealId={accrual.deal.id}
                deals={[accrual.deal]}
                pickable={[]}
                plans={accrual.plan ? [accrual.plan] : []}
                onClose={() => undefined}
                onSaved={() => router.refresh()}
              />
            ) : null
          }
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
          createOptions={createOptions}
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

      {/* THE ACTIONS STAY ON THE RIGHT (Anir, Sep 4: "why is the button here?
          The request solutioning, the edit deal, and the convert to contract
          button should always be where it was before").

          `flex-wrap` and `truncate` were fighting: the title block has
          `min-w-0` and truncates, but a wrapping row lets it keep its natural
          width and pushes the buttons onto a line of their own instead. A deal
          called "GRI — GlaxoSmithkline Consumer Private Limited/ GSK Cx
          Services Co. Inc" is wide enough to do it every time.

          One row from `sm` up, so the name truncates and the buttons hold
          their corner; stacked below that, where there genuinely is not room
          for both. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
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
                  background: tint(LEVEL_TONE[level] ?? "var(--ink-violet-soft)", 8),
                  color: LEVEL_TONE[level] ?? "var(--ink-violet-soft)",
                }}
              >
                {level}
              </span>
              {/* THE STATUS IS A COLOURED PILL, like the category beside it
                  (Anir, Sep 3: "where you say 'under review' at the top or
                  whatever else it could be, I think you should have colours
                  for that"). It was grey body text between two dots — the one
                  fact on this line that changes as the deal moves, dressed as
                  punctuation. */}
              {deal.status && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold"
                  style={{
                    background: tint(statusColor(deal.status), 8),
                    color: statusColor(deal.status),
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: statusColor(deal.status) }}
                  />
                  {deal.status}
                </span>
              )}
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
            /* A PLACE, NOT A POP-UP (Anir, Sep 1: "the edit deal is actually
               not supposed to be a pop-up... it should be like the offerings
               page"). A link, so it can be opened in a tab, bookmarked and
               reloaded like the offering editor it is modelled on. */
            <Link
              href={`/opportunities/${deal.id}/edit`}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Pencil size={14} strokeWidth={2.2} />
              Edit deal
            </Link>
          ) : null}
          {/* NO "VIEW ONLY" PILL (Anir, Sep 1: "I don't want you to say 'view
              only'... that's just wasting space"). The absence of the Edit
              button already says it, and the access shield in the top bar
              answers it properly on hover — which is where he asked for the
              answer to live. */}
          {/* CONVERT TO CONTRACT, WHERE "OPEN IN THE PIPELINE" WAS (Manoj's
              change sheet, item 8: "Remove 'Open in Pipeline' and have
              'Convert to Contract' instead").

              The two are not the same kind of thing, and that is the point.
              "Open in the pipeline" navigated you back to the list you had
              just come from; Anir had already said of it, Aug 31, that "it
              doesn't look like the button that says 'Open in the pipeline'
              even does anything". This is the hand-off itself, and it is now
              the ONLY way a deal becomes a contract: item 7 removed "Create
              contract" as a status, so parking the deal somewhere no longer
              does it.

              It opens the same dialog the Contracts module opens, with the
              deal and its money already filled in. Owners and admins only —
              the same rule that gates Edit deal, because writing a contract
              off somebody else's deal is not a read. */}
          {verdict.mayEdit ? (
            <button
              type="button"
              onClick={() => setCreating("contracts")}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
            >
              <FileSignature size={14} strokeWidth={2.2} />
              Convert to contract
            </button>
          ) : null}
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
        {/* THE THIRD TILE IS TIME, NOT MORE MONEY.

            Weighted value was here and Suren took it out (Sep 1, reading the
            row out loud: "this weighted, and all — don't confuse him, take it
            out. This doesn't make sense, we don't use this actually"). It was
            TCV × confidence: a figure the app computed, that nobody at Freyr
            quotes, sitting between two figures people do. A third money tile
            was always going to be a third answer to a question already
            answered twice, which is why every replacement got removed too.

            So this one answers a different question. When is it signing, and
            is that date still ahead of us. It is a date somebody typed, not
            arithmetic; it is the field the whole accrual schedule is built
            against; and it is the only thing on this deal that goes wrong on
            its own, without anybody touching the record — which is exactly
            what a glance strip is for. Past its date and still open, it goes
            amber, the same warning the Revenue Accruals module already raises
            for the same fact ("close month passed, needs re-planning").

            Won or Lost, the countdown is meaningless and it says so rather
            than counting days toward a date that has stopped mattering. */}
        {(() => {
          const iso = signDateOf(deal);
          const settled = deal.status === "Won" || deal.status === "Lost";
          if (!iso) {
            return (
              <StatTile
                icon={CalendarCheck}
                label="Expected to sign"
                value="·"
                sub="no date on this deal yet"
              />
            );
          }
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const due = new Date(`${iso}T00:00:00`);
          const days = Math.round((due.getTime() - today.getTime()) / 86400000);
          const late = days < 0 && !settled;
          return (
            <StatTile
              icon={CalendarCheck}
              label="Expected to sign"
              value={formatDate(iso)}
              warn={late}
              color={late ? "var(--ink-amber)" : undefined}
              sub={
                settled
                  ? `the deal is ${String(deal.status).toLowerCase()}`
                  : days === 0
                    ? "today"
                    : days > 0
                      ? `in ${days} day${days === 1 ? "" : "s"}`
                      : `${-days} day${days === -1 ? "" : "s"} ago, still open`
              }
            />
          );
        })()}
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
        {shownBands.map((b) => (
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
          /* THE OVERVIEW IS THE EDIT FORM.

             Suren, Sep 1: "This overview can be the edit deal, actually, and
             within the overview, let them edit if you want," and then, plainly:
             "When I press Add a Deal, remember all the shit that's there has to
             be in the overview section underneath in little sections and
             stuff."

             So every field the Add a Deal form asks for is here, grouped into
             little titled sections, saving itself as it is changed. No trip to
             a separate screen for the thing this tab exists to show.

             THE RIGHT-HAND SUMMARY CARD IS GONE WITH IT. It restated Value,
             Estimated ACV, Estimated TCV, Confidence, Status, Revenue type,
             Type of opportunity, Expected to sign, Owner, Offering and Added,
             every one of them marked canEdit={false} — a read-only copy of the
             fields now sitting editable a few centimetres to its left. Suren's
             standing rule is breakdowns, not restatements. The two facts it
             carried that the form did not, the offering and the day the deal
             was added, are fields in "The deal" section now, so nothing went
             with it.

             Full width, because a 320px column beside a form is 320px of
             white. */
          <DealOverviewEditor
            deal={deal}
            /* THE SAME GATE THE EDIT BUTTON READS, decided on the server and
               re-checked by the API route on every write. A view-only person
               gets every field as a value and no way to post one. */
            mayEdit={verdict.mayEdit}
            /**
             * THE OVERVIEW SHOWS. IT DOES NOT EDIT.
             *
             * Anir, Sep 3, looking at a Save plan button sitting at the bottom
             * of a tab nobody scrolls: "I do not want the overview to have
             * anything to do with editing. Remove that. I have to press edit
             * deal to edit anything in the overview."
             *
             * So every field here reads as a value and the whole scheduler
             * moved into Edit deal, which is the one place a change is made
             * and the one place a Save button belongs. This is separate from
             * `mayEdit` on purpose: somebody who may edit still sees a plain
             * screen here rather than being told the deal is not theirs.
             */
            readOnly
            why={verdict.why}
            customers={customers}
            offerings={offerings}
            people={people}
            meName={meName}
            /* WHO IS ON THE DEAL, and whether this person may change that —
               both decided on the server, both re-checked by /api/record-team
               before it writes a single name. */
            team={team}
            mayChangeTeam={mayChangeTeam}
            mayChangeOwner={mayChangeOwner}
            /* THE SCHEDULE, INSIDE THE REVENUE ACCRUAL CARD (Manoj's sheet,
               items 3 and 5: "Under Revenue Accrual, provide Revenue Accrual
               schedule"). The card had the currency and the two estimates and
               stopped there. Read-only here and edited in the one accrual
               screen, because Suren was explicit on Sep 1 that there is only
               one: "both the screens have to be the same." */
            accrualPlan={accrual?.plan ?? null}
            onSave={saveField}
          >
            {meetings.length > 0 && (
              <section className="rounded-2xl border border-border-light bg-white p-5 shadow-card">
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
          </DealOverviewEditor>
        ) : (
          <Customer360
            chromeless
            /* Each area says its own sentence when it is empty, rather than
               the panel's generic "Nothing on X for {company} yet." — which
               names the ACCOUNT on a page about one deal and tells you
               nothing about what to do next. Revenue accruals is the reason
               it matters: empty, that tab's only job is to say where the plan
               gets made. */
            bandEmpty
            forceKey={tab}
            company={deal.customer}
            bands={shownBands}
            /* An add button in every tab, beside the way out to the module.
               The tab that tells you there are none is the place you look for
               the way to make one. */
            bandActions={Object.fromEntries(
              shownBands.map((b) => [
                b.key,
                /* REVENUE ACCRUALS OPENS ITS PLANNER RIGHT HERE (Suren,
                   Sep 1: "we can enter accrued revenue... the accruals
                   actually go into the revenue accrual module, but you can
                   enter from here. You can have this tab, and then you can
                   create accrual for it" — and, on the screen it opens: "I
                   think the same screen from there, both the screens have to
                   be the same. It's just that same screen shows up here").

                   The plan still lives in the accruals module and there is
                   still exactly one of it per deal; what changed is that
                   writing it does not send you to another page. Same
                   component, same months, same save — mounted above.

                   NO BUTTON WHEN YOU MAY NOT WRITE ONE. The months are still
                   listed and the way out to the module is still on the panel;
                   only the editing door is gated, and it is gated on the
                   server's answer to the same question the API asks. */
                b.key === "revenueAccruals" ? (
                  accrual?.mayPlan ? (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setPlanningAccrual(true)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
                    >
                      {b.count === 0 ? (
                        <Plus size={13} strokeWidth={2.4} />
                      ) : (
                        <Pencil size={13} strokeWidth={2.4} />
                      )}
                      {b.count === 0 ? "Add accrual" : "Open the plan"}
                    </button>
                  ) : null
                ) : (
                  <AddToBandButton
                    key={b.key}
                    bandKey={b.key}
                    label={b.label}
                    onAdd={setCreating}
                  />
                ),
              ])
            )}
            emptyLine="Nothing is connected to this deal yet."
          />
        )}
      </div>
    </div>
  );
}

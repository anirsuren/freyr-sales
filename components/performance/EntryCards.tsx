"use client";

import { Fragment, useEffect, useState } from "react";
import {
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileText,
  Hourglass,
  Paperclip,
  PenLine,
  RotateCcw,
  ShieldCheck,
  Trash2,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import {
  ENTRY_COLOR,
  GOAL_PROGRESS_COLOR,
  awaitingTheirFix,
  canVerifyEntry,
  stampedAt,
  entryStatus,
  goalFamilyActuals,
  inGoalCurrency,
  isPending,
  fmtAmount,
  parseAmountInput,
  pctMet,
  verificationQueue,
  headedGroups,
  type PerfActual,
  type PerformanceState,
} from "@/lib/performanceShared";
import { currencyMeta, withCommas } from "@/lib/currency";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyFan } from "@/components/ui/CompanyFan";
import { EvidencePeek, EvidencePreview } from "./EvidenceViewer";
import { EvidencePicker } from "./EvidencePicker";
import { SegmentValues } from "./bits";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { cn, formatDate } from "@/lib/utils";
import type { RunOp } from "./PerformanceModule";
import { typeMeta, GroupPill } from "./bits";
import { tint } from "@/lib/tint";
import { DateText } from "@/components/ui/DateText";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { useStoredView } from "@/lib/useStoredView";
import { expandMoneyShorthand } from "@/lib/moneyShorthand";
import { OptionalMark, RequiredMark } from "@/components/ui/RequiredMark";

/**
 * THE EVIDENCE-AND-VERIFICATION SURFACES (Suren, Aug 13).
 *
 * A claim is logged with proof attached; it WAITS until the group owner —
 * and only the group owner — checks the attachment and locks it. Verified
 * money is the only money that rolls up. These two cards are that story on
 * the People tab: what I claimed and where it stands, and, for a group
 * owner, everything waiting on them.
 */

function goalChip(
  state: PerformanceState,
  goalId: string,
  { compact = false }: { compact?: boolean } = {}
) {
  const goal = state.goals.find((g) => g.id === goalId);
  if (!goal) return null;
  const meta = typeMeta(goal.type);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[12px] font-semibold leading-4",
        compact
          ? "max-w-full whitespace-nowrap"
          : "max-w-[340px] whitespace-normal"
      )}
      style={{ background: tint(meta.color, 10), color: meta.color }}
      title={compact ? goal.name : undefined}
    >
      <span className={compact ? "truncate" : undefined}>{goal.name}</span>
    </span>
  );
}

function EvidenceLinks({
  entry,
  compact = false,
}: {
  entry: PerfActual;
  compact?: boolean;
}) {
  if (!entry.evidence?.length) {
    return (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-text-tertiary"
        title="No attachment"
      >
        <Paperclip size={12} strokeWidth={2} aria-hidden="true" />
        {compact ? "None" : "No attachment"}
      </span>
    );
  }
  const count = entry.evidence.length;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold text-blue-primary"
      title={`${count} ${count === 1 ? "document" : "documents"}`}
    >
      <Paperclip size={12} strokeWidth={2.2} aria-hidden="true" />
      {compact ? `${count} ${count === 1 ? "file" : "files"}` : `${count} ${count === 1 ? "document" : "documents"}`}
    </span>
  );
}

/** The customer as a face, never a string (Anir, Aug 15). */
function CustomerCell({
  customer,
  customerId,
  logoClassName,
  max = 6,
}: {
  customer?: string;
  customerId?: string;
  logoClassName?: string;
  max?: number;
}) {
  const names = (customer ?? "")
    .split(/\s*\+\s*/)
    .map((n) => n.trim())
    .filter(Boolean);
  return (
    <CompanyFan
      logoClassName={logoClassName}
      max={max}
      companies={names.map((raw, i) => {
        const [name, ...relationship] = raw.split(/\s*·\s*/);
        return {
          name: name.trim(),
          context: relationship.length
            ? `Customer · ${relationship.join(" · ")}`
            : "Customer account",
          // The id only ever belongs to the account that was picked, which is
          // the first one named; the rest are free text.
          id: i === 0 ? customerId : undefined,
        };
      })}
    />
  );
}

function compactPersonName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts.at(-1)?.charAt(0)}.`;
}

export function StatusPill({
  entry,
  onUnlock,
  onVerify,
  waitingOnMe = false,
  onOpen,
  owners,
}: {
  entry: PerfActual;
  /** Present only for someone who may reopen this claim. */
  onUnlock?: () => void;
  /** Present when the reader can sign this one off from right here. */
  onVerify?: () => void;
  /** The reader is the group owner who has to check this one. */
  waitingOnMe?: boolean;
  /**
   * Expand the row this pill sits on (Anir, Aug 20: "When I see 'Sent back,'
   * I should be able to click on the 'Sent back,' right?"). A rejection is
   * the one status that comes with homework, so the badge announcing it has
   * to be the way to the note rather than a label you then hunt around.
   */
  onOpen?: () => void;
  /** The group head(s) who can verify this claim — their face rides on the
   *  waiting pill (Anir, Aug 22: "I need to see who the group owner is, like
   *  a profile picture — if it says waiting for owner I should be able to
   *  see that right here"). */
  owners?: string[];
}) {
  if (entryStatus(entry) === "verified") {
    if (onUnlock) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUnlock();
          }}
          title="Unlock this claim and send it back"
          className="group/st inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-[rgba(22,163,74,0.12)] px-2.5 py-1 text-[11.5px] font-bold text-[color:#16A34A] transition-colors hover:bg-[rgba(220,38,38,0.12)] hover:text-[color:var(--status-red)]"
        >
          <CheckCircle2
            size={12}
            strokeWidth={2.4}
            className="group-hover/st:hidden"
          />
          <RotateCcw
            size={12}
            strokeWidth={2.4}
            className="hidden group-hover/st:block"
          />
          {/* Same fixed-width trick as the waiting pill below. */}
          <span className="grid">
            <span className="col-start-1 row-start-1 group-hover/st:invisible">
              Verified · locked
            </span>
            <span className="invisible col-start-1 row-start-1 group-hover/st:visible">
              Unlock and send back
            </span>
          </span>
        </button>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[rgba(22,163,74,0.12)] px-2.5 py-1 text-[11.5px] font-bold text-[color:#16A34A]">
        <CheckCircle2 size={12} strokeWidth={2.4} /> Verified · locked
      </span>
    );
  }
  /* SENT BACK BEATS EVERY OTHER READING OF "not verified". Somebody looked at
     this claim and rejected it: that is a person waiting on a fix, not a queue
     waiting its turn, and the row has to say so before it says anything else.
     Red and an exclamation, the two things Anir asked for by name. */
  if (wasSentBack(entry)) {
    const pill = (
      <>
        <AlertCircle size={13} strokeWidth={2.6} />
        Sent back &middot; needs a fix
        {/* THE FACE OF WHOEVER REJECTED IT, right on the badge (Anir, Aug 20:
            "I can't see who sent it back. I can see the reason, though"). The
            reason without the author is an instruction from nobody. */}
        {entry.sentBackBy && (
          <Avatar
            name={entry.sentBackBy}
            className="h-[17px] w-[17px] shrink-0 text-[7.5px]"
          />
        )}
      </>
    );
    if (onVerify && waitingOnMe) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onVerify();
          }}
          title="You sent this back. Open it to check the fix and sign it off"
          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-[rgba(220,38,38,0.10)] px-2.5 py-1 text-[11.5px] font-bold text-[color:var(--ink-red)] transition-colors hover:bg-[rgba(220,38,38,0.16)]"
        >
          {pill}
        </button>
      );
    }
    if (onOpen) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          title={
            entry.sentBackBy
              ? `${entry.sentBackBy} sent this back. Click to fix it`
              : "Click to fix this claim"
          }
          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-[rgba(220,38,38,0.10)] px-2.5 py-1 text-[11.5px] font-bold text-[color:var(--ink-red)] transition-colors hover:bg-[rgba(220,38,38,0.18)]"
        >
          {pill}
        </button>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[rgba(220,38,38,0.10)] px-2.5 py-1 text-[11.5px] font-bold text-[color:var(--ink-red)]">
        {pill}
      </span>
    );
  }
  /* IF IT IS WAITING ON YOU, SIGN IT OFF FROM HERE (Anir, Aug 19: "I'm
     scrolling down to that exact spot. It should let me verify from there
     too. Why only at the top?"). Same hover-swap as the locked pill. */
  if (onVerify && waitingOnMe) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onVerify();
        }}
        title="Check this claim and sign it off"
        className="group/st inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-[color:var(--entry-waiting-bg)] px-2.5 py-1 text-[11.5px] font-bold text-[color:var(--entry-waiting-ink)] transition-colors hover:bg-[rgba(22,163,74,0.12)] hover:text-[color:#16A34A]"
      >
        <Hourglass size={12} strokeWidth={2.4} className="group-hover/st:hidden" />
        <CheckCircle2
          size={12}
          strokeWidth={2.4}
          className="hidden group-hover/st:block"
        />
        {/* BOTH LABELS SHARE ONE GRID CELL, so the pill is always as wide as
            its longest word and hovering swaps text without nudging the table
            (Anir, Aug 19: "it glitches out, it shouldn't even be moving the
            table. It should just be changing the button"). */}
        <span className="grid">
          <span className="col-start-1 row-start-1 group-hover/st:invisible">
            Waiting for you to verify
          </span>
          <span className="invisible col-start-1 row-start-1 group-hover/st:visible">
            Review and verify
          </span>
        </span>
      </button>
    );
  }
  const heads = owners ?? [];
  return (
    <span
      /* The face says who; the tooltip spells the name without opening. */
      title={
        !waitingOnMe && heads.length > 0
          ? `Waiting for ${heads.join(" or ")} to verify`
          : undefined
      }
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[color:var(--entry-waiting-bg)] py-1 pl-2.5 pr-1.5 text-[11.5px] font-bold text-[color:var(--entry-waiting-ink)]"
    >
      <Hourglass size={12} strokeWidth={2.4} className="shrink-0" />
      {waitingOnMe ? "Waiting for you to verify" : "Waiting for the group owner"}
      {!waitingOnMe && heads.length > 0 && (
        <span className="flex shrink-0 items-center -space-x-1.5">
          {heads.slice(0, 2).map((n) => (
            <Avatar
              key={n}
              name={n}
              className="h-[18px] w-[18px] shrink-0 text-[7px] ring-2 ring-[color:#E4EFFC]"
            />
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * WHAT HAPPENED TO THIS CLAIM, IN ORDER (Anir, Aug 19: "I want a timeline...
 * I need to know when it was verified. It's telling me the date when I had an
 * idea"). The row used to show only the result date, so a claim that had been
 * checked and locked looked identical to one nobody had touched.
 */
/**
 * A STAMP IS A DAY AND A CLOCK TIME (Anir, Aug 20: "I need the time too. I
 * can't just have the date. The time should be right under"). Two claims
 * logged on the same day were indistinguishable, so "why are there two?" had
 * no answer on the row itself. Date-only values — the result date, which is
 * a day someone picked, not a moment — have no clock to show and say so by
 * omission rather than by inventing midnight.
 */
export function stamp(iso?: string): {
  day?: string;
  /** The same day, spelled the way the rest of the app spells a date. */
  label?: string;
  time?: string;
} {
  if (!iso) return {};
  const day = iso.slice(0, 10);
  /* TWO FIELDS, BECAUSE THIS ONE IS BOTH READ AND COMPARED (found in the loop,
     Sep 4: the goal hover card printed "2026-08-17" where the rest of the app
     writes "Aug 17, 2026" -- the same raw-ISO leak already fixed in
     Solutioning).

     `day` cannot simply be formatted in place: callers build a Date out of it
     and test it against other ISO date strings, so reformatting it here would
     break the logic quietly rather than loudly. `label` is its display twin,
     and every site that only PRINTS the date now uses that. */
  const label = formatDate(day);
  if (iso.length <= 10) return { day, label };
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return { day, label };
  return {
    day,
    label,
    time: t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  };
}

/**
 * THE SAME MOMENT, SPELLED OUT (Anir, Aug 23: "everywhere I have the date I
 * need the time too"). The timeline printed "2026-08-23 · 6:04 PM" — a
 * machine's date bolted to a person's clock. Every other date in the app says
 * its month in words, for the reason that has never changed: 08/09 is two
 * different days depending on which office is reading it.
 */
function stampWords(iso?: string): { day?: string; time?: string } {
  const raw = stamp(iso);
  if (!raw.day) return raw;
  const t = new Date(iso!.length <= 10 ? `${raw.day}T12:00:00` : iso!);
  if (Number.isNaN(t.getTime())) return raw;
  return {
    day: t.toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    time: raw.time,
  };
}

export function EntryTimeline({
  entry,
  person,
  owners,
}: {
  entry: PerfActual;
  person: string;
  /** Group head(s) the claim is waiting on — named on the waiting step, so
   *  the expanded row answers "waiting on WHOM" without a hunt. */
  owners?: string[];
}) {
  /**
   * A MARK AND A COLOUR PER STEP (Anir, Aug 19: "each of them should have a
   * different color/icon. A log should have a color, a result happening
   * should have an icon"). Four identical blue dots said only "something
   * happened" four times. The colours are the ones this app already assigns:
   * green is signed off, orange is waiting, red is a problem, blue is a
   * person's own action, teal is the event out in the world.
   */
  const steps: {
    label: string;
    who?: string;
    when?: string;
    done: boolean;
    note?: string;
    /** Shown in place of a date when that step never recorded one. */
    fallback?: string;
    /** This step is a problem, not a milestone — drawn red. */
    alert?: boolean;
    icon: LucideIcon;
    color: string;
  }[] = [
    {
      label: "Result happened",
      when: entry.date,
      done: true,
      icon: CalendarCheck2,
      color: "var(--ink-teal)",
    },
    {
      label: "Logged",
      who: entry.addedBy || person,
      when: entry.addedAt,
      done: true,
      icon: PenLine,
      color: "var(--ink-bright-blue)",
    },
  ];
  if (entry.managerNote || entry.sentBackBy || entry.sentBackAt) {
    /* A rejection with no note is still a rejection (Aug 23 audit): gating
       this step on the note alone made a note-less send-back vanish from the
       timeline while the red pill on the row still shouted about it. */
    steps.push({
      label: "Sent back",
      // The rejection carries its author now — a note from nobody left the
      // rep with nobody to go ask about it.
      who: entry.sentBackBy,
      when: entry.sentBackAt,
      fallback: entry.sentBackAt ? undefined : "date not recorded",
      note: entry.managerNote,
      done: true,
      // The one step on the rail that is a problem, so it is the one step
      // that is red — until it is answered, below.
      alert: wasSentBack(entry),
      icon: AlertCircle,
      color: ENTRY_COLOR.sent_back,
    });
    if (entry.resubmittedAt) {
      steps.push({
        label: "Fixed and sent back up",
        who: entry.addedBy || person,
        when: entry.resubmittedAt,
        done: true,
        icon: RotateCcw,
        color: "var(--ink-violet-soft)",
      });
    }
  }
  steps.push(
    entryStatus(entry) === "verified"
      ? {
          label: "Verified and locked",
          who: entry.verifiedBy,
          when: entry.verifiedAt,
          // A handful of claims were signed off before sign-off recorded a
          // date. Saying so beats a blank line under the step, and beats
          // borrowing another step's date and calling it the verification.
          fallback: entry.verifiedAt ? undefined : "date not recorded",
          done: true,
          icon: ShieldCheck,
          color: ENTRY_COLOR.verified,
        }
      : {
          label: "Waiting to be verified",
          // The name and face of who has to act — the pill shows the face,
          // this line says it in words.
          who: owners?.[0],
          done: false,
          icon: Hourglass,
          // Waiting is amber in the app-wide scheme (green counts and red was
          // refused), matching the pill and striped progress segment.
          color: ENTRY_COLOR.reported,
        }
  );

  // NEWEST FIRST (Anir, Aug 19: "Most recent at the top"). The list is built
  // oldest-to-newest because that is how the events happen; it is read the
  // other way round, the way every other feed in the app runs.
  steps.reverse();

  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
        Timeline
      </span>
      <ol className="mt-2 space-y-0">
        {steps.map((step, i) => (
          <li key={step.label} className="flex gap-2.5">
            {/* The rail: each step's own mark in its own colour, on a tinted
                disc so the icons read as one family, joined by a line. A step
                that has not happened yet is drawn hollow and grey — the shape
                still says which step it is. */}
            <span className="flex flex-col items-center">
              <span
                className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full"
                style={
                  step.done
                    ? { background: tint(step.color, 12), color: step.color }
                    : {
                        boxShadow: "inset 0 0 0 1.5px var(--border-light)",
                        color: "var(--text-tertiary)",
                      }
                }
              >
                <step.icon size={12.5} strokeWidth={2.5} />
              </span>
              {i < steps.length - 1 && (
                <span className="w-[2px] flex-1 bg-[color:var(--border-light)]" />
              )}
            </span>
            <span className={cn("min-w-0 pb-3 pt-0.5", i === steps.length - 1 && "pb-0")}>
              <span
                className={cn(
                  "block text-[12.5px] font-semibold",
                  step.done ? "text-text-primary" : "text-text-tertiary"
                )}
              >
                {step.label}
              </span>
              {/* A NAME IN THIS APP COMES WITH A FACE (Anir, Aug 19: "I need
                  profile pictures, bro, when u say my name or whoever"). The
                  rest of the row already pairs the two; a bare string here
                  read like a different kind of thing. */}
              {/* THE CLOCK BELONGS TO THE DATE (Anir, Aug 20: "put the time
                  after the date, not the name"). The time had been split onto
                  its own line under the person, which read as a third fact
                  about them rather than the rest of the stamp. When and who
                  are two lines now, in that order, each whole. */}
              <span className="flex flex-wrap items-baseline gap-x-1.5 text-[11.5px] text-text-secondary">
                <span className={cn(!step.when && "italic text-text-tertiary", "tnum")}>
                  {stampWords(step.when).day ??
                    step.fallback ??
                    (step.done ? "" : "not yet")}
                </span>
                {stampWords(step.when).time && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="tnum text-text-tertiary">
                      {stampWords(step.when).time}
                    </span>
                  </>
                )}
              </span>
              {step.who && (
                <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-text-secondary">
                  <Avatar
                    name={step.who}
                    className="h-[18px] w-[18px] shrink-0 text-[8px]"
                  />
                  {step.who}
                </span>
              )}
              {step.note && (
                <span className="mt-0.5 block text-[11.5px] text-text-secondary">
                  <span className="font-semibold not-italic">Their note: </span>
                  <span className="italic">&ldquo;{step.note}&rdquo;</span>
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * SENT BACK IS ITS OWN STATE, AND IT SHOUTS (Anir, Aug 19: "if it's sent back
 * it has to look more prominent than this. it's super important if it's sent
 * back... exclamation mark for sure. and make it red").
 *
 * The data has only two statuses — reported and verified — so a claim the
 * group owner rejected looked exactly like one nobody had opened yet: a blue
 * "waiting" pill and a pale note at the bottom of the panel. The note on a
 * reported claim is the rejection, and that is the loudest thing on the row.
 */
export function wasSentBack(entry: PerfActual): boolean {
  // Only while it is still unanswered. Once the person fixes it, the claim is
  // waiting on the owner again and stops shouting — the timeline keeps the
  // history either way.
  return awaitingTheirFix(entry);
}

/** The date this claim last moved: verified beats logged beats happened. */
function lastMoved(entry: PerfActual): string {
  return entry.verifiedAt ?? entry.addedAt ?? entry.date;
}

/** One labelled fact in the expanded row. */
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
        {label}
      </span>
      <span className="mt-1 block text-[13.5px] font-medium text-text-primary">
        {children}
      </span>
    </div>
  );
}

/**
 * LOGGED RESULTS — a real table, and every row opens (Anir, Aug 15: "it should
 * be like a more detailed table… it should probably be like a dropdown").
 *
 * Collapsed, it answers who / what / how much / for whom / when / proof /
 * where it stands, in aligned columns. Open, it adds everything the row cannot
 * hold: the exact goal and subgoal, the deal, when it was entered, who locked
 * it and when, the note it came back with, and the proof as thumbnails you
 * click to see full size.
 */
/**
 * YOUR REJECTED CLAIMS, AT THE TOP OF THE PAGE (Anir, Aug 20: "it's still not
 * showing me this at the top... especially if it's sent back, because it needs
 * my action item").
 *
 * A group owner has had a loud amber queue at the top of this screen for a
 * while. The person on the other end of it had nothing: a rejection lived in a
 * status column near the bottom of a table called "Logged results", below two
 * charts, which is a place you find only if you already knew to look. This is
 * the same idea in red — it is not work waiting its turn, it is work somebody
 * has already refused.
 */
/** The hairline between two facts on one row. A gap alone reads as a run-on
 *  sentence; a rule says where one fact ends and the next begins. */
function Rule() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-px shrink-0 bg-[color:var(--border-light)]"
    />
  );
}

/**
 * WHAT YOU SENT BACK, AND WHO IS SITTING ON IT.
 *
 * Anir, Aug 24, minutes after rejecting a claim: "I sent it back but nothing's
 * there. Where the fuck did it go? Is it in People performance? Where is the
 * shit that I just sent back? It's not showing up anywhere."
 *
 * He was right, and the send-back had worked perfectly — the claim was
 * `sent_back` with his note on it within the second. The hole was on HIS side.
 * A rejected claim leaves the verify queue on purpose (it is no longer waiting
 * on him) and lands on the rep's screen as a red card, so the person who has to
 * act sees it. The person who ASKED for the fix got one sentence of grey text
 * at the bottom of an empty queue — "1 claim is sent back and waiting on them
 * to fix" — with no row, no name, no amount and nothing to click.
 *
 * So a manager could not answer "what am I waiting on?" without signing in as
 * each of their reps. This is that list: every claim this reader rejected that
 * is still unfixed, newest first, with the note they wrote so they do not have
 * to remember what they asked for.
 *
 * Red rail like the rep's card — it is the same claim in the same state — but
 * no "Fix it" button, because it is not theirs to fix.
 */
export function SentBackWatchCard({
  state,
  meName,
}: {
  state: PerformanceState;
  meName: string;
}) {
  const [panelView, setPanelView] = useStoredView<"open" | "closed">(
    "freyr.performance.sent-back-watch",
    "closed",
    ["open", "closed"]
  );
  const expanded = panelView === "open";
  const waiting = state.actuals
    .filter(
      (a) =>
        awaitingTheirFix(a) &&
        // Their own rejected claims are the rep-facing SentBackCard's job; this
        // card is about other people's, so the two never print the same row.
        a.person.trim().toLowerCase() !== meName.trim().toLowerCase() &&
        canVerifyEntry(state, meName, a.person)
    )
    .sort((a, b) => ((a.sentBackAt ?? "") < (b.sentBackAt ?? "") ? 1 : -1));
  if (waiting.length === 0) return null;
  /* WHOSE MOVE IT IS, IN THE COLOUR THAT MEANS IT (Anir, Aug 30: "is this the
     person I chose, or is this me? If you're saying it's a call to action,
     where's the button to fix it?").

     Two things were wrong. It was drawn in alarm red with a red rail, which in
     this app means something is broken and yours to fix — so he looked for a
     button that cannot exist, because the fix belongs to the person you sent it
     back to. And it says "You", which stays true while the page's person picker
     moves under it, so on somebody else's goals it read as being about them.

     Amber is this app's waiting colour, the same one the verification queue
     uses, and the heading now names who it is with. Nothing for you to press,
     and it no longer pretends otherwise. */
  const withWhom = [...new Set(waiting.map((a) => a.person.split(" ")[0]))];
  return (
    <Card className="relative overflow-hidden border-[rgba(180,83,9,0.35)] p-0">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[5px] bg-[color:#B45309]"
      />
      <button
          type="button"
          onClick={() => setPanelView(expanded ? "closed" : "open")}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide sent-back claims" : "Show sent-back claims"}
          className="flex w-full cursor-pointer items-start gap-2 border-b border-[rgba(180,83,9,0.2)] bg-[rgba(180,83,9,0.06)] px-4 py-3 text-left transition-colors hover:bg-[rgba(180,83,9,0.1)]"
        >
        <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center text-[color:var(--ink-amber)]">
          <ChevronDown size={15} strokeWidth={2.4} className={cn("transition-transform", !expanded && "-rotate-90")} />
        </span>
        <RotateCcw
          size={16}
          strokeWidth={2.4}
          aria-hidden="true"
          className="mt-px shrink-0 text-[color:var(--ink-amber)]"
        />
        <span className="min-w-0">
          <h3 className="text-[13.5px] font-bold text-[color:var(--ink-amber)]">
            {waiting.length} {waiting.length === 1 ? "claim you" : "claims you"}{" "}
            sent back, waiting on{" "}
            {withWhom.length === 1
              ? withWhom[0]
              : `${withWhom.length} people`}
          </h3>
          <span className="mt-0.5 block text-[12.5px] text-text-secondary">
            Nothing for you to do until they re-submit. It counts once they fix
            it and you sign it off.
          </span>
        </span>
      </button>
      <div className="freyr-fold" data-open={expanded ? "true" : "false"}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] table-fixed border-collapse">
            <colgroup>
              <col className="w-[4%]" />
              <col className="w-[8%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
              <col className="w-[16%]" />
              <col className="w-[26%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border-light bg-surface/50 text-left text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary [&>th]:whitespace-nowrap">
                <th className="px-4 py-2.5">#</th>
                <th className="px-4 py-2.5">Result</th>
                <th className="px-4 py-2.5">Goal</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Waiting on</th>
                <th className="px-4 py-2.5">Sent back</th>
                <th className="px-4 py-2.5">Your note</th>
              </tr>
            </thead>
            <tbody>
              {waiting.map((a, index) => {
                const goal = state.goals.find((g) => g.id === a.goalId);
                return (
                  <tr key={a.id} className="align-middle transition-colors hover:bg-surface/70">
                    <td className="px-4 py-3.5 text-[13px] font-bold text-text-tertiary tnum">
                      {index + 1}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-[14px] font-bold text-text-primary tnum">
                      {goal ? fmtAmount(goal.unit, a.amount, a.currency) : a.amount}
                    </td>
                    <td className="px-4 py-3.5">
                      {goal ? goalChip(state, goal.id) : (
                        <span className="text-[12.5px] text-text-tertiary">Goal removed</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <CustomerCell customer={a.customer} customerId={a.customerId} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={a.person} className="h-8 w-8 shrink-0 text-[10px]" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-text-primary">
                            {a.person}
                          </span>
                          <span className="mt-0.5 block text-[10.5px] font-semibold text-[color:var(--ink-amber)]">
                            Their move
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] text-text-secondary tnum">
                      {a.sentBackAt ? stampedAt(a.sentBackAt) : "Not recorded"}
                    </td>
                    <td className="px-4 py-3.5">
                      {a.managerNote ? (
                        <span className="block break-words rounded-lg bg-[rgba(180,83,9,0.06)] px-2.5 py-2 text-[12px] leading-4 text-text-secondary">
                          &ldquo;{a.managerNote}&rdquo;
                        </span>
                      ) : (
                        <span className="text-[12px] text-text-tertiary">No note</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

export function SentBackCard({
  state,
  person,
  isMe,
  onFix,
}: {
  state: PerformanceState;
  person: string;
  isMe: boolean;
  onFix: (entryId: string) => void;
}) {
  const [panelView, setPanelView] = useStoredView<"open" | "closed">(
    "freyr.performance.sent-back",
    "closed",
    ["open", "closed"]
  );
  const expanded = panelView === "open";
  const rejected = state.actuals
    .filter(
      (a) =>
        a.person.trim().toLowerCase() === person.trim().toLowerCase() &&
        awaitingTheirFix(a)
    )
    .sort((a, b) => ((a.sentBackAt ?? "") < (b.sentBackAt ?? "") ? 1 : -1));
  if (rejected.length === 0) return null;
  const who = person.split(" ")[0];
  return (
    <Card className="relative overflow-hidden border-[rgba(220,38,38,0.5)] p-0">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[5px] bg-[color:#DC2626]"
      />
      <button
          type="button"
          onClick={() => setPanelView(expanded ? "closed" : "open")}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide claims needing a fix" : "Show claims needing a fix"}
          className="flex w-full cursor-pointer items-start gap-2 border-b border-[rgba(220,38,38,0.25)] bg-[rgba(220,38,38,0.07)] px-4 py-3 text-left transition-colors hover:bg-[rgba(220,38,38,0.11)]"
        >
        <span className="mt-px flex h-6 w-6 shrink-0 items-center justify-center text-[color:var(--ink-red)]">
          <ChevronDown size={15} strokeWidth={2.4} className={cn("transition-transform", !expanded && "-rotate-90")} />
        </span>
        <AlertCircle
          size={16}
          strokeWidth={2.4}
          aria-hidden="true"
          className="mt-px shrink-0 text-[color:var(--ink-red)]"
        />
        <span className="min-w-0">
          <h3 className="text-[13.5px] font-bold text-[color:var(--ink-red)]">
            {isMe
              ? `Sent back to you. ${rejected.length} result${rejected.length === 1 ? "" : "s"} need${rejected.length === 1 ? "s" : ""} a fix`
              : `Sent back to ${who}. ${rejected.length} waiting on them`}
          </h3>
          <span className="mt-0.5 block text-[12.5px] text-text-secondary">
            {isMe
              ? "None of it counts toward your goals until you fix it and it is verified."
              : "None of it counts until they fix it."}
          </span>
        </span>
      </button>
      <div className="freyr-fold" data-open={expanded ? "true" : "false"}>
        <ul className="divide-y divide-border-light">
        {rejected.map((a) => {
          const goal = state.goals.find((g) => g.id === a.goalId);
          return (
            /* ONE LINE, IN COLUMNS (Anir, Aug 20: "the orientation is
               weird. maybe do put on one line but separate properly"). It was
               a run-on sentence first and a two-line stack second; neither
               told you where one fact ended and the next began. Same row,
               divided — money, goal, who and when, their note, the button. */
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <b className="shrink-0 text-[16px] font-bold text-text-primary tnum">
                {goal ? fmtAmount(goal.unit, a.amount, a.currency) : a.amount}
              </b>
              <Rule />
              <span className="shrink-0 text-[13px] text-text-secondary">
                {goal?.name ?? "a goal"}
              </span>
              {a.sentBackBy && (
                <>
                  <Rule />
                  {/* Who refused it, with their face — the first question
                      anyone holding a rejection asks. */}
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold text-text-primary">
                    <Avatar
                      name={a.sentBackBy}
                      className="h-[20px] w-[20px] shrink-0 text-[8px]"
                    />
                    {a.sentBackBy}
                  </span>
                </>
              )}
              {a.sentBackAt && (
                <span className="shrink-0 text-[11.5px] tnum text-text-tertiary">
                  {stamp(a.sentBackAt).label}
                  {stamp(a.sentBackAt).time
                    ? ` at ${stamp(a.sentBackAt).time}`
                    : ""}
                </span>
              )}
              {a.managerNote && (
                <>
                  <Rule />
                  {/* The note is the one part with no fixed length, so it
                      takes whatever room is left and clamps rather than
                      pushing the button off the row. Opening the claim shows
                      it in full. */}
                  <span
                    title={a.managerNote}
                    className="min-w-0 flex-1 truncate text-[12.5px] text-text-secondary"
                  >
                    <b className="text-text-primary">Their note: </b>
                    <i>&ldquo;{a.managerNote}&rdquo;</i>
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => onFix(a.id)}
                className="ml-auto shrink-0 cursor-pointer rounded-lg bg-[color:#DC2626] px-3.5 py-2 text-[12.5px] font-bold text-white transition-all hover:opacity-90"
              >
                {isMe ? "Fix it" : "Open it"}
              </button>
            </li>
          );
        })}
        </ul>
      </div>
    </Card>
  );
}

export function MyEntriesCard({
  state,
  person,
  run,
  meName,
  busy = false,
  focusEntry = null,
}: {
  state: PerformanceState;
  person: string;
  /** Present on the live page; absent in read-only embeds. */
  run?: RunOp;
  meName?: string;
  busy?: boolean;
  /** Open this entry and scroll to it — how the rejected-claims card at the
   *  top of the page hands you off to the row you have to fix. The counter
   *  makes a second press on the SAME claim a new request rather than a
   *  no-op set-state React drops. */
  focusEntry?: { id: string; n: number } | null;
}) {
  const [panelView, setPanelView] = useStoredView<"open" | "closed">(
    "freyr.performance.logged-results",
    "open",
    ["open", "closed"]
  );
  const expanded = panelView === "open";
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  /** The claim whose review popup is open, by entry id. */
  const [reviewing, setReviewing] = useState<string | null>(null);
  /** The review popup opened straight onto its note step, because the reader
   *  pressed send-back rather than the row itself. */
  const [reviewInSendBack, setReviewInSendBack] = useState(false);
  const [dropFor, setDropFor] = useState<string | null>(null);
  /** Fixing a typo used to mean delete and re-enter, losing the upload. */
  const [editFor, setEditFor] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    amount: "",
    date: "",
    customer: "",
    customerId: "",
  });
  const [customerOptions, setCustomerOptions] = useState<
    { id: string; name: string }[]
  >([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  /** The proof, edited alongside the numbers — the commonest reason a claim
   *  comes back is that it arrived without one. */
  const [draftEvidence, setDraftEvidence] = useState<
    { name: string; url: string }[]
  >([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  useEffect(() => {
    if (!focusEntry) return;
    const { id } = focusEntry;
    // NO SCROLL (Anir, Aug 20: "stop scrolling down when I click it"). The
    // jump was written for a card that only pointed at the row; now the form
    // opens over the page, so dragging the page out from under it moved
    // everything except the thing being looked at. The row is still opened
    // underneath, so closing the form lands on the claim in full.
    setOpenRow(id);
    const entry = state.actuals.find((x) => x.id === id);
    if (entry && awaitingTheirFix(entry) && entry.person === person && run) {
      setDropFor(null);
      setEditFor(id);
      setDraft({
        amount: String(entry.amount),
        date: entry.date,
        customer: entry.customer ?? "",
        customerId: entry.customerId ?? "",
      });
      setDraftEvidence(entry.evidence ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusEntry]);
  useEffect(() => {
    if (!editFor) return;
    const controller = new AbortController();
    setCustomersLoading(true);
    fetch("/api/customers", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Customer list unavailable");
        return response.json();
      })
      .then((data: { customers?: { id?: string; company_name?: string }[] }) => {
        setCustomerOptions(
          (data.customers ?? [])
            .map((customer) => ({
              id: String(customer.id ?? ""),
              name: String(customer.company_name ?? "").trim(),
            }))
            .filter((customer) => customer.id && customer.name)
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") {
          setCustomerOptions([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCustomersLoading(false);
      });
    return () => controller.abort();
  }, [editFor]);
  /**
   * A LOCK NEEDS AN UNDO (bug, Aug 15). Verifying pulls the row out of the
   * queue, and the queue was the only place Send back lived — so a claim
   * locked by mistake could not be reopened from anywhere in the UI, though
   * the server has always accepted it. Same op, same rule about who may do
   * it: only an owner of a group this person is in.
   */
  /** The head(s) of every group this person belongs to — the people their
   *  claim is waiting on. Excludes the person themselves: your own headship
   *  is the "Waiting for you" branch, not a face on your own pill. */
  const groupHeadsFor = (who: string): string[] => {
    const heads: string[] = [];
    for (const g of state.groups ?? []) {
      if (!g.head || g.head === who) continue;
      if (!(g.members ?? []).includes(who)) continue;
      if (!heads.includes(g.head)) heads.push(g.head);
    }
    return heads;
  };
  const iOwnThisPerson =
    !!run &&
    !!meName &&
    headedGroups(state, meName).some((g) =>
      [g.head, ...g.members]
        .map((m) => m.trim().toLowerCase())
        .includes(person.trim().toLowerCase())
    );
  const all = state.actuals
    .filter((a) => a.person === person)
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
  /* Eight newest, PLUS every claim still sent back (Aug 23 audit): the card's
     header counts rejections wherever they are, so a ninth-newest sent-back
     claim was being announced by a table that then did not contain it — a
     fix nobody could reach from the one place that demands it. */
  const resultPriority = (entry: PerfActual) =>
    awaitingTheirFix(entry) ? 0 : entryStatus(entry) === "verified" ? 2 : 1;
  const mine = [
    ...all.slice(0, 8),
    ...all.slice(8).filter((a) => awaitingTheirFix(a)),
  ].sort((a, b) => resultPriority(a) - resultPriority(b));
  if (mine.length === 0) return null;

  return (
    <>
      <Card className="p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setPanelView(expanded ? "closed" : "open")}
          aria-expanded={expanded}
          className="flex w-full cursor-pointer items-center gap-2 border-b border-border-light px-4 py-2.5 text-left transition-colors hover:bg-surface/70"
        >
          <ChevronDown
            size={15}
            strokeWidth={2.4}
            className={cn("shrink-0 transition-transform", !expanded && "-rotate-90")}
          />
          <h3 className="text-[13.5px] font-semibold text-text-primary">
            Logged results
          </h3>
          {/* NO BAR ON THIS CARD (Anir, Aug 16: "It says the bar only moves
              once an entry is verified... There's no bar. I don't see a bar
              here"). The bar it meant is the goal's, one card up. Say the rule
              itself instead of pointing at something that is not on screen. */}
          {/* State, not a lecture (Anir, Aug 19: "why are you saying that
              nothing counts toward a goal until it is verified here? That's
              throwing me off: is this done or not?"). The rule only needs
              saying while something is still waiting. */}
          {(() => {
            // A rejection outranks the general rule: if something was sent
            // back, the card says THAT, in red, before it says anything about
            // how verification works.
            const back = mine.filter(wasSentBack).length;
            if (back > 0) {
              return (
                <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-text-secondary">
                  <AlertCircle
                    size={13}
                    strokeWidth={2.6}
                    className="text-[color:var(--status-red)]"
                  />
                  {back} sent back and waiting on a fix
                </span>
              );
            }
            return (
              <span className="text-[11px] text-text-tertiary">
                {mine.some((e) => entryStatus(e) !== "verified")
                  ? "nothing counts toward a goal until it is verified"
                  : "all verified and counting"}
              </span>
            );
          })()}
          <span className="ml-auto text-[11px] text-text-tertiary tnum">
            {mine.length} {mine.length === 1 ? "entry" : "entries"}
          </span>
        </button>
        <div className="freyr-fold" data-open={expanded ? "true" : "false"}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="border-b border-border-light bg-surface/50 text-left text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary [&>th]:whitespace-nowrap">
                <th className="px-4 py-2.5">Logged by</th>
                <th className="px-4 py-2.5">Goal</th>
                <th className="px-4 py-2.5">Amount</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Evidence</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {mine.map((a) => {
                const goal = state.goals.find((g) => g.id === a.goalId);
                const sub = goal?.subgoals.find((x) => x.id === a.subgoalId);
                const open = openRow === a.id;
                const status = entryStatus(a);
                const sentBack = wasSentBack(a);
                /** Your own claim, still unlocked: yours to change or drop.
                 *  A sent-back one especially — fixing it is the whole point,
                 *  and keying this to "reported" alone would have locked the
                 *  edit exactly when it was needed. */
                const canEdit =
                  isPending(a) &&
                  !!run &&
                  (a.person === meName || a.addedBy === meName);
                return (
                  <Fragment key={a.id}>
                    <tr
                      onClick={() => setOpenRow(open ? null : a.id)}
                      aria-expanded={open}
                      /* THE SAME OPEN STATE AS EVERY OTHER DROPDOWN (Anir,
                         Aug 16: "this dropdown looks off, just super, super
                         off. I can't put my finger on it. Maybe it's the
                         colour"). It was the only one washed in blue; the goal
                         rows open onto plain surface with a blue rail down the
                         left, so this now does too. */
                      className={cn(
                        "cursor-pointer border-b border-border-light transition-colors",
                        /* A rejected claim wears its rail whether the row is
                           open or not — closed is exactly when it needs to be
                           spotted from across the table. */
                        sentBack
                          ? cn(
                              "[box-shadow:inset_3px_0_0_0_#DC2626]",
                              open ? "bg-surface" : "hover:bg-surface"
                            )
                          : open
                            ? "bg-surface [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                            : "hover:bg-surface"
                      )}
                    >
                      <td className="px-4 py-3.5">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Avatar name={a.person} className="h-8 w-8 shrink-0 text-[11px]" />
                          <span className="truncate text-[13.5px] font-semibold text-text-primary">
                            {a.person}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5">{goalChip(state, a.goalId)}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[14px] font-semibold text-text-primary tnum">
                        {goal ? fmtAmount(goal.unit, a.amount, a.currency) : a.amount}
                      </td>
                      <td className="px-4 py-3.5">
                        <CustomerCell customer={a.customer} customerId={a.customerId} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-[13px] text-text-secondary tnum">
                        <span className="block">{stamp(lastMoved(a)).label}</span>
                        <span className="block text-[10.5px] text-text-tertiary">
                          {/* THE CLOCK GOES UNDER THE DAY (Anir, Aug 20: "I
                              need the time too... The time should be right
                              under"). Two claims on one day were the same
                              row twice with nothing to tell them apart. */}
                          {stamp(lastMoved(a)).time
                            ? `${stamp(lastMoved(a)).time} · `
                            : ""}
                          {entryStatus(a) === "verified" && a.verifiedAt
                            ? "verified"
                            : a.addedAt
                              ? "logged"
                              : "result date"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <EvidenceLinks entry={a} />
                      </td>
                      <td className="px-4 py-3.5">
                        {/* The pill IS the control: hovering a locked claim
                            turns it into Unlock (Anir, Aug 15: "you don't even
                            need that button there. Put that button when I hover
                            over the status where it says Verified"). */}
                        <StatusPill
                          entry={a}
                          owners={groupHeadsFor(a.person)}
                          waitingOnMe={iOwnThisPerson}
                          onUnlock={
                            iOwnThisPerson && status === "verified"
                              ? () => {
                                  setReviewInSendBack(true);
                                  setReviewing(a.id);
                                }
                              : undefined
                          }
                          onVerify={
                            /* OPENS THE REVIEW POPUP. It must never sign off
                               on the click itself (Anir, Aug 16 and again
                               Aug 19: "it auto-verified it. It didn't even
                               ask me. It didn't open up any pop-up") — the
                               dialog shows the proof and the goal's progress,
                               and Verify and lock lives in there. */
                            iOwnThisPerson && status !== "verified"
                              ? () => setReviewing(a.id)
                              : undefined
                          }
                          /**
                           * A BADGE THAT SAYS "NEEDS A FIX" IS A BUTTON THAT
                           * FIXES IT (Anir, Aug 20: "should be able to click
                           * on that button"). It used to only fold the row
                           * open — and on a row that was already open, that
                           * read as a dead click. It opens the edit form, the
                           * same one the pencil and the red card's Fix it
                           * open, with the rejection note carried into it.
                           */
                          onOpen={
                            canEdit
                              ? () => {
                                  setOpenRow(a.id);
                                  setDropFor(null);
                                  setEditFor(a.id);
                                  setDraft({
                                    amount: String(a.amount),
                                    date: a.date,
                                    customer: a.customer ?? "",
                                    customerId: a.customerId ?? "",
                                  });
                                  setDraftEvidence(a.evidence ?? []);
                                }
                              : () => setOpenRow(open ? null : a.id)
                          }
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        {/* EDIT AND DELETE LIVE IN THE ACTIONS COLUMN (Anir,
                            Aug 16: "The Edit button and the Delete button
                            should go in the action column, which should be the
                            last column instead of putting it here. Just icons
                            would be a lot better"). They still open the same
                            forms inside the row; only the way in moved. */}
                        <span className="flex items-center justify-start gap-1">
                          {/* SEND BACK HAS ITS OWN ICON (Anir, Aug 19: "i need
                              another icon in the actions column (properly
                              aligned) for sending it back"). The status pill
                              still does it on hover; this is the version you
                              can see without hovering, and it sits in the same
                              aligned run as edit and delete. */}
                          {iOwnThisPerson && status === "verified" && (
                            <button
                              type="button"
                              title="Unlock this claim and send it back"
                              aria-label={`Unlock and send back the ${a.date} entry`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setReviewInSendBack(true);
                                setReviewing(a.id);
                              }}
                              className="cursor-pointer rounded-md p-1.5 text-[color:var(--status-red)] transition-colors hover:bg-surface"
                            >
                              <RotateCcw size={14} strokeWidth={2.2} />
                            </button>
                          )}
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                title="Edit this entry"
                                aria-label={`Edit the ${a.date} entry`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenRow(a.id);
                                  setEditFor(a.id);
                                  setDropFor(null);
                                  setDraft({
                                    amount: String(a.amount),
                                    date: a.date,
                                    customer: a.customer ?? "",
                                    customerId: a.customerId ?? "",
                                  });
                                  setDraftEvidence(a.evidence ?? []);
                                }}
                                className="cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface hover:text-blue-primary"
                              >
                                <PenLine size={14} strokeWidth={2.2} />
                              </button>
                              <button
                                type="button"
                                title="Delete this entry"
                                aria-label={`Delete the ${a.date} entry`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenRow(a.id);
                                  setDropFor(a.id);
                                  setEditFor(null);
                                }}
                                className="cursor-pointer rounded-md p-1.5 text-[color:var(--status-red)] transition-colors hover:bg-surface"
                              >
                                <Trash2 size={14} strokeWidth={2.2} />
                              </button>
                            </>
                          )}
                          <ChevronDown
                            size={16}
                            strokeWidth={2.2}
                            aria-hidden="true"
                            className={cn(
                              "ml-0.5 text-text-tertiary transition-transform",
                              open && "rotate-180"
                            )}
                          />
                        </span>
                      </td>
                    </tr>
                    <tr className="!border-t-0 bg-surface">
                        <td colSpan={8} className="max-w-0 p-0">
                          <div className="freyr-fold" data-open={open ? "true" : "false"}>
                          <div className="min-w-0">
                          <div
                          className={cn(
                            /* The spanning cell above is width-constrained so
                               the expansion cannot stretch the table. The panel
                               itself still fills that cell; max-width:0 here
                               squeezed every sentence into one character per
                               line. This padded panel sits inside an unpadded
                               collapse wrapper; putting padding on the grid child
                               itself left a thick gray band while closed. */
                            "min-w-0 w-full pb-4 pl-7 pr-4 pt-1",
                            sentBack
                              ? "[box-shadow:inset_3px_0_0_0_#DC2626]"
                              : "[box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                          )}>
                          {/* THE REJECTION LEADS (Anir, Aug 19: "if it's sent
                              back it has to look more prominent than this").
                              It used to be a pale blue strip under everything
                              else, read last if at all — on the one claim
                              where somebody is waiting for the person to act. */}
                          {sentBack && (
                            <div className="mb-3 mt-2 flex items-start gap-2.5 rounded-xl border border-border-light border-l-[3px] border-l-[color:#DC2626] bg-white px-3.5 py-3">
                              <AlertCircle
                                size={17}
                                strokeWidth={2.5}
                                className="mt-px shrink-0 text-[color:var(--status-red)]"
                              />
                              <span className="min-w-0">
                                <span className="block text-[13px] font-bold text-text-primary">
                                  Sent back &mdash; this does not count until it is
                                  fixed and verified
                                </span>
                                {/* WHO, AND WHEN. A rejection with a reason
                                    but no author leaves the person holding it
                                    with nobody to go ask. */}
                                {(a.sentBackBy || a.sentBackAt) && (
                                  <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-text-secondary">
                                    {a.sentBackBy && (
                                      <>
                                        by
                                        <span className="inline-flex items-center gap-1.5 font-semibold text-text-primary">
                                          <Avatar
                                            name={a.sentBackBy}
                                            className="h-[18px] w-[18px] shrink-0 text-[8px]"
                                          />
                                          {a.sentBackBy}
                                        </span>
                                      </>
                                    )}
                                    {a.sentBackAt && (
                                      <span className="tnum text-text-tertiary">
                                        {a.sentBackBy ? "· " : ""}
                                        {stamp(a.sentBackAt).label}
                                        {stamp(a.sentBackAt).time
                                          ? ` at ${stamp(a.sentBackAt).time}`
                                          : ""}
                                      </span>
                                    )}
                                  </span>
                                )}
                                <span className="mt-1 block text-[12.5px] leading-snug text-text-secondary">
                                  <b className="text-text-primary">Their note: </b>
                                  <i>&ldquo;{a.managerNote}&rdquo;</i>
                                </span>
                              </span>
                            </div>
                          )}
                          {/* THE TIMELINE GETS ITS OWN COLUMN (Anir, Aug 19:
                              "fix this ui so the timeline doesn't extend so
                              far down, maybe it deserves its own column"). It
                              used to be one cell in the facts grid, so its
                              four stacked steps set the height of the whole
                              panel and pushed the proof off the screen. Beside
                              the facts, the panel is only as tall as whichever
                              side is taller. */}
                          <div className="tab-panel flex flex-col gap-4 lg:flex-row lg:gap-6">
                            <div className="min-w-0 flex-1">
                              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                                <Fact label="Goal">
                                  {goal?.name ?? "Goal removed"}
                                </Fact>
                                <Fact label="Subgoal">
                                  {sub?.name ?? (
                                    <span className="text-text-tertiary">
                                      logged on the goal itself
                                    </span>
                                  )}
                                </Fact>
                                <Fact label="Customer">
                                  <CustomerCell
                                    customer={a.customer}
                                    customerId={a.customerId}
                                  />
                                </Fact>
                                <Fact label="Deal">
                                  {a.dealLabel ?? (
                                    <span className="text-text-tertiary">
                                      not tied to a deal
                                    </span>
                                  )}
                                </Fact>
                                <Fact label="Note">
                                  {a.note ?? (
                                    <span className="text-text-tertiary">none</span>
                                  )}
                                </Fact>
                              </div>

                          {/* A scalable document table. The collapsed row says
                              only the count; opening it reveals names and the
                              same hover preview Sales Materials uses. */}
                          <div className="mt-4">
                            <span className="block text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
                              Proof
                            </span>
                            {a.evidence?.length ? (
                              <div className="mt-1.5 max-h-[360px] overflow-auto rounded-xl border border-border-light bg-white">
                                <table className="w-full table-fixed border-collapse text-left">
                                  <colgroup>
                                    <col />
                                    <col className="w-24" />
                                    <col className="w-24" />
                                  </colgroup>
                                  <thead>
                                    <tr className="sticky top-0 z-10 border-b border-border-light bg-surface text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                                      <th className="px-3 py-2">Document</th>
                                      <th className="px-3 py-2">Type</th>
                                      <th className="px-3 py-2">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border-light">
                                    {a.evidence.map((e) => {
                                      const extension = e.name.split(".").pop()?.toUpperCase() || "FILE";
                                      return (
                                        <tr key={e.url || e.name} className="hover:bg-surface/55">
                                          <td className="px-3 py-2.5">
                                            <EvidencePeek file={e}>
                                              <button
                                                type="button"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  setPreview({ name: e.name, url: e.url });
                                                }}
                                                className="flex min-w-0 cursor-pointer items-center gap-2 text-left font-semibold text-text-primary hover:text-blue-primary hover:underline"
                                              >
                                                <FileText size={14} className="shrink-0 text-blue-primary" />
                                                <span className="truncate">{e.name}</span>
                                              </button>
                                            </EvidencePeek>
                                          </td>
                                          <td className="px-3 py-2.5 text-[11px] font-semibold text-text-tertiary">{extension}</td>
                                          <td className="px-3 py-2.5">
                                            <button
                                              type="button"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                setPreview({ name: e.name, url: e.url });
                                              }}
                                              className="cursor-pointer text-[11.5px] font-semibold text-blue-primary hover:underline"
                                            >
                                              Open
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="mt-1 text-[11.5px] text-text-secondary">
                                Nothing attached. A group owner can send this back and
                                ask for the contract or SOW.
                              </p>
                            )}
                              </div>
                            </div>
                            {/* The rail, on its own narrow column with a
                                divider, the way the drill-downs elsewhere
                                separate a side panel from the facts. */}
                            <div className="shrink-0 border-t border-border-light pt-3 lg:w-[200px] lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                              <EntryTimeline entry={a} person={person} owners={groupHeadsFor(a.person)} />
                            </div>
                          </div>


                          {/* YOUR OWN CLAIM IS YOURS UNTIL SOMEBODY LOCKS IT
                              (Anir, Aug 15: "if I was the one who did this, I
                              should be able to delete it"). The server has
                              always allowed this and always refused it once
                              verified; the row simply never offered it. */}
                          {canEdit && dropFor === a.id && (
                              <div
                                className="mt-3 flex flex-wrap items-center gap-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {dropFor === a.id ? (
                                  <>
                                    <span className="text-[12.5px] text-text-secondary">
                                      Delete this entry for good?
                                    </span>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={async () => {
                                        const okDone = await run?.(
                                          { op: "remove-actual", actualId: a.id },
                                          "Entry deleted"
                                        );
                                        if (okDone) setDropFor(null);
                                      }}
                                      className="cursor-pointer rounded-lg bg-[color:#DC2626] px-3 py-1.5 text-[12.5px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                                    >
                                      Delete it
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDropFor(null)}
                                      className="cursor-pointer rounded-lg border border-border-light px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
                                    >
                                      Keep it
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            )}
                          </div>
                          </div>
                          </div>
                        </td>
                      </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      </Card>
      {/* THE SAME REVIEW POPUP THE QUEUE OPENS. One dialog for signing a
          claim off, wherever you happen to be standing when you decide to. */}
      {reviewing &&
        run &&
        (() => {
          const a = state.actuals.find((x) => x.id === reviewing);
          if (!a) return null;
          return (
            <ClaimReviewDialog
              entry={a}
              state={state}
              run={run}
              busy={busy}
              startInSendBack={reviewInSendBack}
              onClose={() => {
                setReviewing(null);
                setReviewInSendBack(false);
              }}
              onPreview={setPreview}
            />
          );
        })()}
      {/* EDITING A RESULT IS A POPUP, NOT A ROW (Anir, Aug 20: "When I press
          Edit, why is it opening this thing? Look at this: why is it opening
          a fucking weird row here? It should be opening a pop-up"). Three
          bare inputs wedged under the panel read as part of the record rather
          than as a form you are filling in, and the Save they belonged to was
          a scroll away from the number being changed. Same fields, same op —
          in the shape every other edit in this app uses. */}
      {editFor && run &&
        (() => {
          const a = state.actuals.find((x) => x.id === editFor);
          if (!a) return null;
          const goal = state.goals.find((g) => g.id === a.goalId);
          const fixing = awaitingTheirFix(a);
          const amountInvalid =
            draft.amount.trim() !== "" &&
            parseAmountInput(draft.amount) === null;
          const customerInOptions = customerOptions.some(
            (customer) => customer.id === draft.customerId
          );
          return (
            <Modal
              open
              onClose={() => setEditFor(null)}
              title={fixing ? "Fix and resubmit result" : "Edit result"}
              size="workflow"
              dialogClassName="!max-w-[1100px]"
              bodyClassName="!p-0"
            >
              <div className="border-b border-border-light bg-surface/70 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
                      Result being corrected
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {goalChip(state, a.goalId)}
                      <span className="text-[12px] text-text-secondary">
                        Logged {stamp(a.addedAt).label ?? formatDate(a.date)}
                        {stamp(a.addedAt).time ? ` at ${stamp(a.addedAt).time}` : ""}
                      </span>
                    </div>
                  </div>
                  {fixing && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:#FDECEC] px-3 py-1.5 text-[11.5px] font-bold text-[color:var(--status-red)]">
                      <AlertCircle size={13} strokeWidth={2.5} />
                      Needs correction
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-5 px-6 py-5">
                {/* The rejection note travels WITH the form. Fixing a claim
                    without the reason in front of you is guesswork. */}
                {a.managerNote && (
                  <section className="overflow-hidden rounded-2xl border border-[color:#F3B2B2] bg-[color:#FFF8F8]">
                    <div className="flex items-center gap-2 border-b border-[color:#F7D1D1] px-4 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:#FDE5E5] text-[color:var(--status-red)]">
                        <AlertCircle size={16} strokeWidth={2.4} />
                      </span>
                      <div className="min-w-0">
                        <span className="block text-[10.5px] font-bold uppercase tracking-[0.07em] text-[color:var(--status-red)]">
                          Why it was sent back
                        </span>
                        {a.sentBackBy && (
                          <span className="mt-0.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-primary">
                            <Avatar
                              name={a.sentBackBy}
                              className="h-[18px] w-[18px] text-[8px]"
                            />
                            {a.sentBackBy}
                          </span>
                        )}
                      </div>
                    </div>
                    <blockquote className="px-4 py-3.5 text-[14px] leading-6 text-text-primary">
                      &ldquo;{a.managerNote}&rdquo;
                    </blockquote>
                  </section>
                )}

                <section className="rounded-2xl border border-border-light bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
                  <div className="mb-4 flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
                      <PenLine size={15} strokeWidth={2.2} />
                    </span>
                    <div>
                      <h3 className="text-[13.5px] font-bold text-text-primary">
                        Corrected result
                      </h3>
                      <p className="mt-0.5 text-[11.5px] text-text-secondary">
                        Update the result and the date it actually happened.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[11.5px] font-semibold text-text-secondary">
                        Amount<RequiredMark />
                      </span>
                  {/* THE AMOUNT CARRIES ITS CURRENCY HERE TOO (Anir, Aug 20:
                      "Literally everywhere where that number is, it has to be
                      there"). The log form has worn the symbol since Aug 15;
                      this box, where a rep retypes the same money after it was
                      sent back, showed a bare number — so a result signed in
                      euros read as dollars at the one moment somebody is
                      changing it. The entry keeps whatever it was recorded in;
                      this only says which that is. */}
                  <span className="relative block">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] font-semibold text-text-tertiary">
                      {goal?.unit === "percent"
                        ? "%"
                        : goal?.unit === "count"
                          ? "#"
                          : currencyMeta(a.currency ?? goal?.currency).symbol}
                    </span>
                    <input
                      required
                      autoFocus
                      value={withCommas(draft.amount)}
                      placeholder="0"
                      aria-invalid={amountInvalid}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          amount:
                            goal?.unit === "currency"
                              ? expandMoneyShorthand(e.target.value, { integer: true })
                              : e.target.value,
                        }))
                      }
                      className={cn(
                        "h-11 w-full rounded-xl border bg-white pl-9 pr-3 text-[14px] outline-none transition-shadow focus:ring-2 tnum",
                        amountInvalid
                          ? "border-error focus:border-error focus:ring-error/10"
                          : "border-border-light focus:border-blue-primary focus:ring-blue-primary/10"
                      )}
                    />
                  </span>
                  {amountInvalid && (
                    <span className="mt-1 block text-[11px] font-semibold text-error">
                      Enter a valid number.
                    </span>
                  )}
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11.5px] font-semibold text-text-secondary">
                    Date<RequiredMark />
                  </span>
                  <input
                    required
                    type="date"
                    value={draft.date}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, date: e.target.value }))
                    }
                    className="h-11 w-full rounded-xl border border-border-light bg-white px-3 text-[14px] outline-none transition-shadow focus:border-blue-primary focus:ring-2 focus:ring-blue-primary/10"
                  />
                </label>
                <div className="block sm:col-span-2">
                  <span className="mb-1.5 block text-[11.5px] font-semibold text-text-secondary">
                    Customer account<OptionalMark />
                  </span>
                  <ColorSelect
                    value={
                      customerInOptions
                        ? draft.customerId
                        : draft.customer
                          ? "__current"
                          : ""
                    }
                    ariaLabel="Customer account"
                    searchable
                    collapsible={false}
                    fill
                    minWidth={0}
                    className="w-full [&_button[aria-haspopup='listbox']]:!h-14 [&_button[aria-haspopup='listbox']]:!rounded-xl [&_button[aria-haspopup='listbox']]:!px-4 [&_button[aria-haspopup='listbox']]:!text-[16px]"
                    onChange={(value) => {
                      if (value === "__current") return;
                      const selected = customerOptions.find(
                        (customer) => customer.id === value
                      );
                      setDraft((current) => ({
                        ...current,
                        customer: selected?.name ?? "",
                        customerId: selected?.id ?? "",
                      }));
                    }}
                    options={[
                      {
                        value: "",
                        label: customersLoading
                          ? "Loading customers…"
                          : "Pick a customer…",
                        color: "#C7CDD6",
                      },
                      ...(draft.customer &&
                      !customerInOptions
                        ? [
                            {
                              value: "__current",
                              label: draft.customer,
                              logoName: draft.customer,
                            },
                          ]
                        : []),
                      ...customerOptions.map((customer) => ({
                        value: customer.id,
                        label: customer.name,
                        logoName: customer.name,
                        href: `/customers/${encodeURIComponent(customer.id)}`,
                      })),
                    ]}
                  />
                </div>
                  </div>
                </section>
              {/* THE PROOF, ON THE FORM THAT ANSWERS THE REJECTION (Anir,
                  Aug 20: "do they have to upload a doc here or no"). They
                  could not — and "attach the contract" is the commonest thing
                  a group owner sends a claim back for, so the one screen where
                  proof is most likely missing was the one screen that could
                  not add it. */}
              {/* The picker draws its own label and hint — saying "Evidence"
                  above it printed the word twice (Anir, Aug 20). */}
                <section className="rounded-2xl border border-border-light bg-surface/45 p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-blue-primary shadow-sm ring-1 ring-border-light">
                      <Paperclip size={15} strokeWidth={2.2} />
                    </span>
                    <div>
                      <h3 className="text-[13.5px] font-bold text-text-primary">
                        Supporting evidence<OptionalMark />
                      </h3>
                      <p className="mt-0.5 text-[11.5px] text-text-secondary">
                        Keep the existing proof or attach the corrected file.
                      </p>
                    </div>
                  </div>
                  <EvidencePicker
                    value={draftEvidence}
                    onChange={setDraftEvidence}
                    onUploadingChange={setUploadingEvidence}
                    showLabel={false}
                    roomy
                  />
                </section>
              </div>

              <div data-agent-dock-clearance className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border-light bg-surface/95 px-6 py-4 backdrop-blur-sm">
                <p className="max-w-[460px] text-[11.5px] leading-5 text-text-secondary">
                  {fixing
                    ? `${a.sentBackBy ?? "Your group owner"} will be notified and can verify the corrected result.`
                    : "Saving updates this result immediately."}
                </p>
                <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditFor(null)}
                  className="h-10 cursor-pointer rounded-xl border border-border-light bg-white px-4 text-[13px] font-semibold text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
                >
                  Cancel
                </button>
                {/* THE BUTTON SAYS WHAT PRESSING IT DOES (Anir, Aug 20:
                    "'save changes' is not good... they are not going to think
                    it's going to actually get sent back"). Saving a rejected
                    claim puts it back in the owner's queue, which is the whole
                    point of the screen and was the one thing the button did
                    not mention. */}
                <button
                  type="button"
                  disabled={
                    busy ||
                    uploadingEvidence ||
                    /* Garbage is a typo, not the old number (Aug 23 audit):
                       this used to fall back to `parsed ?? a.amount`, so a
                       rep fixing a rejected $120K who typed "125kk" silently
                       RESUBMITTED the $120K the owner had just refused. */
                    amountInvalid
                  }
                  onClick={async () => {
                    const parsed = parseAmountInput(draft.amount);
                    const okDone = await run(
                      {
                        op: "update-actual",
                        actualId: a.id,
                        amount: parsed ?? a.amount,
                        date: draft.date || a.date,
                        customer: draft.customer,
                        /* The account link survives an edit that did not touch
                           the customer (Aug 23 audit): the store rewrites
                           customer AND customerId together, so sending the
                           name without the id unlinked the account on every
                           save — even one that only swapped the file. */
                        customerId: draft.customerId || undefined,
                        evidence: draftEvidence,
                      },
                      fixing
                        ? "Sent back up for verification"
                        : "Entry updated"
                    );
                    if (okDone) setEditFor(null);
                  }}
                  className="h-10 cursor-pointer rounded-xl bg-blue-primary px-5 text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(0,113,227,0.18)] transition-all hover:-translate-y-px hover:shadow-[0_8px_20px_rgba(0,113,227,0.24)] disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
                >
                  {uploadingEvidence
                    ? "Waiting for the upload…"
                    : fixing
                      ? "Send it back for verification"
                      : "Save changes"}
                </button>
                </div>
              </div>
            </Modal>
          );
        })()}
      {preview && (
        <EvidencePreview file={preview} onClose={() => setPreview(null)} />
      )}
    </>
  );
}

/** Everything waiting on a group owner. Renders only for group owners. */
export function VerifyQueueCard({
  state,
  run,
  meName,
  busy,
}: {
  state: PerformanceState;
  run: RunOp;
  meName: string;
  busy: boolean;
}) {
  /**
   * ONE WAY IN: REVIEW IT, THEN DECIDE (Anir, Aug 16: "it should just be a
   * view button, and then it brings up a pop-up, and then I can decline it or
   * accept it from the pop-up... I should be able to see all the information
   * about that that I would need to verify").
   *
   * Two icons on the row let you lock money without ever opening the proof —
   * and the first thing he did with them was verify by accident. The claim is
   * read first now, in full, and both answers live in the same dialog.
   */
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ name: string; url: string } | null>(null);
  /** Twenty claims used to be twenty clicks (Anir, Aug 15: "so many features
   *  people would need that just don't exist"). Customers has select-many;
   *  this is the same idiom on the queue. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [panelView, setPanelView] = useStoredView<"open" | "closed">(
    "freyr.performance.verification-queue",
    "closed",
    ["open", "closed"]
  );
  const expanded = panelView === "open";
  const heads = headedGroups(state, meName);
  if (heads.length === 0) return null;
  const queue = verificationQueue(state, meName);
  /* URGENT WHEN LOADED, QUIET WHEN CLEAR (Anir, Aug 17: "most people are
     gonna just pass right by it — it has to stick out so they verify it").
     With claims waiting the card wears the amber attention treatment: a
     coloured rail, a tinted header, an alert icon and the money-on-hold
     total. Amber is a status colour used AS a status — action required —
     never decoration. Empty, it settles back to the calm blue card. */
  const pending = queue.length > 0;
  /* MONEY ONLY, in one currency (Aug 23 audit): this summed every waiting
     claim's raw number — 12 meetings + 40 percent + €50,000 — and printed
     the total with a dollar sign. Only currency-goal claims are money, and
     each converts to USD before it joins the sum; one with no rate counts
     as nothing rather than lying at 1:1. */
  const onHold = queue.reduce((s, q) => {
    const goal = state.goals.find(
      (g) =>
        g.id === q.goalId ||
        (g.componentGoalIds ?? []).includes(q.goalId) ||
        g.subgoals.some((x) => x.id === q.subgoalId)
    );
    const unitOf =
      state.goals.find((g) => g.id === q.goalId)?.unit ?? goal?.unit;
    if (unitOf !== "currency") return s;
    return s + inGoalCurrency(q, undefined, state.rates);
  }, 0);
  return (
    <Card
      className={cn(
        "relative overflow-hidden p-0",
        pending ? "border-[rgba(217,119,6,0.5)]" : "border-[rgba(0,113,227,0.35)]"
      )}
    >
      {pending && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[5px] bg-[color:#D97706]" />
      )}
      <div
        className={cn(
          "flex items-center gap-2 border-b px-4 py-2.5",
          pending
            ? "border-[rgba(217,119,6,0.25)] bg-[rgba(217,119,6,0.07)]"
            : "border-border-light"
        )}
      >
        <button
          type="button"
          onClick={() => setPanelView(expanded ? "closed" : "open")}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide verification requests" : "Show verification requests"}
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md py-0.5 pr-2 text-left transition-colors hover:bg-[rgba(217,119,6,0.1)]"
        >
          <ChevronDown
            size={15}
            strokeWidth={2.4}
            className={cn("shrink-0 text-[color:var(--ink-amber)] transition-transform", !expanded && "-rotate-90")}
          />
          {pending && (
          <AlertCircle
            size={16}
            strokeWidth={2.4}
            aria-hidden="true"
            className="shrink-0 text-[color:var(--ink-amber)]"
          />
          )}
          <h3
          className={cn(
            "text-[13.5px] font-semibold",
            pending ? "text-[color:#92400E]" : "text-text-primary"
          )}
        >
          {pending ? "Action needed. Waiting for your verification" : "Waiting for your verification"}
          </h3>
          <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10.5px] font-bold",
            pending
              ? "bg-[color:#D97706] text-white"
              : "bg-[rgba(22,163,74,0.12)] text-[color:#16A34A]"
          )}
        >
          {queue.length || "all clear"}
          </span>
          {pending && onHold > 0 && (
          <span className="text-[11.5px] font-semibold text-[color:var(--ink-amber)] tnum">
            {fmtAmount("currency", onHold)} on hold until you do
          </span>
          )}
        </button>
        {/* ONE SENTENCE, WITH THE GROUP NAME AS A TAG INSIDE IT (Anir,
            Aug 15). Two goes at this: "you own test. Only you can lock these"
            read like a typo, and pilling the name mid-sentence just turned it
            into two fragments with the full stop gone. The name is the object
            of the sentence now, so the pill has somewhere to sit and the line
            still reads as English. Blue, like every other group tag. */}
        {picked.size > 0 ? (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-[11.5px] font-semibold text-text-secondary tnum">
              {picked.size} selected
            </span>
            <button
              type="button"
              disabled={busy}
              /* SIGNING OFF IN BULK IS STILL SIGNING OFF (found testing, Aug
                 19: two claims went reported → verified on one click with no
                 dialog at all). Anir has made this point twice about the
                 single-claim pill — "it auto-verified it. It didn't even ask
                 me. It didn't open up any pop-up" — and the bulk button was
                 the one path that still did it. It asks first now, naming
                 what is about to be locked and for how much. */
              onClick={() => setConfirmBulk(true)}
              className="cursor-pointer rounded-lg bg-blue-primary px-3 py-1.5 text-[12px] font-bold text-white transition-all hover:opacity-90 active:scale-[0.97] disabled:opacity-50"
            >
              Verify and lock {picked.size} ✓
            </button>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="cursor-pointer rounded-lg border border-border-light px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              Clear
            </button>
          </span>
        ) : (
        /* A LIST THAT CANNOT GROW OFF THE ROW (Anir, Aug 26: "if there's a
           100 groups, how is this gonna work on this people performance page?
           It's just not gonna work"). Naming every group inline was fine at
           three and unreadable at thirty. Two names and a count carries the
           same fact; the full list is on hover. */
        <span
          className="ml-auto shrink-0 text-[11px] text-text-tertiary"
          title={
            heads.length > 2
              ? `You can lock claims from: ${heads.map((g) => g.name).join(", ")}`
              : undefined
          }
        >
          {heads.length === 0 ? null : heads.length <= 2 ? (
            <span className="flex items-center gap-1.5">
              You lock claims from
              {heads.map((g, i) => (
                <span key={g.id} className="flex items-center gap-1.5">
                  {i > 0 && <span>and</span>}
                  <GroupPill name={g.name} size="sm" />
                </span>
              ))}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              You lock claims from
              <GroupPill name={heads[0].name} size="sm" />
              <span>and {heads.length - 1} other groups</span>
            </span>
          )}
        </span>
        )}
      </div>
      <div className="freyr-fold" data-open={expanded ? "true" : "false"}>
      <div>
      {queue.length === 0 ? (
        (() => {
          /* AN EMPTY QUEUE IS NOT ALWAYS AN EMPTY DESK. Claims this reader
             sent back left the queue on purpose — they wait on the person who
             made them — but "nothing pending" would read as nothing
             outstanding at all, which is how a sent-back claim gets forgotten
             by both sides. */
          const withThem = state.actuals.filter(
            (a) => awaitingTheirFix(a) && canVerifyEntry(state, meName, a.person)
          ).length;
          return (
            <p className="px-4 py-3 text-[13px] text-text-secondary">
              Nothing waiting on you. New claims from your people land here with
              their evidence.
              {withThem > 0 && (
                <span className="text-text-primary">
                  {" "}
                  {withThem} {withThem === 1 ? "claim is" : "claims are"} sent
                  back and waiting on them to fix.
                </span>
              )}
            </p>
          );
        })()
      ) : (
        /* A NUMBERED TABLE, not a stack of rows (Anir, Aug 15: "I should
           clearly see this is number one, this is number two... right now, if
           there are two things, they would be really hard to see"). Same
           column rhythm as Logged results below it, so the two read as one
           system. */
        <div className="overflow-hidden">
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[3%]" />
              <col className="w-[3%]" />
              <col className="w-[15%]" />
              <col className="w-[18%]" />
              <col className="w-[9%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-border-light bg-surface/50 text-left text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary [&>th]:whitespace-nowrap">
                <th className="w-9 p-0">
                  <label
                    className="flex cursor-pointer items-center px-3 py-2.5"
                    title="Select every claim waiting on you"
                  >
                    <input
                      type="checkbox"
                      aria-label="Select every claim"
                      checked={picked.size > 0 && picked.size === queue.length}
                      ref={(el) => {
                        if (el) el.indeterminate = picked.size > 0 && picked.size < queue.length;
                      }}
                      onChange={(e) =>
                        setPicked(
                          e.target.checked ? new Set(queue.map((x) => x.id)) : new Set()
                        )
                      }
                      className="h-4 w-4 cursor-pointer accent-[color:#0071E3]"
                    />
                  </label>
                </th>
                <th className="px-2.5 py-2.5">#</th>
                <th className="px-2.5 py-2.5">Logged by</th>
                <th className="px-2.5 py-2.5">Goal</th>
                <th className="px-2.5 py-2.5">Amount</th>
                <th className="px-2.5 py-2.5">Customer</th>
                <th className="px-2.5 py-2.5">Date</th>
                <th className="px-2.5 py-2.5">Evidence</th>
                <th className="px-2.5 py-2.5">Your call</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {queue.map((a, i) => {
                const goal = state.goals.find((g) => g.id === a.goalId);
                return (
                  <Fragment key={a.id}>
                    <tr
                      className={cn(
                        "transition-colors",
                        picked.has(a.id) ? "bg-blue-light/35" : "hover:bg-surface"
                      )}
                    >
                      {/* THE WHOLE CELL TICKS THE BOX (Anir, Aug 20: "I
                          can't tick anything"). A bare 14px square in a
                          32px-tall row is a target you miss more often than
                          you hit; the label wraps the padding so anywhere in
                          the column counts as the click. */}
                      <td className="p-0">
                        <label className="flex cursor-pointer items-center px-3 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${a.person}'s claim`}
                            checked={picked.has(a.id)}
                            onChange={(e) =>
                              setPicked((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(a.id);
                                else next.delete(a.id);
                                return next;
                              })
                            }
                            className="h-4 w-4 cursor-pointer accent-[color:#0071E3]"
                          />
                        </label>
                      </td>
                      <td className="px-2.5 py-3 text-[12px] font-bold text-text-tertiary tnum">
                        {i + 1}
                      </td>
                      <td className="px-2.5 py-3">
                        <span className="flex min-w-0 items-center gap-2" title={a.person}>
                          <Avatar name={a.person} className="h-7 w-7 shrink-0 text-[10px]" />
                          <span className="truncate text-[13px] font-semibold text-text-primary">
                            {compactPersonName(a.person)}
                          </span>
                        </span>
                      </td>
                      <td className="min-w-0 px-2.5 py-3">{goalChip(state, a.goalId, { compact: true })}</td>
                      <td className="whitespace-nowrap px-2.5 py-3 text-[13px] font-semibold text-text-primary tnum">
                        {goal ? fmtAmount(goal.unit, a.amount, a.currency) : a.amount}
                      </td>
                      <td className="px-2.5 py-3">
                        <CustomerCell
                          customer={a.customer}
                          customerId={a.customerId}
                          logoClassName="h-7 w-7 text-[9px]"
                          max={3}
                        />
                      </td>
                      <td
                        className="whitespace-nowrap px-2.5 py-3 text-[12px] text-text-secondary tnum"
                        title={a.addedAt ? `Logged ${stampedAt(a.addedAt)}` : undefined}
                      >
                        <span className="block"><DateText value={a.date} /></span>
                        {stamp(a.addedAt).time && (
                          <span className="block text-[10px] text-text-tertiary">
                            Logged {stamp(a.addedAt).time}
                          </span>
                        )}
                      </td>
                      <td className="px-2.5 py-3">
                        <EvidenceLinks entry={a} compact />
                      </td>
                      <td className="px-2.5 py-3">
                        {/* ONE BUTTON: READ IT, THEN DECIDE. */}
                        <button
                          type="button"
                          onClick={() => {
                            setReviewId(a.id);
                          }}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[rgba(0,113,227,0.28)] bg-white px-2.5 py-1.5 text-[12px] font-bold text-blue-primary transition-all hover:bg-blue-light active:scale-[0.97]"
                        >
                          <Eye size={13} strokeWidth={2.4} /> Review
                        </button>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>
      </div>
      {confirmBulk && (() => {
        const chosen = queue.filter((q) => picked.has(q.id));
        /* The bulk confirm adds ONLY like with like (Aug 23 audit): this
           summed every picked claim's raw number regardless of unit — and a
           mixed pick printed meetings + percents as dollars. Money converts
           and sums; a mixed pick states the count of claims instead of
           inventing a total. */
        const units = new Set(
          chosen.map((q) => state.goals.find((g) => g.id === q.goalId)?.unit ?? "currency")
        );
        const unit = units.size === 1 ? [...units][0] : null;
        const total =
          unit === null
            ? 0
            : chosen.reduce(
                (t, q) =>
                  t +
                  (unit === "currency"
                    ? inGoalCurrency(q, undefined, state.rates)
                    : q.amount || 0),
                0
              );
        const people = [...new Set(chosen.map((q) => q.person))];
        return (
          <Modal
            open
            onClose={() => setConfirmBulk(false)}
            title={`Verify and lock ${chosen.length} ${chosen.length === 1 ? "claim" : "claims"}`}
          >
            <p className="text-[13.5px] leading-relaxed text-text-secondary">
              This signs off{" "}
              <b className="text-text-primary tnum">
                {unit === null
                  ? `${chosen.length} ${chosen.length === 1 ? "claim" : "claims"}`
                  : fmtAmount(unit, total)}
              </b>{" "}
              from{" "}
              <b className="text-text-primary">
                {people.length === 1 ? people[0] : `${people.length} people`}
              </b>
              . Locked claims count toward their goals and cannot be edited
              until you send them back.
            </p>
            <ul className="mt-3 max-h-[220px] space-y-1.5 overflow-y-auto">
              {chosen.map((q) => (
                <li
                  key={q.id}
                  className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5 text-[12.5px]"
                >
                  <Avatar name={q.person} className="h-5 w-5 shrink-0 text-[7px]" />
                  <span className="min-w-0 flex-1 truncate text-text-primary">
                    {q.person}
                    {q.customer ? ` · ${q.customer}` : ""}
                  </span>
                  <b className="shrink-0 text-text-primary tnum">
                    {fmtAmount(
                      state.goals.find((g) => g.id === q.goalId)?.unit ?? "currency",
                      q.amount
                    )}
                  </b>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmBulk(false)}
                className="cursor-pointer rounded-lg border border-border-light px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  // One at a time on the wire: the server checks ownership per
                  // entry, and a partial failure must not look like a success.
                  let done = 0;
                  for (const id of picked) {
                    const ok = await run({ op: "verify-actual", actualId: id }, "");
                    if (ok) done += 1;
                  }
                  setPicked(new Set());
                  setConfirmBulk(false);
                  // Say what actually landed, not what was asked for.
                  if (done < chosen.length) {
                    window.setTimeout(
                      () =>
                        alert(
                          `${done} of ${chosen.length} verified. The rest were refused — refresh and check who owns them.`
                        ),
                      50
                    );
                  }
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
              >
                <Check size={14} strokeWidth={2.8} /> Verify and lock
              </button>
            </div>
          </Modal>
        );
      })()}
      {(() => {
        const a = queue.find((x) => x.id === reviewId);
        if (!a) return null;
        return (
          <ClaimReviewDialog
            entry={a}
            state={state}
            run={run}
            busy={busy}
            onClose={() => setReviewId(null)}
            onPreview={setPreview}
          />
        );
      })()}

      {preview && (
        <EvidencePreview file={preview} onClose={() => setPreview(null)} />
      )}
    </Card>
  );
}


/**
 * REVIEW A CLAIM, THEN DECIDE — shared by the verification queue and the
 * standalone goal page's rail, which until now still had the original
 * one-click Verify and locked money with no dialog at all (Anir, Aug 16: "it
 * auto-verified it. It didn't even ask me. It didn't open up any pop-up").
 *
 * One copy, so the two can never drift apart again.
 */
export function ClaimReviewDialog({
  entry: a,
  state,
  run,
  busy,
  onClose,
  onPreview,
  startInSendBack = false,
}: {
  entry: PerfActual;
  state: PerformanceState;
  run: RunOp;
  busy: boolean;
  onClose: () => void;
  onPreview?: (file: { name: string; url: string }) => void;
  /** Open on the note step. Used by the send-back icon in Actions, which is
   *  a way IN to this decision, not a different one (Anir, Aug 19: "pressing
   *  it should open a popup, not whatever you have rn" — it used to drop an
   *  input row inside the table). */
  startInSendBack?: boolean;
}) {
  const [sendingBack, setSendingBack] = useState(startInSendBack);
  /** Already signed off: this dialog is here to take that back, not to do it
   *  again, so it says so and drops the Verify button. */
  const locked = entryStatus(a) === "verified";
  const [note, setNote] = useState("");
  const goal = state.goals.find((g) => g.id === a.goalId);
  const sub = goal?.subgoals.find((x) => x.id === a.subgoalId);
  const close = () => {
    setSendingBack(false);
    setNote("");
    onClose();
  };
  return (
          /**
           * EVERYTHING YOU NEED TO MAKE THE CALL, IN ONE PLACE (Anir, Aug 16:
           * "I should be able to see all the information about that that I
           * would need to verify. Put yourself in my position where I'm trying
           * to verify something"). Who claimed it, against which goal and
           * subgoal, for how much, for whom, when it happened, when it was
           * entered, what they wrote, and the proof big enough to judge —
           * then accept or decline without leaving.
           */
          <Modal
            open
            onClose={close}
            title={locked ? "Unlock and send this claim back" : "Verify this claim"}
            size="workflow"
          >
            {/* THE SAME MEASURED BAR AS EVERY OTHER SCREEN (Anir, Aug 23:
                "this bar at the top — fix it, make it like the bars I like,
                clearly labelled").

                It had its own private shape: a legend of coloured dots and a
                percentage floating on the right. Every other bar in the
                module is read the same way — $0 pinned at the left end, the
                target pinned at the right end where the target actually is,
                and the value of each coloured segment immediately underneath.
                This one now uses the same SegmentValues component, so it
                cannot drift from them again.

                Solid green is signed off; striped yellow is still waiting;
                red means sent back. "% there" counts verified money only — the one
                dialog whose entire job is deciding what counts must not
                announce a number that includes what it has not yet counted. */}
            {/* THE TIMELINE IS A FULL-HEIGHT RAIL DOWN THE RIGHT (Anir,
                Aug 24: "the timeline should go on the complete right side.
                That line right underneath the X — that's where it needs to
                go. Extend that vertical line up so it takes that portion, and
                everything else is to the left. That's a lot more space, and if
                I'm scrolling on the timeline that's the only place I'm
                scrolling").

                It was already a rail, but it started halfway down — under the
                bar and the claimant card, which both ran full width — so it
                got the bottom third of the dialog and four steps filled it.
                Twenty steps would have set the height of the whole dialog and
                pushed the two buttons off the bottom, which is the failure he
                was predicting.

                Now the split starts at the header rule: everything about the
                claim is one scrolling column on the left, the story is its own
                scrolling column on the right, and neither can push the other
                or the footer around. Below 1024px it stacks, because a 248px
                column of timestamps is unreadable on a phone. */}
            <div className="flex min-h-0 flex-col gap-5 lg:h-[min(60vh,520px)] lg:flex-row lg:gap-0">
              <div className="min-w-0 flex-1 lg:overflow-y-auto lg:pr-6">
            {goal && goal.target > 0 && (() => {
              const status = entryStatus(a);
              const verifiedOthers = goalFamilyActuals(state, goal)
                .filter((x) => x.id !== a.id && entryStatus(x) === "verified")
                .reduce((t, x) => t + (x.amount || 0), 0);
              const verifiedTotal =
                verifiedOthers + (status === "verified" ? a.amount : 0);
              const share = (n: number) =>
                Math.min(100, (n / goal.target) * 100);
              const claimColor =
                status === "verified"
                  ? ENTRY_COLOR.verified
                  : status === "sent_back"
                    ? ENTRY_COLOR.sent_back
                    : ENTRY_COLOR.reported;
              const claimProgressColor = GOAL_PROGRESS_COLOR[status];
              const claimWord =
                status === "verified"
                  ? "this claim"
                  : status === "sent_back"
                    ? "this claim, sent back"
                    : "this claim, waiting";
              return (
                <div className="mb-3 rounded-xl bg-surface px-3.5 pb-3 pt-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <b className="text-[13.5px] font-bold text-text-primary">
                      {goal.name}
                    </b>
                    {/* THE PERCENT IS THE NUMBER (Anir, Aug 30: "I can't even
                        see the percent here as well, so make sure I can see
                        that"). It was set at 11.5px in secondary grey inside a
                        sentence, so the one figure that says where this goal
                        stands was the smallest thing in the card. The figure
                        carries the goal's own verdict colour and the sentence
                        steps back behind it. */}
                    <span className="flex items-baseline gap-1.5 tnum">
                      <b
                        className="text-[16px] font-bold"
                        style={{
                          color:
                            pctMet(verifiedTotal, goal.target) >= 85
                              ? "#15803D"
                              : pctMet(verifiedTotal, goal.target) >= 55
                                ? "var(--ink-bright-blue)"
                                : "var(--ink-amber)",
                        }}
                      >
                        {Math.min(100, Math.round(pctMet(verifiedTotal, goal.target)))}%
                      </b>
                      <span className="text-[11.5px] text-text-tertiary">
                        there, counting what is signed off
                      </span>
                    </span>
                  </div>
                  {/* The two ends, labelled, exactly like the pace track. */}
                  <div className="mt-2 flex items-baseline justify-between text-[10.5px] font-semibold text-text-tertiary tnum">
                    <span>{fmtAmount(goal.unit, 0)}</span>
                    <span className="font-bold text-text-primary">
                      {fmtAmount(goal.unit, goal.target)}
                    </span>
                  </div>
                  <span className="mt-1 flex h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--border-light)]">
                    <span
                      className="block h-full"
                      style={{
                        width: `${share(verifiedOthers)}%`,
                        background: ENTRY_COLOR.verified,
                      }}
                    />
                    {status === "verified" ? (
                      <span
                        className="block h-full"
                        style={{
                          width: `${share(a.amount)}%`,
                          background: ENTRY_COLOR.verified,
                          boxShadow:
                            verifiedOthers > 0
                              ? "inset 1.5px 0 0 rgba(255,255,255,0.75)"
                              : undefined,
                        }}
                      />
                    ) : (
                      <span
                        className="unverified-fill block h-full"
                        style={{
                          width: `${share(a.amount)}%`,
                          ["--fill" as string]: claimProgressColor,
                        }}
                      />
                    )}
                  </span>
                  <SegmentValues
                    unit={goal.unit}
                    parts={[
                      {
                        key: "signed",
                        value: verifiedOthers,
                        pct: share(verifiedOthers),
                        color: ENTRY_COLOR.verified,
                      },
                      {
                        key: "claim",
                        value: a.amount,
                        pct: share(a.amount),
                        color: claimProgressColor,
                      },
                    ]}
                  />
                  {/* The values carry the figures; this names them, so a
                      reader never has to match a colour to a meaning. */}
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[10.5px] text-text-tertiary">
                    {verifiedOthers > 0 && (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: ENTRY_COLOR.verified }}
                        />
                        already signed off
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: claimColor }}
                      />
                      {claimWord}
                    </span>
                  </div>
                </div>
              );
            })()}
            <div className="flex items-center gap-3 rounded-xl bg-surface px-3.5 py-3">
              <Avatar name={a.person} className="h-10 w-10 text-[13px]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-text-primary">
                  {a.person}
                </span>
                <span className="block text-[12px] text-text-secondary">
                  claimed on <DateText value={a.date} />
                </span>
              </span>
              <span className="shrink-0 text-right">
                <b className="block text-[22px] font-extrabold tracking-[-0.02em] text-text-primary tnum">
                  {goal ? fmtAmount(goal.unit, a.amount, a.currency) : a.amount}
                </b>
              </span>
            </div>

            {/* THE FACTS ON THE LEFT, THE STORY DOWN THE SIDE (Anir, Aug 23:
                "the timeline just looks ugly, it's taking up an unnecessary
                amount of space... I like the vertical side thing, where it
                gets on the right side completely and just shows a timeline").

                It ran full width across the middle, so four stacked steps set
                the height of the whole dialog and pushed the proof and the
                two buttons off the bottom. As a rail it is exactly as tall as
                the facts beside it, and the dialog is only as tall as
                whichever side is taller. Below 900px it drops back under the
                facts rather than squeezing into a column too narrow to read.
                Same pattern the expanded Logged-results row already uses. */}
            <div className="mt-3.5">
              <div className="min-w-0">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                  <Fact label="Goal">{goal?.name ?? "Goal removed"}</Fact>
                  <Fact label="Subgoal">
                    {sub?.name ?? (
                      <span className="text-text-tertiary">logged on the goal itself</span>
                    )}
                  </Fact>
                  <Fact label="Customer">
                    <CustomerCell customer={a.customer} customerId={a.customerId} />
                  </Fact>
                  <Fact label="Deal">
                    {a.dealLabel ?? (
                      <span className="text-text-tertiary">not tied to a deal</span>
                    )}
                  </Fact>
                  <Fact label="Their note">
                    {a.note ?? <span className="text-text-tertiary">none</span>}
                  </Fact>
                </div>

                {/* THE PROOF DOES NOT LOAD ITSELF (Anir, Aug 23: "I don't like
                    the preview in the popup, it's ugly" — and he had said it
                    once before). A full-height render of whatever someone
                    happened to attach was the tallest thing in a dialog whose
                    job is a yes or a no, and a screenshot of a dark room told
                    a verifier nothing they could not get from the filename.
                    It is a row now: what it is called, and one click to open
                    it properly. */}
                <div className="mt-4">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.02em] text-text-tertiary">
                    Proof
                  </span>
                  {a.evidence?.length ? (
                    <div className="mt-1.5 space-y-1.5">
                      {a.evidence.map((e) => (
                        <EvidencePeek key={e.url || e.name} file={e}>
                          <button
                            type="button"
                            onClick={() => onPreview?.(e)}
                            title={`Open ${e.name}`}
                            className="group flex w-full cursor-pointer items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 py-2 text-left transition-colors hover:border-blue-subtle hover:bg-blue-light/40"
                          >
                            <Paperclip
                              size={13}
                              strokeWidth={2.1}
                              className="shrink-0 text-text-tertiary group-hover:text-blue-primary"
                            />
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text-primary group-hover:text-blue-primary">
                              {e.name}
                            </span>
                            <span className="shrink-0 text-[11.5px] font-semibold text-blue-primary">
                              View
                            </span>
                          </button>
                        </EvidencePeek>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[12.5px] text-text-secondary">
                      Nothing attached. Send it back and ask for the contract or SOW.
                    </p>
                  )}
                </div>
              </div>
            </div>
              </div>

              {/* The rail: its own scroller, so a twenty-step history scrolls
                  inside this column and nothing else on the screen moves. */}
              <div className="shrink-0 border-t border-border-light pt-4 lg:min-h-0 lg:w-[268px] lg:overflow-y-auto lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <EntryTimeline
                  entry={a}
                  person={a.person}
                  owners={(state.groups ?? [])
                    .filter((g) => g.head && g.head !== a.person && (g.members ?? []).includes(a.person))
                    .map((g) => g.head)
                    .filter((h, i, all) => all.indexOf(h) === i)}
                />
              </div>
            </div>

            {sendingBack && (
              <div className="tab-panel mt-4 rounded-xl border border-border-light bg-surface p-3">
                <label className="block text-[12px] font-semibold text-text-primary">
                  What needs fixing before you can verify this?<RequiredMark />
                </label>
                <input
                  required
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  autoFocus
                  placeholder="They see this note"
                  className="mt-1.5 h-[38px] w-full rounded-lg border border-border-light bg-white px-3 text-[13px] outline-none focus:border-blue-subtle"
                />
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {sendingBack ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSendingBack(false)}
                    className="cursor-pointer rounded-lg border border-border-light bg-white px-4 py-2 text-[13.5px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await run(
                        { op: "send-back-actual", actualId: a.id, note },
                        "Sent back with your note"
                      );
                      if (ok) close();
                    }}
                    className="cursor-pointer rounded-lg bg-[color:#B02020] px-4 py-2 text-[13.5px] font-semibold text-white transition-colors hover:bg-[color:#8F1A1A] disabled:opacity-50"
                  >
                    Send it back
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setSendingBack(true)}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2 text-[13.5px] transition-colors",
                      locked
                        ? "bg-[color:#B02020] font-semibold text-white hover:bg-[color:#8F1A1A]"
                        : "border border-border-light bg-white font-semibold text-[color:var(--status-red)] hover:bg-[rgba(220,38,38,0.08)]"
                    )}
                  >
                    <RotateCcw size={14} strokeWidth={2.4} />
                    {locked ? "Unlock and send back" : "Send back"}
                  </button>
                  {!locked && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await run(
                          { op: "verify-actual", actualId: a.id },
                          "Verified and locked. It counts now"
                        );
                        if (ok) close();
                      }}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13.5px] font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
                    >
                      <Check size={14} strokeWidth={2.8} /> Verify and lock
                    </button>
                  )}
                </>
              )}
            </div>
          </Modal>
        );
}

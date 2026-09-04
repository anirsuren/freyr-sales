"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { setLeaveAsker } from "@/lib/unsavedGuard";
import { expandMoneyShorthand } from "@/lib/moneyShorthand";
import { statusColor } from "@/lib/opportunitiesShared";
import { formatDayLabel } from "@/lib/utils";
import { AgentAvatar, agentIn } from "@/components/ui/AgentAvatar";
import { ViewSwitch } from "@/components/ui/ViewSwitch";
import {
  Banknote,
  Briefcase,
  Check,
  ChevronDown,
  Loader2,
  NotebookPen,
  Package,
  ShieldAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { CalendarRange } from "lucide-react";
import { currencyGlyph } from "@/components/ui/CurrencyGlyph";
import {
  monthLabel,
  type AccrualPlan,
} from "@/lib/revenueAccrualsShared";
import {
  BASE_CURRENCY,
  CURRENCIES,
  convertToUsd,
  currencyMeta,
  rateFor,
  setFxRates,
} from "@/lib/currency";
import {
  DEAL_TYPES,
  OPPORTUNITY_LEVELS,
  OPPORTUNITY_STATUSES,
  REVENUE_TYPES,
  type Opportunity,
} from "@/lib/opportunitiesShared";
import { cn } from "@/lib/utils";
import { ConfidenceSlider } from "./ConfidenceSlider";
import { DealPeople, type DealTeam } from "./DealPeople";
import { tint } from "@/lib/tint";

/**
 * THE OVERVIEW TAB IS THE EDIT FORM.
 *
 * Suren, Sep 1, on a deal page: "This overview can be the edit deal, actually,
 * and within the overview, let them edit if you want." And again, plainly:
 * "When I press Add a Deal, remember all the shit that's there has to be in the
 * overview section underneath in little sections and stuff."
 *
 * So every field the Add a Deal form asks for is here, grouped into little
 * titled sections, on the tab somebody already opens to read the deal. No trip
 * to a separate edit screen, and no subset.
 *
 * THE SECTIONS OF RECORDS ARE NOT HERE. Same call: "The edit deal has all these
 * things below, right? These things we also don't need, right, because the tabs
 * are already here." Contracts, submissions, presentations, meetings and
 * accruals are each a tab one row above, carrying their own count and their own
 * add button. This surface carries deal FIELDS.
 *
 * EVERY FIELD SAVES ITSELF. The rest of the app writes one key at a time
 * (EditableFact, the offerings editor) and the update API merges, so a single
 * key leaves the other fourteen alone and two people editing different facts on
 * the same deal never overwrite each other. A page-wide Save button cannot
 * promise that, and it would be a second interaction for a job the app already
 * has one for. Pickers commit the moment they are picked; typed boxes commit
 * when you leave them or press Enter; the confidence bar commits when you let
 * go of it.
 */

/* Each type gets its own colour, by the standing rule that a category chip is
   never plain grey. Deliberately none of red/amber/green: those mean health
   here, and a renewal is not a warning. */
const DEAL_TONE: Record<string, string> = {
  "New business": "var(--ink-bright-blue)",
  "Existing business": "var(--ink-teal-deep)",
  Renewal: "var(--ink-violet-soft)",
};

/* Three levels since Sep 1, when Suren retired Future ("just pipeline. We
   have high confidence, go-get pipeline"). The picker reads
   OPPORTUNITY_LEVELS, so it lost the fourth option on its own; this map lost
   its fourth colour by hand, because a leftover key here would quietly wait
   to colour something that can no longer exist. */
const LEVEL_TONE: Record<string, string> = {
  "Go get": "var(--ink-teal-deep)",
  "High confidence": "var(--ink-bright-blue)",
  Pipeline: "var(--ink-violet-soft)",
};

const STATUS_TONE = "var(--ink-bright-blue)";
const REVENUE_TONE: Record<string, string> = { ARR: "var(--ink-teal-deep)" };
const REVENUE_FALLBACK = "var(--ink-magenta)";
const OFFERING_TONE = "var(--ink-magenta)";

/** Digits only, and empty stays empty: a blank ACV means nobody has said it
 *  yet, which is not the same claim as zero. */
function num(v: string): number | null {
  const t = v.replace(/[^0-9.]/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * THE DOLLAR FIGURE, WRITTEN OUT IN FULL.
 *
 * Not the app's usual $1.2M shorthand. This row exists so somebody can check
 * a conversion against the contract in front of them, and "1.2M" is exactly
 * the wrong amount of precision for that. Rounded to the dollar, because
 * cents on a pipeline figure are noise.
 */
function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** "1 Sep 2026". A date belongs in a sentence, not as 2026-09-01.
 *
 *  THE PARSING LIVES IN lib/utils NOW. This built the date with `Date.parse`,
 *  which reads a bare YYYY-MM-DD as UTC midnight and then printed it in the
 *  local zone — so every date on this screen showed a day early anywhere west
 *  of Greenwich. See `parseCalendarDate`. */
const dayLabel = (iso: string) => formatDayLabel(iso);

const INPUT =
  "h-10 w-full rounded-lg border border-border-light bg-white px-3 text-[13px] text-text-primary outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * ONE SECTION, AND EVERY SECTION THE SAME SHAPE BUT NOT THE SAME COLOUR.
 *
 * Deliberately not the shared FormSection the offerings editor uses: that card
 * paints itself with three literal near-white hexes and nothing behind them in
 * dark mode, so a stack of them here would come out white on a charcoal app.
 * This is the same shape drawn in the theme's own tokens, which follow dark
 * mode without being asked.
 *
 * SEPARATED, NOT MERELY STACKED (Anir, Sep 1: "I need you to separate the
 * sections better so it's more clear"). Five cards of identical white with five
 * identical blue icon tiles read as one soft wall — you cannot tell at a glance
 * where the money ends and the timing begins, and he reads this page at a
 * glance. So each section carries its OWN colour on three things at once: a
 * rail down its left edge, the wash behind its header, and its icon tile. That
 * is the separation; the extra air between the cards is the rest of it.
 *
 * NOT A BORDER PER SECTION, which would be five more lines on a page that
 * already has enough. The rail is one edge of the card it already had.
 *
 * NONE OF THE COLOURS IS RED, AMBER OR GREEN. Those three mean health in this
 * app and nothing else may borrow them.
 *
 * Not collapsible either. Folding is what the old edit page needed when it
 * carried six sections of records; five groups of fields, on the tab somebody
 * opened to read the deal, should all simply be there.
 *
 * NO `h-full`. It was here to make a two-card row come out level, and it is
 * what kept the People card as tall as the note box beside it even after that
 * row stopped asking for stretch: `height:100%` on a grid item resolves against
 * the ROW, and the row is as tall as its tallest card. A grid gives equal
 * heights on its own when it wants them (align-items defaults to stretch);
 * spelling it out here took the choice away from every row.
 */
function Card({
  icon: Icon,
  title,
  hint,
  startOpen = true,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  /** Whether it is unfolded on arrival. See the note on each call. */
  startOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);

  return (
    <section
      className="relative flex flex-col overflow-hidden rounded-2xl border border-border-light bg-white shadow-card"
    >
      {/* THE RAIL IS AN ELEMENT, NOT AN INSET SHADOW.
          Anir, Sep 1: "there's a little break in the line on the left. I told
          you to fix this before."

          He is right and here is the cause. The rail was `inset 3px 0 0 0` on
          this section, which paints inside the section's own border box but
          UNDER its children. The header carries a 1px bottom border across the
          full width, so at that one row the border sat on top of the rail and
          chopped it. A 1px nick, but it reads as a broken line because the eye
          follows the edge.

          Drawn as a sibling above both, the rail cannot be painted over by
          anything inside the card, whatever borders those children grow later.
          pointer-events-none so it never eats a click meant for the header. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[3px]"
        style={{ background: ACCENT }}
      />
      {/**
       * THE WHOLE HEADER IS THE CONTROL, AND IT IS ONE BUTTON.
       *
       * Anir, Sep 1: "I think all these should be dropdowns."
       *
       * NOTHING INTERACTIVE MAY GO INSIDE THIS. It is a <button>, so a second
       * button in here (an InfoHint, a link, a menu) is the nested-interactive
       * mistake that broke hydration on /opportunities today. Anything that
       * needs its own click goes BESIDE this element, as a sibling, never
       * within it.
       *
       * `aria-expanded` and `aria-controls` rather than a bare chevron, so this
       * announces itself as a fold to somebody who cannot see the arrow turn.
       */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`${title.replace(/\s+/g, "-").toLowerCase()}-panel`}
        /* THE SHAPE OF THE FOLD ON THE ACCRUALS PAGE, COPIED.
           Anir, Sep 1, pointing at "When this money is planned to land": "this
           looks odd because it's not centered. Look at the dropdown where it
           says Where this money lands. That looks better. Copy that."

           What made this one look off was the stacking. A 36px icon TILE next
           to a title with the hint on a second line underneath gives the row
           three different vertical anchors, so nothing lines up with the
           chevron and the whole header reads as top-heavy. The accruals fold
           puts a small plain icon, the title and its subtitle on ONE baseline
           and centres the control against them.

           So: no tile, a 15px icon in the accent, title and hint inline, and
           everything on one centre line. The hint wraps under on a narrow card
           because the row is flex-wrap, which is the accruals behaviour too. */
        className="flex w-full cursor-pointer items-center gap-2.5 px-5 py-3.5 text-left transition-colors"
        /* A wash, not a fill: 5% of the accent lets the card's own background
           through, so it lands right in both themes without a second colour.
           The border is drawn here rather than on the panel so it survives the
           fold and the card keeps its lid. */
        style={{
          background: tint(ACCENT, 5),
          borderBottom: open ? "1px solid var(--border-light)" : "none",
        }}
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-text-primary">
            <Icon
              size={15}
              strokeWidth={2}
              aria-hidden="true"
              style={{ color: ACCENT }}
            />
            {title}
          </span>
          <span className="text-[12.5px] text-text-secondary">{hint}</span>
        </span>
        <ChevronDown
          size={17}
          strokeWidth={2.2}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-text-secondary transition-transform duration-200",
            !open && "-rotate-90"
          )}
        />
      </button>
      {/* UNMOUNTED WHEN FOLDED, not hidden. A display:none panel keeps every
          input in the tree, so a folded section would still be reachable by
          Tab and still be a form somebody can type into by accident. */}
      {open && (
        <div
          id={`${title.replace(/\s+/g, "-").toLowerCase()}-panel`}
          /* flex column so a child asking for h-full has a definite height to
             resolve against; without it the notes box collapses to its rows. */
          className="flex flex-1 flex-col p-5"
        >
          {children}
        </div>
      )}
    </section>
  );
}

/**
 * ONE COLOUR FOR EVERY SECTION, AND IT IS THE APP'S BLUE.
 *
 * The first cut gave the five sections five different hues so they could be
 * told apart at a glance. Anir, Sep 1: "I don't like the colors. Just make them
 * all blue."
 *
 * The separation was never the hue. It is the rail, the wash and the tinted
 * icon tile, and those all stay; only the colour in them changed. A stack of
 * five differently-coloured cards also reads as five CATEGORIES of thing, which
 * these are not: they are five parts of one deal.
 */
const ACCENT = "var(--ink-bright-blue)";

/**
 * A LABEL, A CONTROL, AND WHAT HAPPENED TO IT.
 *
 * The tick and the spinner sit beside the label as plain spans. They must never
 * become buttons: a button inside this <label>, or inside any other button, is
 * the nested-interactive mistake that broke hydration on /opportunities.
 */
function Field({
  label,
  hint,
  state = "idle",
  error,
  fill = false,
  children,
}: {
  /** A node, not just a string, so a required field can carry its star. */
  label: React.ReactNode;
  hint?: string;
  state?: SaveState;
  error?: string;
  /** Take the card's spare height. Only the notes box asks for this: it is
   *  the one control that is BETTER for being taller, so it is what the row
   *  gives its slack to when the card beside it is the tall one. */
  fill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("min-w-0", fill ? "flex h-full flex-col" : "block")}>
      <span className="flex items-center gap-1.5">
        <span className="text-[12px] font-semibold text-text-primary">
          {label}
          {hint && (
            <span className="ml-1.5 font-normal text-text-secondary">{hint}</span>
          )}
        </span>
        {state === "saving" && (
          <Loader2
            size={11}
            aria-hidden="true"
            className="shrink-0 animate-spin text-blue-primary"
          />
        )}
        {state === "saved" && (
          <span className="inline-flex shrink-0 items-center gap-0.5 text-[10.5px] font-bold text-success">
            <Check size={11} strokeWidth={3} aria-hidden="true" />
            Saved
          </span>
        )}
      </span>
      <span className={cn("mt-1.5", fill ? "flex min-h-0 flex-1 flex-col" : "block")}>
        {children}
      </span>
      {state === "error" && error && (
        <span className="mt-1 block text-[11px] font-semibold text-error">
          {error}
        </span>
      )}
    </label>
  );
}

/**
 * THE SAME FIELD, WITH NOBODY'S HAND ON IT.
 *
 * View-only does not get disabled boxes. A greyed-out input says "this control
 * is broken today", which is the wrong sentence. The right one is "this is
 * what the deal says". Same label, same column, same height, so the two modes
 * are the same page rather than two layouts.
 */
function ReadValue({
  text,
  tone,
  empty = false,
}: {
  text: string;
  /** A colour-coded chip for the fields that are categories. */
  tone?: string;
  empty?: boolean;
}) {
  if (tone && !empty) {
    /* THE AGENT'S FACE INSTEAD OF THE DOT (Anir, Sep 3: "offering still does
       not have the icon"). The pickers learned this already; this is the
       READ-ONLY chip, a separate renderer, and it kept drawing the generic
       tone dot beside Agent.Via — which is the third place this same fix was
       needed and the one that stayed visible on the deal itself. */
    const agent = agentIn(text);
    return (
      <span className="flex h-10 items-center">
        <span
          className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
          style={{ background: tint(tone, 8), color: tone }}
        >
          {agent ? (
            <AgentAvatar name={text} size={16} className="shrink-0" />
          ) : (
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: tone }}
            />
          )}
          <span className="truncate">{text}</span>
        </span>
      </span>
    );
  }
  return (
    <span className="flex h-10 items-center">
      <span
        className={cn(
          "truncate text-[13px]",
          empty ? "text-text-tertiary" : "font-medium text-text-primary"
        )}
        title={text}
      >
        {text}
      </span>
    </span>
  );
}

/** A fact the deal carries but nobody types: assigned by the system. */
/**
 * THE MANDATORY MARK (Anir, Sep 3: "make sure the mandatory stuff is in btw
 * (*)").
 *
 * Manoj's sheet stars ten fields on the deal and three on the accrual:
 * Opportunity Name*, Customer*, Offering*, Opportunity ID*, Date Added*,
 * Opportunity Category*, Confidence %*, Opportunity Status*, Opportunity
 * Type*, Expected to sign* — and Project Currency*, Estimated TCV*, Revenue
 * Accrual Schedule*. Revenue Type and Estimated ACV carry no star and do not
 * get one here.
 *
 * IT SAYS WHICH ONES MATTER, IT DOES NOT BLOCK A SAVE. This form commits each
 * field on blur, one at a time, so there is no single submit to refuse — and
 * a deal being written down while somebody is still on the phone should not be
 * unsaveable because the sign date is not known yet. The existing `missing`
 * check on the deal is what actually chases the gaps.
 */
/**
 * THE FIELDS MANOJ STARRED, by the key each one saves under. Revenue type and
 * Estimated ACV are unstarred on his sheet and are absent here on purpose.
 *
 * `estimatedTcv` covers the money box, which writes `value` alongside it — the
 * guard reads the patch, so clearing the box is caught whichever key it
 * arrives under.
 */
const REQUIRED_FIELDS: Record<string, string> = {
  name: "The opportunity name",
  customerId: "The customer",
  customer: "The customer",
  offeringId: "The offering",
  confidence: "The confidence",
  status: "The status",
  estSignDate: "The expected sign date",
  level: "The opportunity category",
  dealType: "The type of opportunity",
  currency: "The project currency",
  estimatedTcv: "The estimated TCV",
  value: "The estimated TCV",
};

function Req() {
  return (
    <span aria-label="required" title="Required" className="text-[color:var(--status-red)]">
      *
    </span>
  );
}

function StaticValue({ text, empty = false }: { text: string; empty?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-10 items-center rounded-lg border border-border-light bg-surface px-3 text-[13px]",
        empty ? "text-text-tertiary" : "font-medium text-text-secondary"
      )}
    >
      <span className="truncate" title={text}>
        {text}
      </span>
    </span>
  );
}

/**
 * THE OVERVIEW EDITOR.
 *
 * Mountable with nothing but the deal. `mayEdit` FAILS CLOSED: a parent that
 * forgets to pass it gets the read-only reading of the deal, never a form that
 * quietly hands the pen to somebody who was never given it. The gate itself is
 * decided on the server (mayTouchOpportunity) and re-checked by the API route
 * on every write, so this prop only decides what is drawn.
 */
export function DealOverviewEditor({
  deal,
  mayEdit = false,
  readOnly = false,
  why = "",
  customers = [],
  offerings = [],
  people = [],
  meName = "",
  team = null,
  mayChangeTeam = false,
  mayChangeOwner = false,
  accrualPlan = null,
  onOpenAccrual,
  accrualScheduler = null,
  onSave,
  onSaved,
  children,
}: {
  deal: Opportunity;
  /** Exactly the verdict the page's own Edit gate reads. Absent means view only. */
  mayEdit?: boolean;
  /**
   * SHOW, DO NOT EDIT. Different from `mayEdit`, and the difference matters:
   * `mayEdit` false means this person is NOT ALLOWED to change the deal and
   * gets told so; `readOnly` means this PLACE does not edit, no matter who is
   * looking. The overview is that place (Anir, Sep 3: "I do not want the
   * overview to have anything to do with editing... I have to press edit deal
   * to edit anything"), and a person who may edit must not be told the deal is
   * not theirs to change just because they are standing on it.
   */
  readOnly?: boolean;
  /** Why not, in the server's own words, when mayEdit is false. */
  why?: string;
  /** The accounts this deal may be moved between. Empty leaves it read-only. */
  customers?: { id: string; name: string }[];
  /** The offerings catalogue. Empty leaves the offering read-only. */
  offerings?: { id: string; name: string; type?: string }[];
  /** The roster the owner is picked from. Empty falls back to a typed name. */
  people?: string[];
  /** Whoever is looking, so they are the first name on the owner list. */
  meName?: string;
  /**
   * WHO IS ON THIS DEAL BESIDES THE OWNER, read from lib/recordTeams on the
   * server. Null is "nobody has ever been put on it", which the People section
   * says differently from an empty team because the two mean different things
   * for who may write.
   */
  team?: DealTeam;
  /**
   * MAY THIS PERSON CHANGE THAT LIST — the server's own verdict, from
   * recordWriteRefusal, which is the same call /api/record-team makes. FAILS
   * CLOSED: a parent that forgets it gets a read-only list of people and no
   * plus button, because putting somebody on a deal hands them the pen.
   */
  mayChangeTeam?: boolean;
  mayChangeOwner?: boolean;
  /** This deal's accrual schedule, shown inside the Revenue Accrual card
   *  (items 3 and 5). Read here, edited in the one accrual screen. */
  accrualPlan?: AccrualPlan | null;
  /** Opens that screen. Absent when this person may not plan. */
  onOpenAccrual?: () => void;
  /** The scheduler itself, mounted in this card (Manoj, Sep 3). Null for a
   *  reader, who gets the months read-only above it. */
  accrualScheduler?: React.ReactNode;
  /** Returns null on success, or a message to show. Defaults to the same
   *  /api/opportunities update the rest of the deal page posts. */
  onSave?: (patch: Record<string, unknown>) => Promise<string | null>;
  /** Called after a save lands, so the page behind can refresh. */
  onSaved?: () => void;
  /** Anything the deal page wants under the sections. */
  children?: React.ReactNode;
}) {
  const [name, setName] = useState(deal.name ?? "");
  const [level, setLevel] = useState<string>(deal.level ?? "Pipeline");
  const [status, setStatus] = useState<string>(deal.status ?? "");
  const [revenueType, setRevenueType] = useState<string>(deal.revenueType ?? "");
  const [dealType, setDealType] = useState<string>(deal.dealType ?? "");
  /**
   * WHICH MONEY THE THREE FIGURES BELOW ARE IN (Suren, Sep 1: "this is local
   * currency, local value, local estimated ACV, and local estimated TCV").
   *
   * Every deal on file predates this and every one of them is in dollars, so
   * an unset currency opens as USD rather than as an empty box demanding an
   * answer about a deal nobody has a question about.
   */
  const [currency, setCurrency] = useState<string>(deal.currency ?? BASE_CURRENCY);
  const [acv, setAcv] = useState(
    deal.estimatedAcv === undefined ? "" : String(deal.estimatedAcv)
  );
  const [tcv, setTcv] = useState(
    /**
     * One box for both fields, so it opens on whichever has been said — and
     * BLANK WHEN NEITHER HAS.
     *
     * `value` is 0 on every deal nobody has priced, so falling back to it
     * without this check printed "0" in the box on those deals (caught on
     * OPP-0007, which has an ACV and no TCV). Zero is a claim that the deal is
     * worth nothing; empty is the truth, that the number has not been said.
     * Same rule the ACV box beside it has always followed.
     */
    deal.estimatedTcv !== undefined
      ? String(deal.estimatedTcv)
      : deal.value
        ? String(deal.value)
        : ""
  );
  const [confidence, setConfidence] = useState(
    deal.confidence === undefined ? "" : String(deal.confidence)
  );
  const [signs, setSigns] = useState(deal.estSignDate ?? "");
  const [owner, setOwner] = useState(deal.owner ?? "");
  const [note, setNote] = useState(deal.nextSteps ?? "");

  /**
   * WHAT EACH FIELD IS DOING RIGHT NOW, keyed by field.
   *
   * A save that lands says so for a moment and then goes quiet again. A save
   * that fails says so and stays said, and the value goes back to what the
   * server still holds, because a field that keeps showing what you typed after a
   * rejected write is the worst possible answer, because it looks saved.
   */
  const [state, setState] = useState<Record<string, SaveState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const alive = useRef(true);

  useEffect(() => {
    const held = timers.current;
    return () => {
      alive.current = false;
      for (const t of Object.values(held)) clearTimeout(t);
    };
  }, []);

  /**
   * WHAT THE SERVER CURRENTLY HOLDS, in the shape the patch is written in.
   *
   * Not read straight off `deal`, because the two disagree on what "nothing"
   * is: an unset value is `undefined` on the record and `0` in the patch, an
   * unset ACV is `undefined` and `null`. Comparing raw would make every blur on
   * an untouched empty box look like a change and post a write nobody asked
   * for. These are the same defaults the whole-form version used.
   */
  const baseline: Record<string, unknown> = {
    name: deal.name ?? "",
    level: deal.level ?? "Pipeline",
    status: deal.status ?? "",
    revenueType: deal.revenueType ?? "",
    dealType: deal.dealType ?? "",
    currency: deal.currency ?? BASE_CURRENCY,
    value: deal.value ?? 0,
    estimatedAcv: deal.estimatedAcv ?? null,
    estimatedTcv: deal.estimatedTcv ?? null,
    confidence: deal.confidence ?? null,
    estSignDate: deal.estSignDate ?? "",
    owner: deal.owner ?? "",
    nextSteps: deal.nextSteps ?? "",
    customer: deal.customer ?? "",
    customerId: deal.customerId ?? "",
    offeringIds: deal.offeringIds ?? [],
    offeringLabels: deal.offeringLabels ?? [],
  };

  /**
   * NOTHING IS WRITTEN UNTIL YOU PRESS SAVE.
   *
   * Anir, Sep 3, after an edit toasted "Saved" while a Save button sat at the
   * bottom of the same screen: "why are you saying save. The user has to press
   * save I think. And it should be sticky at the bottom." He is right that the
   * screen was telling him two different things — the deal's fields committed
   * on blur, while the accrual scheduler underneath them kept an explicit Save
   * plan. One screen, two contradictory promises about when your typing counts.
   *
   * So the fields stage here and go out together. `commit()` keeps its exact
   * signature — all sixteen controls call it unchanged — it simply banks the
   * patch instead of posting it.
   *
   * THE MANDATORY-FIELD GUARD STILL FIRES IMMEDIATELY, on the spot, rather
   * than waiting for Save. Clearing a starred field is not a change to be
   * reviewed later; it is a thing the form does not accept, and saying so
   * three fields later would leave you hunting for which one it meant.
   */
  /* BANKED BY FIELD, NOT BY COLUMN. Keyed on the patch's own keys, the money
     box counted TWO — it writes `estimatedTcv` and `value` to keep the deal
     from being worth two amounts — so editing a name and a figure announced
     "3 unsaved changes" for two edits. The bank is keyed by the FIELD the
     person touched and each entry carries its whole patch. */
  const [pending, setPending] = useState<Record<string, Record<string, unknown>>>({});
  const [saving, setSaving] = useState(false);
  const dirtyCount = Object.keys(pending).length;
  /* Bumped by Discard. Every field's local state re-seeds from `deal` when it
     changes — see the effect below. */
  const [resetNonce, setResetNonce] = useState(0);

  /**
   * DISCARD PUTS THE BOXES BACK, NOT JUST THE BANK.
   *
   * Found in the loop: pressing Discard emptied `pending` and hid the bar, but
   * every field kept its own local state — so the screen still showed the text
   * you had just thrown away, and nothing would save it. A form that displays
   * a value it will not write is worse than one that refuses to discard.
   *
   * Each box re-seeds from the record here. The nonce, not `deal`, is the
   * dependency: re-seeding whenever the prop object changed would fight
   * somebody mid-edit every time the parent re-rendered.
   */
  useEffect(() => {
    if (!resetNonce) return;
    setName(deal.name ?? "");
    setLevel(deal.level ?? "Pipeline");
    setStatus(deal.status ?? "");
    setRevenueType(deal.revenueType ?? "");
    setDealType(deal.dealType ?? "");
    setCurrency(deal.currency ?? BASE_CURRENCY);
    setAcv(deal.estimatedAcv === undefined ? "" : String(deal.estimatedAcv));
    setTcv(
      deal.estimatedTcv === undefined
        ? deal.value
          ? String(deal.value)
          : ""
        : String(deal.estimatedTcv)
    );
    setConfidence(deal.confidence === undefined ? "" : String(deal.confidence));
    setSigns(deal.estSignDate ?? "");
    setOwner(deal.owner ?? "");
    setNote(deal.nextSteps ?? "");
    setErrors({});
    setState({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetNonce]);

  async function commit(
    key: string,
    patch: Record<string, unknown>,
    revert: () => void
  ) {
    /* Nothing moved, nothing to say. Every control below fires on blur as well
       as on change, so this is the common case and it must be silent. */
    const unchanged = Object.entries(patch).every(
      ([k, v]) => JSON.stringify(v) === JSON.stringify(baseline[k])
    );
    if (unchanged) {
      /* TYPING IT BACK IS AN UNDO. This returned early — correct when the
         function POSTED, because there was nothing to send — but now that it
         banks, an early return leaves the old staged value sitting in the bank
         and the save bar offering to write a change that no longer exists. */
      setPending((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    if (!mayEdit || readOnly) return;

    /**
     * A MANDATORY FIELD CANNOT BE EMPTIED.
     *
     * Manoj, Sep 3: "wherever there is an asterisk against those fields... the
     * user should not go to the next page without filling it", and asked for
     * it on both screens: "it is at the level where you're adding a new
     * opportunity, and also editing an opportunity. Whenever you go there, you
     * can't just leave it blank."
     *
     * The Add form already refuses to submit while anything starred is empty.
     * This form has no submit to refuse — it commits each field on blur — so
     * the equivalent is this: a starred field that HAS a value cannot be
     * cleared. The box goes back to what it held and says why.
     *
     * IT REFUSES CLEARING, NOT EDITING. 97 of the 102 deals in the workspace
     * arrived from the sheet with no owner, and several carry no sign date;
     * demanding those be filled before anything else on the record can be
     * corrected would trap somebody fixing a typo behind data nobody has. So a
     * field that was already empty stays editable, and one that was filled
     * cannot be un-filled.
     */
    const blank = (v: unknown) =>
      v === "" || v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
    for (const [k, v] of Object.entries(patch)) {
      const label = REQUIRED_FIELDS[k];
      if (!label) continue;
      if (blank(v) && !blank(baseline[k])) {
        revert();
        setState((s) => ({ ...s, [key]: "error" }));
        setErrors((e) => ({ ...e, [key]: `${label} is required and cannot be left blank.` }));
        return;
      }
    }

    if (timers.current[key]) clearTimeout(timers.current[key]);
    setErrors((e) => ({ ...e, [key]: "" }));
    /* BANKED, NOT SENT. A field edited back to what it started as leaves the
       bank entirely, so the footer disappears rather than offering to save
       nothing. */
    setPending((prev) => ({ ...prev, [key]: patch }));
    setState((s) => ({ ...s, [key]: "idle" }));
  }

  /** Send everything banked, in one write. */
  async function saveAll() {
    if (!dirtyCount || saving) return;
    setSaving(true);
    try {
      const patch = Object.assign({}, ...Object.values(pending));
      const message = onSave ? await onSave(patch) : await postUpdate(deal.id, patch);
      if (!alive.current) return;
      if (message) {
        setErrors((e) => ({ ...e, __form: message }));
        return;
      }
      setPending({});
      setErrors((e) => ({ ...e, __form: "" }));
      onSaved?.();
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  /* LEAVING WITH UNSAVED WORK SHOULD COST A CLICK, not a shrug. The whole
     point of an explicit Save is that closing the tab must not quietly bin
     what you typed. */
  useEffect(() => {
    if (!dirtyCount) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyCount]);

  /**
   * AND THE SAME FOR A CLICK ON THE SIDEBAR.
   *
   * `beforeunload` only fires when the BROWSER leaves the document. Every link
   * in this app navigates through the router without one, so with staged edits
   * on screen a click on "Opportunities" in the rail took them away and threw
   * the work out in silence — found in the loop by clicking exactly that. A
   * full reload warned; the thing people actually do did not, which is the
   * worst shape for a promise that nothing is written until you press Save.
   *
   * The listener runs in the CAPTURE phase so it sees the click before the
   * router does, and it only speaks for in-app links going somewhere else —
   * a new tab, an external host, a download or an anchor on this page all pass
   * straight through.
   */
  const router = useRouter();
  /* The navigation being held back, whatever kind of control started it. */
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (!dirtyCount) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (!href.startsWith("/") || a.target === "_blank" || a.hasAttribute("download")) return;
      if (href === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaving(() => () => router.push(href));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirtyCount, router]);

  /* AND FOR CONTROLS THAT ARE NOT LINKS. SmartBack is a button and pushes
     through the router, so no click listener can recognise it as navigation.
     It asks instead — see lib/unsavedGuard. */
  useEffect(() => {
    if (!dirtyCount) return;
    setLeaveAsker((go) => {
      setLeaving(() => go);
      return false;
    });
    return () => setLeaveAsker(null);
  }, [dirtyCount]);

  /**
   * THE RATE FOR THIS DEAL'S OWN DAY (Suren, Sep 1: "based on that date,
   * whatever the conversion rate is on that particular day, like on 1st of
   * September, it takes the value of that date").
   *
   * Asked of our own server, which fetches and caches it, so the browser never
   * talks to the rate source. Only asked for at all when there is something
   * to convert, so a plain dollar deal makes no request.
   *
   * `on` is the day the numbers actually came from, which is not always the
   * day we asked for: a sign date in November has no rate yet, and a Sunday
   * has none either. The row prints `on`, never the date it asked about.
   */
  const [fx, setFx] = useState<{
    state: "off" | "loading" | "ready" | "failed";
    on?: string;
  }>({ state: "off" });
  const isBase = currency === BASE_CURRENCY;

  useEffect(() => {
    if (isBase) {
      setFx({ state: "off" });
      return;
    }
    let running = true;
    setFx({ state: "loading" });
    const query = signs ? `?on=${encodeURIComponent(signs)}` : "";
    fetch(`/api/fx${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!running) return;
        const day = data?.day;
        if (!day?.date || !day?.rates) {
          setFx({ state: "failed" });
          return;
        }
        /* Hand the numbers to lib/currency, which is the only place allowed
           to look a rate up. Keyed by the day we ASKED for, so rateFor finds
           them again with the same argument the row converts with. */
        setFxRates(signs || undefined, day);
        setFx({ state: "ready", on: day.date });
      })
      .catch(() => {
        if (running) setFx({ state: "failed" });
      });
    return () => {
      running = false;
    };
  }, [isBase, signs]);

  const localSymbol = currencyMeta(currency).symbol.trim();
  const ro = !mayEdit || readOnly;
  /** The banner is about PERMISSION, so a read-only screen never shows it. */
  const denied = !mayEdit;

  /**
   * One typed box, in dollars.
   *
   * THE TWO WAYS THERE IS NO NUMBER ARE NOT THE SAME THING and must not read
   * the same. An empty ACV means nobody has said what it is; a figure with no
   * rate behind it means the amount IS known and the conversion is not. Saying
   * "not entered" over a number somebody just typed would be the form calling
   * them a liar.
   */
  const asUsd = (typed: string): { text: string; known: boolean } => {
    const n = num(typed);
    if (n === null) return { text: "Not entered", known: false };
    const converted = convertToUsd(n, currency, signs || undefined);
    if (converted === undefined) return { text: "No rate for it", known: false };
    return { text: usd(converted), known: true };
  };

  /**
   * WHICH DAY THIS RATE IS REALLY FROM, SAID OUT LOUD.
   *
   * The rate is meant to be the sign date's, and most of the time it is. But a
   * deal signing in November has no rate yet, and no rate is published on a
   * weekend either, so the server answers with the latest day it does have.
   * Printing that day rather than the one we asked for is the difference
   * between a figure you can trust and a figure wearing somebody else's date.
   */
  /**
   * A SCHEDULE FIGURE, READ IN THE DEAL'S OWN MONEY.
   *
   * Manoj, Sep 3: "right next to edit the schedule, if you can give a toggle
   * button. The toggle button is local currency versus USD. So if I see the
   * local currency view, then I should see all the schedule revenue in the
   * local currency of the project... because right now you can still select
   * euros, but the schedule is showing in USD."
   *
   * Accruals are STORED in USD and stay stored in USD — his next sentence was
   * "only here, okay? Outside everywhere else, it should be USD." So this
   * multiplies for display and writes nothing. It runs off the same rate the
   * boxes above already fetched, so the two conversions on this card can never
   * disagree.
   */
  const [scheduleLocal, setScheduleLocal] = useState(false);
  const scheduleMoney = (usd: number): string => {
    if (!scheduleLocal || isBase) return `$${usd.toLocaleString("en-US")}`;
    const rate = rateFor(currency, signs || undefined);
    if (!rate) return `$${usd.toLocaleString("en-US")}`;
    return `${localSymbol}${Math.round(usd * rate).toLocaleString("en-US")}`;
  };

  const rateNote = (() => {
    if (fx.state !== "ready" || !fx.on) return "";
    if (!signs) return `No sign date yet, so this is the ${dayLabel(fx.on)} rate.`;
    if (fx.on === signs) return `At the ${dayLabel(signs)} rate.`;
    return `Nothing published for ${dayLabel(signs)}, so this is the ${dayLabel(fx.on)} rate.`;
  })();

  /* The effect that asks for a rate runs AFTER the render that switched the
     currency, so for one frame the currency is rupees and the fetch has not
     started. Reading that frame as "loading" stops "No figure to show"
     flashing up before "Working it out" replaces it. */
  const fxState = !isBase && fx.state === "off" ? "loading" : fx.state;

  /* WHICH OFFERING THIS DEAL IS FOR. One, never several (Suren, Aug 17: "don't
     do multiple offerings on an opportunity. Make it one offering on an
     opportunity"). Imported deals carry a free-text label instead of a
     catalogue id, so that label stays a first-class row rather than greeting
     its own deal with "None". */
  const offeringId = deal.offeringIds[0] ?? "";
  const offeringLabel = deal.offeringLabels[0] ?? "";
  const offeringValue = offeringId || (offeringLabel ? "__label" : "");
  const offeringText =
    offerings.find((o) => o.id === offeringId)?.name || offeringLabel || "None";

  /* Imported deals carry the account NAME but no id, so resolve by name before
     deciding the picker has nothing selected. */
  const resolvedCustomerId =
    deal.customerId ||
    customers.find(
      (c) => c.name.trim().toLowerCase() === deal.customer.trim().toLowerCase()
    )?.id ||
    "";

  return (
    /* MORE AIR BETWEEN THE SECTIONS THAN INSIDE THEM, which is what makes a
       stack read as five things rather than one (Anir, Sep 1: "separate the
       sections better so it's more clear"). Fields inside a card sit 16px
       apart; the cards themselves sit 20px apart and each wears its own
       colour. */
    <div className="space-y-5">
      {/* SAID ONCE, AT THE TOP, rather than by a form that refuses every field
          one at a time. */}
      {denied && (
        <div className="flex items-start gap-2.5 rounded-xl border border-border-light bg-blue-light/60 px-4 py-3">
          <ShieldAlert
            size={15}
            strokeWidth={2}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-blue-primary"
          />
          <p className="min-w-0 text-[12.5px] leading-snug text-text-secondary">
            <span className="font-semibold text-text-primary">
              This deal is not yours to change.
            </span>{" "}
            {why || "Your Opportunities privilege is view-only."}
          </p>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      <Card
        icon={Briefcase}
        /* HIS OWN WORDS: "the deal's identity section should start open." It is
           the answer to "what am I looking at", so it is never the thing you
           have to unfold to find out. */
        startOpen
        title="The deal"
        hint="What it is called, whose account it is under, and which offering it sells."
      >
        <div className="space-y-4">
          <Field
            label={<>Opportunity name <Req /></>}
            state={state.name}
            error={errors.name}
          >
            {ro ? (
              <ReadValue text={name || "Not named"} empty={!name} />
            ) : (
              <input
                value={name}
                maxLength={200}
                onChange={(e) => setName(e.target.value)}
                onBlur={() =>
                  commit("name", { name: name.trim() }, () =>
                    setName(deal.name ?? "")
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className={INPUT}
                placeholder="e.g. GRI platform. Novartis"
              />
            )}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Field label={<>Customer <Req /></>} state={state.customer} error={errors.customer}>
              {/* PICK FROM THE ACCOUNTS WE HAVE. Deliberately no free-text
                  escape hatch here, unlike the Add form: inventing a new
                  account name from inside an existing deal would re-parent a
                  live record onto an account nobody created. */}
              {ro || customers.length === 0 ? (
                <ReadValue text={deal.customer || "No account"} empty={!deal.customer} />
              ) : (
                <ColorSelect
                  value={resolvedCustomerId || "__current"}
                  ariaLabel="Customer account"
                  fill
                  collapsible={false}
                  onChange={(v) => {
                    if (v === "__current") return;
                    const hit = customers.find((c) => c.id === v);
                    if (!hit) return;
                    void commit(
                      "customer",
                      { customer: hit.name, customerId: hit.id },
                      () => {}
                    );
                  }}
                  options={[
                    /* Whatever this deal already says, kept as a real row, so
                       an account that is not in the list never reads as unset. */
                    ...(resolvedCustomerId
                      ? []
                      : [
                          {
                            value: "__current",
                            label: deal.customer || "No account",
                            color: "var(--ink-bright-blue)",
                          },
                        ]),
                    ...customers.map((c) => ({
                      value: c.id,
                      label: c.name,
                      logoName: c.name,
                    })),
                  ]}
                />
              )}
            </Field>

            <Field label={<>Offering <Req /></>} state={state.offering} error={errors.offering}>
              {ro || offerings.length === 0 ? (
                <ReadValue
                  text={offeringText}
                  tone={OFFERING_TONE}
                  empty={offeringText === "None"}
                />
              ) : (
                <ColorSelect
                  value={offeringValue}
                  ariaLabel="Offering"
                  fill
                  collapsible={false}
                  onChange={(v) => {
                    if (v === "__label") return;
                    /* ONE OFFERING PER OPPORTUNITY. Picking from the catalogue
                       replaces the free-text label rather than sitting beside
                       it, so the deal can never claim two. */
                    void commit(
                      "offering",
                      { offeringIds: v ? [v] : [], offeringLabels: [] },
                      () => {}
                    );
                  }}
                  options={[
                    { value: "", label: "None", color: "var(--ink-bright-blue)" },
                    ...(offeringLabel && !offeringId
                      ? [
                          {
                            value: "__label",
                            label: offeringLabel,
                            color: OFFERING_TONE,
                            icon: Package,
                          },
                        ]
                      : []),
                    ...offerings.map((o) => ({
                      value: o.id,
                      label: o.name,
                      color: OFFERING_TONE,
                      /* The six agents wear Saras's artwork; everything else
                         keeps the offering tone dot. */
                      ...(agentIn(o.name) ? { agentName: o.name } : {}),
                    })),
                  ]}
                />
              )}
            </Field>

            {/* Nobody types either of these. They are assigned, so they are
                shown rather than asked for, the same thing the Add a Deal form
                does with the opportunity id. */}
            <Field label={<>Opportunity id <Req /></>}>
              <StaticValue
                text={deal.externalId || "Assigned on save"}
                empty={!deal.externalId}
              />
            </Field>
            <Field label={<>Added <Req /></>}>
              <StaticValue text={dayLabel(deal.createdAt)} />
            </Field>
          </div>
        </div>
          {/* CONFIDENCE AND TIMING LIVE ON THE DEAL (Manoj's change sheet,
              item 4: "Take Confidence and Timing data and put it along with
              the Deal data"), with exactly the fields he lists: Opportunity
              Name, Customer, Offering, Opportunity ID, Date Added, Opportunity
              Category, Confidence %, Opportunity Status, Opportunity Type,
              Expected to sign, Revenue Type.

              They were a card of their own directly underneath, which meant
              the eleven facts that describe one deal were split across two
              folds and you could close the half that held the date. They are
              one thing: what the deal is, and how sure and how soon. */}
          <div className="mt-5 border-t border-border-light pt-5">
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-3">
          <Field
            label={<>Confidence <Req /></>}
            hint="%"
            state={state.confidence}
            error={errors.confidence}
          >
            {/* THE SLIDER HE REMEMBERS (Suren, Sep 1: "here he had a nice
                little slider, I don't know why he went to 10 percent 20
                percent, why can't you have a slider here"). The same control
                the Opportunities list has carried since Aug 17, shared rather
                than copied: drag moves smoothly and snaps the stored number to
                fives, and the figure stays typeable for an exact one.

                IT SAVES WHEN YOU LET GO, not on every pixel of the drag. The
                events bubble out of the slider's own range input, so the wrapper
                catches the release and the blur of the typed figure without the
                shared control needing to know about saving at all. Deliberately
                no key-up: that would post a write per digit typed into the
                figure, and the blur already has it.

                Read-only gets the FIGURE, not a slider nobody may move. A
                control that slides under your finger and then springs back is a
                worse answer than a number. */}
            {ro ? (
              <ReadValue
                text={confidence === "" ? "Not set" : `${confidence}%`}
                empty={confidence === ""}
              />
            ) : (
              <span
                className="block pt-1"
                onPointerUp={() => void commitConfidence()}
                onBlur={() => void commitConfidence()}
              >
                <ConfidenceSlider value={confidence} onChange={setConfidence} />
              </span>
            )}
          </Field>
          <Field
            label={<>Expected to sign <Req /></>}
            state={state.estSignDate}
            error={errors.estSignDate}
          >
            {ro ? (
              <ReadValue
                text={signs ? dayLabel(signs) : "No date yet"}
                empty={!signs}
              />
            ) : (
              <input
                type="date"
                value={signs}
                onChange={(e) => {
                  const next = e.target.value;
                  setSigns(next);
                  void commit("estSignDate", { estSignDate: next }, () =>
                    setSigns(deal.estSignDate ?? "")
                  );
                }}
                className={INPUT}
              />
            )}
          </Field>
          <Field label={<>Status <Req /></>} state={state.status} error={errors.status}>
            {ro ? (
              <ReadValue text={status || "Not set"} tone={statusColor(status)} empty={!status} />
            ) : (
              <ColorSelect
                value={status}
                ariaLabel="Status"
                fill
                collapsible={false}
                searchable
                onChange={(v) => {
                  setStatus(v);
                  void commit("status", { status: v }, () =>
                    setStatus(deal.status ?? "")
                  );
                }}
                options={[
                  { value: "", label: "Not set", color: STATUS_TONE },
                  ...OPPORTUNITY_STATUSES.map((s) => ({
                    /* Each status wears its own colour, not one shared blue. */
                    value: s,
                    label: s,
                    color: statusColor(s),
                  })),
                ]}
              />
            )}
          </Field>
          <Field label={<>Opportunity category <Req /></>} state={state.level} error={errors.level}>
            {ro ? (
              <ReadValue
                text={level || "Not set"}
                tone={LEVEL_TONE[level] ?? "var(--ink-violet-soft)"}
                empty={!level}
              />
            ) : (
              <ColorSelect
                value={level}
                ariaLabel="Opportunity category"
                fill
                collapsible={false}
                onChange={(v) => {
                  setLevel(v);
                  void commit("level", { level: v }, () =>
                    setLevel(deal.level ?? "Pipeline")
                  );
                }}
                options={OPPORTUNITY_LEVELS.map((l) => ({
                  value: l,
                  label: l,
                  color: LEVEL_TONE[l] ?? "var(--ink-violet-soft)",
                }))}
              />
            )}
          </Field>
          {/* WHERE THE MONEY COMES FROM. The one Suren said was missing
              outright (Aug 31: "opportunity is missing one thing, what type of
              opportunity... new business, existing business, renewal"). */}
          <Field
            label={<>Type of opportunity <Req /></>}
            state={state.dealType}
            error={errors.dealType}
          >
            {ro ? (
              <ReadValue
                text={dealType || "Not set"}
                tone={DEAL_TONE[dealType] ?? "var(--ink-bright-blue)"}
                empty={!dealType}
              />
            ) : (
              <ColorSelect
                value={dealType}
                ariaLabel="Type of opportunity"
                fill
                collapsible={false}
                onChange={(v) => {
                  setDealType(v);
                  void commit("dealType", { dealType: v }, () =>
                    setDealType(deal.dealType ?? "")
                  );
                }}
                options={[
                  { value: "", label: "Not set", color: "var(--ink-bright-blue)" },
                  ...DEAL_TYPES.map((d) => ({
                    value: d,
                    label: d,
                    color: DEAL_TONE[d],
                  })),
                ]}
              />
            )}
          </Field>
          <Field
            label="Revenue type"
            state={state.revenueType}
            error={errors.revenueType}
          >
            {ro ? (
              <ReadValue
                text={revenueType || "Not set"}
                tone={REVENUE_TONE[revenueType] ?? REVENUE_FALLBACK}
                empty={!revenueType}
              />
            ) : (
              <ColorSelect
                value={revenueType}
                ariaLabel="Revenue type"
                fill
                collapsible={false}
                onChange={(v) => {
                  setRevenueType(v);
                  void commit("revenueType", { revenueType: v }, () =>
                    setRevenueType(deal.revenueType ?? "")
                  );
                }}
                options={[
                  { value: "", label: "Not set", color: "var(--ink-bright-blue)" },
                  ...REVENUE_TYPES.map((r) => ({
                    value: r,
                    label: r,
                    color: REVENUE_TONE[r] ?? REVENUE_FALLBACK,
                  })),
                ]}
              />
            )}
          </Field>
        </div>
          </div>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* THE MONEY, IN THE MONEY IT WAS AGREED IN, AND THEN IN DOLLARS
          (Suren, Sep 1: "this is local currency, local value, local estimated
          ACV, and local estimated TCV. Similarly, for US dollar value
          currency, there'll be another row here that'll be an automatic
          value"). One card, so the typed row and the automatic row read as one
          fact and its translation rather than as two competing sets of
          numbers. */}
      <Card
        icon={Banknote}
        /* The figures people quote. Open. */
        startOpen
        /* "REVENUE ACCRUAL", NOT "THE MONEY" (Manoj's change sheet, item 3:
           "Change 'The Money' to 'Revenue Accrual'. Under Revenue Accrual,
           provide Revenue Accrual schedule"), holding exactly the fields his
           item 5 lists: Project Currency, Estimated TCV, Estimated ACV,
           Revenue Accrual Schedule. */
        title="Revenue Accrual"
        hint="Entered in the money it was agreed in. The dollar figures underneath are worked out from the rate and never stored."
      >
        {/**
         * ONE TABLE, TWO ROWS (Anir, Sep 3: "Just have it as a table. Why are
         * you doing that weird blue thing? Literally you could just have euros
         * and then USD... Don't have another section. Just have it in the
         * second row as the table").
         *
         * It was a row of three fields and then a blue-tinted panel underneath
         * repeating the same two figures in dollars — a second section doing
         * what a second ROW does, and tinted so it read as a warning about
         * something. The dollars are not an aside about the money; they are
         * the same money counted again, which is a row.
         *
         * The typed row still writes. Only the dollar row is worked out, and
         * it is still never stored: the deal keeps what somebody typed, in the
         * currency they agreed, and this is recomputed every time.
         */}
        <div className="overflow-x-auto rounded-lg border border-border-light">
          <table className="w-full min-w-[520px] table-fixed text-left">
            <thead className="bg-surface">
              <tr className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:px-3 [&>th]:py-2">
                <th className="w-[38%]">Project currency <Req /></th>
                <th>Estimated TCV <Req /></th>
                <th>Estimated ACV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {/* WHAT WAS AGREED, AND WHAT IS TYPED. */}
              <tr className="align-middle [&>td]:px-3 [&>td]:py-2.5">
                <td>
                  {ro ? (
                    <ReadValue
                      /* THE SYMBOL, NOT JUST THE CODE (Anir, Sep 3: "in the
                         currency show the actual ($) symbol"). Every figure in
                         this card is written with the symbol, so the cell that
                         names the currency should be readable in the same
                         terms rather than making you translate USD into $. */
                      text={`${currencyMeta(currency).symbol.trim()} ${currency} ${currencyMeta(currency).name}`}
                    />
                  ) : (
                    <ColorSelect
                      value={currency}
                      ariaLabel="Currency"
                      fill
                      collapsible={false}
                      onChange={(v) => {
                        setCurrency(v);
                        void commit("currency", { currency: v }, () =>
                          setCurrency(deal.currency ?? BASE_CURRENCY)
                        );
                      }}
                      options={CURRENCIES.map((c) => ({
                        value: c.code,
                        label: `${c.code} ${c.name}`,
                        color: c.code === BASE_CURRENCY ? "var(--ink-bright-blue)" : "var(--ink-teal-deep)",
                        short: c.symbol.trim(),
                        icon: currencyGlyph(c.symbol),
                      }))}
                    />
                  )}
                  {errors.currency && (
                    <p className="mt-1 text-[11.5px] text-[color:var(--status-red)]">{errors.currency}</p>
                  )}
                </td>
                {/* ONE MONEY NUMBER, NOT TWO (Manoj's item 2: "Change Value to
                    'Estimated TCV'. We don't need Value and Estimated TCV
                    separately"). This box writes BOTH fields to the same
                    figure, so no reader has to be migrated and no deal is ever
                    worth two amounts on two screens.

                    ACV STAYS OPTIONAL AND STARTS EMPTY. A zero here would be a
                    claim that a year of the deal is worth nothing; blank is
                    the truth, which is that nobody has said. */}
                <td>
                  {ro ? (
                    <ReadValue text={tcv === "" ? "Not entered" : `${localSymbol}${tcv}`} empty={tcv === ""} />
                  ) : (
                    <>
                      <input
                        value={tcv}
                        aria-label="Estimated TCV"
                        /* K AND M HERE TOO. The shared MoneyInput learned this; these two
                           boxes are hand-rolled inputs in the money table and were
                           still eating the letter, so "1.5m" sat there as text and
                           went to the server as NaN. */
                        onChange={(e) => setTcv(expandMoneyShorthand(e.target.value))}
                        onBlur={() =>
                          /* BOTH FIELDS, ONE NUMBER. `value` is what the
                             rollups read and `estimatedTcv` is what
                             `estimatedTcvOf` prefers, so they have to agree or
                             the deal is worth two amounts. */
                          commit(
                            "estimatedTcv",
                            { estimatedTcv: num(tcv), value: num(tcv) ?? 0 },
                            () =>
                              setTcv(
                                deal.estimatedTcv === undefined
                                  ? deal.value
                                    ? String(deal.value)
                                    : ""
                                  : String(deal.estimatedTcv)
                              )
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        inputMode="numeric"
                        className={INPUT}
                        placeholder="the whole signed number"
                      />
                      {errors.estimatedTcv && (
                        <p className="mt-1 text-[11.5px] text-[color:var(--status-red)]">{errors.estimatedTcv}</p>
                      )}
                    </>
                  )}
                </td>
                <td>
                  {ro ? (
                    <ReadValue text={acv === "" ? "Not entered" : `${localSymbol}${acv}`} empty={acv === ""} />
                  ) : (
                    <input
                      value={acv}
                      aria-label="Estimated ACV"
                      onChange={(e) => setAcv(expandMoneyShorthand(e.target.value))}
                      onBlur={() =>
                        void commit(
                          "estimatedAcv",
                          { estimatedAcv: acv === "" ? null : Number(acv) },
                          () =>
                            setAcv(
                              deal.estimatedAcv === undefined
                                ? ""
                                : String(deal.estimatedAcv)
                            )
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      inputMode="numeric"
                      className={INPUT}
                      placeholder="one year of it"
                    />
                  )}
                </td>
              </tr>
              {/* THE SAME MONEY, COUNTED IN DOLLARS. Only when the deal is in
                  something else: on a dollar deal this row would reprint the
                  row above it. */}
              {!isBase && (
                <tr className="align-middle [&>td]:px-3 [&>td]:py-2.5">
                  <td className="text-[13px] text-text-secondary">
                    USD US dollar
                  </td>
                  {fxState === "ready" ? (
                    [tcv, acv].map((typed, i) => {
                      const shown = asUsd(typed);
                      return (
                        <td
                          key={["tcv", "acv"][i]}
                          className={
                            shown.known
                              ? "text-[13px] font-semibold text-text-primary tnum"
                              : "text-[13px] text-text-tertiary"
                          }
                        >
                          {shown.text}
                        </td>
                      );
                    })
                  ) : (
                    /* HONEST WHEN IT CANNOT. Never a stale figure dressed as a
                       fresh one, and never a blocked save: what saves is what
                       was typed, which needs no rate at all. */
                    <td colSpan={2} className="text-[13px] text-text-tertiary">
                      {fxState === "loading"
                        ? "Getting the rate."
                        : "Cannot convert right now. What you typed still saves exactly as it is."}
                    </td>
                  )}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!isBase && fxState === "ready" && rateNote && (
          <p className="mt-1.5 text-[11.5px] text-text-tertiary">{rateNote}</p>
        )}

        {/* THE SCHEDULE ITSELF (Manoj's sheet, item 3: "Under Revenue Accrual,
            provide Revenue Accrual schedule"; item 5 lists "Revenue Accrual
            Schedule*" among this card's fields).

            READ HERE, EDITED IN ONE PLACE. Suren, Sep 1: "both the screens
            have to be the same. It's just that same screen shows up here." So
            this is the months and what they carry, and the button opens the
            same planner the Revenue accruals module opens — not a second
            editor over the same data, which is the thing he asked me to stop
            building. */}
        <div className="mt-5 border-t border-border-light pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[13px] font-semibold text-text-primary">
              Revenue accrual schedule <Req />
            </h4>
            <span className="flex flex-wrap items-center gap-2">
            {/* LOCAL VERSUS USD, right where he asked for it. Only when the
                deal is in another currency: on a dollar deal there is nothing
                to switch between. */}
            {!isBase && accrualPlan && accrualPlan.lines.length > 0 && (
              <ViewSwitch
                ariaLabel="Read the schedule in"
                className="inline-flex"
                value={scheduleLocal}
                onChange={setScheduleLocal}
                options={[
                  { key: false, label: "USD", mark: "$" },
                  { key: true, label: currency, mark: localSymbol },
                ] as const}
              />
            )}
            {/* NO "EDIT THE SCHEDULE" WHEN THE SCHEDULE IS RIGHT THERE. The
                button existed to reach an editor somewhere else; with the
                scheduler mounted in this card there is nowhere else to go. */}
            {onOpenAccrual && !accrualScheduler && (
              <button
                type="button"
                onClick={onOpenAccrual}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-light px-2.5 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-primary hover:text-blue-primary"
              >
                <CalendarRange size={13} strokeWidth={2.2} />
                {accrualPlan ? "Edit the schedule" : "Plan the schedule"}
              </button>
            )}
            </span>
          </div>
          {/* THE SCHEDULER ITSELF, when this person may plan. The read-only
              months below it are what a READER sees; an owner gets the real
              thing and never has to open a dialog to change a month. */}
          {accrualScheduler ? (
            <div className="mt-3">{accrualScheduler}</div>
          ) : !accrualPlan || accrualPlan.lines.length === 0 ? (
            <p className="mt-1.5 text-[12.5px] text-text-tertiary">
              {accrualPlan
                ? "This plan has no months in it. Its sign date may have passed, which empties the schedule and flags it on the Deviations tab."
                : "Nothing planned yet. The schedule says which months this deal's money is expected to land in."}
            </p>
          ) : (
            <>
              <div className="mt-2 overflow-hidden rounded-lg border border-border-light">
                <table className="w-full table-fixed border-collapse text-left">
                  <thead className="bg-surface text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    <tr>
                      <th className="w-1/2 px-3 py-2">Month</th>
                      <th className="w-1/2 px-3 py-2">
                        Amount ({scheduleLocal && !isBase ? currency : "USD"})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {[...accrualPlan.lines]
                      .sort((a, b) => a.month.localeCompare(b.month))
                      .map((l) => (
                        <tr key={l.month}>
                          <td className="px-3 py-2 text-[12.5px] text-text-secondary">
                            {monthLabel(l.month)}
                          </td>
                          <td className="px-3 py-2 text-[12.5px] font-semibold tnum text-text-primary">
                            {scheduleMoney(l.amount || 0)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  {/* THE TOTAL IS A ROW, NOT A SENTENCE (Anir, Sep 3: "remove
                      the text at the bottom and put a total row at the
                      bottom"). It was prose under the table — "6 months,
                      adding up to $100,000,000." — so the one figure everybody
                      checks sat outside the column of figures it belongs to,
                      in a different typeface, unaligned with the numbers it
                      sums. In the footer it lands under the column, in the
                      same tabular figures, and the eye can add it up. */}
                  <tfoot className="border-t-2 border-border-light bg-surface">
                    <tr>
                      <td className="px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                        Total
                        <span className="ml-1.5 font-normal normal-case tracking-normal">
                          {accrualPlan.lines.length} month
                          {accrualPlan.lines.length === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[13px] font-bold tnum text-text-primary">
                        {scheduleMoney(
                          accrualPlan.lines.reduce((n, l) => n + (l.amount || 0), 0)
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </Card>


      {/* ---------------------------------------------------------------- */}
      {/* THE PEOPLE CARD DOES NOT FLOAT ANY MORE.
          Anir, Sep 1: "for the people, I don't like the way that looks because
          it's in the middle, and it looks odd."

          He was right and it was deliberate, which made it worse: the card held
          ONE picker and was stretched to the height of the Notes box beside it,
          so the code centred the picker in that height on purpose and left dead
          air above and below it. A control hovering in the middle of an empty
          rectangle reads as a page that failed to load.

          THE FIX IS TO STOP STRETCHING IT, not to stretch the control. `items-
          start` lets each card be exactly as tall as what it holds, so the
          Owner picker sits at the top of a card that ends underneath it, the
          same way every field in every other section does. The equal-height
          rule is about a ROW OF LIKE CARDS looking ragged — a one-line picker
          and a note box are not that, and forcing them level is what produced
          the hole in the first place. */}
      {/* LEVEL BOTTOMS, AND NOTHING FLOATING.
          Anir, Sep 1: "the notes part should be symmetrical, so that looks
          weird." He is looking at two cards side by side finishing at
          different heights.

          The note above is right that stretching a card and CENTRING a
          one-line control in it is what produced the hole. The answer is not
          to give up on level bottoms, it is to stretch the row and give the
          taller card's slack to something that should have it anyway: the
          notes box. A textarea growing into spare height is a bigger place to
          type, which is a gain, whereas a picker floating in spare height is
          just a hole. So the row stretches, the People card keeps its content
          hard against the top, and only the note box fills. */}
      {/* NOTES SITS UNDER PEOPLE, FULL WIDTH (Anir, Sep 3: "and notes BELOW
          people like normal"). They were side by side, which squeezed People
          into 420px and gave the note box a column it did not need. Every
          other section on this page is one full-width card stacked under the
          last; these were the exception for no reason the page states. */}
      <div className="grid grid-cols-1 items-stretch gap-5">
        <Card
          icon={UserRound}
          /* He asked for the plus button ON this section, so it cannot start
             folded away. Open. */
          startOpen
          title="People"
          hint="Who owns this deal, and who else is on it."
        >
          <div>
          <Field label="Owner" state={state.owner} error={errors.owner}>
            {/* ITEM 6 — THE OWNER IS SYSTEM SET, AND ONLY AN ADMIN MOVES IT.
                Manoj's sheet: "Under People, Owner is the person who add the
                Opportunity. Let it be System generated with Admin having the
                rights to change it. However, Owner can add anyone to support
                under Other people."

                It was a free picker for anybody who could edit the deal, which
                made ownership something a rep could hand to themselves or away
                from themselves — and ownership is what decides who may edit
                the record at all. The API already stamps the creator as owner
                on `op: "add"`, so the system-generated half was already true;
                this closes the other half. "Other people" below is untouched:
                that is the owner's to manage, exactly as his sentence says. */}
            {ro || !mayChangeOwner ? (
              /* WITH THEIR FACE ON, like every other person in the app — but
                 never for the placeholder, because Avatar resolves a photo from
                 the NAME and "Nobody yet" would go and find somebody's. */
              owner ? (
                <span className="flex h-10 items-center gap-2">
                  <Avatar name={owner} className="h-7 w-7 shrink-0 text-[10px]" />
                  <span className="truncate text-[13px] font-medium text-text-primary">
                    {owner}
                  </span>
                </span>
              ) : (
                <ReadValue text="Nobody yet" empty />
              )
            ) : people.length > 0 ? (
              <ColorSelect
                value={owner}
                ariaLabel="Deal owner"
                fill
                collapsible={false}
                searchable
                onChange={(v) => {
                  setOwner(v);
                  void commit("owner", { owner: v }, () =>
                    setOwner(deal.owner ?? "")
                  );
                }}
                options={[
                  { value: "", label: "Unassigned", color: "var(--ink-bright-blue)" },
                  /* You first, wearing the blue tag, rather than alphabetised
                     into the middle of the roster. */
                  ...[...new Set([...people, ...(owner ? [owner] : [])])]
                    .sort(
                      (a, b) =>
                        Number(b === meName) - Number(a === meName) ||
                        a.localeCompare(b)
                    )
                    .map((n) => ({
                      value: n,
                      label: n,
                      tag: n === meName ? "You" : undefined,
                      avatarName: n,
                    })),
                ]}
              />
            ) : (
              /* No roster to offer, so a typed name rather than a picker with
                 nothing in it. Imported deals arrived this way. */
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                onBlur={() =>
                  commit("owner", { owner: owner.trim() }, () =>
                    setOwner(deal.owner ?? "")
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className={INPUT}
                placeholder="Nobody yet"
              />
            )}
          </Field>

          {/* AND EVERYBODY ELSE (Anir, Sep 1: "obviously, the owner is fine.
              What about other people?"). The Owner picker above is untouched;
              this is the rest of them, on the store the customer page has
              written since Aug 28, through the same route with the same
              server-side check. */}
          <div className="mt-4 border-t border-border-light pt-4">
            <DealPeople
              dealId={deal.id}
              dealName={deal.name || deal.customer}
              owner={owner}
              team={team}
              people={people}
              meName={meName}
              /* Two gates, and both are the server's: you must be able to
                 change this deal at all, and you must clear the record check
                 the route itself runs. Never widened here — a view-only person
                 sees the list and no plus button. */
              /* THE OVERVIEW SHOWS, HERE TOO. `ro` already covers every field
                 in this form, but the team list owns its own control and read
                 only `mayEdit`, so the plus that adds somebody to the deal
                 survived on a screen that is not supposed to change anything
                 (Anir, Sep 3: "I can still add people, though. That's a
                 problem"). Adding a person to a deal decides who may edit it,
                 which makes it the last control that should slip through. */
              mayChangeTeam={!ro && mayChangeTeam}
            />
          </div>
          </div>
        </Card>

        <Card
          icon={NotebookPen}
          /* THE ONE THAT MAY START FOLDED, and only when it is empty. Folding a
             section that HAS something written in it would hide a fact
             somebody left for the next person, which is the opposite of what a
             note is for. An empty one is a blank box taking up a column, and
             the chevron says where to write. */
          startOpen={!!(deal.nextSteps ?? "").trim()}
          title="Notes"
          hint="Whatever needs saying about this deal, in plain words."
        >
          <Field label="Notes" fill state={state.nextSteps} error={errors.nextSteps}>
            {ro ? (
              <p className="max-w-[80ch] whitespace-pre-wrap text-[13.5px] leading-relaxed text-text-primary">
                {note || (
                  <span className="text-text-tertiary">
                    Nothing has been written on this deal.
                  </span>
                )}
              </p>
            ) : (
              <textarea
                value={note}
                /* Stored as nextSteps, which lib/opportunities trims to 600.
                   Paste a couple of paragraphs about a call and the tail went
                   without a word. */
                maxLength={600}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() =>
                  commit("nextSteps", { nextSteps: note.trim() }, () =>
                    setNote(deal.nextSteps ?? "")
                  )
                }
                rows={4}
                aria-label="Notes"
                /* min-h keeps it a sensible box when it is the tall one, h-full
                   lets it take the slack when People is taller. */
                className="h-full min-h-[104px] w-full resize-y rounded-lg border border-border-light bg-white px-3 py-2 text-[13.5px] leading-relaxed text-text-primary outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
                placeholder="Whatever needs saying about this deal."
              />
            )}
          </Field>
        </Card>
      </div>

      {children}

      <ConfirmDialog
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        onConfirm={() => {
          const go = leaving;
          /* Clear the bank BEFORE navigating, so the guard is not still armed
             when the next screen mounts. */
          setPending({});
          setLeaveAsker(null);
          setLeaving(null);
          go?.();
        }}
        title={`Leave with ${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}?`}
        body="Nothing on this deal has been written yet. Leaving now throws those edits away."
        confirmLabel="Leave without saving"
      />

      {/* THE SAVE BAR, PINNED (Anir, Sep 3: "it should be sticky at the
          bottom — you do this well on some other page").

          IT ONLY EXISTS WHEN THERE IS SOMETHING TO SAVE. A bar that is always
          there, permanently greyed, is a piece of furniture you stop seeing;
          one that arrives the moment you change something is the screen
          answering you. It also keeps the read-only overview exactly as it
          was — nothing to stage there, so nothing appears.

          It counts what is actually banked rather than saying "unsaved
          changes", because "3 changes" tells you whether you have edited what
          you think you edited. */}
      {!ro && dirtyCount > 0 && (
        <div className="sticky bottom-0 z-30 -mx-1 mt-2 px-1 pb-1">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-subtle bg-white/95 px-4 py-3 shadow-[0_-2px_18px_-6px_rgba(16,22,30,0.22)] backdrop-blur">
            <span className="text-[13px] font-semibold text-text-primary">
              {dirtyCount} unsaved change{dirtyCount === 1 ? "" : "s"}
            </span>
            {errors.__form && (
              <span className="text-[12.5px] text-[color:var(--status-red)]">{errors.__form}</span>
            )}
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setPending({});
                  setErrors((e) => ({ ...e, __form: "" }));
                  /* Re-seed every box from the record. Emptying the bank alone
                     left the discarded text sitting on screen. */
                  setResetNonce((n) => n + 1);
                  onSaved?.();
                }}
                className="cursor-pointer rounded-lg border border-border-light px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-primary hover:text-blue-primary disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveAll()}
                className="cursor-pointer rounded-lg bg-blue-primary px-4 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );

  function commitConfidence() {
    return commit("confidence", { confidence: num(confidence) }, () =>
      setConfidence(deal.confidence === undefined ? "" : String(deal.confidence))
    );
  }
}

/**
 * THE SAME ROUTE EVERY OTHER DEAL EDIT POSTS TO.
 *
 * SPREAD, NOT NESTED: the route reads the changed fields off the TOP LEVEL of
 * the body (`body(raw)` in app/api/opportunities), so a nested `patch` object
 * is never looked at and every field arrives undefined: a save that returns
 * 200 and writes nothing. The route re-checks the same verdict this form was
 * drawn with; the gate above is a courtesy, the route is the rule.
 */
async function postUpdate(
  id: string,
  patch: Record<string, unknown>
): Promise<string | null> {
  try {
    const res = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "update", id, ...patch }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) return data?.error || "That did not save.";
    return null;
  } catch {
    return "That did not save.";
  }
}

"use client";

// Interactive SVG charts. Every chart is hover-interactive — point at it and a
// tooltip shows the exact number (Suren: "every single graph"). The `format`
// prop accepts a serializable kind ("money" | "duration" | "percent" | …) so
// SERVER components can use it (a function can't cross the client boundary), or
// a function for client callers.
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles,
  MessageSquare,
  BadgeCheck,
  CalendarCheck,
  CircleSlash,
  Package,
  Building2,
  User,
  DollarSign,
  BadgeDollarSign,
  Magnet,
  Activity,
  Handshake,
  Hourglass,
  AlertCircle,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn, OUTCOME_META } from "@/lib/utils";
import { STAGE_COLOR, STAGE_ICON } from "@/lib/pipeline";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { ServiceTag } from "@/components/ui/OfferingIcon";
import { VIZ } from "./palette";

// Series icons for tooltips + legends, keyed by SHORT STRINGS so server
// components can request one (Suren: "put an icon instead of just a purple
// dot") — the same serializable-kind rule as `format`; a component can't cross
// the server boundary. Stage keys mirror the pipeline stage vocabulary
// (deliberately NOT imported from lib/pipeline — the chart layer stays
// standalone), plus generic marks any chart can borrow. Unknown/absent key =
// today's plain dot, so existing call sites render exactly as before.
const TIP_ICONS: Record<string, LucideIcon> = {
  prospect: Sparkles,
  engaged: MessageSquare,
  qualified: BadgeCheck,
  meeting: CalendarCheck,
  lost: CircleSlash,
  offering: Package,
  company: Building2,
  person: User,
  money: DollarSign,
  // The performance goal-type marks, so a tip naming a goal wears the same
  // icon the goal wears everywhere else (Anir, Aug 19: "when you say 'via
  // renewals', you have to put the icon for the financial and revenue
  // performance thing"). Keys, not components — a server component can hand
  // this file a string, never a function.
  goalFinancial: BadgeDollarSign,
  goalLeadGen: Magnet,
  goalActivity: Activity,
  goalProposal: Handshake,
  waiting: Hourglass,
  sentBack: AlertCircle,
  verified: ShieldCheck,
};

// The y-axis value chips (max / baseline) that float over a plot area. Built
// ONLY from utility classes that `app/globals.css` re-skins under `.dark`
// (`bg-surface`, `border-border-light`, `text-text-secondary`) — this app has no
// `dark:` variants, so any class the `.dark` block doesn't name stays in its
// light colours. That is why `bg-white/70` was broken here: Tailwind compiles
// the opacity modifier to the class `bg-white\/70`, which `.dark .bg-white`
// cannot match, so the chips kept a white plate under grey text on a near-black
// card. `text-text-tertiary` went with it — #76767b on the dark surface is only
// 3.4:1, under AA for 10px type; `text-text-secondary` is 5.8:1 dark / 4.7:1
// light.
const AXIS_CHIP =
  "pointer-events-none absolute left-1.5 rounded border border-border-light bg-surface px-1 text-[10px] tnum text-text-secondary";

type ChartAnchor = {
  x: number;
  y: number;
  element?: Element;
  offsetX?: number;
  offsetY?: number;
};

function pointerAnchor(event: {
  clientX: number;
  clientY: number;
  currentTarget: Element;
}): ChartAnchor {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: event.clientX,
    y: event.clientY,
    element: event.currentTarget,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
  };
}

function elementAnchor(element: Element, x: number, y: number): ChartAnchor {
  const rect = element.getBoundingClientRect();
  return {
    x,
    y,
    element,
    offsetX: x - rect.left,
    offsetY: y - rect.top,
  };
}
/** Rows a tooltip shows inline before it needs to become scrollable. Three,
 *  not five: a row now carries company + person + category chip + clause, so
 *  four of them made the card taller than the chart it belonged to (Suren, Jul
 *  27: "this pop-up is very, very big… obviously I would like to scroll"). */
const TIP_INLINE_ROWS = 3;
/** Hard ceiling on the record list, so a reachable tip always reads as a
 *  tooltip and never as a panel. ~3 rows, then it scrolls. Shared by every
 *  chart so the bar tip and the line tip beside it feel like one component. */
/** The card's own horizontal padding, mirrored from `.chart-tip` in
 *  `app/globals.css` (`padding: 11px 13px`). The record list cancels it with a
 *  negative margin so the LIST spans the card edge to edge and its scrollbar
 *  rides the card's true right edge — instead of sitting inboard, on top of the
 *  money column (Suren, on the pipeline area chart: "this scroll bar… should
 *  probably be on the very right side of that little container. You see how
 *  it's almost covering the text, like the money amount?"). The padding moves
 *  onto the ROWS, so nothing shifts; only the scroll gutter changes owner. */
const TIP_CARD_PAD_X = 13;
/** Pull a block out to the card's border box (see TIP_CARD_PAD_X). */
const TIP_BLEED = {
  marginLeft: -TIP_CARD_PAD_X,
  marginRight: -TIP_CARD_PAD_X,
} as const;
/** …and give the padding back to whatever sits inside that block. */
const TIP_ROW_PAD = {
  paddingLeft: TIP_CARD_PAD_X,
  paddingRight: TIP_CARD_PAD_X,
} as const;
/** Left rail of a record row: the company/person mark (22px) + the gap after
 *  it, so every secondary line under the name starts on the name's own edge
 *  rather than drifting back under the logo. */
const TIP_MARK_INDENT = 30;
/** Hard ceiling on the whole card (header + stats + list), independent of how
 *  much viewport room happens to be free. */
const TIP_MAX_HEIGHT = 340;
/** Radius of the hovered-point marker's halo. The tip keeps this much room so
 *  it can never land on the very dot it is describing (Suren, Jul 27:
 *  "whatever I'm hovering, it doesn't really show me the dot properly — it
 *  looks like maybe it's getting covered up"). */
const POINT_MARKER_CLEARANCE = 16;

/**
 * The marker for the point being read, on every point-based chart. Three
 * things make it findable where a bare dot was not: it grows when it is the
 * hovered point, it carries a white ring so it separates from the stroke it
 * sits on, and a soft halo in the series colour spreads it past the 2px line.
 * Rendered as a sibling AFTER the <svg>, so neither the line nor the area fill
 * can ever paint over it.
 */
function PointMarker({
  left,
  top,
  color,
  active,
  dimmed,
}: {
  /** CSS left/top for the point, in the container's own coordinate space. */
  left: string;
  top: string;
  color: string;
  /** This is the point under the cursor. */
  active?: boolean;
  /** A non-hovered point while another one is hovered. */
  dimmed?: boolean;
}) {
  return (
    <>
      {active && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full"
          style={{
            left,
            top,
            width: POINT_MARKER_CLEARANCE * 1.25,
            height: POINT_MARKER_CLEARANCE * 1.25,
            background: `${color}30`,
            transform: "translate(-50%,-50%)",
          }}
        />
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full ring-2 ring-[color:var(--white)] transition-[width,height] duration-100"
        style={{
          left,
          top,
          width: active ? 12 : 8,
          height: active ? 12 : 8,
          background: color,
          opacity: dimmed ? 0.45 : 1,
          transform: "translate(-50%,-50%)",
          boxShadow: active ? "0 2px 6px rgba(0,0,0,0.28)" : undefined,
        }}
      />
    </>
  );
}

/** The dashed drop-line from the hovered point to the baseline, so the eye can
 *  see WHICH x the tooltip is talking about. */
function PointGuide({ left, color }: { left: string; color: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0"
      style={{ left, borderLeft: `1px dashed ${color}`, opacity: 0.45 }}
    />
  );
}
/** Grace period the tip stays open after the cursor leaves the chart element,
 *  so it can be walked INTO (Suren: "let them hover over the pop-up itself and
 *  scroll through"). Same idea as HoverCard's 110ms, a touch longer because a
 *  chart tip can sit a full card-gap away from the bar that opened it. */
const TIP_CLOSE_GRACE_MS = 170;

/** A tip's record list is "long" when it would otherwise be truncated — the
 *  only case where the tip needs to become hoverable + scrollable. */
function tipIsLong(items?: TipItem[]): boolean {
  return (items?.length ?? 0) > TIP_INLINE_ROWS;
}

// Hover state for one chart: which index is lit, where its tip is anchored, and
// — for tips the user is allowed to reach — a grace timer so the card survives
// the trip from the chart into the card.
/** Every graph tooltip in this app waits this long before it opens. No chart
 *  gets to opt out, and there is no user setting for it any more (Anir, Jul 28:
 *  "we need it where it's 0.5 seconds on every single graph. There should not
 *  be any point where, as soon as I hover over it, it does the popup. Remove
 *  that setting, straight up 0.5 seconds. End of story on every single page").
 *  Charts used to open at 0ms on the theory that pointing at a data point is
 *  deliberate, which made every pass of the cursor across a chart flash a card. */
// Superseded Aug 8: graph tips join the fast quarter-second tier ("for the
// graph too, I would make it 0.25 seconds. Everything is either 1 second or
// 0.25 seconds").
export const CHART_TIP_OPEN_MS = 250;

function useChartHover() {
  const [hover, setHover] = useState<number | null>(null);
  // The dot follows the cursor AT ONCE; only the card waits out the dwell
  // (Anir, Jul 28: "for the hover thing, you can show the dot. You just can't
  // show the hover thing after .5 seconds"). Without this the chart looked
  // dead for half a second and nobody could tell it was interactive at all.
  const [active, setActive] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<ChartAnchor | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopOpening = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);

  const keepOpen = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  useEffect(
    () => () => {
      keepOpen();
      stopOpening();
    },
    [keepOpen, stopOpening]
  );

  function show(index: number, at?: ChartAnchor | null) {
    keepOpen();
    // The anchor is remembered immediately so the card lands in the right place
    // the instant it does open, but the card itself waits out the dwell.
    if (at !== undefined) setAnchor(at);
    setActive(index);
    stopOpening();
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      setHover((current) => (current === index ? current : index));
    }, CHART_TIP_OPEN_MS);
  }

  /** Reposition without changing which index is lit (mousemove). */
  function move(at: ChartAnchor | null) {
    setAnchor(at);
  }

  /** Close now (plain tips) or after `graceMs` (reachable tips). */
  const close = useCallback(
    (graceMs = 0) => {
      keepOpen();
      stopOpening();
      // The dot leaves with the cursor either way; only the card lingers.
      setActive(null);
      if (graceMs <= 0) {
        setHover(null);
        setAnchor(null);
        return;
      }
      closeTimer.current = setTimeout(() => {
        closeTimer.current = null;
        setHover(null);
        setAnchor(null);
      }, graceMs);
    },
    [keepOpen, stopOpening]
  );

  return { hover, active, anchor, show, move, close, keepOpen };
}

// A tooltip rendered into <body> via a portal so it can NEVER be clipped by a
// card's overflow or painted over by a neighbouring container — the recurring
// "the pop-up gets covered / cut off on every graph" bug (Suren). It's fixed to
// the viewport, clamped to stay fully on screen. Crucially, it is positioned
// OUTSIDE the chart bounds rather than over the hovered data. The anchor also
// keeps its position inside the chart element, so nested page scrolling moves
// the popup with the graph instead of leaving it stranded over unrelated UI.
function PortalTip({
  anchor,
  wide,
  nearPoint,
  interactive,
  onEnter,
  onLeave,
  children,
}: {
  anchor: ChartAnchor | null;
  wide?: boolean;
  /** Place the card just above/below the anchor POINT instead of outside the
   *  whole chart box. For tall plots (area charts) the box edges are a long
   *  way from the hovered point (Anir: "it should be right below where it is
   *  on the graph… or above… it shouldn't be that far away"). */
  nearPoint?: boolean;
  /** The card can be entered with the cursor and scrolled. Turned on only when
   *  the tip carries more records than fit at rest — a tip you can't finish
   *  reading is the whole complaint (Suren: "a lot of it is kind of hidden").
   *  A plain tip stays inert so it can never intercept the pointer. */
  interactive?: boolean;
  /** Cursor entered the card — cancel the pending close. */
  onEnter?: () => void;
  /** Cursor left the card — start the close. */
  onLeave?: () => void;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const [, refreshPosition] = useState(0);
  const frameRef = useRef<number | null>(null);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!anchor?.element) return;
    const sync = () => {
      if (frameRef.current != null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        refreshPosition((value) => value + 1);
      });
    };
    window.addEventListener("scroll", sync, { capture: true, passive: true });
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync, { capture: true });
      window.removeEventListener("resize", sync);
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [anchor?.element]);
  if (!ready || !anchor) return null;

  let currentAnchor = anchor;
  if (anchor.element) {
    if (!anchor.element.isConnected) return null;
    const rect = anchor.element.getBoundingClientRect();
    if (
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth
    ) {
      return null;
    }
    currentAnchor = {
      ...anchor,
      x: rect.left + (anchor.offsetX ?? anchor.x - rect.left),
      y: rect.top + (anchor.offsetY ?? anchor.y - rect.top),
    };
    // Once the exact hovered point leaves the viewport, let its popup leave
    // with it instead of pinning the card against a screen edge.
    if (
      currentAnchor.x < 4 ||
      currentAnchor.x > window.innerWidth - 4 ||
      currentAnchor.y < 4 ||
      currentAnchor.y > window.innerHeight - 4
    ) {
      return null;
    }
  }
  // Wider than the old 260: these cards carry logo + name + contact + money on
  // every row, and 300px is the width the app's other hover popovers use
  // (HoverCard's default), so a chart tip now reads as the same object.
  const width = wide ? 300 : 224;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sideGap = 12;
  // The gap between chart and card is DEAD SPACE the cursor has to cross. On a
  // reachable tip that gap moves INSIDE the card's own hover area as padding
  // (HoverCard's trick), so the card never closes under the user's hand. The
  // painted card lands in exactly the same place either way — only where the
  // gap "belongs" changes — so plain tips keep their existing geometry.
  const bridge = interactive ? 10 : 0;
  const anchorElement = anchor.element;
  /**
   * The box the card must clear. `data-chart-root` marks the whole CARD where
   * a chart sets it; `[role="img"]` is only the plot strip inside that card.
   * One `closest()` over both returned whichever was NEARER, which is always
   * the plot — so the card cleared the bars and still landed on the title
   * (Anir, Aug 15: "it can never cover up the pop-up"). Ask for the outer box
   * first and fall back to the plot when a chart has not marked one.
   */
  const chartElement =
    anchorElement?.closest("[data-chart-root]") ??
    anchorElement?.closest('[role="img"]') ??
    anchorElement;
  const chartRect = chartElement?.getBoundingClientRect() ?? {
    left: currentAnchor.x,
    right: currentAnchor.x,
    top: currentAnchor.y,
    bottom: currentAnchor.y,
  };
  // Two rules, both earned the hard way. (1) The card follows the CURSOR
  // horizontally — anchored to the chart's centre it sat far from the point
  // being read, and near the viewport top it left the screen entirely (Anir:
  // "i cant see popup on the graph"). (2) Vertically it sits OUTSIDE the
  // chart box — above when there's room, else below — because a card that
  // covers the plot hides the very data being hovered (the older standing
  // rule the verify suite pins). Viewport clamping keeps it on-screen always.
  let placement: "top" | "bottom";
  let top: number;
  let maxHeight: number;
  if (nearPoint) {
    // Hug the hovered point: just above it when there's room, else just below
    // — never parked at the far chart edge. The 14px gap clears the point's
    // own dot so the card frames the data instead of covering it.
    // Clear the hovered point's MARKER, not just its centre — a 14px gap put
    // the card's edge right on the halo, which is what read as the dot being
    // covered up. The card now starts past the marker on whichever side it
    // opens, so the point it describes is always visible beside it.
    const pointGap = POINT_MARKER_CLEARANCE - bridge;
    const roomAbove = Math.max(0, currentAnchor.y - 8);
    const roomBelow = Math.max(0, vh - currentAnchor.y - 8);
    placement = roomAbove >= 150 || roomAbove >= roomBelow ? "top" : "bottom";
    maxHeight = Math.max(48, (placement === "top" ? roomAbove : roomBelow) - pointGap);
    top =
      placement === "top"
        ? currentAnchor.y - pointGap
        : currentAnchor.y + pointGap;
  } else {
    const rooms = {
      top: Math.max(0, chartRect.top - 8),
      bottom: Math.max(0, vh - chartRect.bottom - 8),
    };
    placement = rooms.top >= 120 || rooms.top >= rooms.bottom ? "top" : "bottom";
    const verticalRoom = placement === "top" ? rooms.top : rooms.bottom;
    const gap = sideGap - bridge;
    maxHeight = Math.max(48, verticalRoom - gap);
    top = placement === "top" ? chartRect.top - gap : chartRect.bottom + gap;
  }
  // Never let free viewport room decide how big a tooltip gets — on a tall
  // screen that produced a 800px card for four records.
  maxHeight = Math.min(maxHeight, TIP_MAX_HEIGHT);
  const left = Math.max(
    8,
    Math.min(vw - width - 8, currentAnchor.x - width / 2)
  );
  return createPortal(
    <div
      role="tooltip"
      // The positioned shell stays inert on purpose: it is the marker the
      // verify suite uses to find a chart tip, and an inert shell can never
      // swallow a click meant for the page underneath. A reachable tip re-opts
      // in on the card INSIDE it — `pointer-events` is inherited, and a
      // descendant is always free to turn it back on.
      className="fixed z-[9999] pointer-events-none"
      style={{
        left,
        top,
        width,
        transform: placement === "top" ? "translateY(-100%)" : undefined,
        maxHeight,
      }}
    >
      <div
        className={cn(
          "flex flex-col",
          interactive && "pointer-events-auto",
          // pt/pb (not mt/mb) so the gap to the chart is INSIDE this hoverable
          // box — the cursor never crosses a dead margin on its way in.
          bridge > 0 && (placement === "top" ? "pb-2.5" : "pt-2.5")
        )}
        style={{ maxHeight }}
        onMouseEnter={interactive ? onEnter : undefined}
        onMouseLeave={interactive ? onLeave : undefined}
      >
        {/* THE WHOLE CARD SCROLLS (Anir, Aug 19: "the container for this
            scroll thing shouldn't be in that. it should be in the entire
            thing cuz that's just annoying").
            
            A scroll pane nested inside a small popup means two scrollable
            regions under one cursor: the wheel does nothing until the pointer
            happens to be over the inner one, and the header eats space the
            list needed. One scroll box, the card itself. */}
        <div
          className={cn(
            "chart-tip chart-tip-side flex min-h-0 flex-col overflow-y-auto text-left"
          )}
          style={{ whiteSpace: "normal", width: "100%" }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export type Fmt =
  | "money"
  | "millions"
  | "duration"
  | "percent"
  | "compact"
  | "number"
  | ((v: number) => string);

function fmt(f: Fmt | undefined, v: number): string {
  if (typeof f === "function") return f(v);
  switch (f) {
    case "money":
      return v >= 1e6
        ? `$${(v / 1e6).toFixed(1)}M`
        : v >= 1e3
        ? `$${Math.round(v / 1e3)}K`
        : `$${Math.round(v)}`;
    // Values already expressed in millions (e.g. 2.06 → "$2.1M").
    case "millions":
      return v >= 1 ? `$${v.toFixed(1)}M` : `$${Math.round(v * 1000)}K`;
    case "duration":
      return `${Math.floor(v / 60)}:${String(Math.round(v) % 60).padStart(2, "0")}`;
    case "percent":
      return `${Math.round(v)}%`;
    case "compact":
      return v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v);
    default: {
      const absolute = Math.abs(v);
      if (absolute >= 1e6) {
        const value = v / 1e6;
        return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}M`;
      }
      if (absolute >= 1e3) {
        const value = v / 1e3;
        return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}K`;
      }
      // Never String(v) — an axis max computed as 7 * 1.1 is 7.700000000000001
      // in IEEE-754 and printed exactly that, which is what Anir saw on the
      // "Deals worked" chart. One decimal at most, and no trailing ".0".
      return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(1)));
    }
  }
}

// Thin wrapper kept so existing call sites read the same — now portals to body.
function Tip({
  anchor,
  children,
  wide,
  nearPoint,
  interactive,
  onEnter,
  onLeave,
}: {
  anchor: ChartAnchor | null;
  children: React.ReactNode;
  wide?: boolean;
  nearPoint?: boolean;
  interactive?: boolean;
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  return (
    <PortalTip
      anchor={anchor}
      wide={wide}
      nearPoint={nearPoint}
      interactive={interactive}
      onEnter={onEnter}
      onLeave={onLeave}
    >
      {children}
    </PortalTip>
  );
}

// One data point's breakdown — the WHO/WHICH behind a bar, slice, or plot point.
// A row can carry a logo/headshot, a name, a secondary line, and a value, so the
// tooltip reads like a mini record a rep can act on — not just a bare name
// (Suren: "add the logo, give me more info, I'm a sales agent").
export type TipItem = {
  name: string;
  value?: string;
  /** Free-text detail under the name. When the row also names a person
   *  (`avatar`), the person gets their OWN unbreakable line and whatever is
   *  left of `sub` after the person's name drops below it — so a row never
   *  splits a human's name across two lines (Suren, Jul 27). New call sites
   *  should just put the clause here ("18d since last touch") and let `avatar`
   *  carry the name. */
  sub?: string;
  logo?: string; // company name → CompanyLogo
  avatar?: string; // person name → headshot
  /** The pipeline stage this record sits on ("Qualified"). Rendered as the
   *  SAME colour+icon chip the board, forecast and deal page use. State it
   *  here rather than burying it in `sub` — the tip should not have to infer
   *  what a string is. */
  stage?: string;
  /** How the interaction/call ended — either the raw key ("meeting_booked")
   *  or its label ("Meeting Booked"). Rendered through OUTCOME_META, so it
   *  matches every <OutcomeBadge> in the app. */
  outcome?: string;
  /** The offering/service being sold ("NDA/MAA CMC Writing"). Rendered with
   *  <ServiceTag>, the same glyph + colour it wears on the pipeline cards and
   *  the sessions table. An offering name is a CATEGORY and can never be flat
   *  text — but it also can't be recognised from a bare string (offering names
   *  are user data, not a fixed vocabulary), so a caller must state it here. */
  service?: string;
  /** How big this record is against the whole — drawn as a bar under the
   *  subject line (Anir, Aug 19: "When I hover over that, I need to see a
   *  progress bar... Make it more visual"). A list of amounts makes the
   *  reader do the division; the bar is that division, already done. */
  bar?: { pct: number; color?: string; caption?: string };
  /**
   * Chips the CALLER names outright, for vocabularies this file cannot be
   * expected to recognise — a goal, a claim's status (Anir, Aug 19: "when
   * you're saying 'waiting to be verified', that should be like a tag or
   * something like a color"). `icon` is a TIP_ICONS key.
   */
  tags?: { label: string; color: string; icon?: string }[];
};

/** The clause left over once the person's own name is lifted out of `sub`.
 *  "Prithvi Nair · 18d since last touch" → "18d since last touch". */
function tipRowNote(sub?: string, person?: string): string | undefined {
  if (!sub) return undefined;
  const text = sub.trim();
  if (!person) return text || undefined;
  if (!text.startsWith(person)) return text || undefined;
  return text.slice(person.length).replace(/^[\s·•|,–—-]+/, "").trim() || undefined;
}

// ---------------------------------------------------------------------------
// Stage / outcome chips inside a tooltip row.
//
// A stage or an outcome is NEVER plain text anywhere in this app — it is a chip
// carrying its own colour AND its own icon (Suren's most-repeated rule; Jul 27,
// on the area-chart point tip: "colors, please — colors, tags on the outcome
// thing"). Both palettes are READ from the canonical maps, never re-declared:
// `STAGE_COLOR`/`STAGE_ICON` so a stage looks identical here, on the board, on
// the forecast by-stage chart and on the deal page; `OUTCOME_META` so an
// outcome matches every <OutcomeBadge> in the app (including the central fixes
// to `in_progress` and `no_response`).
type TipTagDef = { label: string; color: string; bg: string; icon: LucideIcon };

const STAGE_TAGS: Record<string, TipTagDef> = Object.fromEntries(
  (Object.keys(STAGE_COLOR) as (keyof typeof STAGE_COLOR)[]).map((stage) => [
    stage.toLowerCase(),
    {
      label: stage,
      color: STAGE_COLOR[stage],
      // 10% tint of the stage's own colour — the same recipe as the deal
      // page's stage pill, so the two are the same object visually.
      bg: `${STAGE_COLOR[stage]}1A`,
      icon: STAGE_ICON[stage],
    },
  ])
);

// Keyed by BOTH the raw outcome key ("meeting_booked") and its display label
// ("Meeting Booked"), because tips in this app pass either one.
const OUTCOME_TAGS: Record<string, TipTagDef> = (() => {
  const out: Record<string, TipTagDef> = {};
  for (const [key, meta] of Object.entries(OUTCOME_META)) {
    const tag: TipTagDef = {
      label: meta.label,
      color: meta.color,
      bg: meta.bg,
      icon: meta.icon,
    };
    out[key.toLowerCase()] = tag;
    out[meta.label.toLowerCase()] = tag;
  }
  return out;
})();

/** Resolve a value to its chip. Stages win a tie ("Meeting Booked" is both a
 *  stage and an outcome label, and the rows that print it bare are deal rows). */
function tipTagFor(
  value: string | undefined,
  kind?: "stage" | "outcome"
): TipTagDef | undefined {
  if (!value) return undefined;
  const key = value.trim().toLowerCase();
  if (kind === "stage") return STAGE_TAGS[key];
  if (kind === "outcome") return OUTCOME_TAGS[key];
  return STAGE_TAGS[key] ?? OUTCOME_TAGS[key];
}

function TipTag({ tag }: { tag: TipTagDef }) {
  const Icon = tag.icon;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-[1.5px] text-[10px] font-semibold leading-[1.2]"
      style={{ background: tag.bg, color: tag.color }}
    >
      <Icon size={10} strokeWidth={2.2} />
      {tag.label}
    </span>
  );
}

/**
 * Split a free-text note into chip-able and plain parts. Callers should say
 * what a value IS via `stage`/`outcome`/`service`, but dozens of existing tips
 * still pack it into `sub` as "Qualified · $610K" — so each "·" segment is
 * looked up by EXACT match in the canonical maps. An exact hit becomes a chip;
 * anything else stays text. No guessing, no partial matching.
 *
 * Leftover segments come back as SEPARATE LINES, never rejoined with a "·":
 * "NDA/MAA CMC Writing · 7 days since last touch" is two different facts and
 * reads as two lines (Suren, Jul 27: "where you say '7 days since last touch',
 * that should be on the next line").
 */
function splitTipNote(note?: string): { tags: TipTagDef[]; lines: string[] } {
  if (!note) return { tags: [], lines: [] };
  const tags: TipTagDef[] = [];
  const lines: string[] = [];
  for (const part of note.split(/\s*[·•|]\s*/)) {
    const piece = part.trim();
    if (!piece) continue;
    const tag = tipTagFor(piece);
    if (tag) tags.push(tag);
    else lines.push(piece);
  }
  return { tags, lines };
}

function TipBreakdown({
  items,
  label,
  /** The card is reachable, so the list scrolls and shows EVERY record instead
   *  of stopping at five with a "+3 more" the user can never open. */
  interactive,
}: {
  items?: TipItem[];
  label?: string;
  interactive?: boolean;
}) {
  if (!items || items.length === 0) return null;
  const rows = interactive ? items : items.slice(0, TIP_INLINE_ROWS);
  const hidden = items.length - rows.length;
  return (
    // Full-bleed section. Two things fall out of that: the hairline above the
    // list runs the WHOLE width of the card, so the headline block above it
    // reads as a headline and this reads as a list; and the scroller below
    // owns the card's right edge, which is where a scrollbar belongs.
    <div
      className="mt-3 flex min-h-0 flex-col border-t border-border-light pt-2.5 text-left"
      style={TIP_BLEED}
    >
      {label && (
        <p
          className="mb-1.5 flex shrink-0 items-baseline gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary"
          style={TIP_ROW_PAD}
        >
          <span>{label}</span>
          {/* How many there are, at rest — a scrollable list needs to say how
              far it goes before you start scrolling it. */}
          <span className="tnum text-text-secondary">{items.length}</span>
        </p>
      )}
      {/* No scroll box of its own any more — the card scrolls, see PortalTip. */}
      <div className="min-h-0">
        {rows.map((t, j) => {
          // The person gets their own line whenever the left-hand mark is
          // already spoken for by the company — otherwise the face has nothing
          // to sit beside. A person-only row keeps its headshot on the left.
          const showPerson = !!t.logo && !!t.avatar && t.avatar !== t.name;
          const note = tipRowNote(t.sub, showPerson ? t.avatar : undefined);
          // Explicit fields first; whatever is left of the note is scanned for
          // stage/outcome names so rows from call sites that still pack them
          // into `sub` get chips too, instead of flat gray text.
          const parsed = splitTipNote(note);
          const tags = [
            ...(t.tags ?? []).map((tag) => ({
              label: tag.label,
              color: tag.color,
              bg: `${tag.color}1A`,
              icon: (tag.icon ? TIP_ICONS[tag.icon] : undefined) ?? Sparkles,
            })),
            tipTagFor(t.stage, "stage"),
            tipTagFor(t.outcome, "outcome"),
            ...parsed.tags,
          ].filter((x): x is TipTagDef => !!x);
          // The company logo stands ALONE on the left so it reads as the
          // company's mark; the person's face travels with the person's NAME on
          // the line below (Suren, Jul 27: "the profile picture should come
          // next to the person's name, and then you can leave the company
          // there"). Overlapping the two stuck the face onto the company label.
          const mark = t.logo ? (
            <CompanyLogo name={t.logo} className="h-[22px] w-[22px] shrink-0 text-[8px]" />
          ) : t.avatar ? (
            <Avatar name={t.avatar} className="h-[22px] w-[22px] shrink-0 text-[8px]" />
          ) : null;
          const hasDetail =
            showPerson || tags.length > 0 || !!t.service || parsed.lines.length > 0;
          return (
            <div
              key={j}
              // No per-row grey plate any more. Three or four lines of text on
              // a solid fill, stacked three deep, is the "bunch of text on top
              // of each other" Suren was reading (Jul 28: "I don't know how I
              // feel about that gray background either"). A list wants a
              // hairline between records and room to breathe, not a wall of
              // plates: the separator does the grouping, `py-2` does the
              // rhythm, and the fill only appears under the cursor — on a
              // reachable tip that also tells you which record you're on while
              // you scroll. `bg-[var(--surface)]` because `hover:bg-surface`
              // compiles to a class `.dark .bg-surface` can never match; the
              // CSS variable is re-defined under `.dark`, so it follows the
              // theme by itself (same fix as the bar-chart column wash).
              className={cn(
                "py-2 transition-colors hover:bg-[var(--surface)]",
                j > 0 && "border-t border-border-light"
              )}
              style={TIP_ROW_PAD}
            >
              {/* The subject line: whose deal it is, and how much it's worth.
                  The money sits on the COMPANY's line, it is that company's
                  number, instead of floating vertically centred against four
                  unrelated lines. */}
              <div className="flex items-center gap-2">
                {mark}
                {/* Wrap, never ellipsize — a clipped company name is the one
                    thing a rep can't act on (Suren's standing rule). */}
                <span className="min-w-0 flex-1 break-normal text-[12px] font-semibold leading-[1.3] text-text-primary">
                  {t.name}
                </span>
                {t.value != null && (
                  <span className="shrink-0 text-[12px] font-semibold leading-[1.3] text-text-primary tnum">
                    {t.value}
                  </span>
                )}
              </div>
              {t.bar && (
                <div
                  className="mt-1.5 flex items-center gap-2"
                  style={mark ? { paddingLeft: TIP_MARK_INDENT } : undefined}
                >
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface)]">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(2, Math.min(100, t.bar.pct))}%`,
                        background: t.bar.color || VIZ.blue,
                      }}
                    />
                  </span>
                  {t.bar.caption && (
                    <span className="shrink-0 text-[10px] font-semibold text-text-tertiary tnum">
                      {t.bar.caption}
                    </span>
                  )}
                </div>
              )}
              {hasDetail && (
                // Everything under the subject is secondary, and it says so by
                // starting on the name's left edge rather than the logo's —
                // one clean rail down the row.
                <div
                  className="mt-1 flex flex-col gap-1"
                  style={mark ? { paddingLeft: TIP_MARK_INDENT } : undefined}
                >
                  {showPerson && (
                    // One line, always. A human's name broken mid-way across
                    // two lines is the thing Suren called out ("that looks
                    // really bad"), so the name is nowrap and anything that
                    // used to trail it after a "·" drops to the line below.
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Avatar name={t.avatar!} className="h-[15px] w-[15px] shrink-0 text-[6px]" />
                      <span className="whitespace-nowrap text-[11px] font-medium text-text-secondary">
                        {t.avatar}
                      </span>
                    </span>
                  )}
                  {/* Metadata, on its own line — a category is never flat text.
                      The offering wears the same ServiceTag it wears on the
                      pipeline cards; the stage wears its board colour+icon. */}
                  {(tags.length > 0 || t.service) && (
                    <span className="flex flex-wrap items-center gap-1">
                      {t.service && (
                        <ServiceTag
                          name={t.service}
                          className="!py-0 !pl-0.5 !pr-1.5 !text-[10px]"
                        />
                      )}
                      {tags.map((tag, k) => (
                        <TipTag key={`${tag.label}-${k}`} tag={tag} />
                      ))}
                    </span>
                  )}
                  {/* …then each remaining clause on a line of its own. Real
                      contrast, not gray-on-gray: these carry facts a rep acts
                      on ("7 days since last touch"). */}
                  {parsed.lines.map((line, k) => (
                    <span
                      key={k}
                      className="block break-normal text-[10.5px] leading-snug text-text-secondary"
                    >
                      {line}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {hidden > 0 && (
          <div
            className="border-t border-border-light py-2 text-[10.5px] text-text-tertiary"
            style={TIP_ROW_PAD}
          >
            +{hidden} more
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The tip's header: the series mark, what you are pointing at, and the number
 * itself — the same hierarchy the app's other hover cards lead with (mark →
 * label → big value), so a chart popup reads as a member of that family
 * instead of a stack of loose lines (Suren: "look at all of your other pop-ups,
 * they look significantly better").
 */
function TipHeader({
  icon,
  color,
  label,
  value,
  note,
  dot,
  bar,
}: {
  icon?: string;
  color?: string;
  label: string;
  value: string;
  /** One plain-English line under the number (what it measures / excludes). */
  note?: string;
  /** Fall back to a plain colour dot when the series has no icon key. */
  dot?: boolean;
  /**
   * DRAW THE PROGRESS, DON'T SPELL IT (Anir, Aug 19: "stop saying '250 of
   * 900k'... If I don't see a bar, it's gonna piss me off. This is not a
   * visual way of showing it at the top").
   *
   * `done` is signed off, `pending` is claimed but unverified — the same
   * two-tone bar every other performance surface draws, so the tip and the
   * page agree at a glance. The caption keeps the numbers, under the bar.
   */
  bar?: {
    done: number;
    pending?: number;
    color?: string;
    /**
     * The unverified segment's own colour. Sent-back money is not "waiting its
     * turn", it is rejected — and a header bar tinted the same friendly blue as
     * the signed-off half said the opposite (Anir, Aug 20: "if this was sent
     * back, the colors should line up... it shouldn't be that blue thing, cuz
     * that means I have to look at it"). Defaults to `color`, so every chart
     * that has nothing rejected looks exactly as it did.
     */
    pendingColor?: string;
    caption?: string;
  };
}) {
  return (
    <div className="flex shrink-0 items-start gap-2.5">
      <SeriesMark
        icon={icon}
        color={color ?? VIZ.blue}
        dotClassName={dot ? "mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full" : undefined}
        tileClassName="mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
          {label}
        </span>
        {/* The headline of the whole card, and sized like one. At 19px it sat
            in the same weight class as the rows below it, which is half of why
            the tip read as one undifferentiated stack (Suren, Jul 28: "a bunch
            of text on top of each other"). */}
        <span className="mt-1.5 block text-[21px] font-bold leading-none text-text-primary tnum">
          {value}
        </span>
        {bar && (
          <span className="mt-2 block">
            <span className="flex h-2.5 w-full overflow-hidden rounded-full bg-[color:var(--border-light)]">
              <span
                className="block h-full"
                style={{
                  width: `${Math.max(0, Math.min(100, bar.done))}%`,
                  background: bar.color ?? color ?? VIZ.blue,
                }}
              />
              <span
                className="block h-full opacity-[0.30]"
                style={{
                  width: `${Math.max(0, Math.min(100 - Math.min(100, bar.done), bar.pending ?? 0))}%`,
                  background: bar.pendingColor ?? bar.color ?? color ?? VIZ.blue,
                }}
              />
            </span>
            {bar.caption && (
              <span className="mt-1 block text-[11px] text-text-secondary tnum">
                {bar.caption}
              </span>
            )}
          </span>
        )}
        {note && (
          <span className="mt-2 block text-[11.5px] leading-snug text-text-secondary">
            {note}
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * A label/number row inside a tip's stat block. The number sits in a fixed
 * right column so several rows line up, but the block itself is a compact
 * plate — never a full-card canyon between a word and its figure.
 */
function TipStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down" | "warn" | "plain";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-tertiary">{label}</span>
      <span
        className={cn(
          "shrink-0 font-semibold tnum",
          tone === "up"
            ? "text-success"
            : tone === "down"
            ? "text-error"
            : tone === "warn"
            ? "text-warning"
            : "text-text-primary"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The series marker in a tip header or legend row. With a known `icon` key it
 * draws a colour-tinted rounded tile with the glyph in the series colour; with
 * no key (or an unknown one) it renders today's plain dot via `dotClassName`,
 * or nothing when no dot class is given — so every existing call site is
 * pixel-identical until a caller opts in.
 */
function SeriesMark({
  icon,
  color,
  dotClassName,
  tileClassName,
}: {
  icon?: string;
  color: string;
  dotClassName?: string;
  tileClassName?: string;
}) {
  const Icon = icon ? TIP_ICONS[icon] : undefined;
  if (!Icon) {
    if (!dotClassName) return null;
    return <span className={dotClassName} style={{ background: color }} />;
  }
  return (
    <span
      className={cn(
        "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md",
        tileClassName
      )}
      // 14% wash of the series colour behind the glyph in the colour itself —
      // reads as "a purple something", not a raw dot.
      style={{ color, background: `${color}24` }}
      aria-hidden="true"
    >
      <Icon size={12} strokeWidth={2.2} />
    </span>
  );
}

/**
 * Tiny share ring for the segment tooltip — the hovered slice's percentage
 * drawn as its own mini donut (series colour vs neutral track) with the % bold
 * in the centre, so "15%" is something you can SEE (Suren: "help the user
 * visualize that 15%… I can't really visualize that"). Hand-rolled two-arc SVG
 * on purpose: nesting the full DonutChart inside a transient tooltip would
 * drag hover state, sync buses and entrance animation along with it.
 */
function TipShareDonut({ pct, color }: { pct: number; color: string }) {
  const size = 54;
  const thickness = 7;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const len = (Math.max(0, Math.min(100, pct)) / 100) * c;
  const fullCircle = len >= c - 0.01;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      aria-hidden="true"
    >
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          className="stroke-[var(--border-light)]"
          strokeWidth={thickness}
        />
        {len > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeDasharray={fullCircle ? undefined : `${len} ${c - len}`}
            strokeLinecap="butt"
          />
        )}
      </g>
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={13}
        fontWeight={700}
        className="fill-current text-text-primary tnum"
      >
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

/**
 * The segment tip's share block: mini share donut + two plain-English lines in
 * place of the old "Share of total / Total shown / Other segments" text rows.
 * The old wording stays as screen-reader text — it reads better aloud than the
 * visual, and the verify suite asserts on it (test 334b).
 */
function TipShareStats({
  value,
  total,
  share,
  color,
  format,
}: {
  value: number;
  /** The raw shown total (may be 0 — display only, never a divisor). */
  total: number;
  share: number;
  color: string;
  format?: Fmt;
}) {
  const others = Math.max(0, total - value);
  return (
    <div className="mt-3 flex shrink-0 items-center gap-2.5 rounded-lg bg-surface px-2.5 py-2">
      <TipShareDonut pct={share} color={color} />
      <div className="min-w-0">
        <span className="sr-only">
          Share of total {share}%. Total shown {fmt(format, total)}.{" "}
          {fmt(format, others)} in other segments.
        </span>
        <p aria-hidden="true" className="text-[12px] leading-snug">
          <span className="font-semibold tnum" style={{ color }}>
            {fmt(format, value)}
          </span>
          <span className="text-text-secondary"> of {fmt(format, total)} total</span>
        </p>
        <p aria-hidden="true" className="mt-0.5 text-[11px] leading-snug text-text-tertiary tnum">
          {fmt(format, others)} in other segments
        </p>
      </div>
    </div>
  );
}

export function AreaChart({
  data,
  color = VIZ.blue,
  height = 220,
  id = "ac",
  className,
  goal,
  goalLabel,
  xLabels,
  format,
  unit,
  pointTips,
  yMax,
}: {
  data: number[];
  color?: string;
  height?: number;
  id?: string;
  className?: string;
  goal?: number;
  goalLabel?: string;
  xLabels?: string[];
  format?: Fmt;
  // Short unit shown after axis values ("deals", "calls") so the chart reads
  // without hovering (Suren: "there are no units, I can't see anything").
  unit?: string;
  // The who/which behind each plotted point, same index as `data`.
  pointTips?: TipItem[][];
  // Fixed scale ceiling for bounded metrics (e.g. a /100 health score). Without
  // it the chart auto-scales to the data's max, so a flat 30/100 renders pinned
  // to the top — reading like a perfect score instead of an at-risk one.
  yMax?: number;
}) {
  const {
    hover,
    active,
    anchor: mouse,
    show: showHover,
    close: closeTip,
    keepOpen,
  } = useChartHover();
  const w = 600;
  const h = height;
  const pad = 6;
  // Big enough to carry axes + always-visible dots (vs. a tiny inline sparkline).
  const showAxes = height >= 140;
  const dataMax = Math.max(...data, goal ?? 0, 1);
  // Auto-scaled charts get ~10% headroom so the stroke never runs under the
  // max-value axis chip (a series that STARTS at its max drew the line right
  // through the label). Bounded metrics (yMax, e.g. /100 health) stay exact.
  const max = yMax != null ? Math.max(dataMax, yMax) : dataMax * 1.1;
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const n = data.length;
  const goalY =
    goal != null ? h - pad - ((goal - min) / range) * (h - pad * 2) : null;
  const px = (i: number) => (i / (n - 1)) * (w - pad * 2) + pad;
  const py = (d: number) => h - pad - ((d - min) / range) * (h - pad * 2);
  const pts = data.map((d, i) => [px(i), py(d)] as const);
  const line = pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  const first = data[0];
  const last = data[data.length - 1];
  const trend = last >= first ? "up" : "down";
  // The point being READ follows the cursor immediately; `hover` (delayed)
  // only decides whether the card is open.
  const hi = active ?? hover ?? n - 1;
  const priorValue = hi > 0 ? data[hi - 1] : data[hi];
  const pointDelta = data[hi] - priorValue;
  const attainment = goal && goal > 0 ? Math.round((data[hi] / goal) * 100) : null;
  const goalGap = goal != null ? goal - data[hi] : null;
  const pointRecords = pointTips?.[hi];
  const tipInteractive = tipIsLong(pointRecords);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
    // Anchor the card to the snapped DATA POINT, not the raw cursor, so it
    // hugs the dot being read (Anir: "right below where it is on the graph").
    const ax = rect.left + (px(idx) / w) * rect.width;
    const ay = rect.top + (py(data[idx]) / h) * rect.height;
    showHover(idx, elementAnchor(e.currentTarget, ax, ay));
  }

  return (
    <div
      className={cn("relative w-full cursor-pointer", className)}
      style={{ height }}
      onMouseMove={onMove}
      onMouseLeave={() => closeTip(tipInteractive ? TIP_CLOSE_GRACE_MS : 0)}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
        role="img"
        aria-label={`Trend chart, ${data.length} points, trending ${trend}${
          goalLabel ? `, ${goalLabel}` : ""
        }`}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {showAxes &&
          [0, 0.5, 1].map((f) => {
            const gy = pad + f * (h - pad * 2);
            return (
              <line
                key={f}
                x1={pad}
                y1={gy}
                x2={w - pad}
                y2={gy}
                stroke="var(--border-light)"
                strokeWidth="1"
                opacity="0.7"
              />
            );
          })}
        <path d={area} fill={`url(#${id})`} className="chart-area" />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chart-line"
        />
        {goalY != null && (
          <line
            x1={pad}
            y1={goalY}
            x2={w - pad}
            y2={goalY}
            stroke={VIZ.amber}
            strokeWidth="1.5"
            strokeDasharray="5 4"
          />
        )}
        {hover != null && (
          <line
            x1={px(hi)}
            y1={pad}
            x2={px(hi)}
            y2={h - pad}
            stroke={color}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
          />
        )}
      </svg>
      {/* Always-visible dots so the series reads as data points, not just a bare
          line you have to hover to understand (Suren). The one under the
          cursor grows and takes a halo so it is unmistakable. */}
      {showAxes &&
        pts.map((p, i) => (
          <PointMarker
            key={i}
            left={`${(p[0] / w) * 100}%`}
            top={`${(p[1] / h) * 100}%`}
            color={color}
            active={hover === i}
            dimmed={hover !== null && hover !== i}
          />
        ))}
      {/* Y-axis scale — max (top) + baseline, with the unit, so the chart has
          numbers you can read at a glance. */}
      {showAxes && (
        <>
          {/* The chip is `bg-surface` + `border-border-light`, never `bg-white/70`.
              Dark mode in this app is a re-skin of the plain utility classes in
              globals.css (`.dark .bg-surface`, `.dark .border-border-light`,
              `.dark .text-text-secondary`); an opacity modifier compiles to a
              DIFFERENT class (`bg-white\/70`), which `.dark .bg-white` cannot
              match, so these axis numbers used to stay light-grey-on-white and
              vanished on every area/line chart in dark mode. */}
          <span className={AXIS_CHIP + " top-1 font-semibold"}>
            {fmt(format, max)}
            {unit ? ` ${unit}` : ""}
          </span>
          <span className={AXIS_CHIP + " bottom-1"}>
            {fmt(format, Math.round(min))}
            {unit ? ` ${unit}` : ""}
          </span>
          {xLabels && xLabels.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 -bottom-4 flex justify-between px-1 text-[10px] text-text-tertiary tnum">
              <span>{xLabels[0]}</span>
              {xLabels.length > 2 && <span>{xLabels[Math.floor((n - 1) / 2)]}</span>}
              <span>{xLabels[n - 1]}</span>
            </div>
          )}
        </>
      )}
      {/* The read-out point on a COMPACT area chart, which has no per-point
          dots of its own. On a full-size chart the loop above already draws
          (and grows) the hovered point, so drawing it twice here would just
          double up the halo. */}
      {!showAxes && (
        <PointMarker
          left={`${(px(hi) / w) * 100}%`}
          top={`${(py(data[hi]) / h) * 100}%`}
          color={color}
          active={active != null}
        />
      )}
      {hover != null && (
        <Tip
          anchor={mouse}
          wide={!!pointTips || goal != null}
          nearPoint
          interactive={tipInteractive}
          onEnter={keepOpen}
          onLeave={() => closeTip(TIP_CLOSE_GRACE_MS)}
        >
          <TipHeader
            color={color}
            dot
            label={xLabels?.[hi] || `Point ${hi + 1} of ${n}`}
            value={`${fmt(format, data[hi])}${unit ? ` ${unit}` : ""}`}
          />
          <div className="mt-3 shrink-0 space-y-1.5 rounded-lg bg-surface px-2.5 py-2 text-[11px]">
            <TipStat
              label="Change from prior"
              value={
                hi === 0
                  ? "Baseline"
                  : `${pointDelta > 0 ? "+" : pointDelta < 0 ? "−" : ""}${fmt(
                      format,
                      Math.abs(pointDelta)
                    )}`
              }
              tone={pointDelta > 0 ? "up" : pointDelta < 0 ? "down" : "plain"}
            />
            {attainment != null && (
              <TipStat label="Quota attainment" value={`${attainment}%`} />
            )}
            {goalGap != null && (
              <TipStat
                label={goalGap > 0 ? "Gap to quota" : "Above quota"}
                value={fmt(format, Math.abs(goalGap))}
                tone={goalGap > 0 ? "warn" : "up"}
              />
            )}
          </div>
          <TipBreakdown
            items={pointRecords}
            label="Records at this point"
            interactive={tipInteractive}
          />
        </Tip>
      )}
      {goalY != null && goalLabel && (
        <span
          className="absolute left-2 text-[11px] font-bold tnum pointer-events-none"
          style={{
            top: `${(goalY / h) * 100}%`,
            color: VIZ.amber,
            transform: "translateY(3px)",
          }}
        >
          {goalLabel}
        </span>
      )}
    </div>
  );
}

/**
 * Hairline seam between donut segments, in user units of the arc. Big enough
 * that neighbouring colours can never smear into each other at any size, small
 * enough that the ring still reads as one continuous whole.
 */
const SEGMENT_GAP = 2;

// ---------------------------------------------------------------------------
// Donut <-> legend linked hover. The chart and its legend are usually siblings
// rendered from a SERVER component, so they can't share React state through a
// parent. Instead both sides subscribe to a tiny module-level bus keyed by a
// shared `syncId` string: hovering a legend row lights the matching slice, and
// hovering a slice lights the row (Anir: "when I hover over the horizontal
// bars, the green pie chart should also hover — they're interconnected").
const donutSyncBus = new Map<string, Set<(i: number | null) => void>>();

function donutSyncSubscribe(id: string, fn: (i: number | null) => void) {
  let set = donutSyncBus.get(id);
  if (!set) donutSyncBus.set(id, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (!set!.size) donutSyncBus.delete(id);
  };
}

export function donutSyncBroadcast(id: string, i: number | null) {
  donutSyncBus.get(id)?.forEach((fn) => fn(i));
}

/** Subscribe to a sync channel; returns the currently-lit index. */
export function useDonutSync(syncId: string | undefined): number | null {
  const [linked, setLinked] = useState<number | null>(null);
  useEffect(() => {
    if (!syncId) return;
    return donutSyncSubscribe(syncId, setLinked);
  }, [syncId]);
  return syncId ? linked : null;
}

export function DonutChart({
  segments,
  size = 150,
  thickness = 16,
  centerLabel,
  centerSub,
  format,
  syncId,
}: {
  segments: {
    label: string;
    value: number;
    color: string;
    /** TIP_ICONS key ("qualified", "meeting", …) — a string on purpose so
     *  server components can pass it. Absent/unknown = plain colour dot. */
    icon?: string;
    tip?: TipItem[];
  }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSub?: string;
  format?: Fmt;
  /** Same string on this donut and its DonutLegend links their hovers. */
  syncId?: string;
}) {
  const {
    hover,
    anchor: mouse,
    show: showHover,
    move: moveTip,
    close: closeTip,
    keepOpen,
  } = useChartHover();
  const linked = useDonutSync(syncId);
  // A slice is "lit" when the mouse is on it OR its legend row is hovered.
  const lit = hover ?? linked;
  const rawTotal = segments.reduce((s, x) => s + x.value, 0);
  const total = rawTotal || 1;
  // Reserve room inside the SVG for the thicker hover stroke. Without this,
  // the ring grows beyond its own viewBox and the outer edge gets visibly
  // shaved off by the SVG viewport.
  const hoverStroke = thickness + 4;
  const r = (size - hoverStroke - 4) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const summary = segments
    .map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`)
    .join(", ");
  const compactCenter = size <= 90;
  // Fit the centre total to the hole instead of hardcoding 24px. "$700K" at a
  // fixed size sat right up against the ring (Anir, Jul 25: "the number 700k so
  // big compared to the pie chart, damn near touching it"), and a longer label
  // like "$1.25M" would have overlapped it outright. 0.62em is a good width
  // estimate per character for bold tabular digits; the 0.82 keeps a margin
  // between the text and the inner edge of the ring.
  const innerWidth = Math.max(0, size - thickness * 2) * 0.82;
  const naturalSize = compactCenter ? 20 : 24;
  const centerLabelSize = centerLabel
    ? Math.max(
        11,
        Math.min(naturalSize, innerWidth / (centerLabel.length * 0.62))
      )
    : naturalSize;
  const centerLabelY = size / 2 - (centerSub ? (compactCenter ? 7 : 8) : 0);
  const centerSubOffset = compactCenter ? 14 : 16;
  const centerSubY = size / 2 + centerSubOffset;
  // The hole is a CIRCLE, so the width available to the sub-label is the chord
  // at its own baseline — not the full inner diameter. "customers" under a 2
  // in a 78px ring measured ~50px against ~50px of chord and sat right on the
  // stroke (Anir, Jul 28: "the text is literally getting blocked"). Same
  // fit-to-space treatment the centre total already gets.
  const innerRadius = Math.max(0, size / 2 - thickness);
  const subChord =
    2 * Math.sqrt(Math.max(0, innerRadius ** 2 - centerSubOffset ** 2)) * 0.82;
  const centerSubSize = centerSub
    ? Math.max(7.5, Math.min(compactCenter ? 9 : 10, subChord / (centerSub.length * 0.55)))
    : 9;
  const hoveredTip = hover != null ? segments[hover]?.tip : undefined;
  const tipInteractive = tipIsLong(hoveredTip);
  function tipAnchor(event: React.MouseEvent<SVGCircleElement>) {
    const chartElement = event.currentTarget.ownerSVGElement;
    if (!chartElement) return null;
    const chart = chartElement.getBoundingClientRect();
    return elementAnchor(chartElement, event.clientX, chart.top);
  }
  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        // Entrance = the whole ring settling in (rotate + fade). The per-slice
        // dash sweep is gone for good — animating dash lengths left square
        // notches at segment edges (the "glitchy pie" Suren kept seeing).
        className="chart-donut"
        aria-label={`Donut chart: ${summary}`}
      >
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            className="stroke-[var(--border-light)]"
            strokeWidth={thickness}
          />
          {segments.map((s, i) => {
            const rawLen = (s.value / total) * c;
            const fullCircle = rawLen >= c - 0.01;
            // Draw each arc a hair shorter than its true share so neighbours
            // never touch. Butt caps alone still bled: sub-pixel rounding let
            // the last segment paint over the first at 12 o'clock, and a 3%
            // sliver ended up with its neighbour's colour smeared across it.
            // The offset still advances by the true length, so proportions and
            // every label stay exact — only the seam changes.
            const gap = fullCircle ? 0 : Math.min(SEGMENT_GAP, rawLen * 0.4);
            const len = Math.max(rawLen - gap, 0.5);
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={lit === i ? hoverStroke : thickness}
                opacity={lit === null || lit === i ? 1 : 0.35}
                strokeDasharray={fullCircle ? undefined : `${len} ${Math.max(0, c - len)}`}
                strokeDashoffset={fullCircle ? undefined : -offset}
                strokeLinecap="butt"
                onMouseEnter={(e) => {
                  showHover(i, tipAnchor(e));
                  if (syncId) donutSyncBroadcast(syncId, i);
                }}
                onMouseMove={(e) => moveTip(tipAnchor(e))}
                onMouseLeave={() => {
                  closeTip(tipIsLong(s.tip) ? TIP_CLOSE_GRACE_MS : 0);
                  if (syncId) donutSyncBroadcast(syncId, null);
                }}
                style={{
                  cursor: "pointer",
                  // Keep the arc geometry stable. Animating dash lengths caused
                  // square notches at segment endpoints as the sweep completed.
                  transition: "stroke-width 120ms ease, opacity 150ms ease",
                }}
              />
            );
            offset += rawLen;
            return el;
          })}
        </g>
        {centerLabel && (
          <text
            x={size / 2}
            y={centerLabelY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={centerLabelSize}
            fontWeight="700"
            className="fill-current text-text-primary"
          >
            {centerLabel}
          </text>
        )}
        {centerSub && (
          <text
            x={size / 2}
            y={centerSubY}
            textAnchor="middle"
            fontSize={centerSubSize}
            className="fill-current text-text-tertiary"
          >
            {centerSub}
          </text>
        )}
      </svg>
      {hover != null && segments[hover] && (
        <PortalTip
          anchor={mouse}
          wide
          interactive={tipInteractive}
          onEnter={keepOpen}
          onLeave={() => closeTip(TIP_CLOSE_GRACE_MS)}
        >
          <TipHeader
            icon={segments[hover].icon}
            color={segments[hover].color}
            dot
            label={segments[hover].label}
            value={fmt(format, segments[hover].value)}
          />
          <TipShareStats
            value={segments[hover].value}
            total={rawTotal}
            share={Math.round((segments[hover].value / total) * 100)}
            color={segments[hover].color}
            format={format}
          />
          <TipBreakdown
            items={hoveredTip}
            label="Records in this segment"
            interactive={tipInteractive}
          />
        </PortalTip>
      )}
    </div>
  );
}

/** Height a classic (non-overlay) horizontal scrollbar occupies. */
const SCROLLBAR_STRIP = 14;

export function BarChart({
  data,
  height = 160,
  format,
  activeIndex = null,
  syncId,
  unit,
  hideTipStats = false,
  tipRecordsLabel = "Records behind this bar",
  fillCard,
  onBarClick,
}: {
  /**
   * Clicking a column does something (Anir, Aug 19: "I feel like something
   * should happen when I click on the bar... whatever it is, do it"). The
   * chart and the table below are the same list twice — hovering already
   * lights both — so a click opens that row rather than opening a page or
   * stacking a dialog on top of the tip.
   */
  onBarClick?: (index: number) => void;
  data: {
    label: string;
    value: number;
    color?: string;
    /**
     * How much of `value` is claimed but not signed off yet. That slice is
     * drawn hatched on top of the solid part, so a bar says what counts and
     * what is still someone's word (Anir, Aug 15: "there has to be
     * differentiation between what's verified, what someone says they have,
     * and what's not").
     */
    pending?: number;
    /**
     * The unverified cap's own hue (Anir, Aug 20: "the top of the bar should
     * be the same color not that blue stripe"). Rejected money read as the
     * same friendly blue as the signed-off money below it, while the tip and
     * the status pill beside it both called it out in red — so the chart was
     * the one surface still saying "on track" about money somebody refused.
     * Omitted keeps the bar's own colour, exactly as before.
     */
    pendingColor?: string;
    // TIP_ICONS key ("qualified", "company", …) — string, not a component, so
    // server components can pass it. Absent/unknown = no mark, same as today.
    icon?: string;
    // A second, smaller line under the bar's value — e.g. the raw count
    // behind a percentage ("4 of 6"), so the bar shows both at rest.
    caption?: string;
    /** Draws the headline as a bar in the tip instead of spelling it out. */
    tipBar?: {
      done: number;
      pending?: number;
      color?: string;
      pendingColor?: string;
      caption?: string;
    };
    // Tip-only line naming what the headline number MEASURES, for the charts
    // where the records listed below can't add up to it (an average, a
    // probability-weighted figure). Suren added the rows up and got a
    // different number — "it says 318K for engaged, but when I add up the
    // records behind this bar it says like a million" — so any bar that isn't
    // simply the sum of its rows now says so out loud. Replaces `caption` in
    // the tooltip (they state the same fact; printing both wastes the space).
    tipNote?: string;
    // Optional breakdown shown in the hover tooltip so it ADDS information
    // (who's in this bar) instead of just restating the label + total.
    tip?: TipItem[];
    // The company this column is about — draws its CompanyLogo above the axis
    // label, the same mark it wears everywhere else (Suren, Jul 27: "I would
    // like to see the logo of the company in the bar chart"). Opt-in per datum
    // on purpose: a stage-named chart ("Prospect", "Engaged") must not sprout
    // logos for things that are not companies.
    logo?: string;
  }[];
  height?: number;
  format?: Fmt;
  // Heading over the tooltip's record list. Override when the rows don't
  // literally compose the bar — "records behind this bar" then reads as a
  // promise the arithmetic doesn't keep.
  tipRecordsLabel?: string;
  // Drop the "Share of shown total" / "Rank" block from the hover tooltip.
  // Meaningless on a two-bar rate chart (open vs reply), where it just
  // restated the same % a third time (Anir: "you say 33% three times").
  hideTipStats?: boolean;
  // When a caller has a "selected" bar (e.g. a stage drill-down is open), pass
  // its index so that bar stays lit + ringed while the rest dim (Suren: "when I
  // highlight one, show that its bar is highlighted").
  activeIndex?: number | null;
  /**
   * Linked hover, the donut's mechanic applied to bars (Anir, Aug 15: "when I
   * hover over the bar chart... that reference amount of money should glow.
   * All these progress bars should glow"). The chart and the table below it
   * are the same list twice, so hovering either lights both.
   */
  syncId?: string;
  // Unit appended to each bar's at-rest value label so a bare "12" reads as
  // "12 calls" without hovering (Suren: "all graphs need units").
  unit?: string;
  /**
   * SIT FLUSH IN A PADDED CARD. Pass the card's own padding in px (20 for
   * p-5) and the caller bleeds this chart into it with a matching negative
   * margin.
   *
   * Two things Anir asked for on Aug 15, and they are the same thing:
   *  - "the bar chart should go all the way to the edge of the rectangle,
   *    it's getting cut short a little bit" — the plot stops 20px inside the
   *    card on each side. The padding moves ONTO the grid here, so the bars
   *    run edge to edge and the padding scrolls with them (padding-right on a
   *    scroll container is dropped by the browser at the end of the scroll,
   *    which is what leaves the last column jammed against the edge).
   *  - "the scroll bar is kind of why it is so high up, it should be at the
   *    bottom" — h-full lets the scroller take the card's leftover height, so
   *    its scrollbar lands on the card's bottom edge instead of cutting
   *    across a wrapped axis label.
   */
  fillCard?: number;
}) {
  const {
    hover,
    anchor: mouse,
    show: showHover,
    move: moveTip,
    close: closeTip,
    keepOpen,
  } = useChartHover();
  const max = Math.max(...data.map((d) => d.value), 1);
  /**
   * NOTHING LOGGED YET SHOULD NOT RESERVE A FULL-HEIGHT PLOT.
   *
   * With every value at 0 the bars are stubs on the baseline and the chart
   * still held back the whole card for a 100% bar that does not exist, so the
   * card read as a big white rectangle with some words at the bottom (Anir,
   * Aug 15, twice). When there is nothing to plot, the chart collapses to the
   * height its labels actually need and centres itself.
   */
  const allZero = data.every((d) => !d.value);
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const ranked = [...data].sort((a, b) => b.value - a.value);
  // Hover wins over the externally-selected bar; otherwise the selected bar lit.
  const linked = useDonutSync(syncId);
  const lit = hover ?? activeIndex ?? linked;
  // Two label lines need more headroom, else a full-height bar's label would
  // ride out of the top of the plot.
  const hasCaption = data.some((d) => d.caption);
  // Room reserved ABOVE the tallest bar for its own value label + the hover
  // lift. Reserving it as padding on the track means a 100%-height bar stops
  // exactly under its label instead of running through it.
  const labelRoom = hasCaption ? 40 : 28;
  // How far a bar (and its label, as one object) rises under the cursor.
  const HOVER_LIFT = 6;
  // --- Axis labels: wrap, never clip -------------------------------------
  // "NovaGene Therapeut" / "Solara Consu…" was the banned truncation (Suren,
  // Jul 27: "a lot of the companies are not even loading completely… I'm
  // perfectly fine with having a graph where I scroll within that section").
  // So: every column gets a width a company name can actually live in, the
  // label wraps to as many lines as that width needs, and when the columns
  // add up to more than the card the PLOT scrolls sideways instead of
  // squeezing the words.
  const hasLogos = data.some((d) => d.logo);
  const longestLabel = data.reduce((n, d) => Math.max(n, d.label.length), 0);
  const wideLabels = hasLogos || longestLabel > 14;
  const COL_GAP = 12; // gap-3
  // 112 tipped six wide-label columns just past a half-width card, so the last
  // one sat half outside it and read as clipped ("Billed / Colle Revenue" on
  // Org performance, Anir Aug 14). 100 still fits a wrapped company name and
  // keeps six columns inside the card instead of behind a sideways scroll.
  // 124, not 100: at 100 a two-line wrap could not hold "Billed / Collected
  // Revenue" and the clamp turned it into "Billed / Collected…" (Anir, Aug 15:
  // "dont have ... figure out how to space them out properly"). The clamp is
  // the guarantee that nothing ever runs to three lines; this is the width
  // that stops it having to. Wider columns just mean the plot scrolls, which
  // he has already said is fine.
  const minColumn = wideLabels ? 124 : 64;
  // A fixed label-block height keeps every column on ONE baseline; sized from
  // the longest name so the tallest wrap still fits without clipping.
  // TWO LINES, NEVER THREE (Anir, Aug 15: "the bar header has to be 2 lines
  // max not 3"). "Billed / Collected Revenue" took three and every column's
  // label block grew to match it, which is where a chunk of the card's dead
  // height was coming from. 28 = two lines at 11px/1.2, and the label itself
  // is clamped so it can never spill past the block it is given.
  const labelTextHeight = 28;
  const labelBlockHeight = labelTextHeight + (hasLogos ? 24 : 0);
  const baselineOffset = labelBlockHeight + 8; // + the label block's mt-2
  const gridMinWidth =
    data.length * minColumn + Math.max(0, data.length - 1) * COL_GAP;

  /** Anchor the tooltip to the hovered column's own VALUE LABEL, so the gap
   *  above the number is the same on a full-height bar and on a stub (Suren:
   *  "it shouldn't be a set amount… even the smallest, look at the space").
   *  Falls back to the cursor if the label somehow isn't there. */
  function barLabelAnchor(column: Element): ChartAnchor | null {
    const label = column.querySelector("[data-bar-label]");
    if (!label) return null;
    const r = label.getBoundingClientRect();
    // offsetY resolves to 0, so the anchor tracks the label as the bar lifts.
    return elementAnchor(label, r.left + r.width / 2, r.top);
  }

  return (
    <div
      className={cn(
        "w-full overflow-x-auto",
        fillCard ? "h-full" : undefined,
        // BOTTOM-ANCHORED when there is nothing to plot. The card still has
        // to match the donut beside it (equal card heights is a standing
        // rule), so the air has to go somewhere — and it belongs ABOVE a bar,
        // never below it. Centred left a band under the labels and the bars
        // read as floating (Anir, Aug 15: "the bars are so high up").
        fillCard && allZero ? "flex items-end" : undefined
      )}
    >
    <div
      className="relative grid w-full items-stretch gap-3"
      style={{
        // THE PLOT FILLS THE CARD; THE SCROLLBAR SITS UNDER IT.
        //
        // First attempt padded the grid, which just shoved the bars up and
        // left the same dead band (Anir, Aug 15: "no. ur moving the bars up.
        // not the scroll bar down."). The real problem was that the grid kept
        // its fixed height inside a scroller stretched to a taller card, so it
        // hugged the top and everything below it was empty.
        //
        // 100% makes the plot take the whole card, so the bars grow and the
        // axis labels land at the bottom where they belong. `height` becomes
        // the floor rather than the value. The strip is still reserved for a
        // classic scrollbar — macOS overlay bars take no layout height, so
        // without it "always show scrollbars" draws straight across the
        // labels.
        // With every bar at zero there is no tall column to leave room above
        // and no column to give height to, so the plot is exactly its value
        // labels, a stub band and the axis labels (Anir, Aug 15: "the bars are
        // so high up").
        height: allZero
          ? labelRoom + 16 + baselineOffset + SCROLLBAR_STRIP
          : fillCard
            ? "100%"
            : height,
        minHeight: undefined,
        paddingBottom: fillCard ? SCROLLBAR_STRIP : undefined,
        gridTemplateColumns: `repeat(${Math.max(
          data.length,
          1
        )}, minmax(${minColumn}px, 1fr))`,
        minWidth: gridMinWidth + (fillCard ?? 0) * 2,
        paddingLeft: fillCard,
        paddingRight: fillCard,
      }}
      role="img"
      aria-label={`Bar chart: ${data
        .map((d) => `${d.label} ${d.value}`)
        .join(", ")}`}
    >
      {/* No baseline rule. It sat exactly where the axis labels begin, so
          once the label block tightened it ran straight through the words
          (Anir, Aug 15: "what's that weird line in the background, please
          remove or at least make it so it doesn't intersect text"). The bars
          all start from the same place anyway; the line was restating that
          and colliding with the labels to do it. */}
      {data.map((d, i) => {
        /**
         * REACHABLE WHENEVER IT LISTS ANYTHING (Anir, Aug 19: "if there are
         * multiple things that this is made of, I need to be able to scroll
         * on the pop-up. I can't scroll on the pop-up because as soon as I
         * leave my cursor, it disappears").
         *
         * This used to open only past three rows, so a card the reader could
         * plainly see more in still evaporated the moment they moved toward
         * it. A tip with no record list stays inert, as it must — nothing to
         * reach for, and it would only intercept the pointer.
         */
        const barInteractive = (d.tip?.length ?? 0) > 0;
        return (
          <div
            key={i}
            // The column wash uses the RAW token, not `bg-surface/45`: this app
            // has no `dark:` variants, dark mode re-skins the plain
            // `.bg-surface` class only, and an opacity modifier (or a
            // `hover:` variant) compiles to a class that rule cannot match —
            // so the wash stayed near-white on a near-black card. `var(--surface)`
            // is redefined under `.dark`, so it follows the theme by itself.
            className="group/bar relative z-[1] flex h-full min-w-0 cursor-pointer flex-col items-center rounded-md transition-colors hover:bg-[var(--surface)]"
            role={onBarClick ? "button" : undefined}
            tabIndex={onBarClick ? 0 : undefined}
            aria-label={onBarClick ? `Open ${d.label}` : undefined}
            onClick={onBarClick ? () => onBarClick(i) : undefined}
            onKeyDown={
              onBarClick
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onBarClick(i);
                    }
                  }
                : undefined
            }
            onMouseEnter={(e) => {
              showHover(i, barLabelAnchor(e.currentTarget) ?? pointerAnchor(e));
              if (syncId) donutSyncBroadcast(syncId, i);
            }}
            onMouseMove={(e) =>
              moveTip(barLabelAnchor(e.currentTarget) ?? pointerAnchor(e))
            }
            onMouseLeave={() => {
              closeTip(barInteractive ? TIP_CLOSE_GRACE_MS : 0);
              if (syncId) donutSyncBroadcast(syncId, null);
            }}
          >
            {/* Hover breakdown — portaled so it's never clipped by the card.
                It sits directly above (or below) THIS bar's value label
                (Anir, Aug 19: "Why is this pop-up so far away from the chart?
                It should be right above the number 25"). It used to clear the
                whole plot box, which on a short chart parked the card halfway
                up the page, nowhere near the bar it described. `nearPoint`
                anchors it to the bar's own label, and the card still goes
                above or below that label, never across it. */}
            {hover === i && (
              <PortalTip
                anchor={mouse}
                wide
                nearPoint
                interactive={barInteractive}
                onEnter={keepOpen}
                onLeave={() => closeTip(TIP_CLOSE_GRACE_MS)}
              >
                <TipHeader
                  icon={d.icon}
                  color={d.color || VIZ.blue}
                  label={d.label}
                  bar={d.tipBar}
                  value={`${fmt(format, d.value)}${unit ? ` ${unit}` : ""}`}
                  // `tipNote` is the fuller sentence version of `caption` — one
                  // or the other, never both restating the same fact. And when
                  // the bar above already carries the figures, neither: the
                  // card printed "$250K of $900K" twice, once under the bar
                  // and once here (Anir, Aug 19).
                  note={
                    d.tipBar?.caption
                      ? d.tipNote || undefined
                      : d.tipNote || d.caption
                  }
                />
                {!hideTipStats && (
                  <div className="mt-3 shrink-0 space-y-1.5 rounded-lg bg-surface px-2.5 py-2 text-[11px]">
                    <TipStat
                      label="Share of shown total"
                      value={`${total ? Math.round((d.value / total) * 100) : 0}%`}
                    />
                    <TipStat
                      label="Rank"
                      value={`#${ranked.findIndex((item) => item === d) + 1} of ${data.length}`}
                    />
                  </div>
                )}
                <TipBreakdown
                  items={d.tip}
                  label={tipRecordsLabel}
                  interactive={barInteractive}
                />
              </PortalTip>
            )}
            {/* The plot track. Its top padding is the room every bar's own
                value label lives in, so the label can sit directly on top of
                ITS bar instead of in a flat row across the chart (Suren, Jul
                27: "the number should be right above the bar"). Same shape as
                /forecast's by-stage columns: a stretchy track, bar pinned to
                the shared baseline. */}
            <div
              className="relative flex min-h-0 w-full flex-1 items-end justify-center px-1.5"
              style={{ paddingTop: labelRoom }}
            >
              {/* Label + bar are ONE object: the label is a child of the bar,
                  so when the bar lifts under the cursor the number rides up
                  with it, exactly as far, at exactly the same speed (Suren:
                  "the number does not go up when the bar chart goes up"). */}
              <div
                className="relative flex w-[72%] min-w-[14px] max-w-[88px] justify-center transition-transform duration-150 motion-reduce:transition-none"
                style={{
                  height: `${(d.value / max) * 100}%`,
                  minHeight: 4,
                  // Every bar keeps its FULL colour at all times. Fading the
                  // siblings to 0.4 read as damage, not emphasis (Suren: "I
                  // don't know why you're blurring the other ones out… it
                  // should just pop a little bit"). So the only hover change is
                  // the bar under the cursor lifting — the same idiom as the
                  // rep bars on the forecast page.
                  transform: lit === i ? `translateY(-${HOVER_LIFT}px)` : undefined,
                }}
              >
                <span
                  data-bar-label
                  className="pointer-events-none absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 flex-col items-center whitespace-nowrap leading-tight"
                >
                  <span className="text-[11px] font-semibold text-text-secondary tnum">
                    {fmt(format, d.value)}
                    {unit ? ` ${unit}` : ""}
                  </span>
                  {d.caption && (
                    <span className="text-[9.5px] font-medium text-text-tertiary tnum">
                      {d.caption}
                    </span>
                  )}
                </span>
                <div
                  className="chart-bar relative h-full w-full overflow-hidden rounded-t-md transition-[filter,box-shadow] group-hover/bar:brightness-105"
                  style={{
                    animationDelay: `${i * 45}ms`,
                    background:
                      d.value > 0
                        ? d.color || VIZ.blue
                        : "var(--border-light)",
                    boxShadow:
                      lit === i
                        ? `0 0 0 2px #fff, 0 0 0 4px ${d.color || VIZ.blue}`
                        : undefined,
                  }}
                >
                  {/* The unverified slice: the same colour washed out, sitting
                      on top of what is already signed off. Diagonal stripes
                      were the first attempt and they were unreadable at this
                      size (Anir, Aug 15: "whatever that fucking design for
                      that bar is, it's horrible"). A pale band with a crisp
                      edge says "not counted yet" without the barber pole. */}
                  {!!d.pending && d.value > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0"
                      style={{
                        height: `${Math.min(100, (d.pending / d.value) * 100)}%`,
                        /**
                         * NOT SIGNED OFF = STRIPED (Anir, Aug 15: "if it's not
                         * verified, show it like a stripe").
                         *
                         * Third time on this. The first stripe was a barber
                         * pole — full-strength colour against white, 50/50, at
                         * a size you could read from across the room. Then a
                         * flat wash, which said nothing. Then a coloured cap,
                         * which read as a stray line.
                         *
                         * These are two WHITE veils over the bar's own colour,
                         * a few percent apart, so the stripe is the same hue
                         * twice and only shows up close. The bar still reads as
                         * one colour at a glance and as provisional when you
                         * look at it.
                         */
                        background: d.pendingColor
                          ? // The veils are white, so laying them over an
                            // explicit colour restripes the cap in that hue
                            // rather than the bar's.
                            `repeating-linear-gradient(45deg, rgba(var(--bar-veil), 0.80) 0 5px, rgba(var(--bar-veil), 0.62) 5px 10px), ${d.pendingColor}`
                          : "repeating-linear-gradient(45deg, rgba(var(--bar-veil), 0.80) 0 5px, rgba(var(--bar-veil), 0.62) 5px 10px)",
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
            {/* The axis label: the company's own mark above its name, and the
                name wrapped over as many lines as it takes. No line-clamp, no
                max-width, no "…", the column is wide enough, and the plot
                scrolls if the columns outgrow the card. */}
            <span
              className="mt-2 flex w-full shrink-0 flex-col items-center justify-start gap-1 px-0.5 text-center"
              style={{ height: labelBlockHeight }}
            >
              {d.logo && (
                <CompanyLogo
                  name={d.logo}
                  className="h-[20px] w-[20px] shrink-0 text-[7px]"
                />
              )}
              {/* A category label carries its series colour, the way the
                  forecast by-stage legend does. Suren, Jul 28: "do the next
                  nice colour-coding thing here… look at the labels at the
                  bottom". Only when the column has no logo: a company already
                  has its mark above the name and a dot beside it would be a
                  second, weaker identity. Same 6px dot the forecast uses. */}
              <span
                title={d.label}
                className="line-clamp-2 w-full break-words text-[11px] leading-[1.2] text-text-tertiary"
              >
                {!d.logo && d.color && (
                  <span
                    aria-hidden
                    className="mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full align-middle"
                    style={{ background: d.color }}
                  />
                )}
                {d.label}
              </span>
            </span>
          </div>
        );
      })}
    </div>
    </div>
  );
}

export function LineChart({
  series,
  xLabels,
  pointLabels,
  unit,
  height = 220,
  className,
  format,
  pointTips,
}: {
  series: { label: string; color: string; points: number[] }[];
  // Sparse labels shown along the x-axis (a handful, evenly spread).
  xLabels?: string[];
  // One label PER data point — used for the hover tooltip so it names the exact
  // day/point you're on (Suren: "it's not even telling me the date when I
  // hover"). Falls back to xLabels when omitted.
  pointLabels?: string[];
  // Optional unit appended to the hovered value ("3 calls").
  unit?: string;
  height?: number;
  className?: string;
  format?: Fmt;
  // The who/which behind each x-point (shared across series).
  pointTips?: TipItem[][];
}) {
  const {
    hover,
    anchor: mouse,
    show: showHover,
    close: closeTip,
    keepOpen,
  } = useChartHover();
  const w = 600;
  const h = height;
  const pad = 8;
  const n = Math.max(...series.map((s) => s.points.length), 2);
  const max = Math.max(...series.flatMap((s) => s.points), 1);
  const x = (i: number) => (i / (n - 1)) * (w - pad * 2) + pad;
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const xPct = (i: number) => (x(i) / w) * 100;
  const summary = series
    .map((s) => `${s.label} peaks at ${Math.max(...s.points, 0)}`)
    .join(", ");
  const hi = hover;
  const pointRecords = hi != null ? pointTips?.[hi] : undefined;
  const tipInteractive = tipIsLong(pointRecords);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    showHover(
      Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))),
      pointerAnchor(e)
    );
  }

  return (
    <div
      className={cn("relative w-full cursor-pointer", className)}
      onMouseMove={onMove}
      onMouseLeave={() => closeTip(tipInteractive ? TIP_CLOSE_GRACE_MS : 0)}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
        role="img"
        aria-label={`Line chart: ${summary}`}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={pad}
            x2={w - pad}
            y1={y(max * f)}
            y2={y(max * f)}
            stroke="#EEF0F3"
            strokeWidth="1"
          />
        ))}
        {series.map((s, si) => {
          const pts = s.points.map((v, i) => [x(i), y(v)] as const);
          const d = pts
            .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
            .join(" ");
          return (
            <path
              key={si}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="chart-line"
            />
          );
        })}
        {/* Drawn AFTER the series: as the first child it was painted over by
            every line, so the guide to the hovered x kept disappearing under
            the data it was supposed to point at. */}
        {hi != null && (
          <line
            x1={x(hi)}
            y1={pad}
            x2={x(hi)}
            y2={h - pad}
            stroke={series[0]?.color || VIZ.blue}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
          />
        )}
      </svg>
      {/* Y-axis scale at rest — max (top) + zero baseline, with the unit, so
          the chart reads without hovering (Suren: "all graphs need units").
          Only on charts tall enough that the labels don't sit ON the lines,
          on compact card charts they collided with the data. */}
      {h >= 120 && (
        <>
          <span className={AXIS_CHIP + " top-1 font-semibold"}>
            {fmt(format, max)}
            {unit ? ` ${unit}` : ""}
          </span>
          <span
            // Pinned in the SVG's pixel space — the in-flow x-labels below make
            // the container taller than the chart, so `bottom-1` would miss the
            // baseline.
            className={AXIS_CHIP}
            style={{ top: h - 8, transform: "translateY(-100%)" }}
          >
            0{unit ? ` ${unit}` : ""}
          </span>
        </>
      )}
      {series.map((s, si) => {
        const i = hi ?? s.points.length - 1;
        const v = s.points[i];
        if (v == null) return null;
        return (
          <PointMarker
            key={si}
            // Position the dot in the SVG's pixel space (top = y in px), NOT a
            // % of the container — the x-axis labels make the container taller
            // than the SVG, which pushed the dots below the line (Suren, Jul 8).
            left={`${xPct(i)}%`}
            top={`${y(v)}px`}
            color={s.color}
            active={hi != null}
          />
        );
      })}
      {hi != null &&
        (() => {
          const tipLabel = pointLabels?.[hi] ?? xLabels?.[hi];
          const current = series[0]?.points[hi] ?? 0;
          const prior = hi > 0 ? series[0]?.points[hi - 1] ?? current : current;
          const delta = current - prior;
          return (
            <Tip
              anchor={mouse}
              wide
              interactive={tipInteractive}
              onEnter={keepOpen}
              onLeave={() => closeTip(TIP_CLOSE_GRACE_MS)}
            >
              {series.length === 1 ? (
                <div className="shrink-0">
                  <TipHeader
                    color={series[0]?.color}
                    dot
                    label={tipLabel || `Point ${hi + 1} of ${n}`}
                    value={`${fmt(format, current)}${unit ? ` ${unit}` : ""}`}
                  />
                  <div className="mt-3 rounded-lg bg-surface px-2.5 py-2 text-[11px]">
                    <TipStat
                      label="Change from prior"
                      value={
                        hi === 0
                          ? "Baseline"
                          : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${fmt(
                              format,
                              Math.abs(delta)
                            )}${unit ? ` ${unit}` : ""}`
                      }
                      tone={delta > 0 ? "up" : delta < 0 ? "down" : "plain"}
                    />
                  </div>
                </div>
              ) : (
                <div className="shrink-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                    {tipLabel || `Point ${hi + 1} of ${n}`}
                  </p>
                  {/* One plate, one row per series — the same "mark, name,
                      number" rhythm the breakdown rows below use. */}
                  <div className="mt-2 space-y-1 rounded-lg bg-surface px-2.5 py-2">
                    {series.map((s) => (
                      <span
                        key={s.label}
                        className="flex items-center gap-2 whitespace-nowrap text-[11.5px]"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ background: s.color }}
                        />
                        <span className="min-w-0 flex-1 text-text-secondary">{s.label}</span>
                        <span className="shrink-0 font-semibold text-text-primary tnum">
                          {fmt(format, s.points[hi] ?? 0)}
                          {unit ? ` ${unit}` : ""}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <TipBreakdown
                items={pointRecords}
                label="Records at this point"
                interactive={tipInteractive}
              />
            </Tip>
          );
        })()}
      {xLabels && xLabels.length > 1 && (
        <div className="flex justify-between mt-1 px-0.5">
          {xLabels.map((l, i) => (
            <span key={i} className="text-[10.5px] text-text-tertiary tnum">
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sparkline({
  points,
  color = VIZ.blue,
  height = 34,
  format,
  xLabels,
  unit,
  pointTips,
  label,
  interactive = true,
}: {
  points: number[];
  color?: string;
  height?: number;
  format?: Fmt;
  xLabels?: string[];
  // A unit appended to the hovered value so a bare "7" reads as "7 touches"
  // (Suren: "7, what the fuck? What date was this?").
  unit?: string;
  pointTips?: TipItem[][];
  // Names the metric in compact contexts where the surrounding card title is
  // not part of the portaled tooltip (for example dashboard KPI sparklines).
  label?: string;
  // Disable the point tooltip when the sparkline is itself the trigger for a
  // larger contextual preview. This prevents two overlapping popovers.
  interactive?: boolean;
}) {
  const {
    hover,
    anchor: mouse,
    show: showHover,
    close: closeTip,
    keepOpen,
  } = useChartHover();
  const w = 120;
  const h = height;
  const pad = 3;
  const n = Math.max(points.length, 2);
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const x = (i: number) => (i / (n - 1)) * (w - pad * 2) + pad;
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2);
  const d = points
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const hi = hover ?? n - 1;
  const pointRecords = pointTips?.[hi];
  // Distinct from the `interactive` PROP above (which decides whether this
  // sparkline pops a tip at all): this is whether the tip itself can be
  // entered and scrolled.
  const tipReachable = tipIsLong(pointRecords);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left) / rect.width;
    showHover(
      Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))),
      pointerAnchor(e)
    );
  }

  return (
    <div
      className={interactive ? "relative w-full cursor-pointer" : "relative w-full"}
      style={{ height }}
      onMouseMove={interactive ? onMove : undefined}
      onMouseLeave={
        interactive
          ? () => closeTip(tipReachable ? TIP_CLOSE_GRACE_MS : 0)
          : undefined
      }
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full block"
        style={{ height }}
        aria-hidden
      >
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="chart-line"
        />
      </svg>
      {/* A 6px dot in the line's own colour, sitting ON a 2px stroke of that
          same colour, was invisible, which is what read as "it doesn't show
          me the dot properly… maybe it's getting covered up" (Suren, Jul 27,
          on the voice agents' "Calls · last 2 weeks"). It is now a ringed,
          haloed marker with a dashed guide down to the baseline, the same
          treatment as the area and line charts. */}
      {interactive && hover != null && (
        <PointGuide left={`${(x(hi) / w) * 100}%`} color={color} />
      )}
      <PointMarker
        left={`${(x(hi) / w) * 100}%`}
        top={`${(y(points[hi] ?? 0) / h) * 100}%`}
        color={color}
        active={interactive && hover != null}
      />
      {interactive && hover != null && (
        <Tip
          anchor={mouse}
          wide
          interactive={tipReachable}
          onEnter={keepOpen}
          onLeave={() => closeTip(TIP_CLOSE_GRACE_MS)}
        >
          <div className="shrink-0">
            <TipHeader
              color={color}
              dot
              label={`${label ? `${label} · ` : ""}${
                xLabels?.[hi] || `Point ${hi + 1} of ${points.length}`
              }`}
              value={`${fmt(format, points[hi] ?? 0)}${unit ? ` ${unit}` : ""}`}
            />
            <div className="mt-3 rounded-lg bg-surface px-2.5 py-2 text-[11px]">
              {(() => {
                const current = points[hi] ?? 0;
                const prior = hi > 0 ? points[hi - 1] ?? current : current;
                const delta = current - prior;
                return (
                  <TipStat
                    label="Change from prior"
                    value={
                      hi === 0
                        ? "Baseline"
                        : `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${fmt(
                            format,
                            Math.abs(delta)
                          )}${unit ? ` ${unit}` : ""}`
                    }
                    tone={delta > 0 ? "up" : delta < 0 ? "down" : "plain"}
                  />
                );
              })()}
            </div>
          </div>
          <TipBreakdown
            items={pointRecords}
            label="Records at this point"
            interactive={tipReachable}
          />
        </Tip>
      )}
    </div>
  );
}

// A donut/pie side legend where the count sits RIGHT AFTER the label (Suren:
// "don't do this stupid thing where the numbers are so far from the tags"), with
// the share % and a subtle proportion bar filling the space that freed up on the
// right — so the width reads as information, not a dead gap.
export function DonutLegend({
  items,
  total,
  format,
  className,
  syncId,
  bars = true,
  pill = false,
  showValues = true,
}: {
  items: {
    label: string;
    color: string;
    value: number;
    /** TIP_ICONS key — colour-tinted icon tile instead of the plain dot. */
    icon?: string;
    /** The records behind this slice. When present, hovering the legend row
     *  opens the SAME pop-up the donut slice shows — the row already lit the
     *  slice via syncId but gave no records, which read as a dead hover
     *  (Anir, Jul 28: "when I hover over this, the pop-up doesn't show up"). */
    tip?: TipItem[];
  }[];
  total?: number;
  format?: Fmt;
  className?: string;
  /** Same string on this legend and its DonutChart links their hovers. */
  syncId?: string;
  /** Hide the per-row share bar — for panels where a table right beside
   *  already draws the same bar (Anir: "you don't have to show the progress
   *  bar twice"). */
  bars?: boolean;
  /** Label as a colour-tinted tag instead of dot + plain text. */
  pill?: boolean;
  /** Drop the absolute value, keeping just the share — for legends sitting
   *  above a table that already lists the same numbers. */
  showValues?: boolean;
}) {
  const sum = (total ?? items.reduce((s, x) => s + x.value, 0)) || 1;
  const linked = useDonutSync(syncId);
  const {
    hover,
    anchor: mouse,
    show: showHover,
    move: moveTip,
    close: closeTip,
    keepOpen,
  } = useChartHover();
  return (
    // One shared grid: label/value/% columns size to their widest row, so
    // every share bar starts at the same x (Anir: "the bars have to be
    // aligned — it doesn't make sense for them not to be").
    <div
      className={cn(
        "min-w-0 grid items-center gap-x-2 gap-y-1",
        // Without bars the row shouldn't stretch: a flex-1 legend shoved the
        // values to the far edge and left a canyon of white space in between
        // (Anir: "so much empty space there").
        bars ? "flex-1" : "w-fit",
        // Label column sizes to content, NOT 1fr — a stretching label column
        // parked the value a canyon away from short labels like "Prospect"
        // (Anir: "the other number is so far away from that"). The number now
        // sits right after the tag and the share bar absorbs the free width.
        //
        // `auto`, not `minmax(0,auto)`: a 0 minimum let the label track
        // collapse under its own text while the 1fr bar track kept the slack,
        // which is how "Meeting Booked" ended up broken over two lines with
        // open space to its right (Suren, Jul 27: "that has to fit on one
        // line"). An `auto` track can never be narrower than the label's
        // min-content, and the label is nowrap below, so min-content IS the
        // whole label — the row claims the width the words need FIRST and the
        // share bar takes whatever is left.
        bars
          ? "grid-cols-[auto_auto_auto_auto_minmax(44px,1fr)]"
          : showValues
            ? "grid-cols-[auto_auto_auto_auto]"
            : "grid-cols-[auto_auto_auto]",
        className
      )}
    >
      {items.map((it, i) => {
        const pct = Math.round((it.value / sum) * 100);
        return (
          <div
            key={it.label}
            onMouseEnter={(e) => {
              if (syncId) donutSyncBroadcast(syncId, i);
              if (it.tip?.length) showHover(i, pointerAnchor(e));
            }}
            onMouseMove={it.tip?.length ? (e) => moveTip(pointerAnchor(e)) : undefined}
            onMouseLeave={() => {
              if (syncId) donutSyncBroadcast(syncId, null);
              if (it.tip?.length) closeTip(tipIsLong(it.tip) ? TIP_CLOSE_GRACE_MS : 0);
            }}
            className={cn(
              // Always the pointer cursor — these rows are hover-interactive
              // chart elements (standing rule; Suren: "why is my cursor not
              // opening when I hover over these?"), not just when a syncId
              // links them to a donut.
              "col-span-full grid grid-cols-subgrid items-center rounded-md px-1.5 py-[3px] text-[12.5px] transition-all duration-150 cursor-pointer",
              // A faint gray wash was not a response (Anir: "the pop isn't
              // enough… it should pop like the pie chart does"). The row now
              // takes the series colour and lifts, matching the slice that
              // thickens on the other side.
              linked === i && "scale-[1.015] shadow-[0_2px_10px_rgba(0,0,0,0.07)]"
            )}
            style={
              linked === i
                ? { background: `${it.color}1F`, boxShadow: `inset 0 0 0 1px ${it.color}59` }
                : undefined
            }
          >
            {pill ? (
              // The coloured company tag (Anir: "you just need to show the
              // tag — the blue and yellow tag that has the company name").
              <span
                className="col-span-2 inline-flex min-w-0 items-center gap-1.5 justify-self-start rounded-full px-2.5 py-1 text-[12px] font-semibold"
                style={{ color: it.color, background: `${it.color}1A` }}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: it.color }}
                />
                <span className="min-w-0 break-normal">{it.label}</span>
              </span>
            ) : (
              <>
                <SeriesMark
                  icon={it.icon}
                  color={it.color}
                  dotClassName="w-2.5 h-2.5 rounded-full shrink-0"
                />
                {/* One line, never truncated (Suren): a two-word stage name
                    like "Meeting Booked" reads as one thing, so it is nowrap
                    and its grid track is sized from that, the share bar
                    yields the width instead of the words. */}
                <span className="whitespace-nowrap text-text-secondary">{it.label}</span>
              </>
            )}
            {showValues && (
              <span className="justify-self-end font-semibold text-text-primary tnum">
                {format ? fmt(format, it.value) : it.value}
              </span>
            )}
            <span className="justify-self-end text-text-tertiary tnum text-[11px]">
              {pct}%
            </span>
            {bars && (
              <span className="h-1.5 w-full rounded-full bg-surface overflow-hidden">
                <span
                  className="block h-full rounded-full transition-all"
                  style={{ width: `${Math.max(pct, 3)}%`, background: it.color }}
                />
              </span>
            )}
          </div>
        );
      })}
      {/* The same records pop-up the donut slice opens, fed by the same tip
          rows, so the legend and the ring answer a hover identically. */}
      {hover != null && items[hover]?.tip?.length ? (
        <PortalTip
          anchor={mouse}
          wide
          interactive={tipIsLong(items[hover].tip)}
          onEnter={keepOpen}
          onLeave={() => closeTip(TIP_CLOSE_GRACE_MS)}
        >
          <TipHeader
            icon={items[hover].icon}
            color={items[hover].color}
            dot
            label={items[hover].label}
            value={format ? fmt(format, items[hover].value) : String(items[hover].value)}
          />
          <TipShareStats
            value={items[hover].value}
            total={sum}
            share={Math.round((items[hover].value / sum) * 100)}
            color={items[hover].color}
            format={format}
          />
          <TipBreakdown
            items={items[hover].tip}
            label="Records in this segment"
            interactive={tipIsLong(items[hover].tip)}
          />
        </PortalTip>
      ) : null}
    </div>
  );
}

export function Legend({
  items,
  layout = "row",
}: {
  items: { label: string; color: string; value?: string }[];
  layout?: "row" | "column";
}) {
  return (
    <div
      className={cn(
        "flex gap-x-4 gap-y-1.5",
        layout === "column" ? "min-w-0 flex-1 flex-col" : "flex-wrap"
      )}
    >
      {items.map((it, i) => (
        <span
          key={i}
          className={cn(
            "flex min-w-0 items-center gap-1.5 text-[12px]",
            layout === "column" && "w-full"
          )}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ background: it.color }}
          />
          <span className="whitespace-nowrap text-text-secondary">{it.label}</span>
          {it.value && (
            <span
              className={cn(
                "shrink-0 font-medium text-text-primary tnum",
                layout === "column" && "ml-auto"
              )}
            >
              {it.value}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

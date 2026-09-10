import {
  Award,
  BookOpenText,
  Calendar,
  Crown,
  FileCheck2,
  Globe2,
  Handshake,
  MessageSquareQuote,
  Swords,
  Tag,
  UserMinus,
  type LucideIcon,
} from "lucide-react";

/**
 * THE NINE SIGNALS (Saras, Sep 10 meeting, from her list "Customer Intel >
 * Triggers/Signals"): what a rep should be told about, in her order.
 *
 *   1. New product approval, filing, or submission announced
 *   2. Expansion into a new market or region
 *   3. M&A, divestiture, or acquisition
 *   4. Leadership change in Regulatory Affairs, Quality, or Compliance
 *   5. Layoffs or restructuring in RA/QA
 *   6. Public commentary on regulatory
 *   7. Organizing / participating in events
 *   8. Collabs with Freyr's competitors
 *   9. Others
 *
 * One vocabulary for live and mock, the label classifier, the chips at the
 * top of a briefing and the tracker cards. `label` is the full sentence for a
 * tooltip or legend; `short` is what fits on a chip.
 */
export type SignalKind =
  | "product"
  | "expansion"
  | "mna"
  | "leadership"
  | "restructuring"
  | "commentary"
  | "events"
  | "competitor"
  | "other";

/** Her order, which is also the order of the chip row. */
export const SIGNAL_KINDS: SignalKind[] = [
  "product",
  "expansion",
  "mna",
  "leadership",
  "restructuring",
  "commentary",
  "events",
  "competitor",
  "other",
];

export const SIGNAL_META: Record<
  SignalKind,
  { label: string; short: string; color: string; why: string }
> = {
  product: {
    label: "New product approval, filing or submission",
    short: "Product approval or filing",
    color: "var(--ink-bright-blue)",
    why: "A filing or approval is exactly where Freyr's work starts. Reach out while the next submission is being scoped.",
  },
  expansion: {
    label: "Expansion into a new market or region",
    short: "Market expansion",
    color: "var(--ink-teal-deep)",
    why: "A new market means new registrations and local compliance work from day one.",
  },
  mna: {
    label: "M&A, divestiture or acquisition",
    short: "M&A or divestiture",
    color: "var(--ink-orange)",
    why: "Two regulatory portfolios have to become one. Integration windows open doors that are normally shut.",
  },
  leadership: {
    label: "Leadership change in Regulatory Affairs, Quality or Compliance",
    short: "RA, Quality or Compliance leader",
    color: "var(--ink-violet-soft)",
    why: "A new regulatory leader revisits vendors and priorities in the first quarter. Be on the shortlist before it forms.",
  },
  restructuring: {
    label: "Layoffs or restructuring in RA/QA",
    short: "Layoffs or restructuring",
    color: "#0891B2",
    why: "A smaller in-house team still has the same filings due. Outsourced capacity is the conversation to have.",
  },
  commentary: {
    label: "Public commentary on regulatory",
    short: "Regulatory commentary",
    color: "var(--ink-violet)",
    why: "They are thinking out loud about regulation. A good opener, and a sign of where their attention is.",
  },
  events: {
    label: "Organizing or participating in events",
    short: "Events",
    color: "#4F46E5",
    why: "Their people will be in a room you can also be in. Plan the meeting before the event, not after.",
  },
  competitor: {
    label: "Collaboration with Freyr's competitors",
    short: "Working with a competitor",
    color: "var(--ink-magenta)",
    why: "A rival is already in the account. Know what they are doing before the next call, and where the gaps are.",
  },
  other: {
    label: "Others",
    short: "Other",
    color: "#5B6B8C",
    why: "",
  },
};

export const SIGNAL_ICON: Record<SignalKind, LucideIcon> = {
  product: FileCheck2,
  expansion: Globe2,
  mna: Handshake,
  leadership: Crown,
  restructuring: UserMinus,
  commentary: MessageSquareQuote,
  events: Calendar,
  competitor: Swords,
  other: Tag,
};

export function isSignalKind(value: unknown): value is SignalKind {
  return typeof value === "string" && (SIGNAL_KINDS as string[]).includes(value);
}

/**
 * CONTENT TAGS, the second thing the classifier reads off an item (Anant via
 * Saras, Sep 10, for competitors): thought leadership they publish, and
 * awards or recognitions they win. Each is its own chip on the briefing so
 * they can be looked at on their own.
 */
export type ItemTag = "thought-leadership" | "award";

export const ITEM_TAG_META: Record<
  ItemTag,
  { label: string; color: string; icon: LucideIcon }
> = {
  "thought-leadership": {
    label: "Thought leadership",
    color: "#0F6E56",
    icon: BookOpenText,
  },
  award: { label: "Awards", color: "#B45309", icon: Award },
};

export function isItemTag(value: unknown): value is ItemTag {
  return value === "thought-leadership" || value === "award";
}

/** Freyr's three divisions, as the classifier reads them off an item. */
export type ItemIndustry = "MPR" | "MDV" | "CON";

export function isItemIndustry(value: unknown): value is ItemIndustry {
  return value === "MPR" || value === "MDV" || value === "CON";
}

/**
 * WHAT THE CLASSIFIER WRITES ONTO AN ITEM, stored beside the item in the feed
 * so it is computed once, not on every page view.
 *
 * `relevant` answers the competitor-intel question (Saras, Sep 10: "only if
 * their posts are related to these industries should they show up here"):
 * is this about pharma or medicinal products, medical devices, consumer
 * health, or regulatory affairs at all. A TCS government contract is not.
 *
 * `v` is the classifier version: bump CLASSIFY_VERSION when the prompt
 * changes meaning and every item is read again on the next runs.
 */
export type ItemLabel = {
  signal: SignalKind;
  relevant: boolean;
  industries: ItemIndustry[];
  tags: ItemTag[];
  /** One line a seller can use, only when the signal is not "other". */
  why?: string;
  v: number;
};

/** 2 (Sep 10): the "why" line speaks to the seller instead of restating
 *  the item, and a leader outside RA/QA/compliance is "other". */
export const CLASSIFY_VERSION = 2;

/** Has this item been read by the current classifier? */
export function isLabeled(item: { label?: ItemLabel }): boolean {
  return !!item.label && item.label.v >= CLASSIFY_VERSION;
}

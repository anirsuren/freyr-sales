/**
 * THE AGENT'S ACTIONS, THE PARTS THAT NEED NO SERVER.
 *
 * Shapes shared by the store, the converse route, the confirm route, the web
 * card and the WhatsApp bridge, plus the small pure helpers the tests cover:
 * reading a yes or a no, matching a person's name, parsing money and dates.
 */

import { canAccessModuleWith, canCreateModuleWith, canWriteModuleWith } from "./moduleAccess";
import type { Access } from "./privileges";
import type { UserIdentityRole } from "./userIdentity";

export type ProposalStatus = "proposed" | "done" | "cancelled" | "failed" | "expired";

export type ActionProposal = {
  id: string;
  /** Registry key, e.g. assign_goal. */
  action: string;
  /** Normalised parameters, ids resolved, exactly what will be sent. */
  params: Record<string, unknown>;
  /** One plain sentence: what will change. */
  summary: string;
  status: ProposalStatus;
  createdAt: number;
  expiresAt: number;
  channel: "web" | "whatsapp";
  conversationId?: string;
  /** After execution. */
  result?: string;
  link?: string;
  error?: string;
  decidedAt?: number;
};

/** What a chat message carries so the web card can draw itself. */
/**
 * WHO AND WHAT A PROPOSAL TOUCHES, as records rather than words, so the web
 * card can draw faces, logos and chips the way every other page does (Anir,
 * Sep 27: "it would be nice if you showed the tags and stuff on the Needs Your
 * Approval screen and the profile pictures"). Derived from the proposal's own
 * params, which every action already fills with resolved names and ids.
 */
export type ActionEntities = {
  people: string[];
  goal?: { id: string; name: string };
  group?: string;
  company?: string;
  deal?: { id?: string; name: string };
  record?: { kind: string; name: string };
};

const asStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(asStr).filter(Boolean) : []);

export function proposalEntities(action: string, params: Record<string, unknown>): ActionEntities {
  const people = [
    ...asList(params.people),
    ...asList(params.members),
    asStr(params.person),
    asStr(params.head),
    /* `owner` is a person on record-team, solutioning and customer-owner
       actions; on a contract it is also a person. Never a company. */
    asStr(params.owner),
  ].filter(Boolean);
  const out: ActionEntities = { people: [...new Set(people)] };
  const goalId = asStr(params.goalId); const goalName = asStr(params.goalName);
  if (goalName) out.goal = { id: goalId, name: goalName };
  const groupName = asStr(params.groupName);
  if (groupName) out.group = groupName;
  else if (/customer_group|_to_group|_from_group/.test(action) && asStr(params.group)) out.group = asStr(params.group);
  const company = asStr(params.customer) || asStr(params.company) || asStr(params.__company) || asStr((params.contract as Record<string, unknown> | undefined)?.customer);
  if (company) out.company = company;
  const dealName = asStr(params.oppName) || asStr(params.opportunityName) || asStr((params.contract as Record<string, unknown> | undefined)?.opportunityName);
  if (dealName) out.deal = { id: asStr(params.opportunityId) || undefined, name: dealName };
  else if (/opportunity/.test(action) && asStr(params.name) && asStr(params.id)) out.deal = { id: asStr(params.id), name: asStr(params.name) };
  const recordKinds: [RegExp, string, string[]][] = [
    [/solutioning/, "request", ["title"]],
    [/meeting/, "meeting", ["title"]],
    [/contract/, "contract", ["name"]],
    [/lead/, "lead", ["leadName"]],
    [/^(create_goal|delete_goal)$/, "goal", ["name", "goalName"]],
  ];
  for (const [re, kind, keys] of recordKinds) {
    if (!re.test(action)) continue;
    const name = keys.map((k) => asStr(params[k]) || asStr((params.contract as Record<string, unknown> | undefined)?.[k])).find(Boolean);
    if (name && !(kind === "goal" && out.goal)) { out.record = { kind, name }; break; }
  }
  return out;
}

export type PendingActionPayload = {
  id: string;
  action: string;
  summary: string;
  status: ProposalStatus;
  result?: string;
  link?: string;
  entities?: ActionEntities;
};

/** A proposal is good for this long; then it must be asked for again. */
export const PROPOSAL_TTL_MS = 30 * 60_000;

const YES = /^(?:yes|yes please|yep|yeah|yup|ya|y|ok|okay|sure|confirm|confirmed|do it|go ahead|go|proceed|please do|approve|approved|make it so|👍|✅)\s*[.!]*\s*$/i;
const NO = /^(?:no|nope|n|cancel|stop|don't|do not|not now|never mind|nevermind|abort|reject|leave it|skip)\s*[.!]*\s*$/i;

export function isAffirmative(text: string): boolean {
  return YES.test(String(text ?? "").trim());
}

export function isNegative(text: string): boolean {
  return NO.test(String(text ?? "").trim());
}

export type NamedThing = { id: string; name: string };

export type Match<T> = { ok: true; value: T } | { ok: false; error: string };

function norm(value: string): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Find one record by id or by name. Exact name first, then a unique partial
 * match; two partial matches is a question back to the person, not a guess.
 */
export function matchOne<T extends NamedThing>(
  query: string,
  items: T[],
  what: string,
  extraKeys: (item: T) => string[] = () => []
): Match<T> {
  const q = norm(query);
  if (!q) return { ok: false, error: `Which ${what}?` };
  const byId = items.find((item) => item.id === query.trim() || extraKeys(item).some((k) => norm(k) === q));
  if (byId) return { ok: true, value: byId };
  const exact = items.filter((item) => norm(item.name) === q);
  if (exact.length === 1) return { ok: true, value: exact[0] };
  if (exact.length > 1) return { ok: false, error: `More than one ${what} is called "${query.trim()}"; give the id.` };
  const partial = items.filter((item) => norm(item.name).includes(q) || q.includes(norm(item.name)));
  if (partial.length === 1) return { ok: true, value: partial[0] };
  if (partial.length > 1) {
    const names = partial.slice(0, 5).map((item) => item.name).join(", ");
    return { ok: false, error: `Which ${what}: ${names}${partial.length > 5 ? "…" : ""}?` };
  }
  /* A person is often named by first name alone; a record by one word of it. */
  const words = q.split(" ");
  const byWord = items.filter((item) => {
    const parts = norm(item.name).split(" ");
    return words.every((w) => parts.some((p) => p === w || p.startsWith(w)));
  });
  if (byWord.length === 1) return { ok: true, value: byWord[0] };
  if (byWord.length > 1) {
    return { ok: false, error: `Which ${what}: ${byWord.slice(0, 5).map((item) => item.name).join(", ")}?` };
  }
  return { ok: false, error: `No ${what} called "${query.trim()}".` };
}

/** "$1.2m", "200k", "1,500,000", "USD 50,000" to a number. */
export function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim().toLowerCase().replace(/[$€£,\s]|usd|eur|gbp|inr/g, "");
  const match = /^(-?\d+(?:\.\d+)?)([kmb])?$/.exec(raw);
  if (!match) return null;
  const n = Number(match[1]);
  const mult = match[2] === "k" ? 1e3 : match[2] === "m" ? 1e6 : match[2] === "b" ? 1e9 : 1;
  return Number.isFinite(n) ? n * mult : null;
}

/** An ISO day (YYYY-MM-DD) from what a person types; null when unreadable. */
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * THE CALENDAR DAY THE PERSON IS IN. The server runs on UTC, so at 8 pm on a
 * Saturday in New Jersey "today" was already Sunday and "next Tuesday" slid a
 * week (Sep 27). A day is answered in the person's zone; an unknown zone
 * falls back to UTC so a stale preference cannot throw.
 */
export function localDay(now = new Date(), zone = "UTC"): { ymd: string; weekday: number } {
  let tz = zone || "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz }).format(now);
  } catch {
    tz = "UTC";
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  const weekday = Math.max(0, WEEKDAYS.indexOf(get("weekday").slice(0, 3).toLowerCase()));
  return { ymd, weekday };
}

/**
 * "today", "tomorrow", "in 3 days", "next week", "Friday", "next Tuesday",
 * "Monday next week", "end of week", "end of month", "end of Q4", or a date.
 * A plain weekday is the first one from today on (today counts); "next" and
 * "next week" mean the occurrence in the following Monday-to-Sunday week.
 * Everything is worked out on the person's own calendar day in `zone`.
 */
export function parseDay(value: unknown, now = new Date(), zone = "UTC"): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const lower = raw.toLowerCase().replace(/\s+/g, " ");
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const { ymd, weekday } = localDay(now, zone);
  const base = new Date(`${ymd}T00:00:00Z`);
  const plus = (days: number) => day(new Date(base.getTime() + days * 86_400_000));
  if (lower === "today") return plus(0);
  if (lower === "tomorrow") return plus(1);
  const inDays = /^in (\d+) days?$/.exec(lower);
  if (inDays) return plus(Number(inDays[1]));
  const inWeeks = /^(?:in (\d+) weeks?|next week)$/.exec(lower);
  if (inWeeks) return plus((inWeeks[1] ? Number(inWeeks[1]) : 1) * 7);
  const wd = /^(?:(this|next|coming) )?(sun|mon|tue|wed|thu|fri|sat)[a-z]*( next week)?$/.exec(lower);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[2]);
    const followingWeek = wd[1] === "next" || !!wd[3];
    if (!followingWeek) return plus((target - weekday + 7) % 7);
    const mondayIndex = (weekday + 6) % 7;
    return plus(7 - mondayIndex + ((target + 6) % 7));
  }
  if (/^end of (this )?week$/.test(lower)) return plus((5 - weekday + 7) % 7);
  const endOfMonth = /^end of (the |this |next )?month$/.exec(lower);
  if (endOfMonth) {
    const ahead = endOfMonth[1] === "next " ? 2 : 1;
    return day(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + ahead, 0)));
  }
  const endOf = /^end of (q[1-4])(?: (\d{4}))?$/.exec(lower);
  if (endOf) {
    const year = endOf[2] ? Number(endOf[2]) : base.getUTCFullYear();
    const month = { q1: 2, q2: 5, q3: 8, q4: 11 }[endOf[1] as "q1" | "q2" | "q3" | "q4"];
    return day(new Date(Date.UTC(year, month + 1, 0)));
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return day(parsed);
  return null;
}

export function shortId(prefix = "act"): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/* ------------------------------------------------ what this person may do */

/** Plain words for each module an action can touch. */
export const ACTION_MODULE_LABELS: Record<string, string> = {
  "/performance": "goals and groups",
  "/opportunities": "deals",
  "/customers": "accounts and contacts (owners, follow-ups, touches, drafts)",
  "/leads": "leads",
  "/meetings": "meetings",
  "/solutioning": "solutioning requests",
  "/market-intel": "Market Intel stars",
};

export type ActionAccessSummary = { create: string[]; edit: string[]; view: string[]; none: string[] };

/**
 * The person's level in every module an action can touch, from the same
 * checks the gates use, so the model can say no before it looks anything up
 * and never offers what propose_action would refuse anyway. View-only is a
 * level a person holds in a module, not a role: a BD member looks at goals
 * and changes deals, so the summary is per module.
 */
export function summarizeActionAccess(
  modules: string[],
  role: string,
  access: Partial<Record<string, Access>> | null
): ActionAccessSummary {
  const out: ActionAccessSummary = { create: [], edit: [], view: [], none: [] };
  const r = role as UserIdentityRole;
  for (const path of [...new Set(modules)]) {
    const label = ACTION_MODULE_LABELS[path] ?? path.replace(/^\//, "").replace(/-/g, " ");
    if (!canAccessModuleWith(path, r, access)) out.none.push(label);
    else if (canCreateModuleWith(path, r, access)) out.create.push(label);
    else if (canWriteModuleWith(path, r, access)) out.edit.push(label);
    else out.view.push(label);
  }
  return out;
}

/** The prompt line built from the summary. */
export function actionAccessLine(firstName: string, s: ActionAccessSummary): string {
  const parts: string[] = [];
  if (s.create.length) parts.push(`make new and change: ${s.create.join(", ")}`);
  if (s.edit.length) parts.push(`change existing only, never make new ones: ${s.edit.join(", ")}`);
  if (s.view.length) parts.push(`look only, never change: ${s.view.join(", ")}`);
  if (s.none.length) parts.push(`not open to them at all: ${s.none.join(", ")}`);
  return (
    `WHAT ${firstName} MAY DO, decided by their privileges and final: ${parts.join("; ") || "nothing can be changed"}. ` +
    "When a request needs more than they have, say so first in one plain line, before any lookup or clarifying question, and name who can (an owner or admin); " +
    "never offer, suggest or list an action above their level, never point them at a page button for it, and never link a page inside a module that is not open to them: it sends them to a door that closes in their face."
  );
}

/**
 * THE CHIP ON THE APPROVAL CARD: what kind of change this is, in two or three
 * words, so the card says "Assign goal" above the sentence rather than making
 * the sentence carry everything. Pure, because the card is a client component.
 */
export const ACTION_LABELS: Record<string, string> = {
  assign_goal: "Assign goal",
  unassign_goal: "Unassign goal",
  assign_goal_group: "Assign group to goal",
  unassign_goal_group: "Unassign group from goal",
  log_goal_actual: "Log goal result",
  move_group_member: "Move group member",
  update_opportunity: "Update deal",
  create_opportunity: "New deal",
  assign_customer_owner: "Account owner",
  add_contact: "New contact",
  update_contact: "Update contact",
  set_record_people: "Record team",
  create_lead: "New lead",
  update_lead: "Update lead",
  create_meeting: "Meeting",
  star_company: "Market Intel star",
  verify_goal_result: "Verify result",
  send_back_goal_result: "Send result back",
  create_customer: "New customer",
  create_solutioning_request: "Solutioning request",
  set_followup: "Follow-up",
  log_touch: "Log a touch",
  create_goal: "New goal",
  update_goal: "Change goal",
  delete_goal: "Delete goal",
  create_subgoal: "New subgoal",
  delete_subgoal: "Delete subgoal",
  update_goal_result: "Correct result",
  remove_goal_result: "Remove result",
  create_group: "New group",
  update_group: "Change group",
  delete_group: "Delete group",
  delete_opportunity: "Delete deal",
  convert_lead: "Convert lead",
  delete_lead: "Delete lead",
  refresh_lead_linkedin: "Re-read LinkedIn",
  update_solutioning_request: "Change request",
  assign_solutioning_request: "Assign request",
  pick_up_solutioning_request: "Pick up request",
  complete_solutioning_request: "Complete request",
  cancel_solutioning_request: "Cancel request",
  reopen_solutioning_request: "Reopen request",
  comment_on_solutioning_request: "Comment",
  set_solutioning_priority: "Request priority",
  delete_solutioning_request: "Delete request",
  create_contract: "New contract",
  update_contract: "Change contract",
  delete_contract: "Delete contract",
  update_meeting: "Change meeting",
  set_meeting_status: "Meeting status",
  add_meeting_note: "Meeting note",
  delete_meeting: "Delete meeting",
  delete_accrual_plan: "Delete accrual plan",
  freeze_accrual_month: "Freeze month",
  unfreeze_accrual_month: "Unfreeze month",
  create_customer_group: "New customer group",
  update_customer_group: "Change customer group",
  add_customer_to_group: "Add to customer group",
  remove_customer_from_group: "Remove from customer group",
  delete_customer_group: "Delete customer group",
  update_customer: "Change account",
  add_customer_note: "Account note",
  delete_contact: "Delete contact",
  track_company: "Track company",
  remove_from_my_list: "Off my list",
  delete_tracked_company: "Delete tracked company",
  save_draft: "Save draft",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * A calendar day a person can check at a glance. The stored value is
 * 2026-10-02; "Fri 2 Oct 2026" is what shows a wrong date immediately, which
 * matters because the day came from words like "next Friday".
 */
export function readableDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!m) return String(iso ?? "");
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

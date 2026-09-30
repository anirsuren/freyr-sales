import "server-only";
import { getDb } from "@/lib/db";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { readPerformance } from "@/lib/performance";
import { readOpportunities } from "@/lib/opportunities";
import { readLeads } from "@/lib/leads";
import { LEAD_STATUSES } from "@/lib/leadsShared";
import { OPPORTUNITY_LEVELS, OPPORTUNITY_STATUSES, estimatedTcvOf } from "@/lib/opportunitiesShared";
import { MEETING_TYPES } from "@/lib/meetings";
import { readRecordTeams, teamFor } from "@/lib/recordTeams";
import { readCustomerGroups } from "@/lib/customerGroups";
import { readMeetings } from "@/lib/meetings";
import { readSolutioning } from "@/lib/solutioning";
import { readContracts } from "@/lib/contracts";
import { CONTRACT_STATUSES } from "@/lib/contractsShared";
import { readRevenueAccruals } from "@/lib/revenueAccruals";
import { readMarketIntelBookmarks } from "@/lib/marketIntelBookmarks";
import { readMarketIntelTracking } from "@/lib/marketIntelTracking";
import { moduleCreateRefusal, moduleWriteRefusal, recordWriteRefusal } from "@/lib/moduleAccessServer";
import { getCurrentUser } from "@/lib/currentUser";
import { opportunityChangeRefusal } from "@/lib/opportunityOwnership";
import { addProposal, getProposal, updateProposal } from "@/lib/agentActionStore";
import {
  matchOne,
  parseDay,
  parseMoney,
  shortId,
  readableDay,
  type ActionProposal,
  type Match,
} from "@/lib/agentActionsShared";
import type { WorkspaceMemberScope } from "@/lib/types";

/**
 * THE ACTIONS THE AGENT MAY TAKE, AND HOW IT TAKES THEM.
 *
 * Anir, Sep 26: "I can say 'hey, can we move this guy to this goal?' It'll
 * find that guy, it'll find that goal, and it'll say 'do you want to do this
 * action?' ... it should follow the permissions, obviously. That's the whole
 * point of it."
 *
 * THE RULE: the agent is a user of the app, signed in as the person talking
 * to it. Every action is one call to a route the page already uses, carrying
 * that person's own cookies over loopback, so the permission check is the
 * route's own and the refusal is the route's own words. Nothing about who may
 * do what is decided here.
 *
 * And nothing happens on the agent's say-so. `proposeAction` resolves names to
 * records, asks the module-level permission question the route will ask, and
 * stores a proposal. `executeProposal` runs it, and only for a proposal made
 * in an EARLIER request, after the person said yes.
 */

export type ActionContext = {
  scope: WorkspaceMemberScope;
  actorName: string;
  /** The person's own cookies, forwarded unchanged. */
  cookie: string;
  internalOrigin: string;
  channel: "web" | "whatsapp";
  conversationId?: string;
  /** The person's own calendar day for "today", "Friday", "next week". */
  timeZone?: string;
};

type Params = Record<string, unknown>;

type Prepared = {
  summary: string;
  params: Params;
  customerId?: string;
  company?: string;
};

type Call =
  | { method: "POST" | "PUT" | "PATCH" | "DELETE"; path: string; body?: unknown }
  /* A few writes have no route of their own (the account timeline the old
     agent wrote to directly). They run in-process, after the same
     recordWriteRefusal question the customer routes ask. */
  | { local: (ctx: ActionContext) => Promise<Record<string, unknown>> };

type Field = { type: "string" | "number" | "boolean" | "array"; description: string; enum?: readonly string[]; items?: { type: "string" } };

export type ActionDef = {
  key: string;
  title: string;
  description: string;
  /** The module whose write/create question is asked before proposing. */
  module: string;
  gate: "write" | "create";
  fields: Record<string, Field>;
  required: string[];
  prepare: (params: Params, ctx: ActionContext) => Promise<Prepared | { error: string }>;
  call: (params: Params) => Call;
  done: (params: Params, response: Record<string, unknown>) => { text: string; link?: string };
};

const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 200)).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : []);
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
/** "2027-01" as "Jan 2027", for a schedule read line by line. */
const readableMonth = (yearMonth: string) => { const [y, m] = yearMonth.split("-").map(Number); return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][(m || 1) - 1]} ${y}`; };

/* ------------------------------------------------------------------------ */
/* Lookups: names to records, always against what the workspace holds now.  */
/* ------------------------------------------------------------------------ */

type Person = { id: string; name: string; role: string };

async function people(ctx: ActionContext): Promise<Person[]> {
  const directory = await listWorkspaceAccess(ctx.scope.workspaceId);
  return directory.members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name, role: m.role }));
}

type ContactMatch = { id: string; name: string; plain: string; customerId: string; company: string };

async function resolvePerson(query: unknown, ctx: ActionContext): Promise<Match<Person>> {
  const q = str(query, 120);
  const members = await people(ctx);
  if (!q || /^(me|myself|i|my)$/i.test(q)) {
    const me = members.find((m) => m.id === ctx.scope.userId) ?? members.find((m) => m.name.toLowerCase() === ctx.actorName.toLowerCase());
    return me ? { ok: true, value: me } : { ok: false, error: "I could not find you in the workspace directory." };
  }
  return matchOne(q, members, "person", (m) => [m.id]);
}

async function resolveGoal(query: unknown) {
  const state = await readPerformance();
  return matchOne(str(query, 200), state.goals.map((g) => ({ id: g.id, name: g.name })), "goal");
}

async function resolveGroup(query: unknown) {
  const state = await readPerformance();
  return matchOne(
    str(query, 200),
    state.groups.map((g) => ({ id: g.id, name: g.name, head: g.head, members: g.members })),
    "group"
  );
}

async function resolveOpportunity(query: unknown) {
  const state = await readOpportunities();
  const rows = state.opportunities.map((o) => ({
    id: o.id,
    name: `${o.name}${o.customer ? ` (${o.customer})` : ""}`,
    externalId: o.externalId ?? "",
    plain: o.name,
    customer: o.customer,
    customerId: o.customerId,
    owner: o.owner,
    status: o.status,
    level: o.level,
    value: o.value,
  }));
  const q = str(query, 200);
  const direct = matchOne(q, rows, "opportunity", (o) => [o.externalId, o.plain]);
  return direct;
}

async function resolveCustomer(query: unknown) {
  const customers = await getDb().customers.list();
  return matchOne(
    str(query, 200),
    customers.map((c) => ({ id: c.id, name: c.company_name, owner: c.owner, owner_user_id: c.owner_user_id })),
    "account"
  );
}

/**
 * A person at an account. Two people can share a name across accounts, so the
 * account is part of the name the matcher sees and an ambiguous first name
 * comes back as a question rather than a guess.
 */
async function resolveContact(query: unknown, customerQuery?: unknown) {
  const db = getDb();
  let onlyCustomer: string | undefined;
  if (str(customerQuery)) {
    const customer = await resolveCustomer(customerQuery);
    if (!customer.ok) return customer as unknown as Match<ContactMatch>;
    onlyCustomer = customer.value.id;
  }
  const [contacts, customers] = await Promise.all([db.contacts.list(onlyCustomer), db.customers.list()]);
  const company = new Map(customers.map((c) => [c.id, c.company_name]));
  return matchOne<ContactMatch>(
    str(query, 200),
    contacts.map((c) => ({
      id: c.id,
      name: `${c.full_name}${company.get(c.customer_id) ? ` (${company.get(c.customer_id)})` : ""}`,
      plain: c.full_name,
      customerId: c.customer_id,
      company: company.get(c.customer_id) ?? "",
    })),
    "contact"
  );
}

async function resolveLead(query: unknown) {
  const state = await readLeads();
  return matchOne(
    str(query, 200),
    state.leads.map((l) => ({ id: l.id, name: `${l.name}${l.company ? ` (${l.company})` : ""}`, ref: l.ref, plain: l.name, status: l.status })),
    "lead",
    (l) => [l.ref, l.plain]
  );
}

async function resolveTrackedCompany(query: unknown) {
  const tracking = await readMarketIntelTracking();
  const companies = tracking.companies.map((c) => ({ id: c.id, name: c.name }));
  const q = str(query, 200);
  const first = matchOne(q, companies, "company");
  if (first.ok) return first;
  /* THE SAME COMPANY, NAMED FROM ANOTHER MODULE. Asked to undo a star, the
     agent reached for Incyte's CUSTOMER id, which Market Intel has never
     heard of (Sep 27). A customer id or name resolves to the tracked company
     with the same name — the same company, not a substitute, so the exact
     name has to match. */
  if (!q) return first;
  const customers = await getDb().customers.list();
  const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
  const customer = customers.find((c) => c.id === q.trim() || norm(c.company_name) === norm(q));
  if (!customer) return first;
  const sameName = companies.filter((c) => norm(c.name) === norm(customer.company_name));
  return sameName.length === 1 ? ({ ok: true as const, value: sameName[0] }) : first;
}

/** A logged goal result that is still open: by its id, or the newest one for a person on a goal. */
/* THE RECORDS THE FULL AUDIT FOUND NO WAY TO NAME (Anir, Sep 27: "the agent
   has to be able to do literally anything I can do in the app"). Each one is
   the same bargain as the resolvers above it: exact name, then a unique
   partial, and two partials is a question back, never a guess. */
async function resolveMeeting(query: unknown) {
  const state = await readMeetings();
  return matchOne(
    str(query, 200),
    state.meetings.map((m) => ({ id: m.id, name: `${m.title}${m.customer ? ` (${m.customer})` : ""}`, plain: m.title, status: m.status, meetingAt: m.meetingAt, customer: m.customer })),
    "meeting",
    (m) => [m.plain]
  );
}

async function resolveRequest(query: unknown) {
  const state = await readSolutioning();
  return matchOne(
    str(query, 200),
    state.requests.filter((r) => (r.type ?? "request") === "request").map((r) => ({
      id: r.id, name: `${r.title}${r.customer ? ` (${r.customer})` : ""}`, plain: r.title, status: r.status, customer: r.customer, owner: (r as { owner?: string | null }).owner ?? null, requestedBy: r.requestedBy,
    })),
    "solutioning request",
    (r) => [r.plain]
  );
}

async function resolveContract(query: unknown) {
  const state = await readContracts();
  return matchOne(
    str(query, 200),
    state.contracts.map((c) => ({ id: c.id, name: `${c.name}${c.customer ? ` (${c.customer})` : ""}`, plain: c.name, reference: c.reference, status: c.status, customer: c.customer, value: c.value, record: c })),
    "contract",
    (c) => [c.reference, c.plain]
  );
}

async function resolveCustomerGroup(query: unknown) {
  const state = await readCustomerGroups();
  return matchOne(str(query, 200), state.groups.map((g) => ({ id: g.id, name: g.name, customerIds: g.customerIds })), "customer group");
}

async function resolveSubgoal(goalQuery: unknown, query: unknown) {
  const goal = await resolveGoal(goalQuery);
  if (!goal.ok) return goal as unknown as Match<{ id: string; name: string; goalId: string; goalName: string }>;
  const state = await readPerformance();
  const parent = state.goals.find((g) => g.id === goal.value.id);
  const subs = (parent?.subgoals ?? []).map((sg) => ({ id: sg.id, name: sg.name, goalId: goal.value.id, goalName: goal.value.name }));
  return matchOne(str(query, 200), subs, "subgoal");
}

async function resolvePlan(query: unknown) {
  const opp = await resolveOpportunity(query);
  if (!opp.ok) return opp as unknown as Match<{ id: string; name: string; opportunityId: string; months: number }>;
  const state = await readRevenueAccruals();
  const plan = state.plans.find((pl) => pl.opportunityId === opp.value.id);
  if (!plan) return { ok: false as const, error: `"${opp.value.name}" has no accrual plan.` };
  return { ok: true as const, value: { id: plan.id, name: opp.value.name, opportunityId: opp.value.id, months: plan.lines.length } };
}

async function resolveOpenEntry(params: Params) {
  const state = await readPerformance();
  const open = state.actuals.filter((a) => (a.status ?? "verified") !== "verified");
  const byId = str(params.entry, 80);
  if (byId) {
    const hit = open.find((a) => a.id === byId);
    if (hit) return { ok: true as const, value: hit, state };
    if (state.actuals.some((a) => a.id === byId)) return { ok: false as const, error: "That entry is already verified." };
    return { ok: false as const, error: `No open entry with id ${byId}.` };
  }
  if (!str(params.person) || !str(params.goal)) return { ok: false as const, error: "Say which entry: its id, or the person and the goal." };
  const goal = matchOne(str(params.goal, 200), state.goals.map((g) => ({ id: g.id, name: g.name })), "goal");
  if (!goal.ok) return { ok: false as const, error: goal.error };
  const who = str(params.person, 120).toLowerCase();
  const hits = open
    .filter((a) => a.goalId === goal.value.id && a.person.trim().toLowerCase() === who)
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!hits.length) return { ok: false as const, error: `${str(params.person)} has no open entry on "${goal.value.name}".` };
  return { ok: true as const, value: hits[0], state };
}

function entryLabel(a: { person: string; amount: number; date: string; customer?: string }, goalName: string): string {
  return `${a.person}'s ${a.amount.toLocaleString("en-US")} on "${goalName}" (${a.date}${a.customer ? `, ${a.customer}` : ""})`;
}

function pickEnum(value: unknown, allowed: readonly string[], what: string): Match<string> {
  const q = str(value, 60).toLowerCase();
  if (!q) return { ok: false, error: `Which ${what}?` };
  const hit = allowed.find((a) => a.toLowerCase() === q) ?? allowed.find((a) => a.toLowerCase().startsWith(q));
  return hit ? { ok: true, value: hit } : { ok: false, error: `${what} must be one of: ${allowed.join(", ")}.` };
}

/** The customer, with the fields recordWriteRefusal needs to answer for it. */
async function customerForWrite(query: unknown) {
  const found = await resolveCustomer(query);
  if (!found.ok) return found;
  const refusal = await recordWriteRefusal("/customers", {
    id: found.value.id,
    owner: found.value.owner,
    owner_user_id: found.value.owner_user_id,
  });
  if (refusal) return { ok: false as const, error: refusal };
  return found;
}

/**
 * THE TIMELINE HANGS OFF A CONTACT. An interaction row needs a contact at the
 * account (the store refuses one without), so a timeline action names the
 * contact it will sit under: the one the person named, else the only one,
 * else the first, said out loud in the summary. No contacts means the honest
 * answer is "add one first", which is itself an action.
 */
async function contactForTimeline(customerId: string, customerName: string, query: unknown): Promise<Match<{ id: string; name: string }>> {
  const contacts = (await getDb().contacts.list()).filter((c) => c.customer_id === customerId).map((c) => ({ id: c.id, name: c.full_name }));
  if (!contacts.length) return { ok: false, error: `${customerName} has no contacts yet, and a touch is logged against a contact.` };
  const q = str(query, 120);
  if (q) return matchOne(q, contacts, "contact");
  return { ok: true, value: contacts[0] };
}

/** "next Tuesday", "in 3 days", "Oct 14": a day for a reminder, default a week out. */
function followupDay(value: unknown, zone?: string): { iso: string; label: string } {
  const raw = str(value, 60);
  const day = parseDay(raw || "next week", new Date(), zone) ?? parseDay("next week", new Date(), zone)!;
  return { iso: day, label: raw || "next week" };
}

/* ------------------------------------------------------------------------ */
/* The catalogue.                                                            */
/* ------------------------------------------------------------------------ */

export const ACTIONS: ActionDef[] = [
  {
    key: "assign_goal",
    title: "Put a person on a goal",
    description: "Assign a colleague (or yourself) to a goal from the Goals plan, optionally with a personal target.",
    module: "/performance",
    gate: "write",
    fields: {
      goal: { type: "string", description: "Goal id or name from read_workspace goals." },
      person: { type: "string", description: "Colleague's name or id from read_workspace team, or 'me'." },
      target: { type: "number", description: "Personal target in the goal's unit. Omit unless the person gave one; never invent 0." },
    },
    required: ["goal", "person"],
    async prepare(params, ctx) {
      const goal = await resolveGoal(params.goal);
      if (!goal.ok) return { error: goal.error };
      const person = await resolvePerson(params.person, ctx);
      if (!person.ok) return { error: person.error };
      const wantsTarget = params.target !== undefined && params.target !== null && params.target !== "" && Number(params.target) !== 0;
      const parsedTarget = wantsTarget ? parseMoney(params.target) : null;
      if (wantsTarget && parsedTarget === null) return { error: "The target must be a number." };
      const target = wantsTarget && parsedTarget !== null ? parsedTarget : undefined;
      return {
        summary: `Put ${person.value.name} on the goal "${goal.value.name}"${target !== undefined ? ` with a target of ${target.toLocaleString("en-US")}` : ""}.`,
        params: { goalId: goal.value.id, goalName: goal.value.name, person: person.value.name, ...(target !== undefined ? { target } : {}) },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "assign-goal", goalId: p.goalId, person: p.person, ...(p.target !== undefined ? { target: p.target } : {}) } }),
    done: (p) => ({ text: `${p.person} is now on the goal "${p.goalName}".`, link: `/performance/goal/${encodeURIComponent(String(p.goalId))}` }),
  },
  {
    key: "unassign_goal",
    title: "Take a person off a goal",
    description: "Remove a colleague (or yourself) from a goal in the Goals plan.",
    module: "/performance",
    gate: "write",
    fields: {
      goal: { type: "string", description: "Goal id or name." },
      person: { type: "string", description: "Colleague's name or id, or 'me'." },
    },
    required: ["goal", "person"],
    async prepare(params, ctx) {
      const goal = await resolveGoal(params.goal);
      if (!goal.ok) return { error: goal.error };
      const person = await resolvePerson(params.person, ctx);
      if (!person.ok) return { error: person.error };
      return {
        summary: `Take ${person.value.name} off the goal "${goal.value.name}".`,
        params: { goalId: goal.value.id, goalName: goal.value.name, person: person.value.name },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "unassign-goal", goalId: p.goalId, person: p.person } }),
    done: (p) => ({ text: `${p.person} is no longer on the goal "${p.goalName}".`, link: `/performance/goal/${encodeURIComponent(String(p.goalId))}` }),
  },
  {
    /* A WHOLE GROUP GOES ON A GOAL IN ONE MOVE. The Goals page has done this
       since groups existed (POST /api/performance op assign-goal-group), but
       the agent had no tool for it, so asked to put group 2 on Renewals it
       announced that "the system requires assigning individual people" and
       offered to add the five of them one by one. A missing tool became a
       false statement about the product (Anir, Sep 27: "is this true?"). */
    key: "assign_goal_group",
    title: "Put a whole group on a goal",
    description: "Assign every member of a group to a goal in one move, optionally with a target for the group. Use this when the person names a group rather than a colleague.",
    module: "/performance",
    gate: "write",
    fields: {
      goal: { type: "string", description: "Goal id or name from read_workspace goals." },
      group: { type: "string", description: "Group id or name from read_workspace team." },
      target: { type: "number", description: "The group's target in the goal's unit. Omit unless the person gave one; never invent 0." },
    },
    required: ["goal", "group"],
    async prepare(params) {
      const goal = await resolveGoal(params.goal);
      if (!goal.ok) return { error: goal.error };
      const group = await resolveGroup(params.group);
      if (!group.ok) return { error: group.error };
      const wantsTarget = params.target !== undefined && params.target !== null && params.target !== "" && Number(params.target) !== 0;
      const parsedTarget = wantsTarget ? parseMoney(params.target) : null;
      if (wantsTarget && parsedTarget === null) return { error: "The target must be a number." };
      const target = wantsTarget && parsedTarget !== null ? parsedTarget : undefined;
      /* Say who that is. "Put group 2 on Renewals" is five people changing
         work, and the person confirming should see the five names. */
      const people = [group.value.head, ...(group.value.members ?? [])].filter(Boolean);
      const named = [...new Set(people)];
      return {
        summary: `Put the group "${group.value.name}" on the goal "${goal.value.name}"${target !== undefined ? ` with a target of ${target.toLocaleString("en-US")}` : ""}. That is ${named.length} ${named.length === 1 ? "person" : "people"}: ${named.join(", ")}.`,
        params: { goalId: goal.value.id, goalName: goal.value.name, groupId: group.value.id, groupName: group.value.name, people: named, ...(target !== undefined ? { target } : {}) },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "assign-goal-group", goalId: p.goalId, groupId: p.groupId, ...(p.target !== undefined ? { target: p.target } : {}) } }),
    done: (p) => ({ text: `The group "${p.groupName}" is now on the goal "${p.goalName}".`, link: `/performance/goal/${encodeURIComponent(String(p.goalId))}` }),
  },
  {
    key: "unassign_goal_group",
    title: "Take a whole group off a goal",
    description: "Remove a group from a goal in the Goals plan.",
    module: "/performance",
    gate: "write",
    fields: {
      goal: { type: "string", description: "Goal id or name." },
      group: { type: "string", description: "Group id or name." },
    },
    required: ["goal", "group"],
    async prepare(params) {
      const goal = await resolveGoal(params.goal);
      if (!goal.ok) return { error: goal.error };
      const group = await resolveGroup(params.group);
      if (!group.ok) return { error: group.error };
      return {
        summary: `Take the group "${group.value.name}" off the goal "${goal.value.name}".`,
        params: { goalId: goal.value.id, goalName: goal.value.name, groupId: group.value.id, groupName: group.value.name, people: [...new Set([group.value.head, ...(group.value.members ?? [])].filter(Boolean))] },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "unassign-goal-group", goalId: p.goalId, groupId: p.groupId } }),
    done: (p) => ({ text: `The group "${p.groupName}" is no longer on the goal "${p.goalName}".`, link: `/performance/goal/${encodeURIComponent(String(p.goalId))}` }),
  },
  {
    key: "log_goal_actual",
    title: "Log a result against a goal",
    description: "Record a number (revenue, meetings, whatever the goal counts) for a person on a goal, optionally tied to an account and dated. It is logged as reported and waits for the group head to verify.",
    module: "/performance",
    gate: "write",
    fields: {
      goal: { type: "string", description: "Goal id or name." },
      person: { type: "string", description: "Whose result; defaults to the person asking." },
      amount: { type: "number", description: "The number to log, in the goal's unit (money accepts 200k, 1.5m)." },
      customer: { type: "string", description: "Optional account the result came from." },
      date: { type: "string", description: "Optional day, YYYY-MM-DD or words like today, yesterday." },
      note: { type: "string", description: "Optional note for the verifier." },
    },
    required: ["goal", "amount"],
    async prepare(params, ctx) {
      const goal = await resolveGoal(params.goal);
      if (!goal.ok) return { error: goal.error };
      const person = await resolvePerson(params.person, ctx);
      if (!person.ok) return { error: person.error };
      const amount = parseMoney(params.amount);
      if (amount === null) return { error: "How much should be logged?" };
      let customer: { id: string; name: string } | undefined;
      if (str(params.customer)) {
        const found = await resolveCustomer(params.customer);
        if (!found.ok) return { error: found.error };
        customer = { id: found.value.id, name: found.value.name };
      }
      const date = str(params.date) ? parseDay(params.date, new Date(), ctx.timeZone) : null;
      if (str(params.date) && !date) return { error: "I could not read that date; use YYYY-MM-DD." };
      return {
        summary: `Log ${amount.toLocaleString("en-US")} for ${person.value.name} on "${goal.value.name}"${customer ? ` from ${customer.name}` : ""}${date ? ` dated ${readableDay(date)}` : ""}. It will wait for verification.`,
        params: { goalId: goal.value.id, goalName: goal.value.name, person: person.value.name, amount, ...(customer ? { customer: customer.name, customerId: customer.id } : {}), ...(date ? { date } : {}), ...(str(params.note) ? { note: str(params.note, 500) } : {}) },
        ...(customer ? { customerId: customer.id, company: customer.name } : {}),
      };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "log-actual", goalId: p.goalId, person: p.person, amount: p.amount, customer: p.customer, customerId: p.customerId, date: p.date, note: p.note } }),
    done: (p) => ({ text: `Logged ${Number(p.amount).toLocaleString("en-US")} for ${p.person} on "${p.goalName}". It is reported and waits for verification.`, link: `/performance/goal/${encodeURIComponent(String(p.goalId))}` }),
  },
  {
    key: "move_group_member",
    title: "Move a person into or out of a group",
    description: "Add a colleague to a group in the Goals plan or remove them from one. Moving between groups is a remove and an add: propose them one at a time.",
    module: "/performance",
    gate: "write",
    fields: {
      group: { type: "string", description: "Group id or name from read_workspace team." },
      person: { type: "string", description: "Colleague's name or id." },
      direction: { type: "string", description: "'in' to add to the group, 'out' to remove.", enum: ["in", "out"] },
    },
    required: ["group", "person", "direction"],
    async prepare(params, ctx) {
      const group = await resolveGroup(params.group);
      if (!group.ok) return { error: group.error };
      const person = await resolvePerson(params.person, ctx);
      if (!person.ok) return { error: person.error };
      const direction = str(params.direction).toLowerCase() === "out" ? "out" : "in";
      const current = group.value.members;
      const already = current.some((m) => m.toLowerCase() === person.value.name.toLowerCase());
      if (direction === "in" && already) return { error: `${person.value.name} is already in ${group.value.name}.` };
      if (direction === "out" && !already) return { error: `${person.value.name} is not in ${group.value.name}.` };
      const members = direction === "in" ? [...current, person.value.name] : current.filter((m) => m.toLowerCase() !== person.value.name.toLowerCase());
      return {
        summary: direction === "in" ? `Add ${person.value.name} to the group "${group.value.name}".` : `Remove ${person.value.name} from the group "${group.value.name}".`,
        params: { groupId: group.value.id, groupName: group.value.name, person: person.value.name, direction, members },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "update-group", groupId: p.groupId, members: p.members } }),
    done: (p) => ({ text: p.direction === "in" ? `${p.person} is now in the group "${p.groupName}".` : `${p.person} has been removed from the group "${p.groupName}".`, link: "/performance" }),
  },
  {
    key: "update_opportunity",
    title: "Change a deal",
    description: "Change one or more fields of an existing opportunity: status (stage), level, value, estimated TCV, confidence (0-100), expected signing date, next steps or name.",
    module: "/opportunities",
    gate: "write",
    fields: {
      opportunity: { type: "string", description: "Opportunity id, OPP number or name (optionally 'at <customer>')." },
      status: { type: "string", description: "New stage.", enum: OPPORTUNITY_STATUSES },
      level: { type: "string", description: "New level.", enum: OPPORTUNITY_LEVELS },
      value: { type: "string", description: "New deal value (200k, 1.5m, 250000)." },
      estimatedTcv: { type: "string", description: "New estimated TCV." },
      confidence: { type: "number", description: "New confidence percentage, 0-100." },
      estSignDate: { type: "string", description: "New expected signing date." },
      nextSteps: { type: "string", description: "New next steps text." },
      name: { type: "string", description: "New deal name." },
    },
    required: ["opportunity"],
    async prepare(params, ctx) {
      const opp = await resolveOpportunity(params.opportunity);
      if (!opp.ok) return { error: opp.error };
      /* The route's own ownership rule, asked now so nobody is asked to confirm a change the route would refuse. */
      const notYours = opportunityChangeRefusal(opp.value, await getCurrentUser());
      if (notYours) return { error: notYours };
      const patch: Params = {};
      const changes: string[] = [];
      if (str(params.status)) {
        const status = pickEnum(params.status, OPPORTUNITY_STATUSES, "status");
        if (!status.ok) return { error: status.error };
        patch.status = status.value;
        changes.push(`status → ${status.value}`);
      }
      if (str(params.level)) {
        const level = pickEnum(params.level, OPPORTUNITY_LEVELS, "level");
        if (!level.ok) return { error: level.error };
        patch.level = level.value;
        changes.push(`level → ${level.value}`);
      }
      if (params.value !== undefined && params.value !== null && params.value !== "") {
        const value = parseMoney(params.value);
        if (value === null) return { error: "I could not read that value." };
        patch.value = value;
        changes.push(`value → ${money(value)}`);
      }
      if (params.estimatedTcv !== undefined && params.estimatedTcv !== null && params.estimatedTcv !== "") {
        const tcv = parseMoney(params.estimatedTcv);
        if (tcv === null) return { error: "I could not read that TCV." };
        patch.estimatedTcv = tcv;
        changes.push(`estimated TCV → ${money(tcv)}`);
      }
      if (params.confidence !== undefined && params.confidence !== null && params.confidence !== "") {
        const confidence = Number(params.confidence);
        if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) return { error: "Confidence is a percentage from 0 to 100." };
        patch.confidence = confidence;
        changes.push(`confidence → ${confidence}%`);
      }
      if (str(params.estSignDate)) {
        const day = parseDay(params.estSignDate, new Date(), ctx.timeZone);
        if (!day) return { error: "I could not read that signing date; use YYYY-MM-DD." };
        patch.estSignDate = day;
        changes.push(`expected signing → ${day}`);
      }
      if (str(params.nextSteps)) {
        patch.nextSteps = str(params.nextSteps, 2000);
        changes.push(`next steps → "${patch.nextSteps}"`);
      }
      if (str(params.name)) {
        patch.name = str(params.name, 200);
        changes.push(`name → "${patch.name}"`);
      }
      if (!changes.length) return { error: "What should change on the deal?" };
      const label = `${opp.value.externalId ? `${opp.value.externalId} ` : ""}${opp.value.plain}${opp.value.customer ? ` at ${opp.value.customer}` : ""}`;
      return {
        summary: `Update ${label}: ${changes.join(", ")}.`,
        params: { id: opp.value.id, label, patch },
        ...(opp.value.customerId ? { customerId: opp.value.customerId, company: opp.value.customer } : {}),
      };
    },
    call: (p) => ({ method: "POST", path: "/api/opportunities", body: { op: "update", id: p.id, ...(p.patch as Params) } }),
    done: (p) => ({ text: `Updated ${p.label}.`, link: `/opportunities/${encodeURIComponent(String(p.id))}` }),
  },
  {
    key: "create_opportunity",
    title: "Open a new deal",
    description: "Create an opportunity on an account. Needs the account, a name, an estimated TCV, a confidence percentage and an expected signing date; the person asking becomes its owner.",
    module: "/opportunities",
    gate: "create",
    fields: {
      customer: { type: "string", description: "Account name or id." },
      name: { type: "string", description: "Deal name, usually the offering or scope." },
      estimatedTcv: { type: "string", description: "Estimated total contract value (200k, 1.5m)." },
      confidence: { type: "number", description: "Confidence percentage, 0-100." },
      estSignDate: { type: "string", description: "Expected signing date." },
      status: { type: "string", description: "Optional starting stage.", enum: OPPORTUNITY_STATUSES },
    },
    required: ["customer", "name", "estimatedTcv", "confidence", "estSignDate"],
    async prepare(params, ctx) {
      const customer = await resolveCustomer(params.customer);
      if (!customer.ok) return { error: customer.error };
      const name = str(params.name, 200);
      if (!name) return { error: "What is the deal called?" };
      const tcv = parseMoney(params.estimatedTcv);
      if (tcv === null) return { error: "A new deal needs an estimated TCV." };
      const confidence = Number(params.confidence);
      if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) return { error: "A new deal needs a confidence percentage from 0 to 100." };
      const day = parseDay(params.estSignDate, new Date(), ctx.timeZone);
      if (!day) return { error: "A new deal needs an expected signing date (YYYY-MM-DD)." };
      let status: string | undefined;
      /* Only a stage the person actually named counts. The model relays a
         guess like "Open" when nothing was said, and a guess that fails the
         enum must not block the deal (first sweep, Sep 28): it is dropped and
         the deal opens at the default stage. */
      if (str(params.status) && pickEnum(params.status, OPPORTUNITY_STATUSES, "status").ok) {
        const picked = pickEnum(params.status, OPPORTUNITY_STATUSES, "status");
        if (!picked.ok) return { error: picked.error };
        status = picked.value;
      }
      return {
        summary: `Open a new deal "${name}" at ${customer.value.name}: estimated TCV ${money(tcv)}, ${confidence}% confidence, signing by ${day}${status ? `, stage ${status}` : ""}.`,
        params: { name, customer: customer.value.name, customerId: customer.value.id, estimatedTcv: tcv, confidence, estSignDate: day, ...(status ? { status } : {}) },
        customerId: customer.value.id,
        company: customer.value.name,
      };
    },
    call: (p) => ({
      method: "POST",
      path: "/api/opportunities",
      body: {
        op: "add",
        name: p.name,
        customer: p.customer,
        customerId: p.customerId,
        estimatedTcv: p.estimatedTcv,
        value: p.estimatedTcv,
        confidence: p.confidence,
        estSignDate: p.estSignDate,
        ...(p.status ? { status: p.status } : {}),
        lines: [{ offeringLabel: p.name, value: p.estimatedTcv, confidence: p.confidence, estSignDate: p.estSignDate }],
      },
    }),
    done: (p, response) => {
      const created = (response.opportunity ?? response.created ?? response) as Record<string, unknown>;
      const id = typeof created?.id === "string" ? created.id : "";
      const ref = typeof created?.externalId === "string" ? created.externalId : "";
      return { text: `Opened "${p.name}" at ${p.customer}${ref ? ` as ${ref}` : ""}.`, link: id ? `/opportunities/${encodeURIComponent(id)}` : "/opportunities" };
    },
  },
  {
    key: "assign_customer_owner",
    title: "Set who owns an account",
    description: "Make a colleague the owner of a customer account.",
    module: "/customers",
    gate: "write",
    fields: {
      customer: { type: "string", description: "Account name or id." },
      person: { type: "string", description: "Colleague's name or id, or 'me'." },
    },
    required: ["customer", "person"],
    async prepare(params, ctx) {
      const customer = await resolveCustomer(params.customer);
      if (!customer.ok) return { error: customer.error };
      const person = await resolvePerson(params.person, ctx);
      if (!person.ok) return { error: person.error };
      return {
        summary: `Make ${person.value.name} the owner of ${customer.value.name}${customer.value.owner ? ` (currently ${customer.value.owner})` : ""}.`,
        params: { customerId: customer.value.id, customer: customer.value.name, owner: person.value.name, ownerUserId: person.value.id },
        customerId: customer.value.id,
        company: customer.value.name,
      };
    },
    call: (p) => ({ method: "PATCH", path: `/api/customers/${encodeURIComponent(String(p.customerId))}`, body: { owner: p.owner, owner_user_id: p.ownerUserId } }),
    done: (p) => ({ text: `${p.owner} now owns ${p.customer}.`, link: `/customers/${encodeURIComponent(String(p.customerId))}` }),
  },
  {
    key: "add_contact",
    title: "Add a contact at an account",
    description: "Add a person who works at a customer account: name, and optionally title, email, phone, LinkedIn.",
    module: "/customers",
    gate: "write",
    fields: {
      customer: { type: "string", description: "Account name or id." },
      name: { type: "string", description: "The contact's full name." },
      title: { type: "string", description: "Job title." },
      email: { type: "string", description: "Email address." },
      phone: { type: "string", description: "Phone number." },
      linkedin: { type: "string", description: "LinkedIn profile URL." },
    },
    required: ["customer", "name"],
    async prepare(params) {
      const customer = await resolveCustomer(params.customer);
      if (!customer.ok) return { error: customer.error };
      const name = str(params.name, 120);
      if (!name) return { error: "What is the contact's name?" };
      const details = [str(params.title, 120), str(params.email, 254), str(params.phone, 40)].filter(Boolean).join(", ");
      return {
        summary: `Add ${name}${details ? ` (${details})` : ""} as a contact at ${customer.value.name}.`,
        params: { customerId: customer.value.id, customer: customer.value.name, full_name: name, title: str(params.title, 120) || undefined, email: str(params.email, 254) || undefined, phone: str(params.phone, 40) || undefined, linkedin_url: str(params.linkedin, 500) || undefined },
        customerId: customer.value.id,
        company: customer.value.name,
      };
    },
    call: (p) => ({ method: "POST", path: `/api/customers/${encodeURIComponent(String(p.customerId))}/contacts`, body: { full_name: p.full_name, job_title: p.title, email: p.email, phone: p.phone, linkedin_url: p.linkedin_url } }),
    done: (p) => ({ text: `${p.full_name} is now a contact at ${p.customer}.`, link: `/customers/${encodeURIComponent(String(p.customerId))}` }),
  },
  {
    key: "update_contact",
    title: "Change a contact's details",
    description:
      "Correct or fill in a person already at an account: job title, email, phone, LinkedIn, department, or mark them as a key contact. Only the fields the person names.",
    module: "/customers",
    gate: "write",
    fields: {
      contact: { type: "string", description: "The contact's name or id." },
      customer: { type: "string", description: "Optional: the account they work at, when two people share a name." },
      title: { type: "string", description: "New job title." },
      email: { type: "string", description: "New email address." },
      phone: { type: "string", description: "New phone number." },
      linkedin: { type: "string", description: "New LinkedIn profile URL." },
      department: { type: "string", description: "New department." },
      key: { type: "boolean", description: "true to mark them a key contact, false to unmark." },
    },
    required: ["contact"],
    async prepare(params) {
      const contact = await resolveContact(params.contact, params.customer);
      if (!contact.ok) return { error: contact.error };
      const patch: Params = {};
      const changes: string[] = [];
      const set = (field: string, value: string, label: string) => {
        if (!value) return;
        patch[field] = value;
        changes.push(`${label} → ${value}`);
      };
      set("job_title", str(params.title, 160), "title");
      set("email", str(params.email, 254), "email");
      set("phone", str(params.phone, 60), "phone");
      set("linkedin_url", str(params.linkedin, 500), "LinkedIn");
      set("department", str(params.department, 120), "department");
      if (typeof params.key === "boolean") {
        patch.is_key = params.key;
        changes.push(params.key ? "mark as a key contact" : "no longer a key contact");
      }
      if (!changes.length) return { error: "What should change about them: title, email, phone, LinkedIn, department, or key contact?" };
      return {
        summary: `Update ${contact.value.plain}${contact.value.company ? ` at ${contact.value.company}` : ""}: ${changes.join(", ")}.`,
        params: { contactId: contact.value.id, name: contact.value.plain, customerId: contact.value.customerId, company: contact.value.company, patch },
        ...(contact.value.customerId ? { customerId: contact.value.customerId, company: contact.value.company } : {}),
      };
    },
    call: (p) => ({
      method: "PATCH",
      path: `/api/contacts/${encodeURIComponent(String(p.contactId))}`,
      body: (p.patch ?? {}) as Record<string, unknown>,
    }),
    done: (p) => ({
      text: `${p.name}${p.company ? ` at ${p.company}` : ""} is updated.`,
      link: `/customers/${encodeURIComponent(String(p.customerId))}`,
    }),
  },
  {
    key: "set_record_people",
    title: "Change who is on a deal or account",
    description: "Add or remove colleagues on an opportunity or a customer account (its team), or set its owner.",
    module: "/opportunities",
    gate: "write",
    fields: {
      type: { type: "string", description: "'opportunity' or 'customer'.", enum: ["opportunity", "customer"] },
      record: { type: "string", description: "The deal (id, OPP number or name) or the account (name or id)." },
      add: { type: "array", description: "Colleagues to add.", items: { type: "string" } },
      remove: { type: "array", description: "Colleagues to remove.", items: { type: "string" } },
      owner: { type: "string", description: "New owner, optional." },
    },
    required: ["type", "record"],
    async prepare(params, ctx) {
      const type = str(params.type).toLowerCase() === "customer" ? "customer" : "opportunity";
      let id = "";
      let label = "";
      let customerId: string | undefined;
      let company: string | undefined;
      if (type === "customer") {
        const customer = await resolveCustomer(params.record);
        if (!customer.ok) return { error: customer.error };
        id = customer.value.id;
        label = customer.value.name;
        customerId = customer.value.id;
        company = customer.value.name;
      } else {
        const opp = await resolveOpportunity(params.record);
        if (!opp.ok) return { error: opp.error };
        id = opp.value.id;
        label = `${opp.value.externalId ? `${opp.value.externalId} ` : ""}${opp.value.plain}${opp.value.customer ? ` at ${opp.value.customer}` : ""}`;
        customerId = opp.value.customerId;
        company = opp.value.customer;
      }
      /* The record-team route's own two questions, asked now: may they change this module, and may they change THIS record (an unclaimed one accepts its first owner). Same words as the route, so the answer does not change between proposal and YES. */
      const owningModule = type === "customer" ? "/customers" : "/opportunities";
      /* A DEAL HANDS OVER ITS OWNER TOO (Sep 29). This passed a bare { id }
         for an opportunity, and a record with no owner fields reads as
         unclaimed, which accepts the first person to take it. So this action
         would have let a BD Member put themselves on somebody else's deal and
         inherit the edit rights ownership carries, through the agent rather
         than the UI. The same fault, and the same fix, as the record-team
         route it copies its two questions from. */
      const scoped =
        type === "customer"
          ? await getDb()
              .customers.get(id)
              .then((c) => (c ? { id: c.id, owner: c.owner, owner_user_id: c.owner_user_id, created_by: c.created_by } : { id }))
              .catch(() => ({ id }))
          : await readOpportunities()
              .then((state) => {
                const deal = state.opportunities.find((o) => o.id === id);
                return deal ? { id, owner: deal.owner ?? null } : { id };
              })
              .catch(() => ({ id }));
      const denied = await recordWriteRefusal(owningModule, scoped);
      if (denied) return { error: denied };
      const team = teamFor(await readRecordTeams(), type, id);
      let owner = team?.owner;
      let members = [...(team?.members ?? [])];
      const changes: string[] = [];
      for (const q of list(params.add)) {
        const person = await resolvePerson(q, ctx);
        if (!person.ok) return { error: person.error };
        if (!members.some((m) => m.toLowerCase() === person.value.name.toLowerCase()) && owner?.toLowerCase() !== person.value.name.toLowerCase()) {
          members.push(person.value.name);
          changes.push(`add ${person.value.name}`);
        }
      }
      for (const q of list(params.remove)) {
        const person = await resolvePerson(q, ctx);
        if (!person.ok) return { error: person.error };
        const before = members.length;
        members = members.filter((m) => m.toLowerCase() !== person.value.name.toLowerCase());
        if (members.length !== before) changes.push(`remove ${person.value.name}`);
        else if (owner?.toLowerCase() === person.value.name.toLowerCase()) {
          owner = undefined;
          changes.push(`remove ${person.value.name} as owner`);
        }
      }
      if (str(params.owner)) {
        const person = await resolvePerson(params.owner, ctx);
        if (!person.ok) return { error: person.error };
        owner = person.value.name;
        members = members.filter((m) => m.toLowerCase() !== owner!.toLowerCase());
        changes.push(`owner → ${owner}`);
      }
      if (!changes.length) return { error: "Nothing would change; who should be added or removed?" };
      return {
        summary: `On ${label}: ${changes.join(", ")}.`,
        params: { type, id, label, owner, members },
        ...(customerId ? { customerId, company } : {}),
      };
    },
    call: (p) => ({ method: "POST", path: "/api/record-team", body: { type: p.type, id: p.id, owner: p.owner, members: p.members } }),
    done: (p) => ({ text: `People on ${p.label} updated.`, link: p.type === "customer" ? `/customers/${encodeURIComponent(String(p.id))}` : `/opportunities/${encodeURIComponent(String(p.id))}` }),
  },
  {
    key: "create_lead",
    title: "Add a lead",
    description: "Create a new lead: a named person at a company who might buy, with optional title, email, phone, source, interest and note.",
    module: "/leads",
    gate: "create",
    fields: {
      name: { type: "string", description: "The lead's full name." },
      company: { type: "string", description: "Their company." },
      title: { type: "string", description: "Job title." },
      email: { type: "string", description: "Email." },
      phone: { type: "string", description: "Phone." },
      source: { type: "string", description: "Where the lead came from (conference, referral, inbound, LinkedIn)." },
      interest: { type: "string", description: "What they are interested in." },
      note: { type: "string", description: "A note." },
    },
    required: ["name", "company"],
    async prepare(params) {
      const name = str(params.name, 120);
      const company = str(params.company, 160);
      if (!name || !company) return { error: "A lead needs a name and a company." };
      return {
        summary: `Add ${name} at ${company} as a new lead${str(params.title) ? ` (${str(params.title, 120)})` : ""}.`,
        params: { name, company, title: str(params.title, 120) || undefined, email: str(params.email, 254) || undefined, phone: str(params.phone, 40) || undefined, source: str(params.source, 120) || undefined, interest: str(params.interest, 500) || undefined, note: str(params.note, 2000) || undefined },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/leads", body: { op: "save", lead: { name: p.name, company: p.company, title: p.title, email: p.email, phone: p.phone, source: p.source, interest: p.interest, note: p.note } } }),
    done: (p, response) => {
      const lead = (response.lead ?? {}) as Record<string, unknown>;
      return { text: `${p.name} at ${p.company} is now a lead${typeof lead.ref === "string" ? ` (${lead.ref})` : ""}.`, link: "/leads" };
    },
  },
  {
    key: "update_lead",
    title: "Change a lead",
    description: "Change a lead's status, owner or add a note.",
    module: "/leads",
    gate: "write",
    fields: {
      lead: { type: "string", description: "Lead id, reference or name." },
      status: { type: "string", description: "New status.", enum: LEAD_STATUSES },
      owner: { type: "string", description: "New owner (colleague)." },
      note: { type: "string", description: "Note to add." },
      disqualifiedReason: { type: "string", description: "Why, when disqualifying." },
    },
    required: ["lead"],
    async prepare(params, ctx) {
      const lead = await resolveLead(params.lead);
      if (!lead.ok) return { error: lead.error };
      const patch: Params = {};
      const changes: string[] = [];
      if (str(params.status)) {
        const status = pickEnum(params.status, LEAD_STATUSES, "status");
        if (!status.ok) return { error: status.error };
        patch.status = status.value;
        changes.push(`status → ${status.value}`);
        if (status.value === "Disqualified" && str(params.disqualifiedReason)) patch.disqualifiedReason = str(params.disqualifiedReason, 500);
      }
      if (str(params.owner)) {
        const person = await resolvePerson(params.owner, ctx);
        if (!person.ok) return { error: person.error };
        patch.owner = person.value.name;
        changes.push(`owner → ${person.value.name}`);
      }
      if (str(params.note)) {
        patch.note = str(params.note, 2000);
        changes.push(`note added`);
      }
      if (!changes.length) return { error: "What should change on the lead?" };
      return { summary: `Update lead ${lead.value.name}: ${changes.join(", ")}.`, params: { id: lead.value.id, label: lead.value.name, patch } };
    },
    call: (p) => ({ method: "POST", path: "/api/leads", body: { op: "save", lead: { id: p.id, ...(p.patch as Params) } } }),
    done: (p) => ({ text: `Updated lead ${p.label}.`, link: `/leads/${encodeURIComponent(String(p.id))}` }),
  },
  {
    key: "create_meeting",
    title: "Log or plan a meeting",
    description: "Create a meeting record with an account: title, type, date and time.",
    module: "/meetings",
    gate: "create",
    fields: {
      title: { type: "string", description: "Meeting title." },
      customer: { type: "string", description: "Account name or id, optional." },
      type: { type: "string", description: "Meeting type.", enum: MEETING_TYPES },
      when: { type: "string", description: "Date and time, ISO (2026-10-02T14:00) or a day." },
    },
    required: ["title", "when"],
    async prepare(params, ctx) {
      const title = str(params.title, 200);
      if (!title) return { error: "What is the meeting called?" };
      let customer: { id: string; name: string } | undefined;
      if (str(params.customer)) {
        const found = await resolveCustomer(params.customer);
        if (!found.ok) return { error: found.error };
        customer = { id: found.value.id, name: found.value.name };
      }
      const raw = str(params.when, 60);
      let when = "";
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) when = raw.slice(0, 16);
      else {
        const day = parseDay(raw, new Date(), ctx.timeZone);
        if (!day) return { error: "When is the meeting? Give a date, ideally with a time." };
        when = `${day}T10:00`;
      }
      let type: string = MEETING_TYPES[1];
      if (str(params.type)) {
        const picked = pickEnum(params.type, MEETING_TYPES, "meeting type");
        if (!picked.ok) return { error: picked.error };
        type = picked.value;
      }
      return {
        summary: `Create the meeting "${title}"${customer ? ` with ${customer.name}` : ""} (${type}) on ${when.replace("T", " at ")}.`,
        params: { title, type, meetingAt: when, ...(customer ? { customer: customer.name, customerId: customer.id } : {}) },
        ...(customer ? { customerId: customer.id, company: customer.name } : {}),
      };
    },
    call: (p) => ({ method: "POST", path: "/api/meetings", body: { op: "create", title: p.title, type: p.type, meetingAt: p.meetingAt, customer: p.customer, customerId: p.customerId } }),
    done: (p, response) => {
      const meeting = (response.meeting ?? {}) as Record<string, unknown>;
      return { text: `Meeting "${p.title}" created.`, link: typeof meeting.id === "string" ? `/meetings/${encodeURIComponent(meeting.id)}` : "/meetings" };
    },
  },
  {
    key: "star_company",
    title: "Star or unstar a company in Market Intel",
    description: "Add a tracked company to your starred list in Market Intel, or take the star off.",
    module: "/market-intel",
    gate: "write",
    fields: {
      company: { type: "string", description: "Tracked company name or id." },
      star: { type: "boolean", description: "true to star, false to unstar." },
    },
    required: ["company", "star"],
    async prepare(params, ctx) {
      const company = await resolveTrackedCompany(params.company);
      if (!company.ok) return { error: company.error };
      const star = params.star !== false && String(params.star).toLowerCase() !== "false";
      /* STARRING ALSO TICKS THE COMPANY ONTO THEIR LIST (the route sends
         on: true with the star), so a summary that only says "star" hides
         half of what happens (Sep 27). Say it when it is actually new. */
      const mine = await readMarketIntelBookmarks(ctx.scope).catch(() => null);
      const alreadyMine = !!mine?.companyIds?.includes(company.value.id);
      const joins = star && !alreadyMine ? ", which also adds it to your tracked companies" : "";
      return { summary: `${star ? "Star" : "Unstar"} ${company.value.name} in Market Intel for you${joins}.`, params: { id: company.value.id, name: company.value.name, star } };
    },
    call: (p) => ({ method: "PUT", path: "/api/market-intel/bookmarks", body: { changes: [{ id: p.id, on: true, star: p.star === true }] } }),
    done: (p) => ({ text: `${p.name} is ${p.star ? "now starred" : "no longer starred"}.`, link: `/market-intel/${encodeURIComponent(String(p.id))}` }),
  },
  {
    key: "verify_goal_result",
    title: "Verify a logged goal result",
    description: "Sign off a colleague's logged result on a goal (a group head for their people; managers and admins for anyone). Find open entries with read_workspace goals (awaitingVerification).",
    module: "/performance",
    gate: "write",
    fields: {
      entry: { type: "string", description: "The entry id from awaitingVerification, if known." },
      person: { type: "string", description: "Otherwise: whose entry." },
      goal: { type: "string", description: "Otherwise: which goal." },
    },
    required: [],
    async prepare(params) {
      const entry = await resolveOpenEntry(params);
      if (!entry.ok) return { error: entry.error };
      const goalName = entry.state.goals.find((g) => g.id === entry.value.goalId)?.name ?? entry.value.goalId;
      return {
        summary: `Verify ${entryLabel(entry.value, goalName)}. Once verified it counts and cannot be edited.`,
        params: { actualId: entry.value.id, goalId: entry.value.goalId, label: entryLabel(entry.value, goalName) },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "verify-actual", actualId: p.actualId } }),
    done: (p) => ({ text: `Verified ${p.label}.`, link: p.goalId ? `/performance/goal/${encodeURIComponent(String(p.goalId))}` : "/performance" }),
  },
  {
    key: "send_back_goal_result",
    title: "Send a logged goal result back",
    description: "Send a colleague's logged result back to them with a note saying what to fix (a group head for their people; managers and admins for anyone).",
    module: "/performance",
    gate: "write",
    fields: {
      entry: { type: "string", description: "The entry id from awaitingVerification, if known." },
      person: { type: "string", description: "Otherwise: whose entry." },
      goal: { type: "string", description: "Otherwise: which goal." },
      note: { type: "string", description: "What needs fixing. Required." },
    },
    required: ["note"],
    async prepare(params) {
      const note = str(params.note, 300);
      if (!note) return { error: "Say what needs fixing before sending it back." };
      const entry = await resolveOpenEntry(params);
      if (!entry.ok) return { error: entry.error };
      const goalName = entry.state.goals.find((g) => g.id === entry.value.goalId)?.name ?? entry.value.goalId;
      return {
        summary: `Send back ${entryLabel(entry.value, goalName)} with the note "${note}".`,
        params: { actualId: entry.value.id, goalId: entry.value.goalId, note, label: entryLabel(entry.value, goalName) },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "send-back-actual", actualId: p.actualId, note: p.note } }),
    done: (p) => ({ text: `Sent back ${p.label}.`, link: p.goalId ? `/performance/goal/${encodeURIComponent(String(p.goalId))}` : "/performance" }),
  },
  {
    key: "create_customer",
    title: "Add a customer account",
    description: "Create a new customer account. Needs the company name, its website, the HQ address (line 1, city, country), an owner who is a BD member, and a customer group.",
    module: "/customers",
    gate: "create",
    fields: {
      name: { type: "string", description: "Company name." },
      website: { type: "string", description: "Website, like gsk.com." },
      hqLine1: { type: "string", description: "HQ address line 1." },
      hqCity: { type: "string", description: "HQ city." },
      hqCountry: { type: "string", description: "HQ country." },
      hqState: { type: "string", description: "HQ state or region, optional." },
      hqZip: { type: "string", description: "HQ postal code, optional." },
      owner: { type: "string", description: "Owner, who must be a BD member. Only defaults to the person asking when they are one." },
      group: { type: "string", description: "Customer group name. Ask which if the person did not say." },
    },
    required: ["name", "website", "hqLine1", "hqCity", "hqCountry", "group"],
    async prepare(params, ctx) {
      const name = str(params.name, 200);
      const website = str(params.website, 300);
      const hq = { line1: str(params.hqLine1, 200), city: str(params.hqCity, 120), country: str(params.hqCountry, 120), ...(str(params.hqState) ? { state: str(params.hqState, 120) } : {}), ...(str(params.hqZip) ? { zip: str(params.hqZip, 40) } : {}) };
      if (!name || !website || !hq.line1 || !hq.city || !hq.country) return { error: "A customer needs a name, a website and an HQ address with line 1, city and country." };
      const owner = await resolvePerson(params.owner, ctx);
      if (!owner.ok) return { error: owner.error };
      /* The route only accepts a BD member as owner. An admin who did not name
         one used to be proposed as owner, say YES, and be refused after the
         fact (first sweep, Sep 28). Ask before proposing instead. */
      if (owner.value.role !== "bd_member") {
        return { error: str(params.owner) && !/^(me|myself|i|my)$/i.test(str(params.owner))
          ? `${owner.value.name} is not a BD member, and an account's owner has to be one. Who should own it?`
          : "Who should own this account? It has to be a BD member." };
      }
      const { groups } = await readCustomerGroups();
      const group = matchOne(str(params.group, 120), groups.map((g) => ({ id: g.id, name: g.name })), "customer group");
      if (!group.ok) return { error: `${group.error} Groups: ${groups.map((g) => g.name).join(", ")}.` };
      return {
        summary: `Add ${name} (${website}) as a customer in the group "${group.value.name}", HQ ${hq.line1}, ${hq.city}, ${hq.country}, owned by ${owner.value.name}.`,
        params: { name, website, hq, owner: owner.value.name, ownerUserId: owner.value.id, groupId: group.value.id, groupName: group.value.name },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/customers", body: { name: p.name, website: p.website, hq: p.hq, owner: p.owner, ownerUserId: p.ownerUserId, groupId: p.groupId } }),
    done: (p, response) => {
      const created = (response.customer ?? response) as Record<string, unknown>;
      const id = typeof created?.id === "string" ? created.id : "";
      return { text: `${p.name} is now a customer, owned by ${p.owner}.`, link: id ? `/customers/${encodeURIComponent(id)}` : "/customers" };
    },
  },
  {
    key: "create_solutioning_request",
    title: "Raise a solutioning request",
    description: "Ask the Solutioning team for a presentation, a submission (RFP/RFI response) or a meeting for an account: what is needed, by when, and how urgent.",
    module: "/solutioning",
    gate: "write",
    fields: {
      customer: { type: "string", description: "Account name or id." },
      kind: { type: "string", description: "What is needed.", enum: ["presentation", "submission", "meeting"] },
      title: { type: "string", description: "One line: what the request is for." },
      details: { type: "string", description: "Optional: scope, questions, context." },
      neededBy: { type: "string", description: "When it is needed (a date). Required; ask if not given." },
      priority: { type: "string", description: "Optional urgency.", enum: ["High", "Medium", "Low"] },
      opportunity: { type: "string", description: "Optional: the deal it belongs to (id, OPP number or name)." },
    },
    required: ["customer", "kind", "title", "neededBy"],
    async prepare(params, ctx) {
      const customer = await resolveCustomer(params.customer);
      if (!customer.ok) return { error: customer.error };
      const kind = pickEnum(params.kind, ["presentation", "submission", "meeting"], "kind");
      if (!kind.ok) return { error: kind.error };
      const title = str(params.title, 200);
      if (!title) return { error: "What is the request for?" };
      /* The route insists on a due date ("Pick a valid due date"), so ask
         for one up front rather than failing after the yes. */
      const neededBy = parseDay(params.neededBy, new Date(), ctx.timeZone);
      if (!neededBy) return { error: "When is it needed by? A date or words like Friday or next week both work." };
      let priority: string | undefined;
      if (str(params.priority)) {
        const picked = pickEnum(params.priority, ["High", "Medium", "Low"], "priority");
        if (!picked.ok) return { error: picked.error };
        priority = picked.value;
      }
      let opportunityIds: string[] | undefined;
      let opportunityLabels: string[] | undefined;
      if (str(params.opportunity)) {
        const opp = await resolveOpportunity(params.opportunity);
        if (!opp.ok) return { error: opp.error };
        opportunityIds = [opp.value.id];
        opportunityLabels = [opp.value.plain];
      }
      return {
        summary: `Raise a solutioning request for a ${kind.value} at ${customer.value.name}: "${title}"${neededBy ? `, needed by ${readableDay(neededBy)}` : ""}${priority ? `, ${priority} priority` : ""}${opportunityLabels ? `, for the deal ${opportunityLabels[0]}` : ""}.`,
        params: { customer: customer.value.name, customerId: customer.value.id, kind: kind.value, title, details: str(params.details, 4000) || undefined, neededBy, priority, opportunityIds, opportunityLabels },
        customerId: customer.value.id,
        company: customer.value.name,
      };
    },
    call: (p) => ({
      method: "POST",
      path: "/api/solutioning",
      body: { op: "create", type: "request", kind: p.kind, title: p.title, details: p.details, customer: p.customer, customerId: p.customerId, neededBy: p.neededBy, priority: p.priority, opportunityIds: p.opportunityIds, opportunityLabels: p.opportunityLabels },
    }),
    done: (p, response) => {
      const request = (response.request ?? {}) as Record<string, unknown>;
      const id = typeof request.id === "string" ? request.id : "";
      return { text: `Solutioning request raised for ${p.customer}: "${p.title}".`, link: id ? `/solutioning/${encodeURIComponent(id)}` : "/solutioning" };
    },
  },
  {
    key: "set_followup",
    title: "Set a follow-up reminder on an account",
    description: "Put a follow-up reminder on a customer account's timeline for a day ('next week', 'in 3 days', a date).",
    module: "/customers",
    gate: "write",
    fields: {
      customer: { type: "string", description: "Account name or id." },
      when: { type: "string", description: "When to follow up: a date or words like next week, in 3 days." },
      note: { type: "string", description: "Optional: what the follow-up is about." },
      contact: { type: "string", description: "Optional: which contact at the account it concerns." },
    },
    required: ["customer", "when"],
    async prepare(params, ctx) {
      const customer = await customerForWrite(params.customer);
      if (!customer.ok) return { error: customer.error };
      const contact = await contactForTimeline(customer.value.id, customer.value.name, params.contact);
      if (!contact.ok) return { error: contact.error };
      const when = followupDay(params.when, ctx.timeZone);
      return {
        summary: `Set a follow-up with ${customer.value.name} (${contact.value.name}) for ${readableDay(when.iso)}${str(params.note) ? ` (${str(params.note, 200)})` : ""}.`,
        params: { customerId: customer.value.id, customer: customer.value.name, contactId: contact.value.id, when: when.iso, label: when.label, note: str(params.note, 1000) || undefined },
        customerId: customer.value.id,
        company: customer.value.name,
      };
    },
    call: (p) => ({
      local: async (ctx) => {
        const interaction = await getDb().interactions.create({
          customer_id: String(p.customerId),
          contact_id: String(p.contactId),
          pitch_session_id: null,
          outcome: "in_progress",
          notes: `Follow-up reminder set by the agent for ${ctx.actorName} (${p.label}).${p.note ? `\n\n${p.note}` : ""}`,
          follow_up_date: String(p.when),
          logged_by: ctx.actorName,
        });
        return { interactionId: interaction.id };
      },
    }),
    done: (p) => ({ text: `Follow-up with ${p.customer} set for ${p.when}.`, link: `/customers/${encodeURIComponent(String(p.customerId))}` }),
  },
  {
    key: "log_touch",
    title: "Log a call, email or meeting you already had",
    description: "Log a call, email or meeting WITH A NAMED CONTACT on their timeline. Needs a contact: if the person only names the company, use add_customer_note instead.",
    module: "/customers",
    gate: "write",
    fields: {
      customer: { type: "string", description: "Account name or id." },
      notes: { type: "string", description: "What happened, in the person's words." },
      outcome: { type: "string", description: "How it went.", enum: ["interested", "meeting_booked", "in_progress"] },
      contact: { type: "string", description: "Optional: who at the account it was with." },
    },
    required: ["customer", "notes"],
    async prepare(params, ctx) {
      const customer = await customerForWrite(params.customer);
      if (!customer.ok) return { error: customer.error };
      const notes = str(params.notes, 4000);
      if (!notes) return { error: "What happened?" };
      const contact = await contactForTimeline(customer.value.id, customer.value.name, params.contact);
      if (!contact.ok) {
        /* NOBODY TO HANG IT ON, SO IT GOES ON THE ACCOUNT. "Log a call on
           Acme: spoke to the CFO" names no contact, and an account with none
           used to get "add a contact first" three times running (sweep, Sep
           28): pointing the model at add_customer_note did not make it go
           there. The same proposal now becomes the account's own note, which
           is what the person meant. A contact that was NAMED and not found is
           still a question, never a silent downgrade. */
        if (str(params.contact)) return { error: contact.error };
        const kind = /\bemail/i.test(notes) ? "email" : /\bmeet/i.test(notes) ? "meeting" : /\bcall/i.test(notes) || /\bspoke|\bphoned|\brang/i.test(notes) ? "call" : "note";
        return {
          summary: `Add a ${kind} to ${customer.value.name}'s timeline: "${notes.slice(0, 140)}${notes.length > 140 ? "…" : ""}"`,
          params: { mode: "account", customerId: customer.value.id, customer: customer.value.name, notes, kind },
          customerId: customer.value.id,
          company: customer.value.name,
        };
      }
      const outcome = ["interested", "meeting_booked", "in_progress"].includes(str(params.outcome)) ? str(params.outcome) : "in_progress";
      return {
        summary: `Log on ${customer.value.name}'s timeline (${contact.value.name}): "${notes.slice(0, 140)}${notes.length > 140 ? "…" : ""}" (${outcome.replace("_", " ")}).`,
        params: { customerId: customer.value.id, customer: customer.value.name, contactId: contact.value.id, notes, outcome },
        customerId: customer.value.id,
        company: customer.value.name,
      };
    },
    call: (p) => p.mode === "account" ? ({ method: "PATCH", path: `/api/customers/${encodeURIComponent(String(p.customerId))}`, body: { addNote: { body: p.notes, kind: p.kind } } }) : ({
      local: async (ctx) => {
        const interaction = await getDb().interactions.create({
          customer_id: String(p.customerId),
          contact_id: String(p.contactId),
          pitch_session_id: null,
          outcome: String(p.outcome) as "interested" | "meeting_booked" | "in_progress",
          notes: String(p.notes),
          follow_up_date: null,
          logged_by: ctx.actorName,
        });
        return { interactionId: interaction.id };
      },
    }),
    done: (p) => ({ text: p.mode === "account" ? `The ${p.kind} is on ${p.customer}'s timeline.` : `Logged on ${p.customer}'s timeline.`, link: `/customers/${encodeURIComponent(String(p.customerId))}` }),
  },
  {
    key: "save_draft",
    title: "Save an outreach draft",
    description: "Save a draft email or message to a customer account's timeline for the person to review and send themselves. Never sends anything. The body should include a 'Subject:' line.",
    module: "/customers",
    gate: "write",
    fields: {
      customer: { type: "string", description: "Account name or id." },
      body: { type: "string", description: "The full draft, including a Subject: line." },
      contact: { type: "string", description: "Optional: who at the account it is for." },
    },
    required: ["customer", "body"],
    async prepare(params, ctx) {
      const customer = await customerForWrite(params.customer);
      if (!customer.ok) return { error: customer.error };
      const contact = await contactForTimeline(customer.value.id, customer.value.name, params.contact);
      if (!contact.ok) return { error: contact.error };
      const body = str(params.body, 20_000);
      if (!body) return { error: "What should the draft say?" };
      const subject = /subject:\s*(.+)/i.exec(body)?.[1]?.trim();
      return {
        summary: `Save a draft${subject ? ` "${subject.slice(0, 80)}"` : ""} to ${customer.value.name}'s timeline (${contact.value.name}) for you to review. Nothing is sent.`,
        params: { customerId: customer.value.id, customer: customer.value.name, contactId: contact.value.id, body },
        customerId: customer.value.id,
        company: customer.value.name,
      };
    },
    call: (p) => ({
      local: async (ctx) => {
        const interaction = await getDb().interactions.create({
          customer_id: String(p.customerId),
          contact_id: String(p.contactId),
          pitch_session_id: null,
          outcome: "in_progress",
          notes: `✍️ Draft outreach (NOT sent: saved for your review):\n\n${p.body}`,
          follow_up_date: null,
          logged_by: ctx.actorName,
        });
        return { interactionId: interaction.id };
      },
    }),
    done: (p) => ({ text: `Draft saved to ${p.customer}'s timeline. Nothing was sent.`, link: `/customers/${encodeURIComponent(String(p.customerId))}` }),
  },
  /* ====================================================================== */
  /* THE FULL AUDIT (Anir, Sep 27: "the agent has to be able to do literally
     anything I can do in the app... I don't want to keep updating it").
     Every write the app's own routes offer in real mode, mapped once. Each
     one is a thin door onto a route that already checks who may pass: the
     agent never re-implements a permission, it forwards the person's cookies
     and repeats the route's refusal in the route's words.

     NO DELETES, BY DECISION (Anir, Sep 28: "I don't think the agent should
     delete anything. It should not have delete capabilities."). Thirteen
     delete actions were built, verified and then removed on his call. Taking
     a person off a goal, a company off your own list or an account out of a
     group is a change of membership, not a deletion, and stays. */
  /* ====================================================================== */

  /* ---------------------------------------------------------- Goals plan */
  {
    key: "create_goal",
    title: "Create a goal",
    description: "Add a new goal to the Goals plan: a name, what it counts (count, currency or percent), the target and the year.",
    module: "/performance",
    gate: "create",
    fields: {
      name: { type: "string", description: "The goal's name." },
      unit: { type: "string", description: "count, currency or percent." },
      target: { type: "number", description: "The target in that unit. Omit if none was given." },
      year: { type: "number", description: "Fiscal year, e.g. 2026. Defaults to this year." },
      type: { type: "string", description: "Goal type (category) name, if the person named one." },
    },
    required: ["name", "unit"],
    async prepare(params) {
      const name = str(params.name, 160);
      if (!name) return { error: "What should the goal be called?" };
      /* "a count goal", "dollars", "%": the model relays the person's words,
         not the enum, and the first sweep died here on "count goal". */
      const unitWord = str(params.unit, 60).toLowerCase();
      const unitValue = /percent|%|pct/.test(unitWord) ? "percent" : /currenc|\$|usd|dollar|money|revenue|eur|gbp|inr/.test(unitWord) ? "currency" : /count|number|how many|times|meetings|calls|leads/.test(unitWord) ? "count" : "";
      if (!unitValue) return { error: "Is the goal counted in numbers, in money, or as a percentage?" };
      const unit = { ok: true as const, value: unitValue };
      const target = params.target === undefined || params.target === null || params.target === "" ? undefined : parseMoney(params.target);
      if (params.target !== undefined && params.target !== null && params.target !== "" && target === null) return { error: "The target must be a number." };
      const year = Number(str(params.year, 8)) || new Date().getFullYear();
      const type = str(params.type, 120) || undefined;
      return {
        summary: `Create the goal "${name}" (${unit.value}${target ? `, target ${target.toLocaleString("en-US")}` : ""}, ${year})${type ? ` under ${type}` : ""}.`,
        params: { name, unit: unit.value, ...(target ? { target } : {}), year, ...(type ? { type } : {}) },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "add-goal", name: p.name, unit: p.unit, target: p.target ?? 0, year: p.year, ...(p.type ? { type: p.type } : {}) } }),
    done: (p) => ({ text: `The goal "${p.name}" is in the plan.`, link: "/performance" }),
  },
  {
    key: "update_goal",
    title: "Change a goal",
    description: "Rename a goal or change its target or year. Only the fields given change.",
    module: "/performance",
    gate: "write",
    fields: {
      goal: { type: "string", description: "Goal id or name." },
      name: { type: "string", description: "New name." },
      target: { type: "number", description: "New target." },
      year: { type: "number", description: "New fiscal year." },
    },
    required: ["goal"],
    async prepare(params) {
      const goal = await resolveGoal(params.goal);
      if (!goal.ok) return { error: goal.error };
      const patch: Params = {};
      const changes: string[] = [];
      if (str(params.name, 160)) { patch.name = str(params.name, 160); changes.push(`rename it to "${patch.name}"`); }
      if (params.target !== undefined && params.target !== null && params.target !== "") {
        const t = parseMoney(params.target); if (t === null) return { error: "The target must be a number." };
        patch.target = t; changes.push(`set the target to ${t.toLocaleString("en-US")}`);
      }
      if (str(params.year, 8)) { patch.year = Number(str(params.year, 8)); changes.push(`move it to ${patch.year}`); }
      if (!changes.length) return { error: "Say what should change: the name, the target or the year." };
      return { summary: `On the goal "${goal.value.name}": ${changes.join(", ")}.`, params: { goalId: goal.value.id, goalName: goal.value.name, patch } };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "update-goal", goalId: p.goalId, ...(p.patch as Params) } }),
    done: (p) => ({ text: `"${(p.patch as Params).name ?? p.goalName}" is updated.`, link: `/performance/goal/${encodeURIComponent(String(p.goalId))}` }),
  },
  {
    key: "create_subgoal",
    title: "Add a subgoal under a goal",
    description: "Carve a share of a goal out as a named subgoal, optionally with its own target and the people on it.",
    module: "/performance",
    gate: "write",
    fields: {
      goal: { type: "string", description: "Parent goal id or name." },
      name: { type: "string", description: "The subgoal's name." },
      target: { type: "number", description: "Its target, in the parent's unit." },
      people: { type: "array", items: { type: "string" }, description: "Colleagues to put on it." },
    },
    required: ["goal", "name"],
    async prepare(params, ctx) {
      const goal = await resolveGoal(params.goal);
      if (!goal.ok) return { error: goal.error };
      const name = str(params.name, 160);
      if (!name) return { error: "What should the subgoal be called?" };
      const target = params.target === undefined || params.target === null || params.target === "" ? undefined : parseMoney(params.target);
      if (params.target !== undefined && params.target !== null && params.target !== "" && target === null) return { error: "The target must be a number." };
      const names: string[] = [];
      for (const q of list(params.people)) { const person = await resolvePerson(q, ctx); if (!person.ok) return { error: person.error }; names.push(person.value.name); }
      return {
        summary: `Add the subgoal "${name}" under "${goal.value.name}"${target ? ` with a target of ${target.toLocaleString("en-US")}` : ""}${names.length ? `, with ${names.join(", ")} on it` : ""}.`,
        params: { goalId: goal.value.id, goalName: goal.value.name, name, ...(target ? { target } : {}), people: names },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "add-subgoal", goalId: p.goalId, name: p.name, target: p.target ?? 0, people: (p.people as string[]).map((n) => ({ name: n })) } }),
    done: (p) => ({ text: `"${p.name}" now sits under "${p.goalName}".`, link: `/performance/goal/${encodeURIComponent(String(p.goalId))}` }),
  },
  {
    key: "update_goal_result",
    title: "Correct a logged result",
    description: "Change the amount, date, account or note on a result that is still waiting for verification. Verified results are locked.",
    module: "/performance",
    gate: "write",
    fields: {
      entry: { type: "string", description: "The entry id from awaitingVerification, if known." },
      person: { type: "string", description: "Otherwise: whose entry." },
      goal: { type: "string", description: "Otherwise: which goal." },
      amount: { type: "number", description: "The corrected amount." },
      date: { type: "string", description: "The corrected date." },
      note: { type: "string", description: "A corrected note." },
    },
    required: [],
    async prepare(params, ctx) {
      const entry = await resolveOpenEntry(params);
      if (!entry.ok) return { error: entry.error };
      const goalName = entry.state.goals.find((g) => g.id === entry.value.goalId)?.name ?? entry.value.goalId;
      const patch: Params = {}; const changes: string[] = [];
      if (params.amount !== undefined && params.amount !== null && params.amount !== "") { const a = parseMoney(params.amount); if (a === null) return { error: "The amount must be a number." }; patch.amount = a; changes.push(`amount to ${a.toLocaleString("en-US")}`); }
      if (str(params.date)) { const d = parseDay(params.date, new Date(), ctx.timeZone); if (!d) return { error: "I could not read that date." }; patch.date = d; changes.push(`date to ${readableDay(d)}`); }
      if (str(params.note, 600)) { patch.note = str(params.note, 600); changes.push("the note"); }
      if (!changes.length) return { error: "Say what to correct: the amount, the date or the note." };
      return { summary: `Correct ${entryLabel(entry.value, goalName)}: ${changes.join(", ")}.`, params: { actualId: entry.value.id, goalId: entry.value.goalId, label: entryLabel(entry.value, goalName), patch } };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "update-actual", actualId: p.actualId, ...(p.patch as Params) } }),
    done: (p) => ({ text: `Corrected ${p.label}.`, link: `/performance/goal/${encodeURIComponent(String(p.goalId))}` }),
  },
  {
    key: "create_group",
    title: "Create a group",
    description: "Start a new group in the Goals plan with a head and, optionally, members.",
    module: "/performance",
    gate: "create",
    fields: {
      name: { type: "string", description: "The group's name." },
      head: { type: "string", description: "Colleague who heads it, or 'me'." },
      members: { type: "array", items: { type: "string" }, description: "Colleagues in it." },
    },
    required: ["name", "head"],
    async prepare(params, ctx) {
      const name = str(params.name, 120);
      if (!name) return { error: "What should the group be called?" };
      const head = await resolvePerson(params.head, ctx);
      if (!head.ok) return { error: head.error };
      const members: string[] = [];
      for (const q of list(params.members)) { const person = await resolvePerson(q, ctx); if (!person.ok) return { error: person.error }; if (person.value.name !== head.value.name) members.push(person.value.name); }
      return { summary: `Create the group "${name}", headed by ${head.value.name}${members.length ? `, with ${members.join(", ")}` : ""}.`, params: { name, head: head.value.name, members } };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "add-group", name: p.name, head: p.head, members: p.members } }),
    done: (p) => ({ text: `The group "${p.name}" exists, headed by ${p.head}.`, link: "/performance?view=groups" }),
  },
  {
    key: "update_group",
    title: "Rename a group or change its head",
    description: "Rename a group in the Goals plan, or make someone else its head. To move people in or out, use move_group_member.",
    module: "/performance",
    gate: "write",
    fields: {
      group: { type: "string", description: "Group id or name." },
      name: { type: "string", description: "New name." },
      head: { type: "string", description: "New head, a colleague's name or 'me'." },
    },
    required: ["group"],
    async prepare(params, ctx) {
      const group = await resolveGroup(params.group);
      if (!group.ok) return { error: group.error };
      const patch: Params = {}; const changes: string[] = [];
      if (str(params.name, 120)) { patch.name = str(params.name, 120); changes.push(`rename it to "${patch.name}"`); }
      if (str(params.head)) { const head = await resolvePerson(params.head, ctx); if (!head.ok) return { error: head.error }; patch.head = head.value.name; changes.push(`make ${head.value.name} its head`); }
      if (!changes.length) return { error: "Say what should change: the name or the head." };
      return { summary: `On the group "${group.value.name}": ${changes.join(" and ")}.`, params: { groupId: group.value.id, groupName: group.value.name, patch } };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "update-group", groupId: p.groupId, ...(p.patch as Params) } }),
    done: (p) => ({ text: `The group "${(p.patch as Params).name ?? p.groupName}" is updated.`, link: "/performance?view=groups" }),
  },

  /* ------------------------------------------------- Deals and leads */
  {
    key: "convert_lead",
    title: "Mark a lead as converted",
    description: "Record that a lead became a deal: the lead is marked converted and linked to the opportunity it turned into. Create the opportunity first if it does not exist yet.",
    module: "/leads",
    gate: "write",
    fields: {
      lead: { type: "string", description: "Lead name, ref or id." },
      opportunity: { type: "string", description: "The deal it became: name, id or OPP reference." },
    },
    required: ["lead", "opportunity"],
    async prepare(params) {
      const lead = await resolveLead(params.lead);
      if (!lead.ok) return { error: lead.error };
      const opp = await resolveOpportunity(params.opportunity);
      if (!opp.ok) return { error: opp.error };
      return { summary: `Mark the lead ${lead.value.plain} as converted into the deal "${opp.value.name}".`, params: { id: lead.value.id, leadName: lead.value.plain, opportunityId: opp.value.id, oppName: opp.value.name } };
    },
    call: (p) => ({ method: "POST", path: "/api/leads", body: { op: "convert", id: p.id, opportunityId: p.opportunityId } }),
    done: (p) => ({ text: `${p.leadName} is now a converted lead, linked to "${p.oppName}".`, link: `/leads/${encodeURIComponent(String(p.id))}` }),
  },
  {
    key: "refresh_lead_linkedin",
    title: "Re-read a lead's LinkedIn profile",
    description: "Fetch the lead's public LinkedIn profile again and replace what is stored. This is a paid lookup, so only when the person asks for it.",
    module: "/leads",
    gate: "write",
    fields: { lead: { type: "string", description: "Lead name, ref or id." } },
    required: ["lead"],
    async prepare(params) {
      const lead = await resolveLead(params.lead);
      if (!lead.ok) return { error: lead.error };
      return { summary: `Read ${lead.value.plain}'s LinkedIn profile again and replace what is stored on the lead. This is a paid lookup.`, params: { id: lead.value.id, leadName: lead.value.plain } };
    },
    call: (p) => ({ method: "POST", path: "/api/leads", body: { op: "enrich-linkedin", id: p.id } }),
    done: (p) => ({ text: `${p.leadName}'s LinkedIn profile has been read again.`, link: `/leads/${encodeURIComponent(String(p.id))}` }),
  },

  /* ------------------------------------------------------- Solutioning */
  {
    key: "update_solutioning_request",
    title: "Change a solutioning request",
    description: "Edit a request's title, details or needed-by date. Only the fields given change.",
    module: "/solutioning",
    gate: "write",
    fields: {
      request: { type: "string", description: "Request title or id." },
      title: { type: "string", description: "New title." },
      details: { type: "string", description: "New details." },
      neededBy: { type: "string", description: "New needed-by date." },
    },
    required: ["request"],
    async prepare(params, ctx) {
      const req = await resolveRequest(params.request);
      if (!req.ok) return { error: req.error };
      const patch: Params = {}; const changes: string[] = [];
      if (str(params.title, 200)) { patch.title = str(params.title, 200); changes.push(`retitle it "${patch.title}"`); }
      if (str(params.details, 4000)) { patch.details = str(params.details, 4000); changes.push("replace the details"); }
      if (str(params.neededBy)) { const d = parseDay(params.neededBy, new Date(), ctx.timeZone); if (!d) return { error: "I could not read that date." }; patch.neededBy = d; changes.push(`move the needed-by date to ${readableDay(d)}`); }
      if (!changes.length) return { error: "Say what should change: the title, the details or the needed-by date." };
      return { summary: `On the request "${req.value.plain}": ${changes.join(", ")}.`, params: { requestId: req.value.id, title: req.value.plain, patch } };
    },
    call: (p) => ({ method: "POST", path: "/api/solutioning", body: { op: "update", requestId: p.requestId, patch: p.patch } }),
    done: (p) => ({ text: `The request "${(p.patch as Params).title ?? p.title}" is updated.`, link: `/solutioning?request=${encodeURIComponent(String(p.requestId))}` }),
  },
  {
    key: "assign_solutioning_request",
    title: "Assign a solutioning request to someone",
    description: "Give a request an owner on the solutioning side. Only a solutioning owner or admin may do this.",
    module: "/solutioning",
    gate: "write",
    fields: { request: { type: "string", description: "Request title or id." }, owner: { type: "string", description: "Colleague's name, or 'me'." } },
    required: ["request", "owner"],
    async prepare(params, ctx) {
      const req = await resolveRequest(params.request);
      if (!req.ok) return { error: req.error };
      const owner = await resolvePerson(params.owner, ctx);
      if (!owner.ok) return { error: owner.error };
      return { summary: `Assign the request "${req.value.plain}" to ${owner.value.name}.`, params: { requestId: req.value.id, title: req.value.plain, owner: owner.value.name } };
    },
    call: (p) => ({ method: "POST", path: "/api/solutioning", body: { op: "assign-request", requestId: p.requestId, owner: p.owner } }),
    done: (p) => ({ text: `"${p.title}" is assigned to ${p.owner}.`, link: `/solutioning?request=${encodeURIComponent(String(p.requestId))}` }),
  },
  {
    key: "pick_up_solutioning_request",
    title: "Pick up a solutioning request",
    description: "Take a request yourself: you become its owner and it moves to in progress.",
    module: "/solutioning",
    gate: "write",
    fields: { request: { type: "string", description: "Request title or id." } },
    required: ["request"],
    async prepare(params, ctx) {
      const req = await resolveRequest(params.request);
      if (!req.ok) return { error: req.error };
      return { summary: `Pick up the request "${req.value.plain}" as ${ctx.actorName}.`, params: { requestId: req.value.id, title: req.value.plain } };
    },
    call: (p) => ({ method: "POST", path: "/api/solutioning", body: { op: "pick-up", requestId: p.requestId } }),
    done: (p) => ({ text: `You have picked up "${p.title}".`, link: `/solutioning?request=${encodeURIComponent(String(p.requestId))}` }),
  },
  {
    key: "complete_solutioning_request",
    title: "Mark a solutioning request complete",
    description: "Close a request as completed.",
    module: "/solutioning",
    gate: "write",
    fields: { request: { type: "string", description: "Request title or id." } },
    required: ["request"],
    async prepare(params) {
      const req = await resolveRequest(params.request);
      if (!req.ok) return { error: req.error };
      if (req.value.status === "completed") return { error: `"${req.value.plain}" is already completed.` };
      return { summary: `Mark the request "${req.value.plain}" as completed.`, params: { requestId: req.value.id, title: req.value.plain } };
    },
    call: (p) => ({ method: "POST", path: "/api/solutioning", body: { op: "complete", requestId: p.requestId } }),
    done: (p) => ({ text: `"${p.title}" is completed.`, link: `/solutioning?request=${encodeURIComponent(String(p.requestId))}` }),
  },
  {
    key: "cancel_solutioning_request",
    title: "Cancel a solutioning request",
    description: "Cancel a request, with a reason if one was given.",
    module: "/solutioning",
    gate: "write",
    fields: { request: { type: "string", description: "Request title or id." }, reason: { type: "string", description: "Why, if said." } },
    required: ["request"],
    async prepare(params) {
      const req = await resolveRequest(params.request);
      if (!req.ok) return { error: req.error };
      if (req.value.status === "cancelled") return { error: `"${req.value.plain}" is already cancelled.` };
      const reason = str(params.reason, 600) || undefined;
      return { summary: `Cancel the request "${req.value.plain}"${reason ? ` (${reason})` : ""}.`, params: { requestId: req.value.id, title: req.value.plain, ...(reason ? { reason } : {}) } };
    },
    call: (p) => ({ method: "POST", path: "/api/solutioning", body: { op: "cancel", requestId: p.requestId, ...(p.reason ? { reason: p.reason } : {}) } }),
    done: (p) => ({ text: `"${p.title}" is cancelled.`, link: `/solutioning?request=${encodeURIComponent(String(p.requestId))}` }),
  },
  {
    key: "reopen_solutioning_request",
    title: "Reopen a solutioning request",
    description: "Reopen a completed or cancelled request. Only the requester or a manager may.",
    module: "/solutioning",
    gate: "write",
    fields: { request: { type: "string", description: "Request title or id." } },
    required: ["request"],
    async prepare(params) {
      const req = await resolveRequest(params.request);
      if (!req.ok) return { error: req.error };
      if (!["completed", "cancelled"].includes(req.value.status)) return { error: `"${req.value.plain}" is still open (${req.value.status.replace("_", " ")}).` };
      return { summary: `Reopen the request "${req.value.plain}".`, params: { requestId: req.value.id, title: req.value.plain } };
    },
    call: (p) => ({ method: "POST", path: "/api/solutioning", body: { op: "reopen", requestId: p.requestId } }),
    done: (p) => ({ text: `"${p.title}" is open again.`, link: `/solutioning?request=${encodeURIComponent(String(p.requestId))}` }),
  },
  {
    key: "comment_on_solutioning_request",
    title: "Comment on a solutioning request",
    description: "Leave a comment on a request. Anyone who can see the request may comment.",
    module: "/solutioning",
    gate: "write",
    fields: { request: { type: "string", description: "Request title or id." }, text: { type: "string", description: "The comment, in the person's words." } },
    required: ["request", "text"],
    async prepare(params) {
      const req = await resolveRequest(params.request);
      if (!req.ok) return { error: req.error };
      const text = str(params.text, 2000);
      if (!text) return { error: "What should the comment say?" };
      return { summary: `Comment on "${req.value.plain}": "${text}"`, params: { requestId: req.value.id, title: req.value.plain, text } };
    },
    call: (p) => ({ method: "POST", path: "/api/solutioning", body: { op: "comment", requestId: p.requestId, text: p.text } }),
    done: (p) => ({ text: `Your comment is on "${p.title}".`, link: `/solutioning?request=${encodeURIComponent(String(p.requestId))}` }),
  },
  {
    key: "set_solutioning_priority",
    title: "Set a request's priority",
    description: "High, Medium or Low.",
    module: "/solutioning",
    gate: "write",
    fields: { request: { type: "string", description: "Request title or id." }, priority: { type: "string", description: "High, Medium or Low." } },
    required: ["request", "priority"],
    async prepare(params) {
      const req = await resolveRequest(params.request);
      if (!req.ok) return { error: req.error };
      const priority = pickEnum(params.priority, ["High", "Medium", "Low"], "priority");
      if (!priority.ok) return { error: priority.error };
      return { summary: `Set the priority of "${req.value.plain}" to ${priority.value}.`, params: { requestId: req.value.id, title: req.value.plain, priority: priority.value } };
    },
    call: (p) => ({ method: "POST", path: "/api/solutioning", body: { op: "set-priority", requestId: p.requestId, priority: p.priority } }),
    done: (p) => ({ text: `"${p.title}" is now ${p.priority} priority.`, link: `/solutioning?request=${encodeURIComponent(String(p.requestId))}` }),
  },

  /* ---------------------------------------------- Contracts and meetings */
  {
    key: "create_contract",
    title: "Record a contract",
    description: "Enter a contract: name, customer, value in USD, and optionally the deal it closed, its status and dates.",
    module: "/contracts",
    gate: "create",
    fields: {
      name: { type: "string", description: "Contract name." },
      customer: { type: "string", description: "Account name or id." },
      value: { type: "number", description: "Total contract value in USD." },
      opportunity: { type: "string", description: "The deal it closed, if any." },
      status: { type: "string", description: "Draft, Ready for delivery, Signed or Cancelled. Defaults to Draft." },
      signedOn: { type: "string", description: "Signing date, if signed." },
      startDate: { type: "string", description: "Start date." },
      endDate: { type: "string", description: "End date." },
    },
    required: ["name", "customer"],
    async prepare(params, ctx) {
      const name = str(params.name, 200);
      if (!name) return { error: "What is the contract called?" };
      const customer = await resolveCustomer(params.customer);
      if (!customer.ok) return { error: customer.error };
      const value = params.value === undefined || params.value === null || params.value === "" ? 0 : parseMoney(params.value);
      if (value === null) return { error: "The value must be a number." };
      const status = str(params.status) ? pickEnum(params.status, CONTRACT_STATUSES, "status") : { ok: true as const, value: "Draft" };
      if (!status.ok) return { error: status.error };
      const contract: Params = { name, customer: customer.value.name, customerId: customer.value.id, value, status: status.value };
      if (str(params.opportunity)) { const opp = await resolveOpportunity(params.opportunity); if (!opp.ok) return { error: opp.error }; contract.opportunityId = opp.value.id; contract.opportunityName = opp.value.name; }
      for (const k of ["signedOn", "startDate", "endDate"] as const) { if (str(params[k])) { const d = parseDay(params[k], new Date(), ctx.timeZone); if (!d) return { error: `I could not read the ${k === "signedOn" ? "signing" : k === "startDate" ? "start" : "end"} date.` }; contract[k] = d; } }
      return { summary: `Record the contract "${name}" for ${customer.value.name}${value ? `, ${money(value)}` : ""}, as ${status.value}${contract.opportunityName ? `, closing "${contract.opportunityName}"` : ""}.`, params: { contract } };
    },
    call: (p) => ({ method: "POST", path: "/api/contracts", body: { op: "save", contract: p.contract } }),
    done: (p, res) => { const saved = (res.contract ?? res.saved ?? {}) as { id?: string; reference?: string }; return { text: `The contract "${(p.contract as Params).name}" is recorded${saved.reference ? ` as ${saved.reference}` : ""}.`, link: saved.id ? `/contracts?contract=${encodeURIComponent(saved.id)}` : "/contracts" }; },
  },
  {
    key: "update_contract",
    title: "Change a contract",
    description: "Change a contract's status, value, name or dates. Only the fields given change.",
    module: "/contracts",
    gate: "write",
    fields: {
      contract: { type: "string", description: "Contract name, reference (FR-C-...) or id." },
      status: { type: "string", description: "Draft, Ready for delivery, Signed or Cancelled." },
      value: { type: "number", description: "New total value in USD." },
      name: { type: "string", description: "New name." },
      signedOn: { type: "string", description: "Signing date." },
      startDate: { type: "string", description: "Start date." },
      endDate: { type: "string", description: "End date." },
    },
    required: ["contract"],
    async prepare(params, ctx) {
      const found = await resolveContract(params.contract);
      if (!found.ok) return { error: found.error };
      const current = found.value.record as unknown as Params;
      const patch: Params = {}; const changes: string[] = [];
      if (str(params.status)) { const st = pickEnum(params.status, CONTRACT_STATUSES, "status"); if (!st.ok) return { error: st.error }; patch.status = st.value; changes.push(`mark it ${st.value}`); }
      if (params.value !== undefined && params.value !== null && params.value !== "") { const v = parseMoney(params.value); if (v === null) return { error: "The value must be a number." }; patch.value = v; changes.push(`set the value to ${money(v)}`); }
      if (str(params.name, 200)) { patch.name = str(params.name, 200); changes.push(`rename it "${patch.name}"`); }
      for (const k of ["signedOn", "startDate", "endDate"] as const) { if (str(params[k])) { const d = parseDay(params[k], new Date(), ctx.timeZone); if (!d) return { error: "I could not read that date." }; patch[k] = d; changes.push(`set the ${k === "signedOn" ? "signing" : k === "startDate" ? "start" : "end"} date to ${readableDay(d)}`); } }
      if (!changes.length) return { error: "Say what should change on the contract." };
      return { summary: `On the contract "${found.value.plain}" (${found.value.reference}): ${changes.join(", ")}.`, params: { contract: { ...current, ...patch }, id: found.value.id, name: (patch.name as string) ?? found.value.plain } };
    },
    call: (p) => ({ method: "POST", path: "/api/contracts", body: { op: "save", contract: p.contract } }),
    done: (p) => ({ text: `The contract "${p.name}" is updated.`, link: `/contracts?contract=${encodeURIComponent(String(p.id))}` }),
  },
  {
    key: "update_meeting",
    title: "Change a meeting",
    description: "Rename, retype, reschedule or re-point a meeting at another account. Only the fields given change.",
    module: "/meetings",
    gate: "write",
    fields: {
      meeting: { type: "string", description: "Meeting title or id." },
      title: { type: "string", description: "New title." },
      type: { type: "string", description: `New type: ${MEETING_TYPES.join(", ")}.` },
      when: { type: "string", description: "New date and time." },
      customer: { type: "string", description: "New account." },
    },
    required: ["meeting"],
    async prepare(params, ctx) {
      const m = await resolveMeeting(params.meeting);
      if (!m.ok) return { error: m.error };
      const patch: Params = {}; const changes: string[] = [];
      if (str(params.title, 200)) { patch.title = str(params.title, 200); changes.push(`retitle it "${patch.title}"`); }
      if (str(params.type)) { const t = pickEnum(params.type, MEETING_TYPES, "meeting type"); if (!t.ok) return { error: t.error }; patch.type = t.value; changes.push(`make it a ${t.value}`); }
      if (str(params.when)) { const d = parseDay(params.when, new Date(), ctx.timeZone); if (!d) return { error: "I could not read that date." }; patch.meetingAt = d; changes.push(`move it to ${readableDay(d)}`); }
      if (str(params.customer)) { const c = await resolveCustomer(params.customer); if (!c.ok) return { error: c.error }; patch.customer = c.value.name; patch.customerId = c.value.id; changes.push(`put it under ${c.value.name}`); }
      if (!changes.length) return { error: "Say what should change: the title, the type, the time or the account." };
      return { summary: `On the meeting "${m.value.plain}": ${changes.join(", ")}.`, params: { id: m.value.id, title: m.value.plain, patch } };
    },
    call: (p) => ({ method: "POST", path: "/api/meetings", body: { op: "update", id: p.id, patch: p.patch } }),
    done: (p) => ({ text: `The meeting "${(p.patch as Params).title ?? p.title}" is updated.`, link: `/meetings/${encodeURIComponent(String(p.id))}` }),
  },
  {
    key: "set_meeting_status",
    title: "Mark a meeting held or cancelled",
    description: "Set a meeting to planned, completed or cancelled.",
    module: "/meetings",
    gate: "write",
    fields: { meeting: { type: "string", description: "Meeting title or id." }, status: { type: "string", description: "planned, completed or cancelled." } },
    required: ["meeting", "status"],
    async prepare(params) {
      const m = await resolveMeeting(params.meeting);
      if (!m.ok) return { error: m.error };
      const st = pickEnum(params.status, ["planned", "completed", "cancelled"], "status");
      if (!st.ok) return { error: st.error };
      if (m.value.status === st.value) return { error: `"${m.value.plain}" is already ${st.value}.` };
      return { summary: `Mark the meeting "${m.value.plain}" as ${st.value}.`, params: { id: m.value.id, title: m.value.plain, status: st.value } };
    },
    call: (p) => ({ method: "POST", path: "/api/meetings", body: { op: "status", id: p.id, status: p.status } }),
    done: (p) => ({ text: `"${p.title}" is ${p.status}.`, link: `/meetings/${encodeURIComponent(String(p.id))}` }),
  },
  {
    key: "add_meeting_note",
    title: "Add a note to a meeting",
    description: "Record an outcome, a decision or a comment on a meeting.",
    module: "/meetings",
    gate: "write",
    fields: { meeting: { type: "string", description: "Meeting title or id." }, text: { type: "string", description: "The note, in the person's words." }, kind: { type: "string", description: "outcome, decision or comment. Defaults to comment." } },
    required: ["meeting", "text"],
    async prepare(params) {
      const m = await resolveMeeting(params.meeting);
      if (!m.ok) return { error: m.error };
      const text = str(params.text, 2000);
      if (!text) return { error: "What should the note say?" };
      const kind = str(params.kind) ? pickEnum(params.kind, ["outcome", "decision", "comment"], "note kind") : { ok: true as const, value: "comment" };
      if (!kind.ok) return { error: kind.error };
      return { summary: `Add ${kind.value === "comment" ? "a note" : `an ${kind.value}`} to "${m.value.plain}": "${text}"`, params: { id: m.value.id, title: m.value.plain, text, kind: kind.value } };
    },
    call: (p) => ({ method: "POST", path: "/api/meetings", body: { op: "add-note", id: p.id, kind: p.kind, text: p.text } }),
    done: (p) => ({ text: `The note is on "${p.title}".`, link: `/meetings/${encodeURIComponent(String(p.id))}` }),
  },

  /* ------------------ Accruals, customer groups, accounts, market intel */
  {
    key: "freeze_accrual_month",
    title: "Freeze a month of accruals",
    description: "Lock a reporting month so its accrual figures stop moving. Admin.",
    module: "/opportunities",
    gate: "create",
    fields: { month: { type: "string", description: "The month as YYYY-MM, e.g. 2026-09." } },
    required: ["month"],
    async prepare(params) {
      const month = str(params.month, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Give the month as YYYY-MM, like 2026-09." };
      return { summary: `Freeze the accrual figures for ${month}.`, params: { month } };
    },
    call: (p) => ({ method: "POST", path: "/api/revenue-accruals", body: { op: "freeze", month: p.month } }),
    done: (p) => ({ text: `${p.month} is frozen.`, link: "/opportunities?tab=accrual" }),
  },
  {
    key: "unfreeze_accrual_month",
    title: "Unfreeze a month of accruals",
    description: "Unlock a frozen reporting month. Admin.",
    module: "/opportunities",
    gate: "create",
    fields: { month: { type: "string", description: "The month as YYYY-MM." } },
    required: ["month"],
    async prepare(params) {
      const month = str(params.month, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Give the month as YYYY-MM, like 2026-09." };
      return { summary: `Unfreeze the accrual figures for ${month}.`, params: { month } };
    },
    call: (p) => ({ method: "POST", path: "/api/revenue-accruals", body: { op: "unfreeze", month: p.month } }),
    done: (p) => ({ text: `${p.month} is unfrozen.`, link: "/opportunities?tab=accrual" }),
  },
  {
    key: "create_customer_group",
    title: "Create a customer group",
    description: "Start a new customer group, optionally with accounts in it.",
    module: "/customers",
    gate: "create",
    fields: { name: { type: "string", description: "Group name." }, description: { type: "string", description: "What it is for." }, customers: { type: "array", items: { type: "string" }, description: "Accounts to put in it." } },
    required: ["name"],
    async prepare(params) {
      const name = str(params.name, 120);
      if (!name) return { error: "What should the group be called?" };
      const ids: string[] = []; const names: string[] = [];
      for (const q of list(params.customers)) { const c = await resolveCustomer(q); if (!c.ok) return { error: c.error }; ids.push(c.value.id); names.push(c.value.name); }
      const description = str(params.description, 300) || undefined;
      return { summary: `Create the customer group "${name}"${names.length ? ` with ${names.join(", ")}` : ""}.`, params: { name, ...(description ? { description } : {}), customerIds: ids } };
    },
    call: (p) => ({ method: "POST", path: "/api/customer-groups", body: { op: "create", name: p.name, ...(p.description ? { description: p.description } : {}), customerIds: p.customerIds } }),
    done: (p) => ({ text: `The customer group "${p.name}" exists.`, link: "/customers" }),
  },
  {
    key: "update_customer_group",
    title: "Rename a customer group",
    description: "Change a customer group's name or description.",
    module: "/customers",
    gate: "write",
    fields: { group: { type: "string", description: "Group name or id." }, name: { type: "string", description: "New name." }, description: { type: "string", description: "New description." } },
    required: ["group"],
    async prepare(params) {
      const g = await resolveCustomerGroup(params.group);
      if (!g.ok) return { error: g.error };
      const patch: Params = {}; const changes: string[] = [];
      if (str(params.name, 120)) { patch.name = str(params.name, 120); changes.push(`rename it "${patch.name}"`); }
      if (str(params.description, 300)) { patch.description = str(params.description, 300); changes.push("change its description"); }
      if (!changes.length) return { error: "Say what should change: the name or the description." };
      return { summary: `On the customer group "${g.value.name}": ${changes.join(" and ")}.`, params: { id: g.value.id, name: (patch.name as string) ?? g.value.name, patch } };
    },
    call: (p) => ({ method: "POST", path: "/api/customer-groups", body: { op: "update", id: p.id, patch: p.patch } }),
    done: (p) => ({ text: `The customer group "${p.name}" is updated.`, link: "/customers" }),
  },
  {
    key: "add_customer_to_group",
    title: "Put an account in a customer group",
    description: "Add one account to a customer group.",
    module: "/customers",
    gate: "write",
    fields: { group: { type: "string", description: "Group name or id." }, customer: { type: "string", description: "Account name or id." } },
    required: ["group", "customer"],
    async prepare(params) {
      const g = await resolveCustomerGroup(params.group);
      if (!g.ok) return { error: g.error };
      const c = await resolveCustomer(params.customer);
      if (!c.ok) return { error: c.error };
      if (g.value.customerIds.includes(c.value.id)) return { error: `${c.value.name} is already in "${g.value.name}".` };
      return { summary: `Put ${c.value.name} in the customer group "${g.value.name}".`, params: { id: g.value.id, group: g.value.name, customerId: c.value.id, customer: c.value.name } };
    },
    call: (p) => ({ method: "POST", path: "/api/customer-groups", body: { op: "toggle-member", id: p.id, customerId: p.customerId } }),
    done: (p) => ({ text: `${p.customer} is in "${p.group}".`, link: "/customers" }),
  },
  {
    key: "remove_customer_from_group",
    title: "Take an account out of a customer group",
    description: "Remove one account from a customer group. The account itself is untouched.",
    module: "/customers",
    gate: "write",
    fields: { group: { type: "string", description: "Group name or id." }, customer: { type: "string", description: "Account name or id." } },
    required: ["group", "customer"],
    async prepare(params) {
      const g = await resolveCustomerGroup(params.group);
      if (!g.ok) return { error: g.error };
      const c = await resolveCustomer(params.customer);
      if (!c.ok) return { error: c.error };
      if (!g.value.customerIds.includes(c.value.id)) return { error: `${c.value.name} is not in "${g.value.name}".` };
      return { summary: `Take ${c.value.name} out of the customer group "${g.value.name}".`, params: { id: g.value.id, group: g.value.name, customerId: c.value.id, customer: c.value.name } };
    },
    call: (p) => ({ method: "POST", path: "/api/customer-groups", body: { op: "toggle-member", id: p.id, customerId: p.customerId } }),
    done: (p) => ({ text: `${p.customer} is out of "${p.group}".`, link: "/customers" }),
  },
  {
    key: "update_customer",
    title: "Change an account's details",
    description: "Change an account's name, website, industry, location, customer type, revenue or main competitor. Only the fields given change.",
    module: "/customers",
    gate: "write",
    fields: {
      customer: { type: "string", description: "Account name or id." },
      name: { type: "string", description: "New account name." },
      website: { type: "string", description: "Website." },
      industry: { type: "string", description: "Industry." },
      location: { type: "string", description: "HQ location." },
      customerType: { type: "string", description: "Customer type." },
      revenue: { type: "string", description: "Revenue, as text." },
      competitor: { type: "string", description: "Main competitor." },
    },
    required: ["customer"],
    async prepare(params) {
      const c = await customerForWrite(params.customer);
      if (!c.ok) return { error: c.error };
      const patch: Params = {}; const changes: string[] = [];
      const map: [keyof typeof params, string, string][] = [["name", "company_name", "name"], ["website", "website_url", "website"], ["industry", "industry", "industry"], ["location", "geography", "location"], ["customerType", "customer_type", "customer type"], ["revenue", "revenue", "revenue"], ["competitor", "competitor", "competitor"]];
      for (const [from, to, label] of map) { const v = str(params[from], 500); if (v) { patch[to] = v; changes.push(`${label} to "${v}"`); } }
      if (!changes.length) return { error: "Say what should change on the account." };
      return { summary: `On ${c.value.name}: set ${changes.join(", ")}.`, params: { id: c.value.id, name: (patch.company_name as string) ?? c.value.name, patch } };
    },
    call: (p) => ({ method: "PATCH", path: `/api/customers/${encodeURIComponent(String(p.id))}`, body: p.patch as Params }),
    done: (p) => ({ text: `${p.name} is updated.`, link: `/customers/${encodeURIComponent(String(p.id))}` }),
  },
  {
    key: "add_customer_note",
    title: "Add a note to an account",
    description: "Record a call, email, meeting or note on the ACCOUNT's own timeline, with an optional next step. Needs no contact: use this whenever the person names the company but not a specific person there. (To log a touch with a named contact, use log_touch.)",
    module: "/customers",
    gate: "write",
    fields: { customer: { type: "string", description: "Account name or id." }, text: { type: "string", description: "The note, in the person's words." }, kind: { type: "string", description: "call, email, meeting or note. Defaults to note." }, nextStep: { type: "string", description: "The next step, if said." } },
    required: ["customer", "text"],
    async prepare(params) {
      const c = await customerForWrite(params.customer);
      if (!c.ok) return { error: c.error };
      const text = str(params.text, 2000);
      if (!text) return { error: "What should the note say?" };
      const kind = str(params.kind) ? pickEnum(params.kind, ["call", "email", "meeting", "note"], "kind") : { ok: true as const, value: "note" };
      if (!kind.ok) return { error: kind.error };
      const nextStep = str(params.nextStep, 300) || undefined;
      return { summary: `Add a ${kind.value} to ${c.value.name}'s timeline: "${text}"${nextStep ? ` Next step: ${nextStep}.` : ""}`, params: { id: c.value.id, name: c.value.name, text, kind: kind.value, ...(nextStep ? { nextStep } : {}) } };
    },
    call: (p) => ({ method: "PATCH", path: `/api/customers/${encodeURIComponent(String(p.id))}`, body: { addNote: { body: p.text, kind: p.kind, ...(p.nextStep ? { next_step: p.nextStep } : {}) } } }),
    done: (p) => ({ text: `The ${p.kind} is on ${p.name}'s timeline.`, link: `/customers/${encodeURIComponent(String(p.id))}` }),
  },
  {
    key: "track_company",
    title: "Track a new company in Market Intel",
    description: "Add a company to the Market Intel catalogue and start following its news. Adding a company nobody tracks yet starts paid collection, so only when asked.",
    module: "/market-intel",
    gate: "write",
    fields: { name: { type: "string", description: "Company name." }, website: { type: "string", description: "Its website, if known." }, group: { type: "string", description: "customer or competitor. Defaults to customer." } },
    required: ["name"],
    async prepare(params) {
      const name = str(params.name, 120);
      if (!name) return { error: "Which company?" };
      const existing = await resolveTrackedCompany(name);
      if (existing.ok) return { error: `${existing.value.name} is already tracked. Star it to add it to your list.` };
      const group = str(params.group) ? pickEnum(params.group, ["customer", "competitor"], "group") : { ok: true as const, value: "customer" };
      if (!group.ok) return { error: group.error };
      const website = str(params.website, 300) || undefined;
      return { summary: `Track ${name} in Market Intel as a ${group.value}${website ? ` (${website})` : ""}. This starts collecting its news, which costs money.`, params: { name, group: group.value, ...(website ? { website } : {}) } };
    },
    call: (p) => ({ method: "POST", path: "/api/market-intel/tracking", body: { kind: "company", name: p.name, group: p.group, ...(p.website ? { website: p.website } : {}) } }),
    done: (p) => ({ text: `${p.name} is now tracked in Market Intel.`, link: "/market-intel" }),
  },
  {
    key: "remove_from_my_list",
    title: "Take a company off your Market Intel list",
    description: "Stop following a company yourself. It stays in the catalogue for everyone else.",
    module: "/market-intel",
    gate: "write",
    fields: { company: { type: "string", description: "Company name or id." } },
    required: ["company"],
    async prepare(params) {
      const c = await resolveTrackedCompany(params.company);
      if (!c.ok) return { error: c.error };
      return { summary: `Take ${c.value.name} off your Market Intel list. Everyone else keeps it.`, params: { id: c.value.id, name: c.value.name } };
    },
    call: (p) => ({ method: "PUT", path: "/api/market-intel/bookmarks", body: { changes: [{ id: p.id, on: false, star: false }] } }),
    done: (p) => ({ text: `${p.name} is off your list.`, link: "/market-intel" }),
  },

  /* --------------------------------------------- Accrual plan by chat */
  {
    /* Anir, Sep 28: "accrual plan by chat sounds good too." A plan is the
       months a deal's money lands in. Said as a sentence it is either a spread
       ("$120K across January to June 2027, evenly") or a list ("Jan 30K, Feb
       20K, then 10K a month to June"). The proposal always prints every month
       with its amount, because a schedule is the one thing a person should
       read line by line before saying yes. Amounts are USD, which is the
       rule for accruals everywhere in the app. */
    key: "set_accrual_plan",
    title: "Plan the months a deal's revenue lands in",
    description: "Create or replace a deal's revenue accrual plan: the total in USD and which months it lands in, spread evenly or with amounts named per month. Replaces the plan's months if one already exists.",
    module: "/revenue-accruals",
    gate: "write",
    fields: {
      opportunity: { type: "string", description: "Deal name, id or OPP reference." },
      total: { type: "number", description: "Total to schedule, in USD. Omit to use the deal's estimated TCV when the deal is in USD." },
      from: { type: "string", description: "First month, e.g. 'January 2027'." },
      to: { type: "string", description: "Last month, e.g. 'June 2027'. Give this or months." },
      months: { type: "number", description: "How many months from the first month, if no last month was given." },
      amounts: { type: "array", items: { type: "string" }, description: "ONLY when the person named an amount for a specific month, as 'January 2027: 30000'. Leave empty for an even spread; never work out the per-month figure yourself." },
      note: { type: "string", description: "Only a note the person asked to record on the plan. Never restate the amounts or the spread here." },
    },
    required: ["opportunity", "from"],
    async prepare(params, ctx) {
      const opp = await resolveOpportunity(params.opportunity);
      if (!opp.ok) return { error: opp.error };
      const record = (await readOpportunities()).opportunities.find((o) => o.id === opp.value.id);
      if (!record) return { error: "That deal is gone." };
      const dealCurrency = (record.currency || "USD").toUpperCase();
      let total = params.total === undefined || params.total === null || params.total === "" ? null : parseMoney(params.total);
      if (params.total !== undefined && params.total !== null && params.total !== "" && total === null) return { error: "The total must be a number, in USD." };
      if (total === null) {
        const tcv = estimatedTcvOf(record);
        if (!tcv) return { error: `What total should the plan carry, in USD? "${opp.value.name}" has no estimated TCV to fall back on.` };
        if (dealCurrency !== "USD") return { error: `"${opp.value.name}" is in ${dealCurrency}. Accrual plans are kept in USD, so say the USD total to schedule.` };
        total = tcv;
      }
      if (total <= 0) return { error: "The total has to be more than zero." };
      const firstDay = parseDay(params.from, new Date(), ctx.timeZone);
      if (!firstDay) return { error: "Which month does it start? Say it like 'January 2027'." };
      const ym = (day: string) => day.slice(0, 7);
      const addMonths = (yearMonth: string, n: number) => { const [y, m] = yearMonth.split("-").map(Number); const idx = y * 12 + (m - 1) + n; return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`; };
      const first = ym(firstDay);
      let count = 0;
      if (str(params.to)) {
        const lastDay = parseDay(params.to, new Date(), ctx.timeZone);
        if (!lastDay) return { error: "Which month does it end? Say it like 'June 2027'." };
        const last = ym(lastDay);
        const [fy, fm] = first.split("-").map(Number); const [ly, lm] = last.split("-").map(Number);
        count = (ly * 12 + lm) - (fy * 12 + fm) + 1;
        if (count < 1) return { error: "The last month is before the first one." };
      } else if (Number(str(params.months, 4)) > 0) {
        count = Math.floor(Number(str(params.months, 4)));
      } else {
        return { error: "How many months, or which month does it end?" };
      }
      if (count > 60) return { error: "That is more than five years of months. Say a shorter range." };
      const months = Array.from({ length: count }, (_, k) => addMonths(first, k));
      /* Named amounts pin their months; the rest share what is left, evenly,
         in whole dollars, the odd dollars on the last open month. */
      const pinned = new Map<string, number>();
      /* WHATEVER SHAPE THE MONTHS ARRIVE IN. The schema says "Month: amount"
         strings; the model has sent bare numbers, and may send objects or a
         map. All of them are read; only ambiguity is refused. */
      const raw = params.amounts;
      const entries: string[] = Array.isArray(raw)
        ? raw.map((e) => (e && typeof e === "object" && !Array.isArray(e)
            ? `${str((e as Params).month ?? (e as Params).label ?? (e as Params).name, 40)}: ${str((e as Params).amount ?? (e as Params).value, 40)}`
            : str(e, 200))).filter(Boolean)
        : raw && typeof raw === "object" ? Object.entries(raw as Params).map(([k, v]) => `${k}: ${str(v, 40)}`)
        : list(raw);
      /* BARE NUMBERS ARE POSITIONAL. Asked for an even spread, the model
         worked out the per-month figure itself and sent ["20000"], and the
         parser refused it (first live check, Sep 28). One bare number is the
         figure for every month; a full list is month by month, in order. */
      const bare = entries.length > 0 && entries.every((e) => !/[:=]/.test(e) && parseMoney(e) !== null);
      if (bare) {
        if (entries.length !== 1 && entries.length !== months.length) return { error: `${entries.length} amounts for ${months.length} months. Name the months, like "January 2027: 30000", or give one figure for all of them.` };
        months.forEach((month, k) => pinned.set(month, parseMoney(entries[entries.length === 1 ? 0 : k])!));
      }
      for (const entry of bare ? [] : entries) {
        const m = entry.match(/^(.*?)[:=]\s*([\s\S]+)$/);
        if (!m) return { error: `I could not read "${entry}". Say it like "January 2027: 30000".` };
        const day = parseDay(m[1].trim(), new Date(), ctx.timeZone);
        const amt = parseMoney(m[2].trim());
        if (!day || amt === null || amt < 0) return { error: `I could not read "${entry}". Say it like "January 2027: 30000".` };
        const key = ym(day);
        if (!months.includes(key)) return { error: `${m[1].trim()} is outside ${readableMonth(first)} to ${readableMonth(months[months.length - 1])}.` };
        pinned.set(key, amt);
      }
      const pinnedTotal = [...pinned.values()].reduce((a, b) => a + b, 0);
      if (pinnedTotal > total) return { error: `The named months add up to ${money(pinnedTotal)}, more than the ${money(total)} total.` };
      const open = months.filter((m) => !pinned.has(m));
      const remainder = total - pinnedTotal;
      if (!open.length && remainder !== 0) return { error: `The months add up to ${money(pinnedTotal)}, not the ${money(total)} total. Say which is right.` };
      const share = open.length ? Math.floor(remainder / open.length) : 0;
      const lines = months.map((month, k) => ({ month, amount: pinned.has(month) ? pinned.get(month)! : share }));
      if (open.length) { const lastOpen = open[open.length - 1]; const line = lines.find((l) => l.month === lastOpen)!; line.amount += remainder - share * open.length; }
      const existing = (await readRevenueAccruals()).plans.find((pl) => pl.opportunityId === opp.value.id);
      const schedule = lines.map((l) => `${readableMonth(l.month)} ${money(l.amount)}`).join(", ");
      const note = str(params.note, 600) || undefined;
      return {
        summary: `${existing ? "Replace" : "Set"} the accrual plan on "${opp.value.name}": ${money(total)} over ${count} ${count === 1 ? "month" : "months"}: ${schedule}.${note ? ` Note: ${note}` : ""}`,
        params: { opportunityId: opp.value.id, opportunityName: opp.value.name, customer: record.customer, customerId: record.customerId, contractValue: total, lines, ...(record.estSignDate ? { signDateAtPlan: record.estSignDate } : {}), ...(note ? { note } : {}), months: count },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/revenue-accruals", body: { op: "save", plan: { opportunityId: p.opportunityId, opportunityName: p.opportunityName, /* offering backfilled from the deal by saveAccrualPlan */ customer: p.customer, customerId: p.customerId, contractValue: p.contractValue, lines: p.lines, ...(p.signDateAtPlan ? { signDateAtPlan: p.signDateAtPlan } : {}), ...(p.note ? { note: p.note } : {}) } } }),
    done: (p) => ({ text: `"${p.opportunityName}" now has a ${p.months}-month accrual plan for ${money(Number(p.contractValue))}.`, link: `/opportunities/${encodeURIComponent(String(p.opportunityId))}?tab=revenueAccruals` }),
  },

];

export const ACTION_BY_KEY = new Map(ACTIONS.map((a) => [a.key, a]));

/** The tool schema the model sees: one tool, the action key and its params. */
export function proposeActionTool() {
  return {
    name: "propose_action",
    description:
      "Propose ONE change to the workspace for the person to confirm. Use after finding the exact records with the read tools. Nothing changes until they confirm; never say it is done. Actions: " +
      ACTIONS.map((a) => `${a.key} (${a.title}: ${Object.keys(a.fields).join(", ")}; required ${a.required.join(", ")})`).join("; ") +
      ".",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ACTIONS.map((a) => a.key) },
        params: {
          type: "object",
          description: "The action's parameters by name. Names and ids exactly as the read tools returned them.",
        },
      },
      required: ["action", "params"],
    },
  };
}

export function runActionTool() {
  return {
    name: "run_action",
    description:
      "Carry out a proposal the person has confirmed in THIS message (they said yes, go ahead, do it). Only for a proposal id from an earlier turn. Never call it in the same turn as propose_action.",
    input_schema: {
      type: "object",
      properties: { proposalId: { type: "string" } },
      required: ["proposalId"],
    },
  };
}

export type ProposeResult = { ok: true; proposal: ActionProposal } | { ok: false; error: string };

/** Resolve, ask the module question, store. The route decides the rest at execution. */
export async function proposeAction(key: string, rawParams: unknown, ctx: ActionContext): Promise<ProposeResult> {
  const def = ACTION_BY_KEY.get(key);
  if (!def) return { ok: false, error: `Unknown action "${key}".` };
  const params = (rawParams && typeof rawParams === "object" ? rawParams : {}) as Params;
  for (const field of def.required) {
    if (params[field] === undefined || params[field] === null || params[field] === "") {
      return { ok: false, error: `${def.title} needs ${field}.` };
    }
  }
  const refusal = def.gate === "create" ? await moduleCreateRefusal(def.module) : await moduleWriteRefusal(def.module);
  if (refusal) return { ok: false, error: refusal };
  let prepared: Prepared | { error: string };
  try {
    prepared = await def.prepare(params, ctx);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not prepare that." };
  }
  if ("error" in prepared) return { ok: false, error: prepared.error };
  const proposal = await addProposal(ctx.scope, {
    id: shortId(),
    action: def.key,
    params: { ...prepared.params, ...(prepared.customerId ? { __customerId: prepared.customerId, __company: prepared.company } : {}) },
    summary: prepared.summary,
    channel: ctx.channel,
    ...(ctx.conversationId ? { conversationId: ctx.conversationId } : {}),
  });
  return { ok: true, proposal };
}

export type ExecuteResult = { ok: true; text: string; link?: string; proposal: ActionProposal } | { ok: false; error: string; proposal: ActionProposal | null };

/**
 * Do it, as the person, through the route. `notBefore` is the start of the
 * request carrying the confirmation: a proposal made during that same
 * request has not been seen by anyone yet and is refused.
 */
export async function executeProposal(id: string, ctx: ActionContext, notBefore?: number): Promise<ExecuteResult> {
  const proposal = await getProposal(ctx.scope, id);
  if (!proposal) return { ok: false, error: "I do not have a proposal with that id.", proposal: null };
  if (proposal.status !== "proposed") return { ok: false, error: `That proposal is ${proposal.status}; ask for it again if you still want it.`, proposal };
  if (notBefore !== undefined && proposal.createdAt >= notBefore) {
    return { ok: false, error: "The person has not confirmed this yet. Show them the proposal and wait for their answer.", proposal };
  }
  const def = ACTION_BY_KEY.get(proposal.action);
  if (!def) return { ok: false, error: "That action no longer exists.", proposal };
  const { __customerId, __company, ...params } = proposal.params as Params & { __customerId?: string; __company?: string };
  const call = def.call(params);
  if ("local" in call) {
    try {
      const data = await call.local(ctx);
      const outcome = def.done(params, data);
      const done = await updateProposal(ctx.scope, id, { status: "done", result: outcome.text, link: outcome.link, decidedAt: Date.now() });
      await logRun(ctx, proposal, true, outcome.text, __customerId, __company);
      return { ok: true, text: outcome.text, link: outcome.link, proposal: done ?? proposal };
    } catch (error) {
      const message = error instanceof Error ? error.message : "That did not save.";
      const failed = await updateProposal(ctx.scope, id, { status: "failed", error: message, decidedAt: Date.now() });
      await logRun(ctx, proposal, false, message, __customerId, __company);
      return { ok: false, error: message, proposal: failed ?? proposal };
    }
  }
  let response: Response;
  try {
    response = await fetch(`${ctx.internalOrigin}${call.path}`, {
      method: call.method,
      headers: { "Content-Type": "application/json", Cookie: ctx.cookie },
      body: JSON.stringify(call.body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The app did not answer.";
    const failed = await updateProposal(ctx.scope, id, { status: "failed", error: message, decidedAt: Date.now() });
    return { ok: false, error: message, proposal: failed ?? proposal };
  }
  const data = ((await response.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof data.error === "string" && data.error ? data.error : `The app refused (HTTP ${response.status}).`;
    const failed = await updateProposal(ctx.scope, id, { status: "failed", error: message, decidedAt: Date.now() });
    await logRun(ctx, proposal, false, message, __customerId, __company);
    return { ok: false, error: message, proposal: failed ?? proposal };
  }
  const outcome = def.done(params, data);
  const done = await updateProposal(ctx.scope, id, { status: "done", result: outcome.text, link: outcome.link, decidedAt: Date.now() });
  await logRun(ctx, proposal, true, outcome.text, __customerId, __company);
  return { ok: true, text: outcome.text, link: outcome.link, proposal: done ?? proposal };
}

export async function cancelProposal(id: string, ctx: ActionContext): Promise<ActionProposal | null> {
  const proposal = await getProposal(ctx.scope, id);
  if (!proposal || proposal.status !== "proposed") return proposal;
  return updateProposal(ctx.scope, id, { status: "cancelled", decidedAt: Date.now() });
}

/** Every confirmed action leaves a line in Agent runs: who, what, result. */
async function logRun(ctx: ActionContext, proposal: ActionProposal, ok: boolean, text: string, customerId?: string, company?: string) {
  try {
    await getDb().agentRuns.create({
      kind: "act",
      created_by_user_id: ctx.scope.userId,
      created_by: ctx.actorName,
      title: proposal.summary,
      ...(customerId ? { customer_id: customerId, company } : {}),
      outcome: ok ? "handled" : "escalated",
      summary: ok ? `${text} Confirmed by ${ctx.actorName} via ${ctx.channel === "whatsapp" ? "WhatsApp" : "the agent"}.` : `Not done: ${text}`,
      steps: [
        { label: "Proposed by the agent", status: "done" },
        { label: `Confirmed by ${ctx.actorName}`, status: "done" },
        { label: ok ? "Done" : "Refused by the app", status: ok ? "done" : "escalated" },
      ],
      interaction_ids: [],
    });
  } catch (error) {
    console.error("[agent-actions] run log failed", error);
  }
}

/** Every module an action can touch, once each, for telling the model what the person may do there. */
export const ACTION_MODULES: string[] = [...new Set(ACTIONS.map((a) => a.module))];

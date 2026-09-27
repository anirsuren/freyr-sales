import "server-only";
import { getDb } from "@/lib/db";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { readPerformance } from "@/lib/performance";
import { readOpportunities } from "@/lib/opportunities";
import { readLeads } from "@/lib/leads";
import { LEAD_STATUSES } from "@/lib/leadsShared";
import { OPPORTUNITY_LEVELS, OPPORTUNITY_STATUSES } from "@/lib/opportunitiesShared";
import { MEETING_TYPES } from "@/lib/meetings";
import { readRecordTeams, teamFor } from "@/lib/recordTeams";
import { readCustomerGroups } from "@/lib/customerGroups";
import { readMarketIntelTracking } from "@/lib/marketIntelTracking";
import { moduleCreateRefusal, moduleWriteRefusal, recordWriteRefusal } from "@/lib/moduleAccessServer";
import { addProposal, getProposal, updateProposal } from "@/lib/agentActionStore";
import {
  matchOne,
  parseDay,
  parseMoney,
  shortId,
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
  | { method: "POST" | "PUT" | "PATCH"; path: string; body: unknown }
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

/* ------------------------------------------------------------------------ */
/* Lookups: names to records, always against what the workspace holds now.  */
/* ------------------------------------------------------------------------ */

type Person = { id: string; name: string; role: string };

async function people(ctx: ActionContext): Promise<Person[]> {
  const directory = await listWorkspaceAccess(ctx.scope.workspaceId);
  return directory.members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name, role: m.role }));
}

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
  return matchOne(str(query, 200), tracking.companies.map((c) => ({ id: c.id, name: c.name })), "company");
}

/** A logged goal result that is still open: by its id, or the newest one for a person on a goal. */
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
  if (!contacts.length) return { ok: false, error: `${customerName} has no contacts yet, and a timeline entry needs one. Add a contact first.` };
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
    done: (p) => ({ text: `${p.person} is now on the goal "${p.goalName}".`, link: "/performance" }),
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
    done: (p) => ({ text: `${p.person} is no longer on the goal "${p.goalName}".`, link: "/performance" }),
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
        summary: `Log ${amount.toLocaleString("en-US")} for ${person.value.name} on "${goal.value.name}"${customer ? ` from ${customer.name}` : ""}${date ? ` dated ${date}` : ""}. It will wait for verification.`,
        params: { goalId: goal.value.id, goalName: goal.value.name, person: person.value.name, amount, ...(customer ? { customer: customer.name, customerId: customer.id } : {}), ...(date ? { date } : {}), ...(str(params.note) ? { note: str(params.note, 500) } : {}) },
        ...(customer ? { customerId: customer.id, company: customer.name } : {}),
      };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "log-actual", goalId: p.goalId, person: p.person, amount: p.amount, customer: p.customer, customerId: p.customerId, date: p.date, note: p.note } }),
    done: (p) => ({ text: `Logged ${Number(p.amount).toLocaleString("en-US")} for ${p.person} on "${p.goalName}". It is reported and waits for verification.`, link: "/performance" }),
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
      if (str(params.status)) {
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
    call: (p) => ({ method: "POST", path: `/api/customers/${encodeURIComponent(String(p.customerId))}/contacts`, body: { full_name: p.full_name, title: p.title, email: p.email, phone: p.phone, linkedin_url: p.linkedin_url } }),
    done: (p) => ({ text: `${p.full_name} is now a contact at ${p.customer}.`, link: `/customers/${encodeURIComponent(String(p.customerId))}` }),
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
    done: (p) => ({ text: `Updated lead ${p.label}.`, link: "/leads" }),
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
    async prepare(params) {
      const company = await resolveTrackedCompany(params.company);
      if (!company.ok) return { error: company.error };
      const star = params.star !== false && String(params.star).toLowerCase() !== "false";
      return { summary: `${star ? "Star" : "Unstar"} ${company.value.name} in Market Intel for you.`, params: { id: company.value.id, name: company.value.name, star } };
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
        params: { actualId: entry.value.id, label: entryLabel(entry.value, goalName) },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "verify-actual", actualId: p.actualId } }),
    done: (p) => ({ text: `Verified ${p.label}.`, link: "/performance" }),
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
        params: { actualId: entry.value.id, note, label: entryLabel(entry.value, goalName) },
      };
    },
    call: (p) => ({ method: "POST", path: "/api/performance", body: { op: "send-back-actual", actualId: p.actualId, note: p.note } }),
    done: (p) => ({ text: `Sent back ${p.label}.`, link: "/performance" }),
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
      owner: { type: "string", description: "Owner (a BD member); defaults to the person asking." },
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
      if (!neededBy) return { error: "When is it needed by? Give a date (YYYY-MM-DD)." };
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
        summary: `Raise a solutioning request for a ${kind.value} at ${customer.value.name}: "${title}"${neededBy ? `, needed by ${neededBy}` : ""}${priority ? `, ${priority} priority` : ""}${opportunityLabels ? `, for the deal ${opportunityLabels[0]}` : ""}.`,
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
        summary: `Set a follow-up with ${customer.value.name} (${contact.value.name}) for ${when.iso}${str(params.note) ? ` (${str(params.note, 200)})` : ""}.`,
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
    description: "Record a past touch with a customer account on its timeline: what happened and how it went.",
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
      const contact = await contactForTimeline(customer.value.id, customer.value.name, params.contact);
      if (!contact.ok) return { error: contact.error };
      const notes = str(params.notes, 4000);
      if (!notes) return { error: "What happened?" };
      const outcome = ["interested", "meeting_booked", "in_progress"].includes(str(params.outcome)) ? str(params.outcome) : "in_progress";
      return {
        summary: `Log on ${customer.value.name}'s timeline (${contact.value.name}): "${notes.slice(0, 140)}${notes.length > 140 ? "…" : ""}" (${outcome.replace("_", " ")}).`,
        params: { customerId: customer.value.id, customer: customer.value.name, contactId: contact.value.id, notes, outcome },
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
          outcome: String(p.outcome) as "interested" | "meeting_booked" | "in_progress",
          notes: String(p.notes),
          follow_up_date: null,
          logged_by: ctx.actorName,
        });
        return { interactionId: interaction.id };
      },
    }),
    done: (p) => ({ text: `Logged on ${p.customer}'s timeline.`, link: `/customers/${encodeURIComponent(String(p.customerId))}` }),
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

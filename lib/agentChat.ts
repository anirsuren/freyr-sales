// The agent's chat brain. Given a message + live pipeline context, it decides
// whether to ANSWER (grounded, plain-English) or to DO something real — save a
// draft to an account, set a follow-up, log a call. When ANTHROPIC_API_KEY is
// set the route uses Claude as the primary voice for answers; this brain still
// drives the actions (so they're reliable) and is the always-on fallback so the
// chat never goes silent. Human-led: it never sends anything outward on its own.
import type { Customer, Contact, Interaction, AgentRun, Outcome } from "./types";
import { type Deal, ROTTING_DAYS, formatMoney } from "./pipeline";
import { accountHealth } from "./health";

export interface ChatContext {
  customers: Customer[];
  contacts: Contact[];
  deals: Deal[];
  interactions: Interaction[];
  runs: AgentRun[];
  needsApproval: number;
  // Every focus action the agent can act on — `kind` lets us pick out the
  // specific pending approvals/pitches so the agent can name them, not just
  // count them.
  topActions: { title: string; rationale: string; kind: string; company: string }[];
}

// An action the agent can actually carry out in the app (a real write to the
// account timeline), as opposed to just talking. The route executes it and
// reports back exactly what happened — never claiming to send anything outward.
export type ChatAction =
  | { type: "save_draft"; customerId: string; company: string; body: string }
  | { type: "set_followup"; customerId: string; company: string; when: string; label: string }
  | { type: "log_touch"; customerId: string; company: string; notes: string; outcome: Outcome }
  | { type: "show_pitch"; customerId: string; company: string };

export interface ChatReply {
  text: string;
  suggestions: string[];
  action?: ChatAction;
}

const DEFAULT_SUGGESTIONS = [
  "What should I focus on today?",
  "Which deals are cooling?",
  "What's my open pipeline worth?",
];

function firstName(full: string) {
  return (
    full.replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, "").split(/\s+/)[0] || "there"
  );
}

// A markdown deep-link to an account — the chat renders it as a clickable link
// so a rep can jump straight to any account the agent names in a list.
function acctLink(company: string, customerId: string) {
  return `[${company}](/customers/${customerId})`;
}

// Find an account named in the message (full name first, then a distinctive
// first word like "Helix").
export function findAccount(msg: string, customers: Customer[]): Customer | null {
  const m = msg.toLowerCase();
  let best: Customer | null = null;
  let bestLen = 0;
  for (const c of customers) {
    const name = c.company_name.toLowerCase();
    if (m.includes(name) && name.length > bestLen) {
      best = c;
      bestLen = name.length;
    }
  }
  if (best) return best;
  for (const c of customers) {
    const w = c.company_name.split(/\s+/)[0].toLowerCase();
    if (w.length >= 4 && new RegExp(`\\b${w}\\b`).test(m)) return c;
  }
  return null;
}

// Find a CONTACT named in the message (full name first, then a distinctive last
// name like "Vogt"/"Mehta"). Contacts are objects too — a rep should be able to
// ask "tell me about Dr. Lena Vogt" and get the person, not a generic answer.
export function findContact(msg: string, contacts: Contact[]): Contact | null {
  const m = msg.toLowerCase();
  let best: Contact | null = null;
  let bestLen = 0;
  for (const c of contacts) {
    const name = c.full_name.toLowerCase();
    if (m.includes(name) && name.length > bestLen) {
      best = c;
      bestLen = name.length;
    }
  }
  if (best) return best;
  for (const c of contacts) {
    const parts = c.full_name
      .toLowerCase()
      .replace(/^(dr|mr|ms|mrs|prof)\.?\s+/, "")
      .split(/\s+/);
    const last = parts[parts.length - 1];
    if (last && last.length >= 4 && new RegExp(`\\b${last}\\b`).test(m)) return c;
  }
  return null;
}

// Pronouns / common words that follow to/about/with/for but are NOT a company.
const NOT_ACCOUNT_WORDS = new Set([
  "them", "they", "it", "that", "this", "the", "you", "me", "us", "him", "her",
  "my", "your", "our", "everyone", "anyone", "someone", "next", "today",
  "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday",
  "saturday", "sunday",
]);

// If the rep names a specific company that ISN'T one of their accounts (a typo,
// or an account they don't have), return that name so the agent can say so
// plainly instead of ignoring it. Conservative: only a Capitalized candidate
// after to/about/with/for/on, and never a known contact's name.
function namedUnknownAccount(
  message: string,
  customers: Customer[],
  contacts: Contact[]
): string | null {
  const mm = message.match(
    /\b(?:to|about|with|for|on)\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,3})/
  );
  if (!mm) return null;
  const cand = mm[1].trim().replace(/[.,!?]+$/, "").trim();
  if (cand.length < 3 || NOT_ACCOUNT_WORDS.has(cand.toLowerCase())) return null;
  if (findAccount(cand, customers)) return null; // it's actually a known account
  const lc = cand.toLowerCase();
  const first = lc.split(/\s+/)[0];
  if (
    contacts.some(
      (c) =>
        c.full_name.toLowerCase().includes(lc) ||
        c.full_name.toLowerCase().split(/\s+/)[0] === first
    )
  )
    return null; // it's a contact's name, not an unknown account
  return cand;
}

function snapshot(c: Customer, ctx: ChatContext) {
  const deals = ctx.deals.filter((d) => d.customerId === c.id);
  const open = deals.filter((d) => d.stage !== "Closed Lost");
  const openValue = open.reduce((s, d) => s + d.value, 0);
  const ints = ctx.interactions.filter((i) => i.customer_id === c.id);
  const contacts = ctx.contacts.filter((x) => x.customer_id === c.id);
  const health = accountHealth({
    interactions: ints,
    deals,
    contactCount: contacts.length,
  });
  const lastAt = ints[0]?.created_at || null;
  const cooling = open.some((d) => d.staleDays > ROTTING_DAYS);
  return { deals, open, openValue, ints, contacts, health, lastAt, cooling };
}

function fmtDate(iso: string | null) {
  if (!iso) return "no activity yet";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "recently";
  }
}

export type ChatTurn = { role: "user" | "agent"; text: string };

// The account most recently referenced in the conversation — lets follow-ups
// like "make it shorter" know who we're talking about.
function lastAccount(history: ChatTurn[], customers: Customer[]): Customer | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const a = findAccount(history[i].text, customers);
    if (a) return a;
  }
  return null;
}

// Pick a phrasing that shifts as the conversation goes, so the same ask never
// gets the exact same line twice in a row (kills the "canned bot" feel).
function vary<T>(options: T[], history: ChatTurn[]): T {
  const n = history.filter((t) => t.role === "agent").length;
  return options[n % options.length];
}

// Pull the draft block ("Subject: …") out of a previous agent message so we can
// save exactly what Suren saw.
function extractDraft(text: string): string | null {
  const i = text.search(/subject:/i);
  if (i === -1) return null;
  const body = text
    .slice(i)
    .replace(/\n+Want me to (make it shorter|change the tone)[\s\S]*$/i, "")
    .trim();
  return body || null;
}

// Turn a natural phrase ("next week", "in 3 days", "friday") into a concrete date.
export function parseWhen(msg: string): { iso: string; label: string } {
  const now = new Date();
  const add = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(9, 0, 0, 0);
    return d;
  };
  const m = msg.toLowerCase();
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const WORD_NUM: Record<string, number> = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2, few: 3,
  };
  const inN = m.match(
    /\bin (a|an|one|two|three|four|five|six|couple|few|\d+)\s*(day|week|month)s?\b/
  );
  // Explicit calendar dates: "June 30", "on Jun 30th", or "on the 30th".
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const md = m.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/
  );
  const dom = m.match(/\bthe (\d{1,2})(?:st|nd|rd|th)\b/);
  const fmtDay = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  let target = add(7);
  let label = "next week";
  if (/\btomorrow\b/.test(m)) {
    target = add(1);
    label = "tomorrow";
  } else if (/\btoday\b/.test(m)) {
    target = add(0);
    label = "today";
  } else if (/\b(end of (the )?week|by friday|this friday)\b/.test(m)) {
    const delta = (5 - now.getDay() + 7) % 7 || 7;
    target = add(delta);
    label = "Friday";
  } else if (/\bnext month\b/.test(m)) {
    target = add(30);
    label = "next month";
  } else if (/\bnext week\b/.test(m)) {
    target = add(7);
    label = "next week";
  } else if (inN) {
    const raw = inN[1];
    const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : WORD_NUM[raw] ?? 1;
    const mult = inN[2] === "week" ? 7 : inN[2] === "month" ? 30 : 1;
    target = add(n * mult);
    label = `in ${n} ${inN[2]}${n === 1 ? "" : "s"}`;
  } else if (md && MONTHS.indexOf(md[1]) >= 0 && +md[2] >= 1 && +md[2] <= 31) {
    const d = new Date(now.getFullYear(), MONTHS.indexOf(md[1]), +md[2], 9, 0, 0, 0);
    // If that date already passed this year, assume they mean next year.
    if (d.getTime() < now.getTime() - 86400000) d.setFullYear(d.getFullYear() + 1);
    target = d;
    label = fmtDay(d);
  } else if (dom && +dom[1] >= 1 && +dom[1] <= 31) {
    let d = new Date(now.getFullYear(), now.getMonth(), +dom[1], 9, 0, 0, 0);
    // If that day already passed this month, roll to next month.
    if (d.getTime() < now.getTime() - 86400000)
      d = new Date(now.getFullYear(), now.getMonth() + 1, +dom[1], 9, 0, 0, 0);
    target = d;
    label = fmtDay(d);
  } else {
    for (let i = 0; i < weekdays.length; i++) {
      if (new RegExp(`\\b${weekdays[i]}\\b`).test(m)) {
        const delta = (i - now.getDay() + 7) % 7 || 7;
        target = add(delta);
        label = weekdays[i][0].toUpperCase() + weekdays[i].slice(1);
        break;
      }
    }
  }
  return { iso: target.toISOString(), label };
}

// Build an outreach draft in a given length/tone.
function makeDraft(
  account: Customer,
  ctx: ChatContext,
  opts: { length?: "short" | "normal"; tone?: "warm" | "formal"; lead?: string } = {}
): ChatReply {
  const snap = snapshot(account, ctx);
  const ct = snap.contacts[0];
  const fn = ct ? firstName(ct.full_name) : "there";
  let body: string;
  if (opts.length === "short") {
    body =
      `Subject: Quick question on your submission timeline\n\n` +
      `Hi ${fn} — Freyr helps clinical-stage teams hit FDA/EMA timelines without adding headcount. Worth a quick call this week?\n\nBest,\nSuren Dheen · Freyr`;
  } else if (opts.tone === "formal") {
    body =
      `Subject: Supporting ${account.company_name}'s regulatory submissions\n\n` +
      `Dear ${ct?.full_name || "there"},\n\nFreyr's regulatory team supports clinical-stage organizations in meeting FDA and EMA submission timelines without additional headcount. I would welcome a brief call to determine whether this aligns with your near-term objectives.\n\nKind regards,\nSuren Dheen · Freyr`;
  } else {
    body =
      `Subject: A quick idea for your upcoming milestones\n\n` +
      `Hi ${fn},\n\nFreyr's regulatory team helps clinical-stage teams hit FDA/EMA submission timelines without adding headcount.${snap.cooling ? " It's been a little while since we connected, so it felt worth a short note." : ""} Worth a 20-minute call to see if it fits your near-term plans?\n\nBest,\nSuren Dheen · Freyr`;
  }
  return {
    text:
      `${opts.lead || `Here's a draft for ${account.company_name} — review and tweak before it goes out:`}\n\n${body}\n\n` +
      `Want me to make it shorter, change the tone, or save it as a draft on ${account.company_name}?`,
    suggestions: ["Make it shorter", "Make it more formal", `Tell me about ${account.company_name}`],
  };
}

// Resolve a described account ("a cooling account", "my most at-risk account",
// "my biggest deal") to the real best-matching customer, so the agent can act on
// a criterion instead of demanding an exact name. Returns the pick + a label so
// the reply can say which one it chose.
function criterionAccount(
  m: string,
  ctx: ChatContext
): { customer: Customer; label: string } | null {
  const open = ctx.deals.filter((d) => d.stage !== "Closed Lost");
  const custOf = (customerId: string) =>
    ctx.customers.find((c) => c.id === customerId) || null;

  // NB: no trailing \b on the stems — "cool" must also match "cooling"/"cools".
  if (/\b(cool|stall|cold|quiet|gone dark|going cold|dormant|rotting|losing momentum|slipping|neglect)/.test(m)) {
    const top = [...open]
      .filter((d) => d.staleDays > ROTTING_DAYS)
      .sort((a, b) => b.staleDays - a.staleDays)[0];
    const c = top && custOf(top.customerId);
    if (c) return { customer: c, label: "account that's been quiet longest" };
  }
  if (/\b(at.?risk|risk|churn|unhealthy|about to lose|in trouble|losing)\b/.test(m)) {
    const ranked = ctx.customers
      .map((c) => ({ c, score: snapshot(c, ctx).health.score }))
      .sort((a, b) => a.score - b.score)[0];
    if (ranked) return { customer: ranked.c, label: "most at-risk account" };
  }
  if (/\b(biggest|largest|top deal|most valuable|highest value)\b/.test(m)) {
    const top = [...open].sort((a, b) => b.value - a.value)[0];
    const c = top && custOf(top.customerId);
    if (c) return { customer: c, label: "biggest open deal" };
  }
  return null;
}

export function answerAgentChat(
  message: string,
  ctx: ChatContext,
  history: ChatTurn[] = []
): ChatReply {
  const m = message.toLowerCase().trim();
  const account = findAccount(message, ctx.customers);

  const atRisk = ctx.customers.filter((c) => snapshot(c, ctx).health.band === "at_risk");
  const cooling = ctx.deals.filter(
    (d) => d.stage !== "Closed Lost" && d.staleDays > ROTTING_DAYS
  );
  const open = ctx.deals.filter((d) => d.stage !== "Closed Lost");
  const openValue = open.reduce((s, d) => s + d.value, 0);
  const topDeals = [...open].sort((a, b) => b.value - a.value);

  const acct = account || lastAccount(history, ctx.customers);
  // If the rep named a CONTACT (not an account) for an action — "draft an email
  // to Dr. Lena Vogt" — resolve it to that contact's account so the action can
  // run, instead of asking "which account?". Used only by the action handlers
  // below; informational contact questions still fall through to the contact
  // answer so "tell me about Dr. Lena Vogt" stays about the person.
  const namedContactForAction = findContact(message, ctx.contacts);
  const contactAcct = namedContactForAction
    ? ctx.customers.find((c) => c.id === namedContactForAction.customer_id) || null
    : null;
  const lastAgent = [...history].reverse().find((t) => t.role === "agent")?.text || "";
  const hadDraft =
    /subject:/i.test(lastAgent) ||
    /here's a draft|tightened it up|more formal version|warmer version/i.test(lastAgent);

  // Rep named a company we don't have on the book → say so clearly instead of
  // silently ignoring it or asking "which account?" as if they'd named nothing.
  const acctIntent =
    /\b(draft|write|compose|send|email|re.?engage|reach out|follow.?up|remind|log|note|record|call(ed)?|spoke|met|emailed|tell me (about|more)|more about|anything (on|about)|brief|summar|status|update on|pull up|show|prep|prepare|meeting)\b/i.test(
      message
    );
  if (!acct && acctIntent) {
    const unknown = namedUnknownAccount(message, ctx.customers, ctx.contacts);
    if (unknown) {
      const picks = ctx.customers.slice(0, 3).map((c) => c.company_name);
      const didYouMean = picks.length
        ? ` Did you mean ${picks.slice(0, 2).join(", ")}${picks[2] ? `, or ${picks[2]}` : ""}?`
        : "";
      return {
        text: `I don't see "${unknown}" in your accounts yet.${didYouMean} Tell me the exact name and I'll pull it up.`,
        suggestions: picks.length
          ? [`Tell me about ${picks[0]}`, `Draft an email to ${picks[0]}`, "What should I focus on today?"]
          : DEFAULT_SUGGESTIONS,
      };
    }
  }

  // ===================================================================
  // ACTIONS — things the agent actually DOES (real writes), not answers.
  // These are detected here (deterministically, so they're reliable) and
  // executed by the route, which reports back exactly what happened.
  // ===================================================================

  // Pull up an account's real, already-prepared pitch (read-only). Triggered by
  // an explicit "show/pull up/open/review the pitch", OR by saying yes after the
  // agent offered to pull a pitch up.
  const wantsPitch =
    /\b(pull up|show( me)?|open|see|view|read|review|bring up|look at|pull)\b[\s\S]*\b(pitch|proposal)\b/.test(m) ||
    /\b(pitch|proposal)\b[\s\S]*\b(for|on)\b/.test(m);
  const justAffirm =
    /^(yes|yep|yeah|sure|ok(ay)?|please|do it|go ahead|sounds good|that works|yes please|let'?s do it)\b/.test(m) &&
    message.trim().split(/\s+/).length <= 4;
  const lastOfferedPitch = /\b(pull up|show|bring up|open)\b[\s\S]*\bpitch\b/i.test(lastAgent) || /\bpitch\b[\s\S]*\b(review|approve|take a look)\b/i.test(lastAgent);
  if ((wantsPitch || (justAffirm && lastOfferedPitch)) && !/\b(draft|write|compose|new pitch)\b/.test(m)) {
    if (!acct) {
      return {
        text: "Which account's pitch do you want to see?",
        suggestions: ctx.customers.slice(0, 3).map((c) => `Show me the pitch for ${c.company_name}`),
      };
    }
    return {
      text: "",
      suggestions: [],
      action: { type: "show_pitch", customerId: acct.id, company: acct.company_name },
    };
  }

  // Save the draft we just showed (or generate one and save it) onto an account.
  const savePhrase =
    /^(save|save it|save that|save the draft|log it|log that|save as a draft)\b/.test(m) ||
    /\b(save|store|keep|log) (it|that|this|the draft|the email|as a draft)\b/.test(m) ||
    /\b(save|add) (it|that|this )?(as )?(a )?draft\b/.test(m);
  if (savePhrase && (hadDraft || /\bdraft\b/.test(m))) {
    const t = acct || contactAcct;
    if (!t) {
      return {
        text: "Happy to save a draft — which account is it for?",
        suggestions: ctx.customers.slice(0, 3).map((c) => `Draft an email to ${c.company_name}`),
      };
    }
    const body = extractDraft(lastAgent) || extractDraft(makeDraft(t, ctx, {}).text) || "";
    return {
      text: "",
      suggestions: [],
      action: { type: "save_draft", customerId: t.id, company: t.company_name, body },
    };
  }

  // Set a follow-up reminder on an account ("set a follow-up with X next week").
  const mentionsFollowup =
    /\bfollow.?up\b/.test(m) ||
    /\bremind me\b/.test(m) ||
    /\b(check in|circle back|touch base|reconnect)\b/.test(m);
  const followupVerb = /\b(set|add|schedule|create|book|put|make|remind me)\b/.test(m);
  const followupQuery = /\b(who|which|what|any|when do|do i (have|need)|how many|list)\b/.test(m);
  if (mentionsFollowup && !followupQuery && (followupVerb || /\b(with|for|on)\b/.test(m))) {
    // Resolve a named account, else a described one ("my most at-risk account").
    const target = acct || contactAcct || criterionAccount(m, ctx)?.customer || null;
    if (!target) {
      return {
        text: "Sure — who should I set the follow-up with?",
        suggestions: ctx.customers.slice(0, 3).map((c) => `Set a follow-up with ${c.company_name} next week`),
      };
    }
    const when = parseWhen(m);
    return {
      text: "",
      suggestions: [],
      action: { type: "set_followup", customerId: target.id, company: target.company_name, when: when.iso, label: when.label },
    };
  }

  // Log a call / meeting / email the rep already had — either explicitly
  // ("log a call with X") or just reported in passing ("I called X", "spoke with
  // X, they're interested"). A past-tense report counts even without "log".
  const logVerb = /\b(log|note|record|mark|jot)\b/.test(m);
  const touchNoun = /\b(call|called|meeting|met|email(ed)?|conversation|chat(ted)?|spoke|talked|reached out|voicemail|demo|connected)\b/.test(m);
  const pastTouch =
    /\b(called|phoned|spoke|talked|met|emailed|messaged|reached out|left (a |them a |her a |him a )?voicemail|had (a )?(call|meeting|chat|conversation|demo)|caught up|connected with|got on (a|the) (call|phone))\b/.test(m);
  const futureOrNeg =
    /\b(should i|need to|want to|going to|gonna|will|i'?ll|can i|could i|who (should|do|can|to)|when (should|do)|how do i|haven'?t|hasn'?t|didn'?t|never|not yet)\b/.test(m);
  if ((logVerb && touchNoun) || ((acct || contactAcct) && pastTouch && !futureOrNeg)) {
    const t = acct || contactAcct;
    if (!t) {
      return {
        text: "Got it — which account should I log that on?",
        suggestions: ctx.customers.slice(0, 3).map((c) => `Log a call with ${c.company_name}`),
      };
    }
    const outcome: Outcome = /\b(meeting|met|booked|demo)\b/.test(m)
      ? "meeting_booked"
      : /\binterested\b/.test(m)
      ? "interested"
      : "in_progress";
    return {
      text: "",
      suggestions: [],
      action: { type: "log_touch", customerId: t.id, company: t.company_name, notes: message.trim(), outcome },
    };
  }

  // --- greeting / capabilities (varied) ---
  if (/^(hi|hey|hello|good morning|good afternoon|good evening)\b/.test(m) || /what can you (do|help)|how (do|does) (you|this) work|who are you|what do you do/.test(m)) {
    return {
      text: vary(
        [
          "Hi Suren — I'm your sales agent. Ask me where to focus, who's cooling or at-risk, or to draft outreach. And I can actually do things for you: save a draft onto an account, set a follow-up, or log a call. I never send anything without your OK. What do you want to do?",
          "Hey Suren. I read your pipeline and act on it — I'll draft and save outreach, set follow-ups, log your calls, and flag what's slipping. Everything waits for your sign-off. Where do you want to start?",
        ],
        history
      ),
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  // --- smalltalk (varied + grounded, never the same twice) ---
  if (/^(what'?s up|whats up|wassup|sup|yo|hey there|hiya|how'?s it going|how are you|how'?s things|howdy)\b/.test(m)) {
    return {
      text: vary(
        [
          `Not much on my end — I'm watching your book. You've got ${open.length} open deal${open.length === 1 ? "" : "s"} worth ${formatMoney(openValue)}${cooling.length ? `, and ${cooling.length} ${cooling.length === 1 ? "is" : "are"} starting to cool` : ""}. Want me to pull what needs you today?`,
          `${cooling.length ? `${cooling.length} deal${cooling.length === 1 ? "" : "s"} ${cooling.length === 1 ? "is" : "are"} going quiet — want me to draft re-engagement?` : "Pipeline's warm, nothing slipping."} ${ctx.needsApproval ? `${ctx.needsApproval} thing${ctx.needsApproval === 1 ? "" : "s"} ${ctx.needsApproval === 1 ? "is" : "are"} waiting on you.` : ""}`.trim(),
          `Standing by for you. Quickest win right now: ${ctx.topActions[0]?.title || "widening relationships on your bigger accounts"}. Want the full focus list?`,
        ],
        history
      ),
      suggestions: ["What should I focus on today?", "Which deals are cooling?", "What's waiting for my approval?"],
    };
  }
  if (/^(thanks|thank you|thx|ty|cheers|appreciate it|nice one)\b/.test(m)) {
    return {
      text: vary(
        ["Anytime. Want me to tee up your next move?", "You got it — anything else you want me to dig into?", "Happy to help. Should I set a follow-up or draft something while we're here?"],
        history
      ),
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }
  if (!hadDraft && /^(cool|nice|great|awesome|perfect|sweet|ok(ay)?|got it|sounds good|makes sense|good stuff|👍)\b/.test(m) && message.trim().split(/\s+/).length <= 3) {
    return {
      text: vary(
        ["👍 What next — want your focus list, or should I draft something?", "On it. Want me to line up the next account?", "Anything else? I can summarize an account or set a follow-up."],
        history
      ),
      suggestions: DEFAULT_SUGGESTIONS,
    };
  }

  // --- follow-up refinements on a draft ("make it shorter", tone, "do it") ---
  const wantsShorter = /\b(shorter|trim|tighten|condense|cut.*down|too long|tl;?dr)\b/.test(m);
  const wantsFormal = /\b(more formal|formal|professional|polished)\b/.test(m);
  const wantsWarm = /\b(warmer|friendl|casual|less stiff)\b/.test(m);
  const affirm = /^(yes|yep|yeah|sure|do it|go ahead|please|sounds good|ok(ay)?|that works|perfect|great)\b/.test(m) && message.trim().split(/\s+/).length <= 4;
  const lastAgentDraftish = [...history].reverse().find((t) => t.role === "agent")?.text || "";
  if (wantsShorter || wantsFormal || wantsWarm || affirm) {
    const followingADraft = /draft|tone|save it as a draft|shorter/i.test(lastAgentDraftish);
    if (acct && (wantsShorter || wantsFormal || wantsWarm || (affirm && followingADraft))) {
      return makeDraft(acct, ctx, {
        length: wantsShorter ? "short" : "normal",
        tone: wantsFormal ? "formal" : "warm",
        lead: wantsShorter
          ? "Tightened it up:"
          : wantsFormal
          ? "More formal version:"
          : wantsWarm
          ? "Warmer version:"
          : "Done — here it is:",
      });
    }
  }

  // --- "send it" / "go ahead and send" — human-led: the agent NEVER sends
  //     outward. Catch send-of-an-existing-draft and hand control back. ("draft
  //     an email to X" still drafts; "send AN email to X" has no back-reference
  //     token so it falls through to drafting too.)
  const wantsSend =
    /\b(send|fire|shoot|blast)\b/.test(m) &&
    /\b(it|that|this|the (draft|email|message|note)|them|over|off)\b/.test(m) &&
    !/\b(draft|write|compose)\b/.test(m);
  if (wantsSend) {
    const co = acct?.company_name;
    return {
      text: co
        ? `I can't send emails on your behalf — you stay in control of what actually goes out. The draft's ready, though: I can save it to ${co}'s timeline so it's queued for you, or you can open ${co} and hit Send there yourself. Want me to save it?`
        : "I can't send anything on your behalf — you always have the final say on what goes out. Tell me which account and I'll get the draft ready for you to send.",
      suggestions: co
        ? [`Save it as a draft on ${co}`, "Make it shorter", "Make it more formal"]
        : ctx.customers.slice(0, 3).map((c) => `Draft an email to ${c.company_name}`),
    };
  }

  // --- draft / write outreach (incl. "re-engage X", "reach out to X") ---
  const wantsDraft =
    (/\b(draft|write|compose|send)\b/.test(m) &&
      /\b(email|outreach|note|message|follow.?up|pitch|re.?engage(ment)?)\b/.test(m)) ||
    (/\b(re.?engage|reach out|touch base|reconnect|nudge|warm up)\b/.test(m) &&
      !!acct &&
      !/\b(who|which|what|any|list)\b/.test(m)) ||
    // Back-reference after discussing an account ("draft something for that one",
    // "write to them", "put together a quick note") → draft for the account in
    // context. Only fires when an account is already in play.
    (/\b(draft|write|compose|put together|whip up)\b/.test(m) &&
      /\b(it|that one|them|this one|something|a note|a quick)\b/.test(m) &&
      !!acct &&
      !/\b(who|which|list)\b/.test(m));
  if (wantsDraft) {
    const tone: "formal" | "warm" = /\bformal\b/.test(m) ? "formal" : "warm";
    const length: "short" | "normal" = /\b(short|quick|brief)\b/.test(m) ? "short" : "normal";
    // Account named, else the named contact's account, else a criterion match.
    if (!acct && contactAcct && namedContactForAction) {
      return makeDraft(contactAcct, ctx, {
        tone,
        length,
        lead: `Drafting to ${namedContactForAction.full_name} at ${contactAcct.company_name} — review before anything goes out:`,
      });
    }
    if (!acct) {
      // No name, but a criterion ("a cooling account", "my biggest deal")? Pick
      // the real best match and say which one — don't punt with "which account?".
      const crit = criterionAccount(m, ctx);
      if (crit) {
        return makeDraft(crit.customer, ctx, {
          tone,
          length,
          lead: `Going with ${crit.customer.company_name} — your ${crit.label}. Here's a draft to review before anything goes out:`,
        });
      }
      return {
        text:
          "Happy to draft it — which account is it for? (e.g. “draft an email to Helix Biologics”). I'll write it and leave it for you to review before anything goes out.",
        suggestions: ctx.customers.slice(0, 3).map((c) => `Draft an email to ${c.company_name}`),
      };
    }
    return makeDraft(acct, ctx, { tone, length });
  }

  // --- account detail (summary, contact, email, stage, value — anything about an
  //     account). Fires when an account is NAMED here ("tell me more about
  //     BioNex"), OR when the message is a detail follow-up that only refers to
  //     the account by context ("tell me more", "what about them") after we were
  //     just discussing one. By this point every ACTION intent (draft, save,
  //     follow-up, log, pitch, send) has already been handled above, so a message
  //     that simply names an account is overwhelmingly a "what's the story here?"
  //     ask — default to the summary rather than the generic fallback. ---
  const namedDetailIntent =
    /\b(tell me (more|about)|more (about|on)|details?|info(rmation)?|overview|brief(ing)?|summar|status|update on|going on|the (story|latest|deal)|latest|rundown|fill me in|catch me up|dig (in|into)|look into|how('?s| is| are| have| big| much)|who('?s| is| are)|contact|point of contact|poc|reach|talk to|speak to|email|phone|stage|worth|anything (on|about)|what('?s| is) (going on|happening|the story|up)|tell me)\b/.test(
      m
    );
  const contextDetailIntent =
    /\b(tell me more|more (about|on|detail)|what about (it|them|that|this|that one)|how about (it|them|that one)|fill me in|catch me up|the rundown|anything else (on|about) (it|them|that))\b/.test(
      m
    ) || /^(tell me more|more|and (what|how) about)\b/.test(m);
  const detailTarget =
    account && (namedDetailIntent || message.trim().split(/\s+/).length <= 6)
      ? account
      : !account && acct && contextDetailIntent
      ? acct
      : null;
  if (detailTarget) {
    const snap = snapshot(detailTarget, ctx);
    const band = snap.health.label.toLowerCase();
    const ct = snap.contacts[0];
    const stage = snap.open[0]?.stage;
    const threadNote = snap.contacts.length < 2 ? " It's single-threaded, so widening the relationship would de-risk it." : "";
    return {
      text:
        `${detailTarget.company_name} — ${band} health (${snap.health.score}/100). ` +
        `${snap.open.length} open deal${snap.open.length === 1 ? "" : "s"} worth ${formatMoney(snap.openValue)}${stage ? `, currently ${stage}` : ""}. ` +
        `Main contact: ${ct ? `${ct.full_name}${ct.job_title ? `, ${ct.job_title}` : ""}${ct.email ? ` (${ct.email})` : ""}` : "none mapped yet"}` +
        `${snap.contacts.length > 1 ? ` (+${snap.contacts.length - 1} more)` : ""}. ` +
        `Last touch: ${fmtDate(snap.lastAt)}.${threadNote}` +
        (snap.cooling ? " ⚠️ A deal here has gone quiet — worth re-engaging." : "") +
        `\n\nWant me to pull up their pitch, draft outreach, or set a follow-up?`,
      suggestions: [
        `Show me the pitch for ${detailTarget.company_name}`,
        `Draft an email to ${detailTarget.company_name}`,
        `Set a follow-up with ${detailTarget.company_name} next week`,
      ],
    };
  }

  // --- at-risk / churn / health ---
  if (/\b(at.?risk|risk|churn|los(e|ing)|unhealthy|in trouble|about to lose)/.test(m)) {
    if (atRisk.length === 0) {
      return { text: "Good news — no accounts are flagged at-risk right now. Your book looks stable.", suggestions: DEFAULT_SUGGESTIONS };
    }
    const lines = atRisk.slice(0, 5).map((c) => {
      const s = snapshot(c, ctx);
      return `• ${acctLink(c.company_name, c.id)} — ${formatMoney(s.openValue)} open, last touch ${fmtDate(s.lastAt)}`;
    });
    return {
      text: `${atRisk.length} account${atRisk.length === 1 ? " is" : "s are"} at-risk:\n\n${lines.join("\n")}\n\nWant me to draft re-engagement for the top one?`,
      suggestions: [`Draft an email to ${atRisk[0].company_name}`, "Which deals are cooling?", "What should I focus on today?"],
    };
  }

  // --- follow-ups / who to contact ---
  if (/\b(follow.?up|overdue|chase|needs? a (touch|call|nudge)|who (do i need to|haven'?t i|to|should i|do i|can i) (call|contact|reach|chase|email))/.test(m)) {
    const due = [...open].sort((a, b) => b.staleDays - a.staleDays).slice(0, 5);
    if (due.length === 0) {
      return { text: "Nothing's overdue for a follow-up — you're on top of your touches.", suggestions: DEFAULT_SUGGESTIONS };
    }
    const lines = due.map((d) => `• ${acctLink(d.company, d.customerId)} — last touch ${d.staleDays} days ago (${d.stage})`);
    return {
      text: `Due a follow-up (longest since contact first):\n\n${lines.join("\n")}\n\nWant me to draft one for ${due[0].company}?`,
      suggestions: [`Draft an email to ${due[0].company}`, "Which deals are cooling?", "What should I focus on today?"],
    };
  }

  // --- cooling / stalled / re-engage ---
  if (/\b(cool|stall|cold|quiet|gone dark|re.?engage|dormant|rotting|no activity|fallen off|slip|neglect|letting|gone silent|going dark)/.test(m)) {
    if (cooling.length === 0) {
      return { text: "Nothing's gone cold — every open deal has had activity recently. Nicely kept up.", suggestions: DEFAULT_SUGGESTIONS };
    }
    const lines = cooling.slice(0, 5).map((d) => `• ${acctLink(d.company, d.customerId)} — ${formatMoney(d.value)}, quiet ${d.staleDays} days (${d.stage})`);
    return {
      text: `${cooling.length} deal${cooling.length === 1 ? " is" : "s are"} cooling:\n\n${lines.join("\n")}\n\nI can draft re-engagement for any of them — just say which, or "draft for all".`,
      suggestions: [`Draft an email to ${cooling[0].company}`, "What's my open pipeline worth?", "What should I focus on today?"],
    };
  }

  // --- pipeline / forecast / value ---
  if (/\b(pipeline|forecast|open value|worth|how much|revenue|quota|deal value|in play|booked)\b/.test(m)) {
    const weighted = Math.round(openValue * 0.45);
    const top = topDeals.slice(0, 3).map((d) => `• ${acctLink(d.company, d.customerId)} — ${formatMoney(d.value)} (${d.stage})`);
    return {
      text:
        `You've got ${open.length} open deal${open.length === 1 ? "" : "s"} worth ${formatMoney(openValue)} (roughly ${formatMoney(weighted)} weighted by stage). ` +
        `${cooling.length} ${cooling.length === 1 ? "is" : "are"} cooling and ${atRisk.length} account${atRisk.length === 1 ? " is" : "s are"} at-risk.\n\nBiggest open deals:\n${top.join("\n")}`,
      suggestions: ["Which deals are cooling?", "What are my biggest deals?", "What should I focus on today?"],
    };
  }

  // --- biggest / top deals ---
  if (/\b(biggest|largest|top deals?|highest value|most valuable)\b/.test(m)) {
    const lines = topDeals.slice(0, 5).map((d, i) => `${i + 1}. ${acctLink(d.company, d.customerId)} — ${formatMoney(d.value)} (${d.stage}, ${d.contactName})`);
    return {
      text: `Your biggest open deals:\n\n${lines.join("\n")}\n\nWant a briefing on any of them before you reach out?`,
      suggestions: topDeals.slice(0, 3).map((d) => `Tell me about ${d.company}`),
    };
  }

  // --- approvals / to-do / waiting (named, not just counted) ---
  if (/\b(approv|waiting|to.?do|inbox|pending|sign.?off|review queue|need me|pitch(es)? (waiting|pending|to approve)|what'?s in my (queue|inbox))\b/.test(m)) {
    const pending = ctx.topActions.filter((a) => a.kind === "approve" || a.kind === "send");
    if (pending.length === 0) {
      return {
        text: "Nothing's waiting on your approval right now — you're all clear.",
        suggestions: ["What should I focus on today?", "Which deals are cooling?", "What did you do recently?"],
      };
    }
    const lines = pending.map((a) => `• ${a.title} — ${a.rationale}`);
    const firstCo = pending[0].company;
    return {
      text:
        `${pending.length} ${pending.length === 1 ? "pitch is" : "pitches are"} waiting on you:\n\n${lines.join("\n")}\n\n` +
        `Open the To-do tab to approve or send each — you have the final say. Want me to pull up the ${firstCo} pitch so you can review it here?`,
      suggestions: [
        firstCo ? `Show me the pitch for ${firstCo}` : "What should I focus on today?",
        "Which deals are cooling?",
        "What should I focus on today?",
      ],
    };
  }

  // --- recent activity / what did you do ---
  if (/\b(what did you|recent|this week|activity|history|done lately|been up to|worked on)\b/.test(m)) {
    const recent = ctx.runs.filter((r) => !r.reverted).slice(0, 4);
    if (recent.length === 0) {
      return { text: "I haven't run anything for you yet. Give me a goal — like “re-engage my cooling deals” — and I'll get started (and leave everything for your review).", suggestions: DEFAULT_SUGGESTIONS };
    }
    const lines = recent.map((r) => `• ${r.title}`);
    return {
      text: `Recently I:\n\n${lines.join("\n")}\n\nEverything's logged on the accounts for you to review.`,
      suggestions: ["What should I focus on today?", "What's waiting for my approval?", "Which deals are cooling?"],
    };
  }

  // --- meeting / call prep ---
  if (/\b(prep|prepare|call with|meeting with|before my call|talking points|brief me before)\b/.test(m)) {
    if (!acct) {
      return { text: "Which account or person is the call with? Tell me the name and I'll pull a quick pre-call brief.", suggestions: ctx.customers.slice(0, 3).map((c) => `Prep me for a call with ${c.company_name}`) };
    }
    const snap = snapshot(acct, ctx);
    const ct = snap.contacts[0];
    return {
      text:
        `Pre-call brief — ${acct.company_name}:\n\n` +
        `• Health: ${snap.health.label} (${snap.health.score}/100)\n` +
        `• Pipeline: ${snap.open.length} open deal${snap.open.length === 1 ? "" : "s"}, ${formatMoney(snap.openValue)}\n` +
        `• Last touch: ${fmtDate(snap.lastAt)}\n` +
        `• Key contact: ${ct ? `${ct.full_name}${ct.job_title ? `, ${ct.job_title}` : ""}` : "none mapped yet"}\n\n` +
        `Lead with their submission timeline and one clear ask. Want me to draft a follow-up to send afterward?`,
      suggestions: [`Draft an email to ${acct.company_name}`, "What should I focus on today?", "Which deals are cooling?"],
    };
  }

  // --- "which is most urgent / which one first" → answer with the SINGLE top
  //     item (not the whole list). Placed before the focus list so the singular
  //     intent wins. Matters most when Claude is unavailable and this brain answers. ---
  const wantsSingleTop =
    /\bwhich one\b/.test(m) ||
    /\b(top|first|most urgent|number one|#1) (one|priority|thing)\b/.test(m) ||
    /\bwhat should i do first\b/.test(m) ||
    /\b(which|what'?s|what is)\b.*\b(most urgent|first|single most|one thing)\b/.test(m);
  if (wantsSingleTop && ctx.topActions.length) {
    const top = ctx.topActions[0];
    const c = findAccount(top.title, ctx.customers);
    return {
      text:
        `Most urgent: **${top.title}** — ${top.rationale}` +
        (c ? `\n\n[Open ${c.company_name} →](/customers/${c.id})` : ""),
      suggestions: [
        "What else should I focus on?",
        "Which deals are cooling?",
        c ? `Draft an email to ${c.company_name}` : "Draft an email to a cooling account",
      ],
    };
  }

  // --- focus / today / priorities (also the catch for "what / where do I start") ---
  if (/\b(focus|today|urgent|priorit|where (do|should) i (start|begin)|what('?s| is) (next|important|urgent)|what should i (do|work on)|my day|most important|game ?plan|top (3|three))/.test(m)) {
    const picks = ctx.topActions.slice(0, 3);
    const body = picks.length
      ? picks
          .map((a, i) => {
            const c = findAccount(a.title, ctx.customers);
            const link = c ? ` · [open →](/customers/${c.id})` : "";
            return `${i + 1}. ${a.title} — ${a.rationale}${link}`;
          })
          .join("\n")
      : "Your book is quiet — nothing urgent. A good time to widen relationships on your bigger accounts.";
    return {
      text:
        `Here's where I'd start today:\n\n${body}\n\n` +
        `You've also got ${ctx.needsApproval} waiting for your approval, ${cooling.length} cooling deal${cooling.length === 1 ? "" : "s"}, and ${atRisk.length} at-risk account${atRisk.length === 1 ? "" : "s"}.`,
      suggestions: ["Which deals are cooling?", "What's waiting for my approval?", "Which accounts are at-risk?"],
    };
  }

  // --- counts ---
  if (/\bhow many\b/.test(m)) {
    if (/account|customer|compan/.test(m)) return { text: `You have ${ctx.customers.length} accounts on your book, ${open.length} with open deals.`, suggestions: DEFAULT_SUGGESTIONS };
    if (/contact|people|stakeholder/.test(m)) return { text: `${ctx.contacts.length} contacts are mapped across your accounts.`, suggestions: DEFAULT_SUGGESTIONS };
    if (/deal|opportunit/.test(m)) return { text: `${open.length} open deals, worth ${formatMoney(openValue)} together.`, suggestions: ["What are my biggest deals?", "Which deals are cooling?"] };
  }

  // --- a contact named by name → answer about the person (their account, role,
  //     email) before falling back. Last, so account/action/focus intents win. ---
  const namedContact = findContact(message, ctx.contacts);
  if (namedContact) {
    const cust = ctx.customers.find((x) => x.id === namedContact.customer_id);
    const title = namedContact.job_title ? `, ${namedContact.job_title}` : "";
    const where = cust
      ? ` at [${cust.company_name}](/customers/${cust.id})`
      : "";
    const email = namedContact.email ? ` · ${namedContact.email}` : "";
    return {
      text:
        `**${namedContact.full_name}**${title}${where}.${email}` +
        `\n\n[Open contact →](/contacts/${namedContact.id})`,
      suggestions: cust
        ? [
            `Tell me about ${cust.company_name}`,
            `Draft an email to ${cust.company_name}`,
            "What should I focus on today?",
          ]
        : DEFAULT_SUGGESTIONS,
    };
  }

  // --- fallback (varied + grounded, points at real things I can do) ---
  const exampleAcct = (cooling[0]?.company) || ctx.customers[0]?.company_name || "an account";
  return {
    text: vary(
      [
        `I can dig into your pipeline or take an action for you. Right now you've got ${open.length} open deal${open.length === 1 ? "" : "s"} worth ${formatMoney(openValue)}${cooling.length ? `, ${cooling.length} cooling` : ""}. Try “what should I focus on today?”, “draft an email to ${exampleAcct}”, or “set a follow-up with ${exampleAcct} next week.”`,
        `Not sure I caught that — but I can act on it. Ask me to summarize an account, draft and save outreach, set a follow-up, or log a call. Want your focus list for today?`,
      ],
      history
    ),
    suggestions: DEFAULT_SUGGESTIONS,
  };
}

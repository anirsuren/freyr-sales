import { getDataMode } from "./dataMode";
import { SALES_TEAM } from "./salesTeam";
import {
  FILL_ACCOUNTS,
  FILL_NAMES,
  fillCompany,
  fillCustomerId,
  fillPairIndex,
  mockFillContact,
} from "./mockFillCast";
import { spreadEvenly } from "./revenueAccrualsShared";
import { sampleDocPath } from "./sampleDocuments";
import {
  normalizeConfidence,
  normalizeLevel,
  normalizeRevenueType,
  normalizeStatus,
  type Opportunity,
} from "./opportunitiesShared";
import type { Contract } from "./contractsShared";
import type { Lead } from "./leadsShared";
import type { Meeting } from "./meetings";
import type { SolutionRequest } from "./solutioning";
import type { RecordTeam } from "./recordTeams";

/**
 * A WORKING LIFE FOR THE 140 GENERATED MOCK ACCOUNTS.
 *
 * Anir, Sep 2, on /mock-mode/customers/cust-fill-140: "im in mock mode trying
 * to see how everything would look and ur making this so difficult for me.
 * like how many times do i have to say this we need to have mock data what is
 * wrong with you." Every tab on that account read zero.
 *
 * WHY IT READ ZERO. lib/mock-db generates 140 accounts with contacts, pitch
 * sessions and interactions, and that part was fine. The customer page's tabs
 * come from six OTHER stores, and each of those seeded only the hand-named
 * demo cast (Cortexa, Helix, Aether and about a dozen more). So a dozen
 * accounts looked full and the 140 he actually clicks through were empty.
 *
 * Then, the same day: "i need there to be hundreds of data points in total
 * down every rabbit hole for every single page so in mock mode ppl can see
 * exactly how it will look. and i should still be able to add edit and delete
 * shit if i really want." So this is deliberately a lot of rows, and it is
 * laid down as a FLOOR that a person's own mock edits sit on top of, never as
 * something that reasserts itself over them.
 *
 * =====================================================================
 * MOCK ONLY. THIS MUST BE INCAPABLE OF TOUCHING REAL DATA.
 * =====================================================================
 * Every generator below returns an empty array unless getDataMode() says
 * "mock", so a caller that forgets its own guard still cannot put an invented
 * deal in front of Freyr's actual sales team. The stores that call these are
 * guarded a second time, and each of them writes to a row id that carries a
 * ":mock" suffix which only mock mode ever computes. Three independent things
 * would have to fail at once for a single row here to reach the live
 * workspace. Outside a request (boot, scripts, instrumentation) getDataMode()
 * answers "live", which is the safe direction: nothing is generated.
 *
 * DETERMINISTIC, NEVER RANDOM. Everything is index arithmetic off the account
 * number, the way lib/mock-db does it. Two reads of a page must never
 * disagree and a reload must not reshuffle what he is looking at.
 *
 * ONE SET PER COMPANY NAME, NOT PER ACCOUNT. See lib/mockFillCast: the 140
 * accounts carry only 70 distinct names, and buildCustomer360 matches records
 * by id OR by name, so anything generated for account 1 also lands on account
 * 71. Generating both would show each account the union of its own work and
 * its twin's, with meetings naming people who are not on the account you are
 * looking at. Everything here is keyed by fillPairIndex.
 *
 * INVENTED PEOPLE ONLY. Customer-side names come from lib/mockFillCast, which
 * is the same cast the contacts tab renders. Our side is the mock sales floor
 * that already has generated headshots in components/ui/Avatar, so no row
 * points at a real Freyr colleague.
 */

/** The mock sales floor. Every one of these resolves to a generated headshot. */
/* THE SAME FLOOR THE TEAM PAGE SHOWS. This used to be its own cast of
   sixteen invented names, so every record generated here was owned by
   somebody who was not on the roster and the join by name found nothing —
   see lib/salesTeam for what that cost. */
const SALES = SALES_TEAM;
/**
 * What a regulatory-affairs account actually buys. Drawn from the real
 * catalogue order so a contract and the deal it closed name the same kind of
 * thing the Offerings module knows about.
 */
const OFFERINGS = [
  "Freya.Label", "Freya.Submit", "Freya.Register", "Freya.Artwork",
  "Freya.Docs", "Freya.Intelligence", "Freya.RTQ", "Freya.Agents",
  "Publishing", "Submissions Planning & Management", "Label Management",
  "Artwork Management", "Regulatory Affairs Strategy", "Local Regulatory Affairs",
  "Post-Approval Regulatory Affairs", "Regulatory Intelligence Services",
  "Pharmacovigilance", "Medical Writing - Clinical",
  "Compliance, Audit and Validation", "RIMS Data Services",
];

const DEAL_STATUSES = [
  "Qualify", "Pilot", "Propose", "Submitted to client", "Under review",
];
const DEAL_LEVELS = ["Pipeline", "Go get", "High confidence"];
const CONFIDENCE = [10, 25, 50, 75, 99];

const MEETING_KINDS = [
  "Introductory", "Discovery", "Capability / demo", "Technical deep dive",
  "RFP defence", "Commercial / pricing", "QBR / review", "Executive briefing",
  "Conference / event",
];

const LEAD_SOURCE = [
  "Website", "Conference", "Referral", "Campaign", "Inbound email",
  "Partner", "Outbound",
];
const LEAD_STATUS = [
  "New", "Contacted", "Qualifying", "Nurturing", "Converted", "Disqualified",
];

const DOC_FILES = [
  "cmc-writing-approach.pdf",
  "helix-capability-deck.pdf",
  "publishing-workflow-one-pager.pdf",
  "q3-review-pack.pdf",
  "eu-mdr-discovery-questions.docx",
  "delivery-metrics.xlsx",
] as const;

/**
 * HOW MUCH WORK EACH ACCOUNT CARRIES.
 *
 * Anir asked for variety, not a uniform three deals on all of them: "some
 * accounts should be busy, some quiet, a few genuinely empty, because an
 * empty state is a real state and he needs to see it too." Each cycle has a
 * different length so they do not line up: an account that is quiet on deals
 * is not automatically quiet on everything, and the combinations do not
 * repeat until far past the 70 names.
 *
 * The zeros are deliberate, and they are placed so that none of them lands on
 * pair index 70. That is cust-fill-140, the account he was looking at when he
 * reported this, and it has to read full on every tab.
 */
/* NO ZEROS ANY MORE (Anir, Sep 4, on Belmara Sciences reading 0 across six
   tabs: "make sure on every page u have enough data on all of these. it cant
   say 0. then whats the point of mock mode"). The zeros were his OWN earlier
   ask — "a few genuinely empty, because an empty state is a real state" — and
   the newer instruction wins. Variety survives as busy-versus-quiet (7 deals
   against 2), never as empty.

   SOLUTIONING is 4 or more everywhere, deliberately: the generator deals its
   rows across four shelves in rotation (request, submission, presentation,
   meeting ask) and the customer page gives each shelf its OWN tab, so any
   count under four leaves some tab reading 0 on that account. */
const DEALS = [5, 3, 6, 4, 7, 3, 5, 2, 6, 4, 7];
const CONTRACTS = [3, 1, 2, 1, 3, 1, 2, 2, 1];
const LEADS = [3, 1, 1, 2, 1, 3, 2];
const MEETINGS = [4, 1, 4, 2, 2, 3, 3, 5];
const SOLUTIONING = [5, 4, 6, 4, 5, 4, 7, 4, 6, 4];

const at = <T,>(list: T[], n: number): T => list[((n % list.length) + list.length) % list.length]!;
const pad = (n: number) => String(n).padStart(3, "0");

/**
 * THE FLOOR'S GENERATION, STAMPED INTO EVERY GENERATED ID.
 *
 * The four row-backed stores lay this floor once and then leave the row alone
 * so mock edits stick — the marker being the rows themselves. Which means a
 * change to the tables above would otherwise never reach a workspace that
 * already holds the old floor: the old rows ARE the marker. So the ids carry
 * their generation ("fill2-mtg-…"), the marker only recognises the current
 * one, and each store sweeps rows of older generations out before laying the
 * new floor. Rows a person added by hand carry no fill prefix and survive.
 */
export const FILL_GENERATION = 3;
const FP = `fill${FILL_GENERATION}-`;

/** A generated row from an OLDER floor: swept on the next top-up. */
export function isStaleFillRow(id: string): boolean {
  return /^fill\d*-/.test(id) && !id.startsWith(FP);
}

/** Mock and only mock. The single gate every generator passes through. */
function isMock(): boolean {
  try {
    return getDataMode() === "mock";
  } catch {
    return false;
  }
}

/** A fixed clock. A seed that moved with today would reshuffle on reload. */
const ANCHOR = Date.UTC(2026, 7, 30);
const iso = (dayOffset: number) =>
  new Date(ANCHOR + dayOffset * 86400000).toISOString();
const day = (dayOffset: number) => iso(dayOffset).slice(0, 10);
const month = (offset: number) => {
  const d = new Date(Date.UTC(2026, 7 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/**
 * Everything the six generators need to agree about one company: who owns it,
 * what it buys, what its deals are worth, and who works there. Money follows
 * the size band lib/mock-db already assigned so a small account never carries
 * a large account's numbers.
 */
function profile(p: number) {
  const i = p - 1;
  /* The size tier lib/mock-db put on the account, same arithmetic. */
  const size = ["small", "mid", "large"][i % 3]!;
  const base = size === "large" ? 320_000 : size === "mid" ? 120_000 : 40_000;
  const spread = size === "large" ? 1_100_000 : size === "mid" ? 360_000 : 120_000;
  return {
    i,
    size,
    company: fillCompany(p),
    customerId: fillCustomerId(p),
    owner: at(SALES, i),
    /* A second and third name so an account is not a one-person show. */
    second: at(SALES, i * 5 + 3),
    third: at(SALES, i * 7 + 9),
    contact: (slot: number) => mockFillContact(p, slot % 5),
    offering: (k: number) => at(OFFERINGS, i * 3 + k),
    /* Rounded to the nearest thousand, like every other figure in the app. */
    money: (k: number) =>
      Math.round((base + ((i * 37 + k * 91) % spread)) / 1000) * 1000,
  };
}

/** Every distinct fill company, 1..70. */
const names = () => Array.from({ length: FILL_NAMES }, (_, k) => k + 1);

/* --------------------------------------------------------- opportunities */

/**
 * The deals. Everything else in this file hangs off them: a meeting is
 * against a deal, a submission is against a deal, a contract closed one.
 */
export function mockFillOpportunities(): Opportunity[] {
  if (!isMock()) return [];
  const out: Opportunity[] = [];
  for (const p of names()) {
    const a = profile(p);
    const count = at(DEALS, a.i);
    for (let k = 0; k < count; k += 1) {
      const offering = a.offering(k);
      const value = a.money(k);
      const confidence = at(CONFIDENCE, a.i + k);
      const signs = day(30 + ((a.i * 11 + k * 23) % 400));
      const owner = k % 3 === 0 ? a.owner : k % 3 === 1 ? a.second : a.third;
      out.push({
        id: `${FP}opp-${pad(p)}-${k + 1}`,
        externalId: `OPP-F${pad(p)}${k + 1}`,
        name: `${offering}. ${a.company}`,
        customer: a.company,
        customerId: a.customerId,
        offeringIds: [],
        offeringLabels: [offering],
        lines: [
          {
            id: `${FP}line-${pad(p)}-${k + 1}`,
            offeringLabel: offering,
            revenueType: normalizeRevenueType(k % 2 === 0 ? "OTS" : "ARR"),
            value,
            confidence: normalizeConfidence(confidence),
            estSignDate: signs,
          },
        ],
        level: normalizeLevel(at(DEAL_LEVELS, a.i + k)),
        status: normalizeStatus(at(DEAL_STATUSES, a.i * 2 + k)),
        revenueType: normalizeRevenueType(k % 2 === 0 ? "OTS" : "ARR"),
        value,
        estimatedTcv: value,
        estimatedAcv:
          Math.round(value / [1, 1, 2, 3, 2, 1, 4, 2][(a.i + k) % 8]! / 1000) * 1000,
        confidence: normalizeConfidence(confidence),
        estSignDate: signs,
        owner,
        nextSteps: at(
          [
            "Scope call booked with their regulatory lead",
            "Waiting on their legal to clear the MSA",
            "Second market added to scope, repricing",
            "Pilot results due before they commit",
            "Procurement wants one more reference call",
          ],
          a.i + k
        ),
        goalIds: [],
        /* A deal with no history reads as a deal nobody has worked. */
        activities: [
          {
            id: `${FP}act-${pad(p)}-${k + 1}-1`,
            activity: at(["lead", "opportunity", "pilot", "contract", "delivery"], a.i + k),
            status: at(["initiated", "under_progress", "completed"], a.i + k) as
              | "initiated"
              | "under_progress"
              | "completed",
            person: owner,
            date: day(-(20 + ((a.i * 3 + k) % 60))),
          },
          ...(k % 2 === 0
            ? [
                {
                  id: `${FP}act-${pad(p)}-${k + 1}-2`,
                  activity: "opportunity",
                  status: "under_progress" as const,
                  person: a.second,
                  date: day(-(5 + ((a.i + k) % 18))),
                  note: at(
                    [
                      "Demo done, security review next",
                      "They asked for a phased start",
                      "Budget confirmed for next financial year",
                    ],
                    a.i + k
                  ),
                },
              ]
            : []),
        ],
        createdAt: iso(-(60 + ((a.i * 7 + k) % 120))),
        updatedAt: iso(-((a.i + k) % 20)),
      });
    }
  }
  return out;
}

/** The deals one company carries, in the shape the joins want. */
function dealRefs(p: number) {
  const a = profile(p);
  return Array.from({ length: at(DEALS, a.i) }, (_, k) => ({
    id: `${FP}opp-${pad(p)}-${k + 1}`,
    label: `${a.offering(k)}. ${a.company}`,
    offering: a.offering(k),
    value: a.money(k),
  }));
}

/* -------------------------------------------------------------- contracts */

export function mockFillContracts(): Contract[] {
  if (!isMock()) return [];
  const out: Contract[] = [];
  for (const p of names()) {
    const a = profile(p);
    const count = at(CONTRACTS, a.i);
    const deals = dealRefs(p);
    for (let k = 0; k < count; k += 1) {
      /* A contract closes something this account was actually being sold. */
      /* Coverage starts at the account's FIRST deal and walks down, so the
         deal at the top of the list is never the one with nothing behind it
         (Anir, Sep 2: "down every rabbit hole"). */
      const deal = deals.length ? deals[k % deals.length]! : null;
      const offering = deal ? deal.offering : a.offering(k);
      const value = deal ? deal.value : a.money(k + 3);
      const status = at(["Signed", "Ready for delivery", "Signed", "Draft"], a.i + k) as
        Contract["status"];
      const startMonth = month(-(6 + ((a.i + k) % 10)));
      const months = [12, 18, 24, 6][(a.i + k) % 4]!;
      const signer = a.contact(k);
      const reference = `FR-CF-${pad(p)}${k + 1}`;
      out.push({
        id: `${FP}ct-${pad(p)}-${k + 1}`,
        reference,
        name: `${offering} ${at(["managed service", "renewal", "programme", "rollout"], a.i + k)}`,
        customer: a.company,
        customerId: a.customerId,
        opportunityId: deal?.id,
        opportunityName: deal?.label,
        offeringLabel: offering,
        value,
        status,
        startDate: `${startMonth}-01`,
        signedOn: status === "Signed" ? `${startMonth}-04` : undefined,
        signedBy: status === "Signed" ? signer.name : undefined,
        owner: a.owner,
        /* Sample only. A real contract points at wherever legal keeps the
           executed PDF; nothing is stored in this app. */
        documentUrl:
          status === "Signed" || status === "Ready for delivery"
            ? `https://example.invalid/contracts/${reference}.pdf`
            : undefined,
        docs: [
          {
            id: `${FP}cd-${pad(p)}-${k + 1}`,
            name: `${offering} statement of work`,
            docsPath: sampleDocPath(at([...DOC_FILES], a.i + k)),
            fileName: at([...DOC_FILES], a.i + k),
            addedBy: a.owner,
            addedAt: iso(-(40 + ((a.i + k) % 60))),
          },
        ],
        /* The month-by-month plan, so opening a contract lands on a schedule
           rather than an empty panel. */
        schedule: spreadEvenly(value, startMonth, months),
        createdBy: a.owner,
        createdAt: iso(-(70 + ((a.i + k) % 90))),
        updatedBy: a.second,
        updatedAt: iso(-((a.i + k) % 25)),
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ leads */

export function mockFillLeads(): Lead[] {
  if (!isMock()) return [];
  const out: Lead[] = [];
  for (const p of names()) {
    const a = profile(p);
    const count = at(LEADS, a.i);
    for (let k = 0; k < count; k += 1) {
      const person = a.contact(k + 1);
      const status = at(LEAD_STATUS, a.i * 2 + k) as Lead["status"];
      out.push({
        id: `${FP}ld-${pad(p)}-${k + 1}`,
        ref: `LEAD-F${pad(p)}${k + 1}`,
        name: person.name,
        company: a.company,
        customerId: a.customerId,
        title: at(
          [
            "VP Regulatory Affairs",
            "Head of Submissions",
            "Director, RIM",
            "Head of Labelling",
            "Regulatory Operations Manager",
          ],
          a.i + k
        ),
        email: `${person.name.toLowerCase().replace(/[^a-z]+/g, ".")}@${a.company
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "")}.example`,
        source: at(LEAD_SOURCE, a.i + k) as Lead["source"],
        status,
        interest: at(
          [
            `Asked for a ${a.offering(k)} walkthrough through the site`,
            `Met at DIA, wants the ${a.offering(k)} overview`,
            `Downloaded the ${a.offering(k)} white paper`,
            `Emailed about capacity for ${a.offering(k)}`,
            `Introduced by a delivery partner, interested in ${a.offering(k)}`,
          ],
          a.i + k
        ),
        owner: k % 2 === 0 ? a.owner : a.second,
        createdBy: a.owner,
        createdAt: iso(-(10 + ((a.i * 5 + k) % 90))),
        updatedBy: a.owner,
        updatedAt: iso(-((a.i + k) % 9)),
        disqualifiedReason:
          status === "Disqualified" ? "No budget this financial year" : undefined,
      });
    }
  }
  return out;
}

/* --------------------------------------------------------------- meetings */

export function mockFillMeetings(): Meeting[] {
  if (!isMock()) return [];
  const out: Meeting[] = [];
  for (const p of names()) {
    const a = profile(p);
    const count = at(MEETINGS, a.i);
    const deals = dealRefs(p);
    for (let k = 0; k < count; k += 1) {
      /* Coverage starts at the account's FIRST deal and walks down, so the
         deal at the top of the list is never the one with nothing behind it
         (Anir, Sep 2: "down every rabbit hole"). */
      const deal = deals.length ? deals[k % deals.length]! : null;
      /* Two people from the account, both real contacts on it. */
      const c1 = a.contact(k);
      const c2 = a.contact(k + 2);
      const held = k % 3 !== 0;
      const when = held ? -(4 + ((a.i * 3 + k) % 70)) : 6 + ((a.i + k) % 45);
      const owner = k % 2 === 0 ? a.owner : a.second;
      const presenter = k % 2 === 0 ? a.second : a.third;
      out.push({
        id: `${FP}mtg-${pad(p)}-${k + 1}`,
        ref: `MTG-F${pad(p)}${k + 1}`,
        title: `${a.company} ${at(
          [
            "kick-off",
            "capability walkthrough",
            "scope and pricing",
            "quarterly review",
            "technical session",
          ],
          a.i + k
        )}`,
        type: at(MEETING_KINDS, a.i + k),
        status: held ? "completed" : "planned",
        meetingAt: day(when),
        customerId: a.customerId,
        customer: a.company,
        opportunityIds: deal ? [deal.id] : [],
        opportunityLabels: deal ? [deal.label] : [],
        contactIds: [c1.id, c2.id],
        contactNames: [c1.name, c2.name],
        attendees: [owner, presenter, a.third].filter(
          (x, idx, all) => all.indexOf(x) === idx
        ),
        presenters: [presenter],
        owner,
        createdAt: iso(when - 12),
        completedAt: held ? iso(when) : undefined,
        completedBy: held ? owner : undefined,
        /* A meeting nobody wrote up is a row you cannot learn anything from. */
        notes: held
          ? [
              {
                id: `${FP}mn-${pad(p)}-${k + 1}-1`,
                kind: "brief",
                by: owner,
                at: iso(when - 2),
                text: `Take ${c1.name} through how we would run ${
                  deal ? deal.offering : a.offering(k)
                } for them, and agree who owns what on their side.`,
              },
              {
                id: `${FP}mn-${pad(p)}-${k + 1}-2`,
                kind: "outcome",
                by: presenter,
                at: iso(when),
                text: at(
                  [
                    `${c2.name} will send their current process notes this week. Costed proposal to follow.`,
                    `They want a phased start, one market first. ${c1.name} is the decision maker.`,
                    `Agreed a pilot scope. Procurement joins the next session.`,
                  ],
                  a.i + k
                ),
              },
            ]
          : [
              {
                id: `${FP}mn-${pad(p)}-${k + 1}-1`,
                kind: "brief",
                by: owner,
                at: iso(-2),
                text: `Agenda: where ${a.company} is today on ${
                  deal ? deal.offering : a.offering(k)
                }, and what a first phase would cover.`,
              },
            ],
        docs: held
          ? [
              {
                id: `${FP}md-${pad(p)}-${k + 1}`,
                label: at(
                  [
                    "Capability deck.pdf",
                    "Approach and scope.pdf",
                    "Workflow one-pager.pdf",
                    "Review pack.pdf",
                  ],
                  a.i + k
                ),
                docsPath: sampleDocPath(at([...DOC_FILES], a.i + k + 1)),
                addedBy: presenter,
                addedAt: iso(when),
              },
            ]
          : [],
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------ solutioning */

export function mockFillSolutioning(): SolutionRequest[] {
  if (!isMock()) return [];
  const out: SolutionRequest[] = [];
  for (const p of names()) {
    const a = profile(p);
    const count = at(SOLUTIONING, a.i);
    const deals = dealRefs(p);
    for (let k = 0; k < count; k += 1) {
      /* Coverage starts at the account's FIRST deal and walks down, so the
         deal at the top of the list is never the one with nothing behind it
         (Anir, Sep 2: "down every rabbit hole"). */
      const deal = deals.length ? deals[k % deals.length]! : null;
      const c1 = a.contact(k + 1);
      /* All four shelves get filled: a request, the submission it became, a
         presentation, and an ask for a meeting. Each is a separate object,
         which is the distinction Suren drew on Aug 26. */
      const shelf = (a.i + k) % 4;
      const isRequest = shelf === 0 || shelf === 3;
      const kind = (shelf === 3 ? "meeting" : shelf === 2 ? "presentation" : "submission") as
        SolutionRequest["kind"];
      const type = (isRequest
        ? "request"
        : shelf === 2
          ? "presentation"
          : "submission") as SolutionRequest["type"];
      const prefix = shelf === 3 ? "MRQ" : shelf === 2 ? "PRE" : isRequest ? "REQ" : "SUB";
      const subtype =
        kind === "submission"
          ? at(["RFI", "RFP", "Proposal"], a.i + k)
          : kind === "presentation"
            ? at(["RFP defense", "Capability overview", "Executive readout"], a.i + k)
            : undefined;
      const offering = deal ? deal.offering : a.offering(k);
      const owner = k % 2 === 0 ? a.second : a.third;
      const requestedAt = iso(-(6 + ((a.i * 4 + k) % 80)));
      out.push({
        id: `${FP}sr-${pad(p)}-${k + 1}`,
        type,
        ref: `${prefix}-F${pad(p)}${k + 1}`,
        kind,
        subtype,
        title:
          kind === "meeting"
            ? `Meeting support for ${a.company}`
            : `${subtype} for ${offering} at ${a.company}`,
        details: `${offering} scope for ${a.company}. ${at(
          [
            "Two markets in phase one, EU first.",
            "They want the delivery model and a pricing band.",
            "Existing process is manual end to end.",
            "Timeline is driven by their filing date.",
          ],
          a.i + k
        )}`,
        customerId: a.customerId,
        customer: a.company,
        opportunityIds: deal ? [deal.id] : [],
        opportunityLabels: deal ? [deal.label] : [],
        contactIds: [c1.id],
        contactNames: [c1.name],
        status: at(
          ["initiated", "assigned", "in_progress", "completed"],
          a.i + k
        ) as SolutionRequest["status"],
        ...(isRequest
          ? {}
          : {
              deliverableStatus: at(
                ["Draft", "In progress", "Ready for review", "Finalized", "Submitted to customer"],
                a.i + k
              ) as SolutionRequest["deliverableStatus"],
            }),
        priority: at(["High", "Medium", "Low"], a.i + k) as SolutionRequest["priority"],
        requestedBy: a.owner,
        requestedAt,
        neededBy: day(4 + ((a.i + k) % 40)),
        owner,
        pickedUpAt: iso(-(3 + ((a.i + k) % 30))),
        ...(kind === "meeting"
          ? { meetingAt: day(5 + ((a.i + k) % 30)), attendees: [a.owner, owner] }
          : {}),
        /* Documents, so opening one lands on the four tabs with something on
           them rather than four empty shelves. */
        docs: [
          {
            id: `${FP}sd-${pad(p)}-${k + 1}-1`,
            category: "customer",
            name: `${a.company} requirements`,
            version: 1,
            docsPath: sampleDocPath(at([...DOC_FILES], a.i + k)),
            fileName: at([...DOC_FILES], a.i + k),
            addedBy: a.owner,
            addedAt: requestedAt,
          },
          ...(k % 2 === 0
            ? [
                {
                  id: `${FP}sd-${pad(p)}-${k + 1}-2`,
                  category: "working" as const,
                  name: `${offering} response draft`,
                  version: 1,
                  docsPath: sampleDocPath(at([...DOC_FILES], a.i + k + 2)),
                  fileName: at([...DOC_FILES], a.i + k + 2),
                  assignedTo: owner,
                  addedBy: owner,
                  addedAt: iso(-(2 + ((a.i + k) % 20))),
                },
              ]
            : []),
        ],
        activity: [
          { at: requestedAt, by: a.owner, what: `Raised this ${isRequest ? "request" : type}` },
          { at: iso(-(3 + ((a.i + k) % 30))), by: owner, what: "Picked it up" },
        ],
        updatedAt: iso(-((a.i + k) % 12)),
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------ record teams */

/**
 * WHO IS ON THE ACCOUNT.
 *
 * Suren, Aug 28: "in the team I should know who's the OWNER, and then if
 * there are other people that would be one." The customer page can infer a
 * team from the work, but an account whose Team tab said "Nothing on team for
 * Isolde Bio yet" is exactly what Anir was looking at, so the mock accounts
 * get a named owner and named members.
 *
 * Keyed by ACCOUNT id, not by pair index, because teamFor looks a record up
 * by its own id. Both accounts sharing a company name get the same team,
 * which is the same answer their other tabs give.
 */
export function mockFillRecordTeams(): Record<string, RecordTeam> {
  if (!isMock()) return {};
  const teams: Record<string, RecordTeam> = {};
  for (let account = 1; account <= FILL_ACCOUNTS; account += 1) {
    const p = fillPairIndex(account);
    const a = profile(p);
    /* A handful stay unassigned on purpose: "nobody has been put on this yet"
       is a real state and he needs to see how it reads. */
    if (a.i % 17 === 5) continue;
    teams[`customer:${fillCustomerId(account)}`] = {
      owner: a.owner,
      members: [a.second, a.third, at(SALES, a.i * 3 + 11)].filter(
        (m, idx, all) => m !== a.owner && all.indexOf(m) === idx
      ),
      updatedBy: a.owner,
      updatedAt: iso(-(30 + (a.i % 60))),
    };
  }
  /* The deals and contracts carry one too, so a record opened from the
     account page has the same tab answered. */
  for (const p of names()) {
    const a = profile(p);
    for (let k = 0; k < at(DEALS, a.i); k += 1) {
      teams[`opportunity:fill-opp-${pad(p)}-${k + 1}`] = {
        owner: k % 3 === 0 ? a.owner : k % 3 === 1 ? a.second : a.third,
        members: [a.owner, a.second].filter((m, idx, all) => all.indexOf(m) === idx),
        updatedBy: a.owner,
        updatedAt: iso(-(20 + ((a.i + k) % 40))),
      };
    }
    for (let k = 0; k < at(CONTRACTS, a.i); k += 1) {
      teams[`contract:fill-ct-${pad(p)}-${k + 1}`] = {
        owner: a.owner,
        members: [a.third],
        updatedBy: a.owner,
        updatedAt: iso(-(25 + ((a.i + k) % 40))),
      };
    }
  }
  return teams;
}

/**
 * HAS THE FLOOR ALREADY BEEN LAID?
 *
 * The four stores that keep mock in a real row top themselves up once and
 * then behave like any other store, so a person can add, edit and delete in
 * mock and have it stick (Anir, Sep 2: "i should still be able to add edit and
 * delete shit if i really want"). Re-running the top-up on every read would
 * undo a deletion the moment the page reloaded, which is the one bug most
 * likely to bite here.
 *
 * The marker is the rows themselves rather than a version field, so nothing
 * needs adding to a stored shape and an older mock row that predates all this
 * is topped up on its next read without being replaced.
 */
export function hasMockFillRows(ids: Iterable<string>): boolean {
  for (const id of ids) if (id.startsWith(FP)) return true;
  return false;
}

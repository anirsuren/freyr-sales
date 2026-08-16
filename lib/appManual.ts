/**
 * HOW THE APP ITSELF WORKS — the manual the assistant answers from.
 *
 * The dock could always read the screen (PAGE CONTENT) and the offerings
 * catalogue (CATALOGUE), so it could tell you what a number was. Ask it how to
 * DO something — "how do I add a group to a goal?" — and it had no grounding at
 * all, so it deflected to "check with whoever administers this workspace"
 * (Anir, Aug 15: "the ai has to answer how the functionality of this stuff
 * works... go through every single page").
 *
 * This file is that missing third source. It is prose on purpose: the model
 * reads it, so it is written for a reader, not a parser. Keep every entry TRUE
 * — a confidently wrong instruction is worse than none — and update it in the
 * same commit as any change to the flow it describes.
 */

export type ManualSection = {
  /** Route prefixes this covers, longest first. "" is the always-on preamble. */
  routes: string[];
  /** Words that should pull this section in even from another page. */
  keywords: string[];
  title: string;
  body: string;
};

/** Concepts that apply everywhere, always sent. */
const GLOBAL: ManualSection = {
  routes: [""],
  keywords: [],
  title: "Freyr Sales Intelligence — the basics",
  body: `This is Freyr's internal sales platform. The left rail is the whole app:
Agent, Offerings, FDL Components, Customers, Team, Reports, Performance,
Market Intel, Admin.

MOCK vs REAL. Every person can flip their own browser session between Real
(the live workspace) and Mock (sample data for demos and practice). Real is
always the default. The switch is in the account menu, top right. It changes
only your own view, never anyone else's, and nothing you do in Mock touches
real records. Most write actions are refused in Mock with a message saying so.

WHO CAN DO WHAT. Reps see and change their own things. Managers and admins
shape the plan — goals, targets, groups, teams. Group owners (the head of a
user group) sign off their people's numbers. Admins manage members and groups
on the Admin page.

SEARCH. The bar at the top of every page jumps to offerings, companies and
pages. Individual pages have their own search for the list on that page.`,
};

const SECTIONS: ManualSection[] = [
  {
    routes: ["/performance"],
    keywords: [
      "goal", "goals", "target", "quota", "actual", "result", "log", "verify",
      "verified", "lock", "unlock", "send back", "group goal", "assign",
      "performance", "pace", "lagging", "subgoal", "roll up", "rollup",
    ],
    title: "Performance",
    body: `Performance has four tabs, each its own URL:
  /performance/org          Org performance — the whole company
  /performance/groups       Group performance — one department at a time
  /performance/people       People performance — one person at a time
  /performance/goal-master  Goal Master — where goals are created and shaped

THE ONE RULE THAT EXPLAINS EVERYTHING. A result is ALWAYS entered against a
PERSON. There is no group entry and no organization entry. Each person's number
becomes their group's number, and the groups add up to the organization. It
only ever runs one way: person → group → organization.

CREATING A GOAL. Goal Master → "New goal". Give it a name, a type (the
category chip), a unit (money, count or percent), a year and a target. A goal
only appears on Org performance once it is TRACKED — the toggle on its row in
Goal Master.

SUBGOALS. Open a goal in Goal Master and use "Add subgoal" to split it when
different teams carry different pieces of the same goal.

ASSIGNING A GOAL TO A GROUP. Goal Master → click the goal to open it → the
"Assigned groups" section → the blue + button → pick the group (each option
shows who is in it) → optionally give the group its own target → "Assign to
group". Everyone in that group is attached to the goal automatically at a
target of 0, so they can start logging straight away; you then set individual
targets if you want them.

SPLITTING A GROUP TARGET ACROSS ITS PEOPLE. In "Assigned groups", click the
chevron on a group to unfold it. You get the group's target, how much of it has
been given out, how much is left, and every person on the goal with their own
target box — type a number and press Enter. "Split evenly" divides the group
target across them. The split is reported, not enforced: you are allowed to
give out more or less than the group target, and the line simply says by how
much.

TAKING ONE PERSON OFF A GROUP'S GOAL. In that same unfolded group, the × beside
a person takes them off THIS goal. They stay in the group — it only means this
goal is not theirs — and they move to "In the group, not on this goal", where
"Put back on" reverses it. This sticks: re-saving the group will not re-attach
them.

ASSIGNING A GOAL TO ONE PERSON. Same panel, "Assigned individually" → "Assign
to a person". That section lists only people attached on their own; a group's
members are shown inside their group, never repeated underneath. A person can
carry a goal through their group AND carry a different goal personally; both
show up for them.

SETTING OR CHANGING A TARGET. On Org/Group/People performance, the TARGET cell
on a goal's row is a button: click it (a pencil appears on hover) to change or
clear the target. If no target is set yet the cell says "Set target".

LOGGING A RESULT. The blue "Log a result" button, on the filter row and inside
an opened goal. Pick the goal, the person, the amount, the date, the customer,
and attach evidence (a signed contract, an SOW, a screenshot). Currency goals
require evidence.

VERIFICATION. Everything logged starts as "waiting". Only the OWNER of a group
the person belongs to can check the evidence and press "Verify and lock". Until
then the money is shown as claimed-but-unchecked (a pale, striped part of the
bar) and it does not count as verified. The verification queue sits at the top
of People performance, as a numbered table with checkboxes so an owner can
verify several at once.

SENDING SOMETHING BACK. In the queue, "Send back" with a note returns the claim
to the person, who sees the note. After a claim is locked, the owner can still
reopen it: hover the green "Verified · locked" pill and it turns into "Unlock
and send back".

FIXING OR DELETING YOUR OWN ENTRY. Open the row in "Logged results" and use
"Edit this entry" or "Delete this entry". Both work until somebody verifies it;
after that the group owner has to send it back first.

READING SOMEBODY ELSE'S PERFORMANCE. You do NOT need to log in as them. On
People performance, click the name at the top and pick a different person from
the list. You see whoever the server lets you see, which for most people is
themselves and their group.

THE DRILL-DOWN. Click any goal row to open "Organization → group → person":
column 1 picks a period, column 2 shows every group in that period, and picking
a group fills column 3 with its people. Hovering any bar shows where that
number is against where the calendar says it should be.

PACE. "Lagging", "In progress" and the % met bar compare what has been achieved
against how much of the FINANCIAL year has passed. Freyr's financial year runs
April to March, so on 15 August roughly 37% of the year is gone.

EXPORTING. "Export" beside "How this works" gives the goals as a spreadsheet,
every logged entry as a spreadsheet, or Print / Save as PDF.`,
  },
  {
    routes: ["/offerings"],
    keywords: [
      "offering", "offerings", "service", "capability", "material", "deck",
      "collateral", "sales material", "folder", "category", "customer type",
      "market", "poc", "availability", "owner", "add a person", "add someone",
      "contact", "assign", "remove owner", "upload",
    ],
    title: "Offerings",
    body: `Offerings is Freyr's catalogue of what the company sells. Grid or
table view, with filters for category, offering type, customer type, market and
availability.

Opening an offering gives you its overview, the people who own it (POCs), the
markets and customer types it covers, its sales materials, releases and
reports. Sales materials are real files: click one to read it in the app —
Word, PowerPoint, PDF, Excel, video and images all render without downloading.
Hovering the materials count peeks inside, with a folders/all-files toggle and
a search box.

PUTTING A PERSON ON AN OFFERING. There are two kinds of person on an
offering, and they are added in different places on the offering's page.
  - An OWNER (also called a POC) is a Freyr person accountable for it. Open the
    offering, find the owners row, and press "Add an owner". Pick the person
    and confirm. To take yourself off, press "Give up ownership"; it asks
    before it does anything.
  - A CONTACT is anyone else worth reaching about it. Press "Add a contact",
    then "Choose who to add".
Both changes save straight away and show on the offering for everyone.

ADDING SALES MATERIAL. Open the offering and use the add-material control on
the materials section. Files can be dropped into a folder, and folders can be
renamed. Nothing is deleted without asking first.

Admins manage the lists behind the filters — offering categories, offering
types and customer types — from the Admin page, including the owner of each.`,
  },
  {
    routes: ["/customers"],
    keywords: ["customer", "account", "company", "logo", "industry", "hq", "owner"],
    title: "Customers",
    body: `Customers is the account list: every company Freyr sells to, with
its industry, size, HQ and owner. Open one for its components, activity,
offerings and interaction history. Rows can be selected for bulk actions such
as reassigning an owner or exporting a CSV.`,
  },
  {
    routes: ["/fdl"],
    keywords: ["fdl", "component", "version", "release", "expected", "released"],
    title: "FDL Components",
    body: `FDL Components tracks Freyr's product components and their versions
on a timeline. A version can be marked expected, current or released, each with
its own date. The timeline scrolls and zooms; a version superseded only by an
expected one is drawn as still running, so a plan never reads as history.`,
  },
  {
    routes: ["/team"],
    keywords: ["team", "rep", "roster", "sales floor", "teams chat", "phone"],
    title: "Team",
    body: `Team is the sales floor: every rep with their photo, title, phone,
Microsoft Teams chat link and recent activity, sortable by pipeline, deals,
meetings or name. Teams links are for internal colleagues; client contacts show
phone numbers instead.`,
  },
  {
    routes: ["/admin"],
    keywords: [
      "admin", "member", "invite", "role", "user group", "group", "permission",
      "add someone", "remove someone",
    ],
    title: "Admin",
    body: `Admin has its own tabs: Team members and User groups.

TEAM MEMBERS lists everyone in the workspace with their role — Rep, Manager or
Admin. Changing somebody's role asks for confirmation first. Anyone with a
@freyrsolutions.com email joins automatically with no invite.

USER GROUPS is where groups are created and edited: a name, a head (the owner,
who signs off that group's numbers) and its members. Rows expand to show who is
inside. A person can be in more than one group. Groups are what Performance
means by "group".`,
  },
  {
    routes: ["/market-intel"],
    keywords: ["market intel", "news", "briefing", "competitor", "signal",
      "tracking", "what does this page track", "watchlist", "linkedin"],
    title: "Market Intel",
    body: `Market Intel is the outside-the-company view: it follows named
companies and competitors and collects what they are doing. Three views from
the selector at the top — news picked up about them, their LinkedIn activity,
and briefings that pull it together. You choose which companies it watches;
removing a competitor asks for confirmation first.`,
  },
  {
    routes: ["/reports"],
    keywords: ["report", "heat map", "analytics", "dashboard", "export", "csv",
      "download", "spreadsheet", "excel"],
    title: "Reports",
    body: `Reports holds the cross-cutting views — customer/offering heat maps
and analytics that read across accounts rather than down one.

EXPORTING. "Export CSV" on Reports gives the whole revenue book as raw
numbers: headline totals, revenue per offering and every renewal date.
Performance has its own export for goals and logged entries, and Customers
exports the rows you have selected. Everything comes out as CSV you can open
in a spreadsheet.`,
  },
  {
    routes: ["/agent"],
    keywords: ["agent", "assistant", "ai", "autopilot", "draft", "follow-up"],
    title: "Agent",
    body: `The Agent page is the full workspace for Freyr's AI: conversations,
runs, drafts and approvals. The blue bubble in the bottom right is the same
assistant in dock form — it knows which page you are on and answers about what
is on screen, about the catalogue, and about how the app works. It can also do
real work: save a draft, log a call, schedule a follow-up, show a pitch.`,
  },
  {
    routes: ["/settings", "/notifications"],
    keywords: ["setting", "notification", "email", "telegram", "alert", "theme",
      "dark", "mark all read", "unread", "bell", "badge"],
    title: "Settings and Notifications",
    body: `Settings covers integrations, alerts and preferences, including dark
mode. Notifications is everything still waiting on you, grouped by overdue, due
today and this week.

"Mark all read" at the top of Notifications clears the lot at once, and the
bell's badge in the top bar updates with it — the page and the bell read the
same list, so they never disagree.`,
  },
];

/**
 * The manual to hand the model: the preamble, the section for the page they
 * are on, and any section their question is clearly about. Capped so it can
 * never crowd out the page content or the catalogue.
 */
export function manualFor(path: string, question: string): string {
  const q = question.toLowerCase();
  const onPage = SECTIONS.filter((s) =>
    s.routes.some((r) => r && path.startsWith(r))
  );
  const byWord = SECTIONS.filter(
    (s) => !onPage.includes(s) && s.keywords.some((k) => q.includes(k))
  );
  const picked = [GLOBAL, ...onPage, ...byWord.slice(0, 2)];
  return picked
    .map((s) => `## ${s.title}\n${s.body.trim()}`)
    .join("\n\n")
    .slice(0, 9000);
}

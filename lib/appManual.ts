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
 *
 * RULE FOR EDITING THIS FILE: every control named here is quoted from the JSX
 * that renders it. Never write a label you have not grepped for. Aug 16's sweep
 * found the manual sending people to an "Add a contact" button on the offering
 * page — OfferingContacts is real code but nothing renders it, so the button
 * was not there. An invented control is the worst answer the agent can give.
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
  body: `This is Freyr's internal sales platform. The left rail in the live
workspace is: Agent, Offerings, FDL Components, Customers, Team, Reports,
Performance, Market Intel, Admin. Settings and Notifications are reached from
the top bar, not the rail. FDL Components lives at /components.

WHO CAN OPEN WHAT. This is a real block, not just a hidden menu item: a rep who
types the URL is sent back to Offerings.
  - Everyone (Rep, Manager, Admin): Agent, Offerings, Team, Settings,
    Notifications.
  - Managers and Admins only: FDL Components, Customers, Reports, Performance,
    Market Intel.
  - Admins only: Admin. Managers cannot open it.
So "a rep cannot see Customers" is correct behaviour, not a fault. Editing
inside a module is gated further, and each page says so below.

READY NOW vs IN PROGRESS. Everyone can flip their own browser session between
the finished app and the one still being built. Account menu, top right, under
"Show me": "Ready now" is the live workspace (the default), "In progress" is
sample data for demos and practice. In progress mode shows extra modules that
are still being built and puts a banner across the top saying the data is fake.
The same switch is on Settings under "Data view", where it is worded "Real
mode" and "Mock mode". It changes only your own view, never anyone else's, and
most write actions are refused in progress mode with a message saying so.

SEARCH AND KEYBOARD. The bar across the top is a button, not a text box: it
reads "Search offerings, companies, contacts, or jump to a page…". Press Enter
anywhere on a page to open it, then type to jump to an offering, a company or
any page. "?" opens the "Keyboard shortcuts" list. Esc closes any dialog, menu
or palette. Individual pages have their own search for the list on that page.

DARK MODE. Account menu, top right, under "Appearance": "Light" or "Dark". The
same pair is on Settings under Profile, also headed "Appearance". It is saved
on this device, not on your account.

THE ACCOUNT MENU (your name, top right) holds, in order: "Show me",
"Appearance", "Profile and settings", "Agent settings", "Admin", "Service
catalog", "Recordings", "Keyboard shortcuts", "Switch account" and "Log out".

THE AGENT. The blue bubble bottom right ("Open your agent") and the sparkle in
the top bar ("Ask your agent") open the same assistant. It knows which page you
are on. It answers and it writes drafts; it cannot save, send, file, schedule
or change anything in the workspace.`,
};

const SECTIONS: ManualSection[] = [
  {
    routes: ["/performance"],
    keywords: [
      "goal", "goals", "target", "quota", "actual", "result", "log", "verify",
      "verified", "lock", "unlock", "send back", "group goal", "assign",
      "performance", "pace", "lagging", "subgoal", "roll up", "rollup",
      "evidence", "claim", "sign off", "tracked", "tracking",
    ],
    title: "Performance",
    body: `Performance is open to Managers and Admins only; a Rep who opens it
is redirected to Offerings. It has four tabs, each its own URL:
  /performance/org          "Org performance" — the whole company
  /performance/groups       "Group performance" — one department at a time
  /performance/people       "People performance" — one person at a time
  /performance/goal-master  "Goal Master" — where goals are created and shaped

THE ONE RULE THAT EXPLAINS EVERYTHING. A result is ALWAYS entered against a
PERSON. There is no group entry and no organization entry. Each person's number
becomes their group's number, and the groups add up to the organization. It
only ever runs one way: person → group → organization.

CREATING A GOAL. Goal Master → "New goal". Fields: "Goal name", "Goal type",
"Counted in" (Money ($) / Count (#) / Percentage (%)), "How it adds up"
(Running total or Latest value), "Year", and the annual target. Save with "Add
to the goal master". A goal only appears on Org performance once its Tracking
switch is on. That switch is on the goal's own row in Goal Master, in the
column headed "Tracking", where the pill reads "Tracking" or "Not tracked"; the
goal editor carries the same switch worded "Track on Org performance".

SUBGOALS. Open a goal and use "Add subgoal" to split it when different teams
carry different pieces of the same goal.

ASSIGNING A GOAL TO A GROUP. Open the goal → the "Assigned groups" section →
the blue + ("Assign this goal to a group") → pick the "Group" (each option
shows who leads it and how many people) → optionally set "Group target
(optional)" → "Assign to {group}". Everyone in that group joins the goal at a
target of 0 so they can log straight away.

SPLITTING A GROUP TARGET. Expand a group row for "Split of the group target":
how much is given out, how much is left, and every person with their own target
box. "Split evenly ({amount} each)" divides it. The split is reported, not
enforced — the line just says how much is still to give, or how much you are
over.

TAKING ONE PERSON OFF A GOAL. In that unfolded group, the × beside a person,
then "Take off". They stay in the group and move to "In the group, not on this
goal", where "Put back on" reverses it.

ASSIGNING TO ONE PERSON. Same panel, "Assigned individually" → the + ("Assign
this goal to a person") → "Person" and an optional "Personal target" →
"Assign goal". A group's members are shown inside their group, never repeated
here.

SETTING A TARGET. On Org/Group/People performance the Target cell on a goal's
row is a button. If nothing is set it reads "Set target".

LOGGING A RESULT. The blue "Log a result" button on the filter row, and again
inside an opened goal. The modal asks for Goal, Subgoal, Person, Amount, Date,
Customer, "Deal (optional)", "Evidence" ("＋ Attach a file", up to five) and
"Note (optional)". Submit with "Submit for verification". A money goal cannot
be submitted until the contract is attached.

VERIFICATION. Everything logged starts as waiting. Only the OWNER of a group
the person belongs to can verify it. On People performance they get a card
headed "Waiting for your verification" (it only appears if you head a group).
"Review" on a row opens "Review this claim" with the evidence, then "Verify and
lock" or "Send back". Send back asks "What needs fixing before you can verify
this?" and the note goes to the person. Several rows can be ticked and cleared
at once with "Verify and lock {n} ✓". A locked entry shows "Verified · locked";
hovering it as the owner turns it into "Unlock and send back".

YOUR OWN ENTRIES. The "Logged results" card lists what you logged, with "Edit
this entry" and "Delete this entry". Both work only while it is still waiting.
A returned claim shows "Sent back: {note}" — fix it with "Edit this entry".

READING SOMEBODY ELSE'S NUMBERS. On People performance click the name at the
top and pick another person. You see yourself plus anyone in a group you head;
admins see everyone.

THE DRILL-DOWN. Clicking a goal name opens /performance/goal/{id}: a section
headed "Organization → group → person" with three boxes, "1 · Organization"
(pick a period), "2 · Groups" and "3 · People". The period picker offers Weeks,
Months, Quarters, Halves and Years. It counts verified results only; claims
still waiting are shown separately as "+{amount} waiting".

PACE. "Target met", "Ahead", "On track", "Lagging" and "No target yet" compare
what is achieved against how much of the FINANCIAL year has passed. Freyr's
financial year runs April to March. A goal can read Lagging while results sit
unverified, because only verified numbers count.

EXPORTING. "Export", beside "How this works", offers "Goals as a spreadsheet",
"Every logged entry" and "Print / Save as PDF".

WHO CAN CHANGE WHAT. Only managers and admins change the plan itself — goals,
subgoals, groups, assignments. Anyone in the module can log their own result,
and only a group's owner verifies its people's numbers.`,
  },
  {
    routes: ["/offerings"],
    keywords: [
      "offering", "offerings", "service", "capability", "material", "deck",
      "collateral", "sales material", "folder", "category", "customer type",
      "market", "poc", "availability", "owner", "add a person", "add someone",
      "assign", "remove owner", "upload", "file", "document", "pptx", "slide",
    ],
    title: "Offerings",
    body: `Offerings is Freyr's catalogue of what the company sells. Everyone
can open it. Tiles or Rows, with filters for "Category", "Type", "GTM status"
(Available Now / Coming Soon / To Be Decided), "Owner" and customer type, plus
"Sort" and a "Search offerings…" box. There is no export on this page.

At the top, admins and managers get "New offering", "Import" (an Excel file of
offerings) and a "Manage" menu whose "Master lists" are "Offering categories",
"Offering types" and "Customer types" — that is where the filter lists
themselves are maintained.

AN OFFERING'S TABS: "Overview", "Sales Materials (n)", "Components (n)",
"Customers (n)" (hidden from Reps), "Competition (n)", and "Reports" (which
only shows in progress mode). Other actions on the header: "Use in a pitch",
"Add to a customer", "Ask Freyr AI", and a pencil to edit for people allowed to.

PUTTING A PERSON ON AN OFFERING. The Overview side rail has a card headed "Who
can edit this". "Add an owner" opens a searchable list and confirms with "Add
owner"; an owner may edit that offering's content, materials and contacts. Only
a WORKSPACE ADMIN sees "Add an owner", so if you need ownership, ask an admin —
there is no self-service request button. To step down from an offering you own,
use "Give up ownership"; it asks first. There is no contacts control on the
offering page.

SALES MATERIALS. Real files: click one to read it in the app. PDF, Word,
PowerPoint, Excel, text, CSV, video and images all render without downloading,
and a zip opens as a list you can click into. The tab has "Search materials…",
"All formats", "All buyer's journey stages", "All access levels", and a
Folders / All files switch. Hovering the materials count peeks inside.

THE THREE ACCESS LEVELS on a material, set by "Who can view this file?".
"Client Facing" and "Internal Only" are both visible to everyone in the
workspace; they label how the file may be used outside, they are not a lock.
"Freyr AI Only" IS a lock: the assistant reads that file and answers from it,
but only a recorded owner of that offering can see the row or open it, and the
assistant never names it or its filename to anyone else.

ADDING A FILE. The + on the materials section ("Add material") opens "Add
sales materials". Pick the "File format", a "Folder" (required), the "Buyer's
journey stage", "Who can view this file?" and the "Division", then drop files
on "Drop files or a whole
folder here" or use "Or paste a link". Finish with "Add material" / "Add n
materials". The same + also offers "Create a folder". Renaming a folder (the
pencil, "Rename this folder" → "Save name") is workspace-admin only. Deleting
asks first: "Remove this material?" → "Remove material". All of this needs edit
rights: a workspace admin, or an owner of that offering. Everyone else sees
"View only" or "You don't own this offering" and is told to ask an admin.

COMPONENTS ON AN OFFERING. The "Components" tab lists the FDL components inside
the package; "Connect component" adds one and "Disconnect from this offering"
takes it out.

EDITING OR DELETING THE OFFERING ITSELF. The pencil on the header opens the
edit form, which is sectioned into "The basics", "Offering brief & service
cards", "Who it's for", "Where it's available" and "Sales materials". Nothing
saves until you press "Save changes", and leaving with unsaved work asks first.
Deleting the whole offering is at the foot of that same edit form: "Delete
offering", which then asks "Delete this offering? This can't be undone." with
"Delete" and "Keep". Same edit rights as everything else: a workspace admin, or
an owner of that offering.`,
  },
  {
    routes: ["/customers"],
    keywords: [
      "customer", "account", "company", "logo", "industry", "hq", "owner",
      "reassign", "import", "csv", "digital component", "tabs", "interaction",
    ],
    title: "Customers",
    body: `Customers is the account list: every company Freyr sells to. It is
open to Managers and Admins only.

The toolbar has "Search customers…", a health filter, a sort, a page size, a
"Select accounts" toggle and an "Export CSV" button that downloads whatever the
filters are currently showing. Admins also get "Add customer" and "Import CSV"
in the header; the CSV columns are company_name, website_url, contact_name,
contact_email.

BULK ACTIONS INCLUDING REASSIGNING AN OWNER. Press "Select accounts", tick the
rows, and a bar appears with "{n} selected". It offers "Run analysis",
"Assign owner" (pick the person, then press "Assign"), "Export" (just the rows
you ticked) and "Clear selection".

WHICH TABS A CUSTOMER HAS. This is the usual surprise. In Ready now (real) mode
a customer page shows only two tabs, "Digital components" and "Activity" —
everything else is still being built and is deliberately hidden, not missing
data. Flip to In progress and the full set appears: Overview, Analytics,
Offerings, Digital components, Contacts, Deals, Sessions, Notes and Activity.
So in the live workspace there is no Offerings tab on a customer; what a
customer runs is on "Digital components", and the customer-by-offering picture
lives on the Customer Offering Heat Map under Reports.

RECORDING WHAT A CUSTOMER RUNS. The "Digital components" tab lists every
component and its version, with columns Component, Type, Current version,
Version status and Next version. "Connect component" adds one (admins and
managers). The same link can be made from the component's own page.

LOGGING WHAT IS HAPPENING. The "Activity" tab has "Offering activity" with
"Log an activity", where an activity is tied to an offering and carries a
status, dates and a value, plus an "Interactions" timeline underneath.

The header also has "New session", "Report" (a printable account report) and
"Refresh research".`,
  },
  {
    routes: ["/components", "/fdl"],
    keywords: [
      "fdl", "component", "components", "version", "release", "expected",
      "released", "current version", "timeline", "feature sheet", "release calendar",
    ],
    title: "FDL Components",
    body: `FDL Components is at /components and is called "FDL Components" in
the left rail: the Freya Digital components, the software pieces an offering is
made of. Managers and Admins only. Each component keeps its own versions and
features.

THE LIST. "Search components…", a type filter (Module, Agent, Platform), an
offering filter, and a release-state filter (Has a current version, No version
yet, Next version planned). "New FDL component" creates one (name and type,
then "Create component"). "Release calendar" opens a month-by-month grid of
every version.

THE THREE VERSION WORDS. "Released" (it has shipped), "Current" (the one
sellers quote today) and "Expected" (planned, not out yet). A version
superseded only by an expected one is still drawn as running, so a plan never
reads as history.

A COMPONENT'S PAGE is one scrolling page, not tabs: "Versions", "Features",
"Customers running this" and "Compare versions".

MARKING A VERSION. On a version card: "Set a date" (or the date itself, to
change it), "Mark released" / "Mark expected" to flip its state, "Mark current"
to make it the one customers are on, "Download the V{n} feature sheet", and a
bin that asks "Remove this version?" first. "Add version" creates one, with a
"Released" or "Coming next" choice and a "This is the current version"
checkbox. All of this needs manager or admin rights.

THE TIMELINE. Switch the Versions section from "List" to "Timeline". Drag to
pan, pinch or Ctrl/Cmd + scroll to zoom, and "Fit every version" to see the
whole thing. There are no + / − buttons. Versions with no date sit in a "No
date yet" lane at the bottom and move up as soon as you give them one.

HOW IT CONNECTS. To an offering: "Add to an offering" on the component's header
opens "Which offerings include {name}?", or go the other way from the
offering's "Components" tab and press "Connect component". To a customer: "Add
a customer" on the component's page, or the customer's own "Digital components"
tab. Both directions write the same link.`,
  },
  {
    routes: ["/team"],
    keywords: ["team", "rep", "roster", "sales floor", "teams chat", "phone",
      "invite", "invitation", "teammate", "joiner", "new starter"],
    title: "Team",
    body: `Team is the sales floor and every role can open it: the card is
headed "The sales floor (n)" and lists everyone with their photo, title, phone,
Microsoft Teams chat link and recent activity. Search, filter by role, region
or pipeline, and sort by "Open pipeline", "Open deals", "Meetings" or "Name",
as Tiles or Rows. The Teams button reads "Message {first name} on Teams" and is
for internal colleagues; client contacts get phone numbers instead. Clicking a
person opens their own analytics page.

INVITING SOMEONE. There IS an invite here: the "Invite" button in the top right
of the page, which admins see. It opens "Invite a teammate" and asks for a
"Starting role" (Rep, Manager or Admin), "Full name", "Work email" and an
optional "Note" that goes into the email, then "Send invitation". They get an
email with a link that signs them in; it expires after 14 days and an admin can
change their role later from the Admin page. Separately, anyone with a
@freyrsolutions.com address joins automatically with no invite at all.

WHY EVERY NUMBER IS ZERO. In the live workspace the roster is real people but
every pipeline figure is 0 on purpose — the page says "Pipeline numbers fill in
as deals are logged". Nothing is broken and nothing is hidden; no deals exist
yet. In progress mode shows a populated sample floor instead.`,
  },
  {
    routes: ["/reports"],
    keywords: ["report", "heat map", "heatmap", "matrix", "analytics",
      "dashboard", "export", "csv", "download", "spreadsheet", "excel",
      "renewal", "revenue", "board"],
    title: "Reports and the Customer Offering Heat Map",
    body: `Reports is Managers and Admins only. It reads across accounts rather
than down one: stat tiles for revenue, licensed users, customers, offerings,
contracts and work in progress, charts for "Revenue by category", "Revenue by
type" and "Top offerings", then two tables, "Every offering, by revenue" and
"Renewals & contract terms". If no revenue has been logged the page says "No
offering revenue yet" and explains that reps log revenue on each customer.

EXPORTING. "Export CSV" at the top gives the whole revenue book in one file:
headline totals, then revenue per offering, then every contract with its end
date. Performance has its own separate export for goals and logged entries, and
Customers exports the rows you have selected.

THE HEAT MAP. It is called the "Customer Offering Heat Map" and it is its own
page — the card on Reports links to it with "Open report". It is every customer
against every offering. Controls: a search box, a "Cell display" menu ("Show
the activity", "Show dollar value", "Show the start date", "Show the end
date"), an activity filter (Lead, Opportunity, Pilot, Contract, Delivery), a
status filter (Initiated, Under progress, Completed), a full-screen button, and
pins to freeze the customer column or the offering row while you scroll.

A cell reading "None" means nothing has been logged for that customer and that
offering — it is an empty pairing, not a zero.

Clicking a cell opens an editor titled "{Customer} × {Offering}". If it is
empty you get "Add the first activity"; otherwise "Add activity" or "Continue
activity" plus an "Activity log" of every attempt. Each row carries the
activity, its status, a value and dates, and exactly one row must be ticked as
the "Report row" — that is the one the heat map shows. Save with "Save
activity". The heat map itself has no export.`,
  },
  {
    routes: ["/agent"],
    keywords: ["agent", "assistant", "ai", "autopilot", "draft", "follow-up",
      "chat", "knowledge base", "tone", "snippet", "digest"],
    title: "Agent",
    body: `/agent is one full-page chat, not a console of tabs. Down the left
are your past conversations with "New chat" at the top, and at the bottom two
buttons: "Knowledge base" and "Agent settings". There is no queue and no
approvals screen. The composer sends on Enter, Shift+Enter for a new line, and
before your first message it offers a few starting prompts.

STOPPING IT USING A DOCUMENT. That is what "Knowledge base" is for. It opens a
list grouped into "Uploaded documents", "Offerings", "Customer types" and
"Markets", and each one can be switched off so the agent stops drawing on it.
The header shows how many are "turned off" and "Reset" turns them all back on.
"Done" closes it.

CHANGING HOW IT BEHAVES. /agent/settings, also reachable from the account menu
as "Agent settings". Under "Agent preferences": "Only act on my accounts",
"Focus industry", "Default draft tone" (warm, formal or brief), whether
autopilot may re-engage cooling deals or stabilize at-risk accounts, an "Always
ask above" money threshold, an "Autopilot schedule" and a "Digest schedule".
Underneath is a "Snippet library" of saved lines you can search, rename and
delete.

THE DOCK. The bubble bottom right is the same assistant, on every page except
the /agent pages themselves and any edit or new form. Its header says which
page or record it is looking at, and it suggests three prompts for that page
before you type.

WHAT IT CAN AND CANNOT DO. It answers about what is on your screen, the
offerings catalogue and its uploaded materials, the Market Intelligence feed,
and how this app works. It writes full drafts for you to copy. It cannot save,
send, file, schedule or change anything in the workspace, and it never contacts
anyone — so it will show you a draft and stop there.`,
  },
  {
    routes: ["/market-intel"],
    keywords: ["market intel", "news", "briefing", "competitor", "signal",
      "tracking", "track", "what does this page track", "watchlist", "linkedin",
      "follow", "m&a", "acquisition", "refresh"],
    title: "Market Intel",
    body: `Market Intel is the outside-the-company view and is open to Managers
and Admins only. Three views from the selector at the top:
  "Customer Intelligence"   — what the market is saying about customers you track
  "Competitor Intelligence" — what your competitors are doing
  "Market Intelligence"     — mergers and acquisitions across the industry
Each covers roughly the past three months of LinkedIn activity, news and
signals, and each company has a written rundown pulling it together.

TRACKING A COMPANY OR A COMPETITOR. The button reads "Track a company", or
"Track a competitor" on the competitor view. It asks for one thing, "Their
LinkedIn page" (like linkedin.com/company/their-name), then "Start tracking".
The name, logo, posts, news and briefing are all pulled from that page, and it
takes about half a minute. Note the modal is titled "Track a company" even when
you started from the competitor button.

FOLLOWING ONE PERSON AT A COMPANY. There is a control for this. Open the
company, find the people section, and press the + ("Follow someone here"). Give
it "Their LinkedIn profile" (linkedin.com/in/their-name) and press "Follow
their posts". To stop, use the person's own control and confirm "Stop".

STOPPING TRACKING. On the company's page, "Stop tracking", then confirm "Yes,
stop" — it always asks first.

REFRESHING. There is no refresh button, by design. The chip near the top reads
"Updated {how long ago}"; clicking it opens the refresh schedule, which says
"Live data · twice a day" and when the next refresh is due. Everyone sees the
same feed.

READING A BRIEFING. Search inside it, filter to company posts, people posts,
news or signals, choose a time range from the past day to the past three
months, and switch between rows, tiles and a table.

REAL OR SAMPLE. In progress mode labels itself: a chip reading "Sample data
preview" and a footer saying the companies are real but every person, post,
article and signal is illustrative. In Ready now mode it is the live feed.`,
  },
  {
    routes: ["/admin"],
    keywords: [
      "admin", "member", "invite", "role", "user group", "group", "permission",
      "add someone", "remove someone", "manager", "rep", "head", "owner of a group",
    ],
    title: "Admin",
    body: `Admin is for workspace ADMINS only — managers cannot open it, and a
non-admin who lands there is told "Admin tools are open to workspace admins."
It has two tabs, both at /admin: "Team members" and "User groups".

TEAM MEMBERS is a card headed "Member roles": everyone in the workspace with a
role picker offering Rep, Manager and Admin. Changing a role opens a
confirmation, "Give them more access?" or "Reduce their access?", which spells
out what that role can do before you press "Make {name} a {role}". Nothing is
sent until you confirm, and the server refuses a role change from anyone who is
not an admin. The role picker is the ONLY control here: there is no button to
remove, delete or suspend a member anywhere in the app, so taking someone out
of the workspace is not something this app does — a suspended person shows a
"Suspended" badge, but nothing here sets it. There is no invite button here
either; inviting is done from the Team page. Anyone with a @freyrsolutions.com
email joins automatically with no invite.

USER GROUPS is where departments are created. "New group" opens "New user
group" and asks for a "Group name", a "Group owner" (the person who runs that
group's performance and verifies its people's numbers) and "People in the
group". Save with "Create group"; all three are required. Rows expand to show
who is inside, the pencil edits, and the bin asks "Remove this group?" first,
warning that the group disappears from Performance while its people and their
goals are untouched. A person can be in more than one group. Groups are exactly
what Performance means by "group", and picking the owner does not automatically
put them in the group.`,
  },
  {
    routes: ["/settings", "/notifications", "/onboarding"],
    keywords: ["setting", "settings", "notification", "email", "telegram",
      "alert", "theme", "dark", "mark all read", "unread", "bell", "badge",
      "signature", "profile", "photo", "time zone", "password", "passkey",
      "integration", "tour", "onboarding", "access request", "linkedin profile"],
    title: "Settings, Notifications and the product tour",
    body: `SETTINGS (/settings) is a rail of sections: "Workspace", "Profile",
"Team", "Notifications", "Integrations" and "Access". The released workspace
does not show the Notifications and Integrations sections yet, so say they are
not there rather than describing them, unless the person is in progress mode.

  Workspace — "Data view", the same Ready now / In progress switch as the
  account menu, worded here as "Real mode" and "Mock mode"; and "Guided product
  tour", whose "Open product tour" button starts a page-by-page walkthrough you
  can resume whenever you like. That tour is the guide for a new joiner.

  Profile — your picture (click it to upload, or "Remove picture"), "Full
  name", "Title" (your job title), "Email" (read-only), "Time zone", "Email
  signature", "LinkedIn profile", "Touch ID and passkeys", and "Save profile",
  which only appears once you have changed something. Below that sits
  "Appearance" with "Light" and "Dark", and "Reset password".

  Team — the member directory with roles, statuses and pending invitations.

  Notifications — channel cards for email and Slack / Teams, then "Notification
  rules": "New session created", "Outcome logged", "Rotting deal alert" and
  "Weekly pipeline digest".

  Integrations — "Connect" for Email, Calendar, CRM, Slack / Teams and
  LinkedIn, then "System services", the engines Freyr runs on, each marked
  "Live" or "Not configured". Those are set up with secure keys by an admin;
  there is nothing to connect there yourself.

  Access — whether the workspace is invite-only, the "Access requests" queue
  where an admin presses "Approve" or "Reject", and a "Role permissions" table
  comparing Admin, Manager and Rep.

NOTIFICATIONS (/notifications) is everything still waiting on you, in four
groups: "Overdue", "Today", "This week" and "Later". A selector at the top
switches between "All (n)" and "Unread (n)" — that is how you see only what you
have not read. "Mark all read" clears the lot at once and the bell's badge
updates with it, because the page and the bell read the same list. The bell
panel itself has no mark-all; clicking a row there marks just that one, and
"View all notifications" at its foot opens this page.`,
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
    .slice(0, 14000);
}

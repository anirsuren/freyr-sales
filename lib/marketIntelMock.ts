/**
 * MARKET INTELLIGENCE - SAMPLE DATA (Anir, Aug 10, from Anant's ask: "for
 * approx. 30-40 companies, publicly available data on their senior employees'
 * LinkedIn activity, recent online news, competition signals... live data
 * from the past 3 months that keeps refreshing").
 *
 * This is a DESIGN MOCKUP. Nothing here is fetched, scraped or true:
 * - Companies are real names from the workspace so the demo lands, but every
 *   PERSON is fictional (house rule: never invent data on a real person) and
 *   every post, headline and signal is illustrative sample content.
 * - Dates are stored as days-ago and rendered against today, so the mockup
 *   always claims "the past 3 months" no matter when it is opened.
 */

export type MiSignalKind =
  | "hiring"
  | "leadership"
  | "competitor"
  | "regulatory"
  | "expansion"
  | "deal";

export const SIGNAL_META: Record<
  MiSignalKind,
  { label: string; color: string }
> = {
  hiring: { label: "Hiring surge", color: "#0891B2" },
  leadership: { label: "Leadership change", color: "#7C3AED" },
  competitor: { label: "Competitor move", color: "#B4318F" },
  regulatory: { label: "Regulatory filing", color: "#0071E3" },
  expansion: { label: "Market expansion", color: "#0F766E" },
  deal: { label: "Deal or partnership", color: "#C2410C" },
};

export type MiPerson = {
  id: string;
  name: string;
  role: string;
  posts90d: number;
};

export type MiPost = {
  personId: string;
  daysAgo: number;
  text: string;
  reactions: number;
  comments: number;
};

export type MiNews = {
  daysAgo: number;
  source: string;
  headline: string;
  summary: string;
};

export type MiSignal = {
  daysAgo: number;
  kind: MiSignalKind;
  title: string;
  detail: string;
  why: string;
};

export type MiCompany = {
  id: string;
  name: string;
  industry: string;
  hq: string;
  /** Activity change vs the previous month, in percent. */
  momentum: number;
  /** Items per week, oldest first, 12 weeks. */
  trend: number[];
  competitors: string[];
  people: MiPerson[];
  posts: MiPost[];
  news: MiNews[];
  signals: MiSignal[];
};

export function miDate(daysAgo: number): Date {
  return new Date(Date.now() - daysAgo * 86_400_000);
}

export function miDateLabel(daysAgo: number): string {
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return `${daysAgo} days ago`;
  return miDate(daysAgo).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** A stable "updated N min ago" per company, so the page reads live without
 *  Math.random and without changing between server and client render. */
export function miFreshMinutes(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return 4 + (h % 43);
}

export const MI_COMPANIES: MiCompany[] = [
  {
    id: "takeda",
    name: "Takeda",
    industry: "Global biopharma",
    hq: "Tokyo, Japan",
    momentum: 42,
    trend: [3, 4, 2, 5, 6, 4, 7, 6, 9, 8, 11, 12],
    competitors: ["Parexel", "IQVIA", "Certara"],
    people: [
      { id: "tk-1", name: "Yuki Hamada", role: "VP, Global Regulatory Affairs", posts90d: 9 },
      { id: "tk-2", name: "Priya Raghavan", role: "Head of Regulatory Operations", posts90d: 6 },
      { id: "tk-3", name: "Daniel Osei", role: "Director, Regulatory Intelligence", posts90d: 4 },
    ],
    posts: [
      { personId: "tk-1", daysAgo: 2, text: "Proud of our regulatory team for closing three simultaneous submissions across APAC this quarter. The lesson: start label alignment earlier than you think you need to.", reactions: 412, comments: 38 },
      { personId: "tk-2", daysAgo: 9, text: "We are rethinking how regulatory operations teams measure cycle time. Counting days between milestones hides where the waiting actually happens.", reactions: 187, comments: 22 },
      { personId: "tk-3", daysAgo: 21, text: "Attending DIA next month. If your team is working on AI-assisted regulatory intelligence, I would love to compare notes.", reactions: 96, comments: 14 },
      { personId: "tk-1", daysAgo: 44, text: "Hiring two senior regulatory scientists for our Boston hub. Rare chance to shape a new submissions platform from the ground up.", reactions: 523, comments: 61 },
      { personId: "tk-2", daysAgo: 63, text: "A quiet milestone: our 100th electronic submission this year with zero validation errors. Consistency is a feature.", reactions: 240, comments: 19 },
    ],
    news: [
      { daysAgo: 4, source: "Reuters", headline: "Takeda outlines digital overhaul of regulatory operations", summary: "In an investor briefing, leadership named regulatory technology one of three priority areas for operational spend next fiscal year, citing submission volume growth across emerging markets." },
      { daysAgo: 17, source: "Fierce Pharma", headline: "Takeda expands Boston regulatory hub with 40 new roles", summary: "The expansion focuses on regulatory science and submissions management, consolidating work previously spread across three sites." },
      { daysAgo: 39, source: "Endpoints News", headline: "Takeda files two major label updates in the EU", summary: "Both updates move through the centralized procedure and are expected to complete review within the year." },
      { daysAgo: 71, source: "PharmaTimes", headline: "Takeda signs multi-year data partnership for safety analytics", summary: "The agreement covers post-market surveillance data across four regions, with an option to extend into regulatory intelligence." },
    ],
    signals: [
      { daysAgo: 6, kind: "hiring", title: "Regulatory hiring up sharply", detail: "31 open regulatory roles this month against a 12-month average of 11.", why: "Teams staff up ahead of platform decisions. This is the window to be in the room." },
      { daysAgo: 17, kind: "expansion", title: "Boston regulatory hub expansion", detail: "New hub consolidates submissions work from three sites into one.", why: "Consolidation usually triggers a tooling review across everything the sites used separately." },
      { daysAgo: 52, kind: "competitor", title: "Competitor pilot reported", detail: "Industry chatter places a rival intelligence vendor in a limited pilot with one Takeda division.", why: "A pilot is not a rollout. A strong counter-demo now keeps the decision open." },
    ],
  },
  {
    id: "gsk",
    name: "GSK",
    industry: "Global biopharma",
    hq: "London, UK",
    momentum: 18,
    trend: [5, 6, 6, 4, 7, 5, 6, 8, 7, 6, 8, 9],
    competitors: ["IQVIA", "Veeva", "ArisGlobal"],
    people: [
      { id: "gk-1", name: "Eleanor Whitfield", role: "SVP, Regulatory Affairs", posts90d: 7 },
      { id: "gk-2", name: "Marcus Adeyemi", role: "Director, Regulatory Systems", posts90d: 5 },
    ],
    posts: [
      { personId: "gk-1", daysAgo: 5, text: "Regulatory teams do not need more dashboards. They need fewer systems that disagree with each other.", reactions: 634, comments: 87 },
      { personId: "gk-2", daysAgo: 26, text: "We just finished mapping every handoff in our submission process. 14 systems touch a single dossier. There is the roadmap.", reactions: 301, comments: 45 },
      { personId: "gk-1", daysAgo: 58, text: "Grateful to the team that ran our regulatory data quality sprint. Unglamorous work that everything else depends on.", reactions: 289, comments: 21 },
    ],
    news: [
      { daysAgo: 11, source: "Reuters", headline: "GSK to consolidate regulatory systems under one platform", summary: "The company confirmed a program to reduce its regulatory software estate, with vendor selection expected within two quarters." },
      { daysAgo: 33, source: "Regulatory Focus", headline: "GSK regulatory head calls for interoperable submission standards", summary: "Speaking at an industry panel, leadership pushed for cross-vendor data standards for dossier exchange." },
      { daysAgo: 80, source: "Fierce Pharma", headline: "GSK reorganizes R&D operations, regulatory moves under new leadership", summary: "The reorganization places regulatory affairs alongside development operations, reporting into the chief development office." },
    ],
    signals: [
      { daysAgo: 11, kind: "deal", title: "Platform consolidation program confirmed", detail: "Public commitment to reduce the regulatory software estate, selection within two quarters.", why: "An open selection window is the single best time to be evaluated. This one has a clock on it." },
      { daysAgo: 80, kind: "leadership", title: "Regulatory moved under new leadership", detail: "Regulatory affairs now reports into the chief development office.", why: "New owner, new budget review. Prior vendor loyalties reset." },
    ],
  },
  {
    id: "novartis",
    name: "Novartis",
    industry: "Global biopharma",
    hq: "Basel, Switzerland",
    momentum: -8,
    trend: [9, 8, 10, 7, 8, 6, 7, 5, 6, 5, 6, 5],
    competitors: ["Veeva", "Parexel"],
    people: [
      { id: "nv-1", name: "Sofia Lindqvist", role: "Global Head, Regulatory Excellence", posts90d: 5 },
      { id: "nv-2", name: "Arjun Mehta", role: "Head of Submission Management", posts90d: 3 },
    ],
    posts: [
      { personId: "nv-1", daysAgo: 8, text: "The best regulatory teams I have worked with treat every health authority question as free consulting. Log it, tag it, learn from it.", reactions: 452, comments: 53 },
      { personId: "nv-2", daysAgo: 37, text: "Six months into our submission automation pilot. The honest readout: 30 percent faster on document assembly, no change yet on review cycles.", reactions: 275, comments: 40 },
    ],
    news: [
      { daysAgo: 14, source: "Endpoints News", headline: "Novartis trims external spend, reviews vendor contracts", summary: "A cost program covering commercial and development operations puts existing vendor agreements under review through the end of the year." },
      { daysAgo: 47, source: "PharmaTimes", headline: "Novartis reports automation gains in submission assembly", summary: "An internal pilot cut document assembly time by roughly a third, with review cycles unchanged so far." },
    ],
    signals: [
      { daysAgo: 14, kind: "competitor", title: "Vendor contracts under review", detail: "Cost program puts existing agreements, including a rival platform, under review.", why: "Reviews cut both ways. An incumbent under cost pressure is an opening." },
      { daysAgo: 47, kind: "regulatory", title: "Automation pilot readout published", detail: "Assembly 30 percent faster, review cycles unchanged.", why: "They have proven appetite and found the gap. The gap is exactly what Freya.Submit addresses." },
    ],
  },
  {
    id: "incyte",
    name: "Incyte",
    industry: "Biopharma",
    hq: "Wilmington, USA",
    momentum: 25,
    trend: [2, 2, 3, 2, 4, 3, 5, 4, 5, 6, 5, 7],
    competitors: ["Certara", "ArisGlobal"],
    people: [
      { id: "in-1", name: "Rachel Donnelly", role: "VP, Regulatory Affairs", posts90d: 6 },
      { id: "in-2", name: "Tomas Keller", role: "Associate Director, Labeling", posts90d: 4 },
    ],
    posts: [
      { personId: "in-1", daysAgo: 3, text: "Scaling a regulatory team from 20 to 60 people in eighteen months taught me one thing: process debt compounds faster than headcount.", reactions: 388, comments: 49 },
      { personId: "in-2", daysAgo: 29, text: "Label consistency across 40 markets is a data problem wearing a document costume.", reactions: 214, comments: 31 },
    ],
    news: [
      { daysAgo: 9, source: "BioSpace", headline: "Incyte builds out European regulatory presence", summary: "New roles across three EU markets support a broadening late-stage pipeline, with labeling and submissions named as immediate needs." },
      { daysAgo: 55, source: "Fierce Pharma", headline: "Incyte pipeline expansion drives operations hiring", summary: "Late-stage readouts expected next year are pulling forward investment in regulatory and quality operations." },
    ],
    signals: [
      { daysAgo: 9, kind: "expansion", title: "European regulatory build-out", detail: "Hiring across three EU markets, labeling and submissions named as needs.", why: "New teams pick new tools. Nobody defends a legacy system they never used." },
      { daysAgo: 55, kind: "hiring", title: "Operations hiring ahead of readouts", detail: "Regulatory and quality roles pulled forward of next year's late-stage readouts.", why: "Budget exists now. After the readouts, everyone will be too busy to switch anything." },
    ],
  },
  {
    id: "gilead",
    name: "Gilead",
    industry: "Global biopharma",
    hq: "Foster City, USA",
    momentum: 6,
    trend: [4, 5, 4, 6, 5, 4, 5, 6, 5, 5, 6, 6],
    competitors: ["Veeva", "IQVIA"],
    people: [
      { id: "gl-1", name: "Miriam Castellanos", role: "Senior Director, Global Labeling", posts90d: 5 },
    ],
    posts: [
      { personId: "gl-1", daysAgo: 12, text: "Every labeling deviation has a story. The teams that capture the story, not just the correction, stop repeating them.", reactions: 199, comments: 24 },
      { personId: "gl-1", daysAgo: 66, text: "We are piloting structured content authoring for our core datasheets. Early days, but the reuse numbers are promising.", reactions: 231, comments: 28 },
    ],
    news: [
      { daysAgo: 22, source: "Regulatory Focus", headline: "Gilead pilots structured labeling content", summary: "A structured authoring pilot targets core datasheets first, with reuse across markets as the headline metric." },
    ],
    signals: [
      { daysAgo: 22, kind: "regulatory", title: "Structured labeling pilot", detail: "Structured authoring piloted on core datasheets, reuse as the metric.", why: "Directly adjacent to Freya.Label. They are already sold on the problem." },
    ],
  },
  {
    id: "jj-medtech",
    name: "J&J Medtech",
    industry: "Medical devices",
    hq: "New Brunswick, USA",
    momentum: 31,
    trend: [1, 2, 2, 3, 2, 4, 3, 5, 5, 6, 7, 8],
    competitors: ["Greenlight Guru", "Veeva"],
    people: [
      { id: "jj-1", name: "Henrik Vos", role: "Head of Regulatory, EMEA", posts90d: 8 },
      { id: "jj-2", name: "Amara Okafor", role: "Director, Regulatory Compliance", posts90d: 5 },
    ],
    posts: [
      { personId: "jj-1", daysAgo: 1, text: "EU MDR taught the device industry a hard lesson about technical documentation debt. The companies that treated it as a one-time project are paying it again.", reactions: 540, comments: 72 },
      { personId: "jj-2", daysAgo: 19, text: "Compliance is a team sport, but somebody has to own the score. Clear accountability for each dossier changed everything for us.", reactions: 168, comments: 20 },
      { personId: "jj-1", daysAgo: 49, text: "We are consolidating regulatory information across 14 device franchises. If you have done this at scale, what do you wish you had known?", reactions: 402, comments: 95 },
    ],
    news: [
      { daysAgo: 7, source: "Reuters", headline: "J&J Medtech accelerates device registration modernization", summary: "The device unit named registration data consolidation a priority, following audit findings that flagged fragmented records across franchises." },
      { daysAgo: 49, source: "Fierce Biotech", headline: "J&J Medtech consolidating regulatory information systems", summary: "A program to unify regulatory data across 14 franchises is underway, with vendor conversations reported in early stages." },
    ],
    signals: [
      { daysAgo: 7, kind: "regulatory", title: "Registration modernization named a priority", detail: "Audit findings flagged fragmented records, consolidation now has executive sponsorship.", why: "An audit finding is a budget line. This one maps directly onto Freya.Register." },
      { daysAgo: 49, kind: "deal", title: "Vendor conversations under way", detail: "Early-stage vendor conversations reported for the consolidation program.", why: "Early stage means the shortlist is still open. Late means it is not. Move now." },
    ],
  },

  // ---------------------------------------------------------------------
  // THE REST OF THE SAMPLE MARKET — INVENTED COMPANIES ONLY.
  //
  // Six briefings left the dashboard reading as a pilot rather than the
  // 30-40 company watch Anant described, and every one of them hangs
  // fictional people off a real corporate name. Everything added below is an
  // invented company, so the people, posts and quotes attached to it cannot
  // be mistaken for a claim about anybody real. Competitor names stay real
  // vendors: those are companies, never named humans.
  // ---------------------------------------------------------------------
  {
    id: "northvale",
    name: "Northvale Therapeutics",
    industry: "Clinical-stage biopharma",
    hq: "Cambridge, USA",
    momentum: 54,
    trend: [1, 2, 2, 3, 5, 4, 6, 8, 7, 10, 12, 14],
    competitors: ["Veeva", "ArisGlobal", "Certara"],
    people: [
      { id: "nvl-1", name: "Beatrice Nkemdirim", role: "Chief Regulatory Officer", posts90d: 11 },
      { id: "nvl-2", name: "Callum Reyes", role: "Head of Regulatory Operations", posts90d: 7 },
      { id: "nvl-3", name: "Ines Vaszary", role: "Director, Global Labeling", posts90d: 5 },
    ],
    posts: [
      { personId: "nvl-1", daysAgo: 1, text: "We are twelve months from our first filing and building the regulatory function from scratch. The temptation is to buy everything at once. The discipline is to buy the system of record first.", reactions: 731, comments: 94 },
      { personId: "nvl-2", daysAgo: 6, text: "Nobody warns you that your first submission is 20 percent regulatory work and 80 percent finding out which spreadsheet is authoritative.", reactions: 486, comments: 63 },
      { personId: "nvl-3", daysAgo: 18, text: "Started drafting our core data sheet this month. Writing it once, properly, is the cheapest thing we will ever do.", reactions: 212, comments: 27 },
      { personId: "nvl-1", daysAgo: 34, text: "Hiring a Head of Submissions. If you have taken a first product through FDA and EMA in parallel, we should talk.", reactions: 640, comments: 118 },
      { personId: "nvl-2", daysAgo: 58, text: "Our regulatory tooling review is done. Four vendors, two weeks, one decision criterion: which one still works when we have forty products instead of four.", reactions: 355, comments: 41 },
    ],
    news: [
      { daysAgo: 3, source: "Endpoints News", headline: "Northvale Therapeutics raises Series C ahead of first filing", summary: "The round is earmarked for late-stage development and the commercial build-out, with regulatory and quality named among the first hires." },
      { daysAgo: 15, source: "BioSpace", headline: "Northvale names first Chief Regulatory Officer", summary: "The appointment consolidates regulatory affairs, intelligence and labeling under a single function reporting to the CEO." },
      { daysAgo: 41, source: "Fierce Biotech", headline: "Northvale reports positive Phase 2 readout", summary: "The company confirmed it will move to registrational studies, with a first submission targeted inside eighteen months." },
      { daysAgo: 76, source: "Regulatory Focus", headline: "Northvale selects submissions partner for EU entry", summary: "The company said it will use an external partner for its first European filing while building an internal capability in parallel." },
    ],
    signals: [
      { daysAgo: 3, kind: "deal", title: "Series C closed", detail: "New funding explicitly names regulatory and quality build-out.", why: "Funded, unencumbered and buying their first platform. There is no incumbent to displace." },
      { daysAgo: 15, kind: "leadership", title: "First Chief Regulatory Officer appointed", detail: "Regulatory, intelligence and labeling consolidated under one new leader.", why: "A brand-new function writes its own tool list in the first ninety days." },
      { daysAgo: 58, kind: "competitor", title: "Tooling review completed", detail: "Four vendors evaluated, decision framed around scale rather than price.", why: "They have told the market exactly what they will be judged on. Answer that." },
    ],
  },
  {
    id: "kestrel-pharma",
    name: "Kestrel Pharma",
    industry: "Specialty pharmaceuticals",
    hq: "Dublin, Ireland",
    momentum: 22,
    trend: [4, 3, 5, 4, 6, 5, 7, 6, 8, 7, 9, 10],
    competitors: ["ArisGlobal", "IQVIA"],
    people: [
      { id: "kst-1", name: "Fionnuala Brannigan", role: "VP, Regulatory Affairs EMEA", posts90d: 8 },
      { id: "kst-2", name: "Dmitri Alkhimov", role: "Head of Lifecycle Management", posts90d: 4 },
    ],
    posts: [
      { personId: "kst-1", daysAgo: 4, text: "Variations are the quiet tax on a specialty portfolio. We filed 340 last year. Nobody outside regulatory has any idea what that costs.", reactions: 418, comments: 57 },
      { personId: "kst-2", daysAgo: 20, text: "Worksharing across markets sounds obvious until you try it with three different data models. Fix the data first, then group the filings.", reactions: 263, comments: 34 },
      { personId: "kst-1", daysAgo: 47, text: "Congratulations to our team on closing out the last of the MDR remediations. Two years. Worth saying out loud.", reactions: 302, comments: 39 },
      { personId: "kst-2", daysAgo: 72, text: "The best regulatory metric I have found is not cycle time. It is how many times the same fact gets typed in.", reactions: 189, comments: 25 },
    ],
    news: [
      { daysAgo: 8, source: "PharmaTimes", headline: "Kestrel Pharma acquires three legacy brands", summary: "The acquisition brings 40 additional marketing authorisations across the EU, which the company said it will migrate onto its own regulatory systems." },
      { daysAgo: 29, source: "Regulatory Focus", headline: "Kestrel flags variation volume as an operational priority", summary: "Leadership cited post-approval change volume as the single largest driver of regulatory workload in the coming year." },
      { daysAgo: 63, source: "Reuters", headline: "Kestrel expands Dublin operations centre", summary: "The expansion adds regulatory operations and pharmacovigilance roles to the existing site." },
    ],
    signals: [
      { daysAgo: 8, kind: "expansion", title: "40 authorisations acquired", detail: "Legacy brands must be migrated onto Kestrel's own regulatory systems.", why: "Migration projects are budget events. They also expose whether the current system can take the load." },
      { daysAgo: 29, kind: "regulatory", title: "Variation volume named a priority", detail: "Post-approval change is the biggest stated driver of regulatory workload.", why: "That is the exact problem Freya.LCM was built for, and they have said it in public." },
    ],
  },
  {
    id: "halcyon-ls",
    name: "Halcyon Life Sciences",
    industry: "Contract research",
    hq: "Basel, Switzerland",
    momentum: -12,
    trend: [11, 10, 12, 9, 10, 8, 9, 7, 8, 6, 7, 6],
    competitors: ["Parexel", "IQVIA", "Certara"],
    people: [
      { id: "hcy-1", name: "Anneke Vandersteen", role: "Global Head of Regulatory Services", posts90d: 6 },
      { id: "hcy-2", name: "Rafael Ortuño", role: "Director, Submissions Delivery", posts90d: 3 },
    ],
    posts: [
      { personId: "hcy-1", daysAgo: 11, text: "Clients no longer ask us how many people we will put on the account. They ask what our software does before the people arrive.", reactions: 522, comments: 71 },
      { personId: "hcy-2", daysAgo: 38, text: "Publishing is not a differentiator any more. What clients pay for is being told, early, that a dossier is not going to pass.", reactions: 244, comments: 30 },
    ],
    news: [
      { daysAgo: 12, source: "Endpoints News", headline: "Halcyon Life Sciences reports slower regulatory services bookings", summary: "The company attributed softer demand to client insourcing and said it is reviewing its delivery technology." },
      { daysAgo: 44, source: "Fierce Pharma", headline: "Halcyon restructures regulatory services unit", summary: "Delivery is being consolidated into two hubs, with a stated aim of automating routine publishing work." },
    ],
    signals: [
      { daysAgo: 12, kind: "competitor", title: "Bookings under pressure", detail: "Client insourcing named as the cause; delivery technology under review.", why: "A services business that must automate to defend margin is a buyer, not just a competitor." },
      { daysAgo: 44, kind: "expansion", title: "Delivery consolidated into two hubs", detail: "Restructure explicitly targets automation of routine publishing.", why: "Consolidation plus automation is a platform decision with a deadline attached." },
    ],
  },
  {
    id: "verdant-medical",
    name: "Verdant Medical",
    industry: "Medical devices",
    hq: "Galway, Ireland",
    momentum: 37,
    trend: [2, 3, 3, 4, 4, 5, 6, 6, 8, 9, 10, 11],
    competitors: ["Greenlight Guru", "Veeva"],
    people: [
      { id: "vrd-1", name: "Siobhán Mulcahy", role: "VP, Global Regulatory and Quality", posts90d: 9 },
      { id: "vrd-2", name: "Piotr Zawadzki", role: "Head of Technical Documentation", posts90d: 6 },
      { id: "vrd-3", name: "Leila Haddadi", role: "Manager, Post-Market Surveillance", posts90d: 4 },
    ],
    posts: [
      { personId: "vrd-1", daysAgo: 2, text: "We finished our second MDR recertification cycle this month. The first took nineteen months. The second took five. The difference was entirely in how the documentation was stored.", reactions: 612, comments: 88 },
      { personId: "vrd-2", daysAgo: 16, text: "A technical file is not a folder. Treating it like one is why so many device companies are still remediating.", reactions: 341, comments: 44 },
      { personId: "vrd-3", daysAgo: 31, text: "Post-market surveillance data is the most under-used regulatory asset in the device industry. It answers questions the notified body has not asked yet.", reactions: 227, comments: 29 },
      { personId: "vrd-1", daysAgo: 65, text: "Opening a regulatory affairs team in Singapore. APAC device registration is where our next three years of growth sit.", reactions: 448, comments: 52 },
    ],
    news: [
      { daysAgo: 5, source: "MassDevice", headline: "Verdant Medical clears second MDR recertification", summary: "The company credited a consolidated technical documentation system for cutting the cycle from nineteen months to five." },
      { daysAgo: 27, source: "Medtech Dive", headline: "Verdant opens APAC regulatory hub in Singapore", summary: "The hub will handle device registrations across eight Asian markets, with hiring under way across regulatory and quality." },
      { daysAgo: 68, source: "Reuters", headline: "Verdant Medical reports record device registrations", summary: "The company registered products in 14 new markets over the year, more than double the prior period." },
    ],
    signals: [
      { daysAgo: 5, kind: "regulatory", title: "MDR cycle cut by two thirds", detail: "Improvement attributed to consolidated technical documentation.", why: "They already believe the tooling caused the outcome. That belief is the hardest part of the sale." },
      { daysAgo: 27, kind: "expansion", title: "APAC hub opening in Singapore", detail: "Eight new markets, regulatory and quality hiring under way.", why: "A greenfield team choosing its own stack, in markets the current system was never configured for." },
      { daysAgo: 68, kind: "hiring", title: "Registration volume doubled", detail: "14 new markets registered in a single year.", why: "Volume growth is the point at which a spreadsheet-based registration book stops being viable." },
    ],
  },
  {
    id: "arclight-dx",
    name: "Arclight Diagnostics",
    industry: "In-vitro diagnostics",
    hq: "Utrecht, Netherlands",
    momentum: 29,
    trend: [2, 2, 3, 3, 4, 5, 4, 6, 7, 6, 8, 9],
    competitors: ["Greenlight Guru", "ArisGlobal"],
    people: [
      { id: "arc-1", name: "Wouter De Bruyn", role: "Director, Regulatory Affairs", posts90d: 7 },
      { id: "arc-2", name: "Mei-Ling Toh", role: "Regulatory Intelligence Lead", posts90d: 5 },
    ],
    posts: [
      { personId: "arc-1", daysAgo: 7, text: "IVDR reclassified most of our portfolio overnight. The companies that survived it are the ones that already knew, precisely, what they had registered where.", reactions: 497, comments: 66 },
      { personId: "arc-2", daysAgo: 23, text: "I track guidance across nine markets. The hard part has never been finding the change. It is proving to somebody which of our products it touches.", reactions: 318, comments: 47 },
      { personId: "arc-1", daysAgo: 54, text: "Notified body capacity is still the binding constraint in diagnostics. Plan your submissions around their calendar, not yours.", reactions: 274, comments: 35 },
    ],
    news: [
      { daysAgo: 10, source: "Medtech Dive", headline: "Arclight Diagnostics completes IVDR transition for core portfolio", summary: "The company said the remaining legacy assays will transition within the year, with intelligence and impact assessment cited as the bottleneck." },
      { daysAgo: 50, source: "Regulatory Focus", headline: "Arclight invests in regulatory intelligence capability", summary: "The investment follows an internal review that found guidance changes were reaching product teams too late to act on." },
    ],
    signals: [
      { daysAgo: 10, kind: "regulatory", title: "IVDR transition nearly complete", detail: "Impact assessment named as the remaining bottleneck.", why: "They have named the gap themselves, and RIA.Product Impact is the thing that closes it." },
      { daysAgo: 50, kind: "deal", title: "Intelligence capability funded", detail: "Internal review found changes reached product teams too late.", why: "Budget approved, problem defined, no incumbent named. This is the cleanest opening on the board." },
    ],
  },
  {
    id: "solenne-pharma",
    name: "Solenne Pharma",
    industry: "Generic pharmaceuticals",
    hq: "Hyderabad, India",
    momentum: 44,
    trend: [3, 4, 4, 6, 5, 7, 8, 7, 10, 11, 12, 13],
    competitors: ["ArisGlobal", "Certara"],
    people: [
      { id: "sln-1", name: "Vaishnavi Ramanathan", role: "Head of Global Regulatory Affairs", posts90d: 10 },
      { id: "sln-2", name: "Gopal Venkataraman", role: "Director, ANDA Submissions", posts90d: 6 },
      { id: "sln-3", name: "Aditi Shanbhag", role: "Manager, Regulatory Intelligence", posts90d: 3 },
    ],
    posts: [
      { personId: "sln-1", daysAgo: 3, text: "We filed 61 ANDAs last year with a team of nineteen. That ratio is not heroism, it is tooling. Anyone telling you otherwise is burning their people out.", reactions: 823, comments: 131 },
      { personId: "sln-2", daysAgo: 13, text: "Deficiency letters are feedback. We started tagging every one by root cause two years ago and our first-cycle approval rate moved eleven points.", reactions: 561, comments: 78 },
      { personId: "sln-3", daysAgo: 36, text: "Half my week is checking whether a guidance update changes anything for us. It should be five minutes and a list.", reactions: 294, comments: 52 },
      { personId: "sln-1", daysAgo: 61, text: "Expanding into Latin America next year. Different dossier, different clock, same discipline.", reactions: 407, comments: 44 },
    ],
    news: [
      { daysAgo: 6, source: "PharmaTimes", headline: "Solenne Pharma files record number of US generic applications", summary: "The company attributed the volume to submission automation and a restructured regulatory operations team." },
      { daysAgo: 24, source: "Reuters", headline: "Solenne targets Latin American expansion", summary: "The company confirmed filings planned across five Latin American markets, requiring a second regional dossier capability." },
      { daysAgo: 58, source: "Endpoints News", headline: "Solenne reports improved first-cycle approval rate", summary: "A root-cause programme on deficiency letters was credited with an eleven-point improvement." },
    ],
    signals: [
      { daysAgo: 6, kind: "hiring", title: "Filing volume at a record", detail: "Growth attributed to submission automation and an operations restructure.", why: "They are proving the thesis themselves. The next constraint after volume is always intelligence." },
      { daysAgo: 24, kind: "expansion", title: "Latin American filings planned", detail: "Five new markets, a second regional dossier capability required.", why: "New markets mean new requirement sets. GRR-PAC answers that on day one." },
      { daysAgo: 36, kind: "regulatory", title: "Intelligence triage named as a time sink", detail: "Regulatory intelligence lead describes half a week spent on applicability checks.", why: "A named person, a named problem, and a product that removes it. Lead with that post." },
    ],
  },
  {
    id: "ridgeway-ch",
    name: "Ridgeway Consumer Health",
    industry: "Consumer health",
    hq: "Manchester, UK",
    momentum: 15,
    trend: [3, 4, 3, 5, 4, 5, 6, 5, 6, 7, 6, 7],
    competitors: ["Veeva", "IQVIA"],
    people: [
      { id: "rdg-1", name: "Harriet Blyth", role: "Head of Regulatory and Compliance", posts90d: 6 },
      { id: "rdg-2", name: "Sandro Bellini", role: "Artwork and Packaging Lead", posts90d: 4 },
    ],
    posts: [
      { personId: "rdg-1", daysAgo: 9, text: "Consumer health lives in the gap between regulated medicine and marketing. Every claim we make has to survive both a lawyer and a regulator.", reactions: 288, comments: 33 },
      { personId: "rdg-2", daysAgo: 28, text: "We reprinted 400,000 cartons last year because of an artwork error that a two-minute check would have caught. That is the whole business case.", reactions: 619, comments: 92 },
      { personId: "rdg-1", daysAgo: 57, text: "Reformulation season. Twelve products, six markets, and every one of them needs a label change that nobody has budgeted for.", reactions: 231, comments: 28 },
    ],
    news: [
      { daysAgo: 13, source: "Consumer Goods News", headline: "Ridgeway Consumer Health reformulates core range", summary: "Twelve products are being reformulated across six markets, requiring coordinated label and artwork changes." },
      { daysAgo: 46, source: "PharmaTimes", headline: "Ridgeway reports artwork error costs", summary: "The company disclosed a packaging recall attributed to an artwork version control failure." },
    ],
    signals: [
      { daysAgo: 13, kind: "regulatory", title: "Twelve-product reformulation under way", detail: "Coordinated label and artwork changes across six markets.", why: "A label and artwork programme with a live deadline. Freya.Label and Freya.Artwork sell themselves here." },
      { daysAgo: 46, kind: "competitor", title: "Artwork version control failure disclosed", detail: "A packaging recall traced to artwork version control.", why: "A public, costly failure in exactly the workflow we replace. Timing matters more than pitch." },
    ],
  },
  {
    id: "tessellate-bio",
    name: "Tessellate Bio",
    industry: "Cell and gene therapy",
    hq: "Leiden, Netherlands",
    momentum: 61,
    trend: [1, 1, 2, 3, 3, 5, 6, 7, 9, 11, 13, 15],
    competitors: ["Veeva", "Parexel"],
    people: [
      { id: "tsl-1", name: "Margit Løvstad", role: "VP, Regulatory Strategy", posts90d: 12 },
      { id: "tsl-2", name: "Kwame Anfo-Boateng", role: "Head of CMC Regulatory", posts90d: 8 },
    ],
    posts: [
      { personId: "tsl-1", daysAgo: 1, text: "Advanced therapies break every assumption a regulatory system was built on. Batch of one. Patient-specific. There is no precedent to copy from, only a framework to keep straight.", reactions: 894, comments: 142 },
      { personId: "tsl-2", daysAgo: 12, text: "CMC changes in cell therapy are not variations in the ordinary sense. Every one is a small scientific argument that has to be documented as if it were a trial.", reactions: 476, comments: 61 },
      { personId: "tsl-1", daysAgo: 33, text: "Three health authorities, three different views on the same comparability package. Somebody has to hold all three in one place.", reactions: 512, comments: 83 },
      { personId: "tsl-2", daysAgo: 69, text: "Hiring CMC regulatory scientists. If you have taken an ATMP through comparability, we have a lot to talk about.", reactions: 388, comments: 57 },
    ],
    news: [
      { daysAgo: 2, source: "Endpoints News", headline: "Tessellate Bio secures conditional approval for lead therapy", summary: "The approval carries post-authorisation commitments across three regions, which the company said will require substantial regulatory tracking." },
      { daysAgo: 26, source: "Fierce Biotech", headline: "Tessellate expands regulatory team ahead of second filing", summary: "Hiring focuses on CMC regulatory and lifecycle management as the pipeline moves toward a second submission." },
      { daysAgo: 59, source: "Regulatory Focus", headline: "Tessellate calls for harmonised ATMP comparability guidance", summary: "Leadership described divergent regional expectations as the biggest cost in advanced therapy development." },
    ],
    signals: [
      { daysAgo: 2, kind: "regulatory", title: "Conditional approval with commitments", detail: "Post-authorisation commitments across three regions to track and evidence.", why: "A commitment register is a legal obligation with a deadline. There is no version of this they can do on a spreadsheet." },
      { daysAgo: 26, kind: "hiring", title: "Regulatory team expanding", detail: "CMC regulatory and lifecycle management hiring ahead of a second filing.", why: "They are staffing the exact functions Freya.LCM supports, before they have chosen a system." },
      { daysAgo: 59, kind: "leadership", title: "Public position on divergent guidance", detail: "Regional divergence named as the biggest cost in development.", why: "RIA.Compare answers the complaint their own VP made in public." },
    ],
  },
  {
    id: "orchid-peak",
    name: "Orchid Peak Bio",
    industry: "Biotechnology",
    hq: "Seoul, South Korea",
    momentum: 33,
    trend: [2, 3, 4, 3, 5, 6, 5, 7, 8, 8, 10, 11],
    competitors: ["Certara", "ArisGlobal"],
    people: [
      { id: "orc-1", name: "Ha-eun Seo", role: "Head of Global Regulatory Affairs", posts90d: 8 },
      { id: "orc-2", name: "Jonas Kirchner", role: "Director, EU Regulatory", posts90d: 4 },
    ],
    posts: [
      { personId: "orc-1", daysAgo: 5, text: "Taking a Korean-developed biologic into Europe and the US at the same time is three regulatory strategies wearing one project plan.", reactions: 452, comments: 59 },
      { personId: "orc-2", daysAgo: 21, text: "The MFDS dossier and the EU dossier share maybe 60 percent of their content. Managing that 60 percent as one source is the entire game.", reactions: 336, comments: 41 },
      { personId: "orc-1", daysAgo: 48, text: "Biosimilar development rewards the boring virtues. Document control, comparability discipline, and a regulatory team that says no early.", reactions: 398, comments: 46 },
    ],
    news: [
      { daysAgo: 9, source: "BioSpace", headline: "Orchid Peak Bio files first EU marketing authorisation application", summary: "The filing follows domestic approval and marks the company's first submission through the centralised procedure." },
      { daysAgo: 37, source: "Endpoints News", headline: "Orchid Peak signs US commercialisation partnership", summary: "The agreement covers US commercialisation while Orchid Peak retains regulatory ownership of the dossier." },
      { daysAgo: 72, source: "PharmaTimes", headline: "Orchid Peak expands biosimilar pipeline", summary: "Three additional programmes were added, each targeting simultaneous filing across Korea, the EU and the US." },
    ],
    signals: [
      { daysAgo: 9, kind: "expansion", title: "First EU centralised filing", detail: "Domestic approval now followed by a first European submission.", why: "A first EU filing is where a domestic-only regulatory system finally breaks." },
      { daysAgo: 37, kind: "deal", title: "US partnership signed, dossier retained", detail: "Orchid Peak keeps regulatory ownership under the commercialisation deal.", why: "They own the dossier and now have a partner reading it. Shared, controlled access becomes a requirement." },
    ],
  },
  {
    id: "ironvale-medical",
    name: "Ironvale Medical",
    industry: "Medical devices",
    hq: "Minneapolis, USA",
    momentum: -5,
    trend: [8, 7, 8, 6, 7, 6, 6, 5, 6, 5, 5, 6],
    competitors: ["Greenlight Guru", "Veeva", "IQVIA"],
    people: [
      { id: "irv-1", name: "Delphine Marchetti", role: "SVP, Regulatory Affairs", posts90d: 5 },
      { id: "irv-2", name: "Grayson Whitlock", role: "Senior Director, Quality Systems", posts90d: 3 },
    ],
    posts: [
      { personId: "irv-1", daysAgo: 14, text: "Twenty years of registrations across four acquisitions. Consolidating them is not a data migration, it is an archaeology project.", reactions: 384, comments: 51 },
      { personId: "irv-2", daysAgo: 42, text: "An audit finding is not a failure. Not being able to answer the auditor's follow-up question in the room is.", reactions: 267, comments: 32 },
    ],
    news: [
      { daysAgo: 18, source: "Medtech Dive", headline: "Ironvale Medical faces FDA observations at Minneapolis site", summary: "Observations cited documentation traceability, with the company confirming a remediation plan is under way." },
      { daysAgo: 55, source: "MassDevice", headline: "Ironvale consolidates regulatory records after fourth acquisition", summary: "The programme aims to bring registrations from four acquired businesses onto a single system." },
    ],
    signals: [
      { daysAgo: 18, kind: "regulatory", title: "FDA observations on documentation traceability", detail: "Remediation plan confirmed following site inspection.", why: "Remediation has a regulator-imposed deadline and a budget that does not need arguing for." },
      { daysAgo: 55, kind: "deal", title: "Post-acquisition records consolidation", detail: "Registrations from four acquired businesses moving onto one system.", why: "Somebody is choosing that one system this year. It should be ours." },
    ],
  },
  {
    id: "lumaris-pharma",
    name: "Lumaris Pharma",
    industry: "Global biopharma",
    hq: "Copenhagen, Denmark",
    momentum: 12,
    trend: [6, 7, 6, 8, 7, 7, 8, 7, 9, 8, 9, 9],
    competitors: ["Veeva", "ArisGlobal", "Parexel"],
    people: [
      { id: "lmr-1", name: "Ingrid Halvorsen", role: "Global Head of Regulatory Operations", posts90d: 7 },
      { id: "lmr-2", name: "Yusuf Demirkan", role: "Head of Regulatory Data Management", posts90d: 5 },
      { id: "lmr-3", name: "Claudia Restrepo", role: "Director, Submissions", posts90d: 3 },
    ],
    posts: [
      { personId: "lmr-1", daysAgo: 6, text: "We measured it: a single product fact exists in eleven of our systems. Nine of them can write to it. That is the real regulatory risk, and it is not on any risk register.", reactions: 748, comments: 109 },
      { personId: "lmr-2", daysAgo: 19, text: "IDMP is not a compliance project. It is the first time most companies will have been forced to agree what a product actually is.", reactions: 521, comments: 74 },
      { personId: "lmr-3", daysAgo: 44, text: "Submitted in eleven markets this quarter with zero validation failures. Quietly the proudest I have been of a number.", reactions: 366, comments: 42 },
      { personId: "lmr-1", daysAgo: 77, text: "Starting a data governance programme for regulatory. If you have done this without it becoming a two-year committee, tell me how.", reactions: 429, comments: 88 },
    ],
    news: [
      { daysAgo: 16, source: "Regulatory Focus", headline: "Lumaris Pharma launches regulatory data governance programme", summary: "The programme follows an internal audit that found product data duplicated across eleven systems." },
      { daysAgo: 35, source: "Reuters", headline: "Lumaris reports steady growth, flags operations investment", summary: "Leadership named regulatory and quality operations as areas of continued investment through the next two years." },
      { daysAgo: 70, source: "Endpoints News", headline: "Lumaris completes IDMP readiness assessment", summary: "The assessment identified master data ownership as the largest remaining gap." },
    ],
    signals: [
      { daysAgo: 16, kind: "deal", title: "Data governance programme launched", detail: "Product data found duplicated across eleven systems.", why: "Data Hub is the answer to the question they have just funded somebody to ask." },
      { daysAgo: 70, kind: "regulatory", title: "IDMP readiness gap identified", detail: "Master data ownership named as the largest remaining gap.", why: "A named gap with a regulatory deadline behind it. Bring the IDMP data model to the first meeting." },
    ],
  },
  {
    id: "anvarra-biotech",
    name: "Anvarra Biotech",
    industry: "Biotechnology",
    hq: "Toronto, Canada",
    momentum: 48,
    trend: [1, 2, 3, 3, 4, 6, 5, 8, 9, 10, 11, 13],
    competitors: ["Certara", "Veeva"],
    people: [
      { id: "anv-1", name: "Théo Lacombe", role: "VP, Regulatory Affairs", posts90d: 9 },
      { id: "anv-2", name: "Nkechi Obiora", role: "Head of Regulatory Intelligence", posts90d: 6 },
    ],
    posts: [
      { personId: "anv-1", daysAgo: 4, text: "Our first pre-submission meeting taught me more than two years of guidance reading. Ask the question you are afraid of.", reactions: 583, comments: 76 },
      { personId: "anv-2", daysAgo: 25, text: "Building a regulatory intelligence function from nothing. Week one lesson: coverage without impact assessment is just a newsletter.", reactions: 401, comments: 55 },
      { personId: "anv-1", daysAgo: 52, text: "We are a 60-person company filing in three regions. Every process we choose now, we will live with at 600 people.", reactions: 469, comments: 63 },
    ],
    news: [
      { daysAgo: 7, source: "BioSpace", headline: "Anvarra Biotech completes pre-submission meeting with FDA", summary: "The company said the meeting confirmed its registrational pathway and set the timeline for a first filing." },
      { daysAgo: 32, source: "Fierce Biotech", headline: "Anvarra builds out regulatory intelligence function", summary: "The new function is being built in-house, with impact assessment named as the primary requirement." },
      { daysAgo: 64, source: "Endpoints News", headline: "Anvarra expands into European development", summary: "The company confirmed parallel European development, adding a second regulatory jurisdiction to its plan." },
    ],
    signals: [
      { daysAgo: 7, kind: "regulatory", title: "Registrational pathway confirmed", detail: "Pre-submission meeting completed, first filing timeline set.", why: "The clock has started and they have no submission system. This is the earliest useful moment." },
      { daysAgo: 32, kind: "hiring", title: "Intelligence function being built in-house", detail: "Impact assessment named as the primary requirement.", why: "They have written our product requirement into their own job description." },
    ],
  },
  {
    id: "brightwater-generics",
    name: "Brightwater Generics",
    industry: "Generic pharmaceuticals",
    hq: "Ljubljana, Slovenia",
    momentum: 8,
    trend: [5, 5, 6, 5, 6, 6, 5, 7, 6, 7, 7, 8],
    competitors: ["ArisGlobal", "IQVIA"],
    people: [
      { id: "bwg-1", name: "Katarina Zupančič", role: "Head of Regulatory Affairs", posts90d: 5 },
      { id: "bwg-2", name: "Miloš Đorđević", role: "Manager, Lifecycle Management", posts90d: 3 },
    ],
    posts: [
      { personId: "bwg-1", daysAgo: 10, text: "Two hundred authorisations across the EU and a renewal calendar that lives in one person's head. We fixed that this year. It should not have taken this long.", reactions: 312, comments: 40 },
      { personId: "bwg-2", daysAgo: 40, text: "Grouped variations save real money, but only if you can see every affected registration in one query. Most companies cannot.", reactions: 208, comments: 26 },
    ],
    news: [
      { daysAgo: 21, source: "PharmaTimes", headline: "Brightwater Generics completes registration book migration", summary: "Two hundred European authorisations were moved onto a single system, replacing a spreadsheet-based renewal calendar." },
      { daysAgo: 62, source: "Regulatory Focus", headline: "Brightwater expands into Nordic markets", summary: "The expansion adds four markets and roughly 30 additional authorisations." },
    ],
    signals: [
      { daysAgo: 21, kind: "expansion", title: "Registration book migrated", detail: "Two hundred authorisations moved off a spreadsheet-based calendar.", why: "They have proved the value of a system of record. The next conversation is variations and intelligence." },
      { daysAgo: 62, kind: "regulatory", title: "Nordic expansion under way", detail: "Four new markets and about 30 further authorisations.", why: "More markets, same team. Automation is the only way that arithmetic works." },
    ],
  },
  {
    id: "caldera-biopharm",
    name: "Caldera Biopharm",
    industry: "Global biopharma",
    hq: "São Paulo, Brazil",
    momentum: 26,
    trend: [3, 4, 4, 5, 6, 5, 7, 8, 7, 9, 10, 10],
    competitors: ["Veeva", "Parexel", "Certara"],
    people: [
      { id: "cld-1", name: "Renata Albuquerque", role: "Diretora de Assuntos Regulatórios", posts90d: 8 },
      { id: "cld-2", name: "Felipe Nogueira", role: "Head of Regional Submissions", posts90d: 5 },
      { id: "cld-3", name: "Amara Sivakumar", role: "Regulatory Intelligence Manager", posts90d: 4 },
    ],
    posts: [
      { personId: "cld-1", daysAgo: 8, text: "Latin American regulatory work is treated as an afterthought by most global systems. Eleven agencies, eleven dossier formats, and none of them fit the template.", reactions: 538, comments: 81 },
      { personId: "cld-2", daysAgo: 30, text: "ANVISA timelines have improved more than most global teams realise. The planning assumptions in our systems are three years out of date.", reactions: 347, comments: 49 },
      { personId: "cld-3", daysAgo: 51, text: "Tracking regulatory change across the region is not a translation problem. It is a structure problem. The same requirement is written five different ways.", reactions: 289, comments: 37 },
    ],
    news: [
      { daysAgo: 11, source: "Reuters", headline: "Caldera Biopharm consolidates Latin American regulatory operations", summary: "Regulatory work across eleven markets is being brought under a single regional function based in São Paulo." },
      { daysAgo: 43, source: "Endpoints News", headline: "Caldera reports faster ANVISA approvals", summary: "The company said improved agency timelines have shifted the bottleneck onto internal dossier preparation." },
      { daysAgo: 74, source: "PharmaTimes", headline: "Caldera Biopharm to file across Andean markets", summary: "Filings are planned across five additional Andean markets over the next eighteen months." },
    ],
    signals: [
      { daysAgo: 11, kind: "expansion", title: "Regional operations consolidating", detail: "Eleven markets moving under one São Paulo function.", why: "Consolidation is a tooling decision. Regional coverage is where most global platforms are weakest, and we are not." },
      { daysAgo: 43, kind: "regulatory", title: "Bottleneck moved in-house", detail: "Faster agency timelines have exposed internal dossier preparation.", why: "The constraint is now something they control, which means they can buy their way out of it." },
      { daysAgo: 74, kind: "hiring", title: "Andean filings planned", detail: "Five further markets over eighteen months.", why: "New requirement sets on a fixed timeline. GRR-PAC and RIA.Compare are the whole pitch." },
    ],
  },
];

/** Companies tracked without full sample feeds, so the dashboard reads as the
 *  30-40 company watchlist Anant described without forty hand-written feeds. */
export const MI_WATCHLIST: string[] = [
  "Kenvue", "Otsuka", "Opella", "Zydus", "Galderma", "CuraTeQ",
  "Pierre Fabre", "Vertex", "Gideon", "Novartis + Cognizant", "Roche",
  "Sanofi", "AstraZeneca", "Boehringer Ingelheim", "Teva", "Viatris",
  "Lupin", "Cipla", "Dr. Reddy's", "Sun Pharma", "Alkem", "Biocon",
  "Moderna", "Amgen", "Bayer", "Merck KGaA", "Eisai", "Daiichi Sankyo",
];

export function miCompany(id: string): MiCompany | undefined {
  return MI_COMPANIES.find((c) => c.id === id);
}

export function miTotals() {
  const posts = MI_COMPANIES.reduce((a, c) => a + c.posts.length, 0);
  const news = MI_COMPANIES.reduce((a, c) => a + c.news.length, 0);
  const signals = MI_COMPANIES.reduce((a, c) => a + c.signals.length, 0);
  const thisWeek = MI_COMPANIES.reduce(
    (a, c) =>
      a +
      [...c.posts, ...c.news, ...c.signals].filter((i) => i.daysAgo <= 7)
        .length,
    0
  );
  return {
    tracked: MI_COMPANIES.length + MI_WATCHLIST.length,
    posts,
    news,
    signals,
    thisWeek,
  };
}

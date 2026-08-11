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

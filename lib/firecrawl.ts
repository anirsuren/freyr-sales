// Firecrawl integration (Section 5.2 + 7). Crawls the full Freyr domain for the
// knowledge base, and scrapes individual customer websites for enrichment.
// Falls back to mocks whenever FIRECRAWL_API_KEY is absent.

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";

export const MOCK_CUSTOMER_SCRAPE = `
# BioNex Therapeutics
BioNex Therapeutics is a mid-size clinical-stage biopharmaceutical company focused on developing
novel biologics for oncology and autoimmune diseases. Headquartered in Princeton, NJ with offices
in London and Singapore. Approximately 450 employees globally. Series D funded ($280M raised).
Currently has 3 compounds in Phase 2 trials and 1 preparing for NDA submission later this year.
Strong pipeline in monoclonal antibodies and ADCs. Working across FDA and EMA jurisdictions.
`;

// A small mock set of "crawled pages" used when keys are missing so the KB
// crawl flow is fully exercisable end-to-end without a real Firecrawl call.
export const MOCK_FREYR_CRAWL_PAGES: string[] = [
  `# Freyr Solutions — Regulatory Submissions
Freyr offers end-to-end regulatory submission services to FDA, EMA, CDSCO and 120+ agencies.
INDs, NDAs, ANDAs, MAAs, CTD/eCTD dossiers. 5000+ submissions completed.`,
  `# Labeling & Artwork Management
Global pharmaceutical labeling lifecycle — artwork, compliance, print-ready output. Zero-error labeling.`,
  `# Pharmacovigilance
ICSR processing, signal detection, PSUR/PBRER aggregate reports, validated safety databases.`,
  `# Regulatory Intelligence
Real-time monitoring across 120+ agencies with expert analysis. Stay ahead of regulation.`,
  `# Clinical Trial Regulatory Support
IND/CTA preparation, protocol review, IRB/EC interactions. From IND to NDA.`,
];

export async function crawlFreyrWebsite(): Promise<string[]> {
  if (!process.env.FIRECRAWL_API_KEY) {
    // Simulate a brief crawl latency for the admin live-progress UX.
    await new Promise((r) => setTimeout(r, 600));
    return MOCK_FREYR_CRAWL_PAGES;
  }

  const response = await fetch(`${FIRECRAWL_BASE}/crawl`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: "https://www.freyr-solutions.com",
      limit: 200,
      scrapeOptions: {
        formats: ["markdown"],
        excludeTags: ["nav", "footer", "script", "style"],
      },
      excludePaths: [
        "/careers",
        "/jobs",
        "/privacy-policy",
        "/cookie-policy",
        "/sitemap.xml",
        "/robots.txt",
      ],
    }),
  });

  const { id: crawlJobId } = await response.json();
  return pollCrawlJob(crawlJobId);
}

async function pollCrawlJob(jobId: string): Promise<string[]> {
  while (true) {
    const res = await fetch(`${FIRECRAWL_BASE}/crawl/${jobId}`, {
      headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` },
    });
    const data = await res.json();
    if (data.status === "completed") {
      return data.data
        .map((page: any) => page.markdown)
        .filter(Boolean);
    }
    if (data.status === "failed") throw new Error("Firecrawl crawl failed");
    await new Promise((r) => setTimeout(r, 3000)); // poll every 3s
  }
}

// Web search + scrape via Firecrawl's /search (returns the top results already
// scraped to markdown). Used by customer analysis to gather firmographics —
// revenue, employee count, public/private — from across the web, not just the
// company's own site. Returns [] when no key so the caller falls back to mock.
export interface WebResult {
  url: string;
  title: string;
  markdown: string;
}
export async function searchWeb(
  query: string,
  limit = 5
): Promise<WebResult[]> {
  if (!process.env.FIRECRAWL_API_KEY) return [];
  try {
    const response = await fetch(`${FIRECRAWL_BASE}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit,
        scrapeOptions: { formats: ["markdown"] },
      }),
    });
    const data = await response.json();
    const items = data.data || data.results || [];
    return items.map((r: any) => ({
      url: r.url || "",
      title: r.title || r.metadata?.title || "",
      markdown: r.markdown || r.description || "",
    }));
  } catch {
    return [];
  }
}

export async function scrapeCustomerWebsite(url: string): Promise<string> {
  if (!process.env.FIRECRAWL_API_KEY) {
    return MOCK_CUSTOMER_SCRAPE;
  }

  const response = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      excludeTags: ["nav", "footer", "script", "style", "header"],
      actions: [{ type: "wait", milliseconds: 2000 }],
    }),
  });

  const data = await response.json();
  return data.data?.markdown || data.markdown || "";
}

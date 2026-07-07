// Apify LinkedIn enrichment (Section 6). Uses the thirdwatch LinkedIn profile
// scraper actor; falls back to a realistic mock profile when no token is set.

const APIFY_BASE = "https://api.apify.com/v2";
const LINKEDIN_ACTOR = "thirdwatch~linkedin-profile-scraper";

export const MOCK_LINKEDIN_PROFILE = {
  fullName: "Dr. Priya Mehta",
  headline:
    "Vice President, Regulatory Affairs | Global Drug Development | FDA & EMA Expert",
  currentCompany: "BioNex Therapeutics",
  currentTitle: "VP Regulatory Affairs",
  location: "New Jersey, United States",
  about:
    "20+ years leading regulatory strategy for complex biologics and small molecules across US, EU, and emerging markets. Led 12 successful NDA/MAA approvals. Former FDA reviewer.",
  experience: [
    {
      title: "VP Regulatory Affairs",
      company: "BioNex Therapeutics",
      duration: "2019 – Present",
      description:
        "Leading global regulatory strategy for a pipeline of 8 biologics and 3 small molecules.",
    },
    {
      title: "Director, Regulatory Affairs",
      company: "Novartis",
      duration: "2014 – 2019",
    },
    {
      title: "Regulatory Reviewer",
      company: "US FDA (CDER)",
      duration: "2008 – 2014",
    },
  ],
  education: [
    { school: "Rutgers University", degree: "PhD, Pharmaceutical Sciences" },
    { school: "University of Mumbai", degree: "B.Pharm" },
  ],
  skills: [
    "Regulatory Strategy",
    "FDA Submissions",
    "CTD Dossiers",
    "Biologics",
    "CMC",
    "Clinical Regulatory",
    "EMA",
    "CDSCO",
  ],
};

export async function scrapeLinkedInProfile(linkedinUrl: string): Promise<any> {
  if (!process.env.APIFY_API_TOKEN) {
    return MOCK_LINKEDIN_PROFILE;
  }

  const response = await fetch(
    `${APIFY_BASE}/acts/${LINKEDIN_ACTOR}/run-sync-get-dataset-items?token=${process.env.APIFY_API_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileUrls: [linkedinUrl] }),
      signal: AbortSignal.timeout(90000), // 90s timeout
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Apify error ${response.status}: ${error}`);
  }

  const results = await response.json();
  if (!results || results.length === 0) {
    throw new Error("Apify returned no results for this LinkedIn URL");
  }

  return results[0];
}

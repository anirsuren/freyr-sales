import type { FeedCompanySummary } from "@/lib/marketIntelFeed";
import { COMPANY_SOURCES, COMPETITOR_SOURCES } from "@/lib/marketIntelSources";
import { companyDivisions, type Followers, type MarketIntelTracking, type TrackedCompany } from "@/lib/marketIntelTracking";
import type { Division } from "@/lib/offeringMaterials";

/**
 * ONE ROW PER COMPANY FOR MANAGE COMPETITORS AND MANAGE CUSTOMERS, built on
 * the server from the tracking row, the summaries (for the logo) and who has
 * what. It used to be built inside the dashboard for the pop-up; Manage is a
 * page of its own now (Anir, Sep 11).
 */
export type ManagedCompany = {
  id: string;
  name: string;
  group: "customer" | "competitor";
  /** How many people have it on their list. */
  followers: number;
  /** On the standing list, so collected with nobody ticking it (Anir, Sep 11). */
  activeByDefault: boolean;
  divisions: Division[];
  logoUrl: string | null;
  /** Which of the three sources this company is set up for. */
  onboarding?: TrackedCompany["onboarding"];
  sources: { linkedin: boolean; news: boolean; website: boolean };
};

export function buildManagedCompanies({
  tracking,
  summaries,
  followers,
}: {
  tracking: Pick<MarketIntelTracking, "companies" | "divisions">;
  summaries: Record<string, Pick<FeedCompanySummary, "logoUrl">>;
  followers: Followers;
}): ManagedCompany[] {
  const sourceDefault = (id: string): Division[] =>
    ([...COMPANY_SOURCES, ...COMPETITOR_SOURCES].find((s) => s.id === id)?.divisions ?? []) as Division[];
  return tracking.companies
    .map((c) => ({
      id: c.id,
      name: c.name,
      onboarding: c.onboarding,
      group: c.group === "competitor" ? ("competitor" as const) : ("customer" as const),
      followers: followers[c.id]?.length ?? 0,
      activeByDefault: c.activeByDefault === true,
      divisions: companyDivisions(tracking, c.id, sourceDefault(c.id)),
      logoUrl: c.logoUrl || summaries[c.id]?.logoUrl || null,
      sources: {
        linkedin: c.scrape ? (c.scrape.li?.length ?? 0) > 0 : /linkedin\.com\/company\//i.test(c.linkedinUrl),
        news: true,
        website: !!(c.scrape?.site || c.website),
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

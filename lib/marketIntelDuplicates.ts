import { linkedInIdentifier } from "./marketIntelLinks";

type CompanyIdentity = {
  id: string; name: string; group?: "customer" | "competitor";
  website?: string; linkedinUrl?: string;
  scrape?: { site?: string; li?: string[] | null };
};

export function companyDomain(raw: string): string | null {
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    return host.includes(".") ? host : null;
  } catch { return null; }
}

export function findCompanyDuplicate<T extends CompanyIdentity>(companies: T[], website: string, linkedinUrl: string): T | undefined {
  const domain = companyDomain(website);
  const slug = linkedInIdentifier(linkedinUrl, "company")?.toLowerCase();
  return companies.find((company) => {
    const sites = [company.website, company.scrape?.site].filter(Boolean).map((site) => companyDomain(site!));
    const linkedIn = [linkedInIdentifier(company.linkedinUrl || "", "company"), ...(company.scrape?.li || [])];
    return (!!domain && sites.some((site) => site && (site === domain || domain.endsWith(`.${site}`) || site.endsWith(`.${domain}`)))) ||
      (!!slug && linkedIn.some((value) => value?.toLowerCase() === slug));
  });
}

export class DuplicateCompanyError extends Error {
  constructor(company: Pick<CompanyIdentity, "name" | "group">) {
    super(`${company.name} already exists. Use Manage ${company.group === "competitor" ? "competitors" : "customers"} to track it.`);
    this.name = "DuplicateCompanyError";
  }
}

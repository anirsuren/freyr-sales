import { readGoogleNews } from "./companyWebsiteNews";
import type { FeedNews } from "./marketIntelFeed";
import { decodeGoogleNewsUrl } from "./marketIntelSummarize";
import { CLASSIFY_VERSION } from "./marketIntelSignals";
import { load } from "cheerio";

/** Authority notices are a separate source, even though they share the news
 * record shape. A press report or customer release cannot become an official
 * enforcement signal just because it repeats a regulator's name. */
export function healthAuthorityName(url: string): string | null {
  let host: string;
  let path: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    host = parsed.hostname.toLowerCase();
    path = parsed.pathname.toLowerCase();
  } catch { return null; }
  const on = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (on("fda.gov")) return "FDA";
  if (on("ema.europa.eu")) return "EMA";
  if (on("mhra.gov.uk") || (on("gov.uk") && /drug-device-alerts|medicines-and-healthcare-products-regulatory-agency|mhra|drug-safety-update/.test(path))) return "MHRA";
  if (on("tga.gov.au")) return "TGA";
  if (on("health-products.canada.ca") || on("recalls-rappels.canada.ca")) return "Health Canada";
  if (on("hsa.gov.sg")) return "HSA";
  if (on("mda.gov.my")) return "MDA";
  return null;
}

function officialPublisher(item: FeedNews): boolean {
  if (!item.publisherUrl) return /^(?:FDA|EMA|MHRA|TGA|HSA|MDA|Health Canada|GOV\.UK)$/i.test(item.source);
  try {
    const host = new URL(item.publisherUrl).hostname.toLowerCase();
    return !!healthAuthorityName(item.publisherUrl) || host === "www.gov.uk" || host === "gov.uk";
  } catch { return false; }
}

const ENFORCEMENT = /warning letter|form 483|inspection (?:finding|observation|report)|non.compliance|recall|field safety|safety notice|medicines defect|drug alert|import alert|import ban|consent decree|data integrity|certification lapse|failed audit|iso 13485|mdsap|\bgmp\b|good manufacturing practice/i;

export function isCompanyAuthorityNotice(item: Pick<FeedNews, "title" | "url">, companyName: string): boolean {
  if (!healthAuthorityName(item.url) || !ENFORCEMENT.test(`${item.title} ${new URL(item.url).pathname.replace(/[-_/]/g, " ")}`)) return false;
  const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const company = normalized(companyName).replace(/\b(?:inc|ltd|limited|plc|corporation|corp|co|company)\b/g, "").trim();
  if (!company) return false;
  return new RegExp(`(?:^| )${company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ +/g, " +")}(?: |$)`, "i").test(normalized(item.title));
}

const QUERIES = [
  "site:fda.gov",
  "(site:ema.europa.eu OR site:gov.uk)",
  "(site:tga.gov.au OR site:canada.ca OR site:hsa.gov.sg OR site:mda.gov.my)",
];

type FdaRecall = {
  recalling_firm?: string;
  report_date?: string;
  recall_number?: string;
  classification?: string;
  product_description?: string;
  reason_for_recall?: string;
  status?: string;
};

function fdaDate(value: string | undefined): string | null {
  if (!value || !/^\d{8}$/.test(value)) return null;
  const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  return Number.isFinite(Date.parse(date)) ? new Date(`${date}T12:00:00Z`).toISOString() : null;
}

async function fdaRecalls(companyName: string, type: "drug" | "device" | "food"): Promise<{ items: FeedNews[]; failed: boolean }> {
  const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const to = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const search = `recalling_firm:"${companyName.replace(/["\\]/g, " ")}" AND report_date:[${from} TO ${to}]`;
  const endpoint = `https://api.fda.gov/${type}/enforcement.json`;
  try {
    const response = await fetch(`${endpoint}?${new URLSearchParams({ search, limit: "1000" })}`, { signal: AbortSignal.timeout(8000) });
    if (response.status === 404) return { items: [], failed: false };
    if (!response.ok) return { items: [], failed: true };
    const payload = await response.json() as { results?: FdaRecall[] };
    const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(?:inc|ltd|limited|plc|corporation|corp|co|company)\b/g, "").trim();
    const wanted = normalized(companyName);
    const items = (payload.results ?? []).flatMap((record): FeedNews[] => {
      const date = fdaDate(record.report_date);
      const firm = normalized(record.recalling_firm ?? "");
      if (!date || !record.recall_number || !wanted || !firm || !(firm === wanted || firm.startsWith(`${wanted} `))) return [];
      const product = (record.product_description ?? "").split(/[,.;]/)[0].trim().slice(0, 90);
      const detailUrl = `${endpoint}?${new URLSearchParams({ search: `recall_number:"${record.recall_number}"`, limit: "1" })}`;
      return [{
        title: `FDA ${record.classification || "product"} recall ${record.recall_number}: ${companyName}${product ? ` — ${product}` : ""}`,
        url: detailUrl,
        source: "FDA",
        published: date,
        summary: [record.reason_for_recall, record.status ? `Status: ${record.status}.` : ""].filter(Boolean).join(" ").slice(0, 500),
        provenance: "health_authority",
        label: { signals: ["compliance_enforcement"], relevant: true, industries: [], isCompanyNews: true, v: CLASSIFY_VERSION },
      }];
    });
    return { items, failed: false };
  } catch { return { items: [], failed: true }; }
}

async function mhraNotices(companyName: string): Promise<{ items: FeedNews[]; failed: boolean }> {
  try {
    const url = `https://www.gov.uk/drug-device-alerts.atom?${new URLSearchParams({ keywords: companyName })}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { items: [], failed: true };
    const $ = load(await response.text(), { xml: true });
    const items: FeedNews[] = [];
    $("entry").each((_, element) => {
      const entry = $(element);
      const title = entry.find("title").first().text().trim();
      const detailUrl = entry.find("link[rel='alternate']").first().attr("href") || "";
      const published = entry.find("updated").first().text().trim();
      const summary = entry.find("summary").first().text().replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
      if (!published || Date.now() - Date.parse(published) > 90 * 86_400_000 || !isCompanyAuthorityNotice({ title, url: detailUrl }, companyName)) return;
      items.push({ title, url: detailUrl, source: "MHRA", published, summary, provenance: "health_authority",
        label: { signals: ["compliance_enforcement"], relevant: true, industries: [], isCompanyNews: true, v: CLASSIFY_VERSION } });
    });
    return { items, failed: false };
  } catch { return { items: [], failed: true }; }
}

/** A small, free daily discovery pass. Only decoded final URLs on an official
 * authority host are accepted; search snippets never establish provenance. */
export async function collectHealthAuthorityNotices(companyName: string): Promise<{ items: FeedNews[]; failed: boolean }> {
  const safeName = companyName.replace(/["\r\n]/g, " ").trim();
  const [search, recallResults] = await Promise.all([
    Promise.all(QUERIES.map(domain =>
      readGoogleNews(`"${safeName}" ("warning letter" OR "Form 483" OR inspection OR recall OR "field safety" OR "import alert" OR "import ban" OR "consent decree" OR "data integrity" OR "failed audit" OR "certification lapse") ${domain} when:90d`)
    )),
    Promise.all([fdaRecalls(companyName, "drug"), fdaRecalls(companyName, "device"), fdaRecalls(companyName, "food"), mhraNotices(companyName)]),
  ]);
  const candidates = search.flatMap(result => result.news.filter(officialPublisher).slice(0, 30));
  const decoded = await Promise.all(candidates.map(async item => {
    const finalUrl = item.url.includes("news.google.com") ? await decodeGoogleNewsUrl(item.url) : item.url;
    if (!finalUrl) return null;
    const notice = { ...item, url: finalUrl };
    if (!isCompanyAuthorityNotice(notice, companyName)) return null;
    return {
      ...notice,
      source: healthAuthorityName(finalUrl)!,
      provenance: "health_authority" as const,
      label: { signals: ["compliance_enforcement" as const], relevant: true, industries: [], isCompanyNews: true, v: CLASSIFY_VERSION },
    };
  }));
  const seen = new Set<string>();
  return {
    items: [...recallResults.flatMap(result => result.items), ...decoded.filter((item): item is NonNullable<typeof item> => !!item)].filter(item => {
      const key = item.url.replace(/\/$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
    failed: search.every(result => result.failed) && recallResults.every(result => result.failed),
  };
}

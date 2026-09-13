import { requestMarketIntelSearch } from "./marketIntelSearch";
/**
 * EVERY COMPANY WEARS ITS OWN LOGO (Anir, Sep 11: "every single thing should
 * have their logos, both customers and competitors").
 *
 * The LinkedIn page logo the scrape already mirrors stays first wherever it
 * exists. Everything else gets its logo from the company's OWN website: the
 * icons the homepage declares (apple-touch-icon and the largest icon first),
 * then /apple-touch-icon.png and /favicon.ico, then Google's favicon service.
 * The picture is copied into our bucket, so it never depends on their server.
 *
 * A company with no website on file is looked up (Perplexity picks the
 * company's own site from its search results) and the answer has to pass the
 * same checks as a typed website: the domain lines up with the name, and a
 * short name like RACS also has to be about regulated work on its homepage.
 * Nothing is guessed; a company that fails keeps the generated mark.
 */
import sharp from "sharp";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { MI_PHOTO_BUCKET } from "./miPhotos";
import { domainMatchesName, normalizeSiteDomain } from "./siteUpdates";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";
const FALLBACK_COST_USD = 0.006;
const NOT_THEIR_SITE =
  /linkedin\.com|facebook\.com|(^|\.)x\.com$|twitter\.com|instagram\.com|youtube\.com|wikipedia\.org|bloomberg\.com|crunchbase\.com|zoominfo\.com|glassdoor\.|indeed\.|reuters\.com|pitchbook\.com|dnb\.com|tracxn\.com|owler\.com|rocketreach\.co|cbinsights\.com|g2\.com|capterra\.com|craft\.co/i;
const REGULATED_WORK =
  /regulat|complian|consult|pharma|medic|device|cosmetic|chemic|food|supplement|clinical|life science|safety|labell?ing|artwork|quality|registration|dossier|toxicolog/i;

export type LogoImage = { bytes: Buffer; type: string; size: number | null; source: string };

function decodeHref(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/");
}

/** The icons a homepage declares, best first. */
function iconsDeclared(html: string, base: string): { url: string; score: number }[] {
  const found: { url: string; score: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (/\brel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? "").toLowerCase();
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || !rel.includes("icon") || rel.includes("mask-icon")) continue;
    let url: string;
    try {
      url = new URL(decodeHref(href), base).toString();
    } catch {
      continue;
    }
    if (!/^https?:/i.test(url)) continue;
    const declared = Math.max(
      0,
      ...(/\bsizes\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? "")
        .split(/\s+/)
        .map((s) => Number(s.split(/x/i)[0]) || 0)
    );
    const svg = /svg/i.test(/\btype\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? "") || /\.svg(\?|$)/i.test(url);
    found.push({ url, score: declared || (rel.includes("apple-touch-icon") ? 180 : svg ? 150 : 32) });
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const identity = tag.match(/\b(?:alt|class|id)\s*=\s*["']([^"']+)["']/gi)?.join(" ") ?? "";
    const src = /\b(?:src|data-src)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!src || (!/logo/i.test(identity) && !/(?:^|\/)logo[._-]/i.test(src))) continue;
    try {
      const url = new URL(decodeHref(src), base).toString();
      if (/^https?:/i.test(url)) found.push({ url, score: 160 });
    } catch { /* Ignore malformed image references. */ }
  }
  return found.sort((a, b) => b.score - a.score);
}

function typeFromBytes(bytes: Buffer): string | null {
  if (bytes.length > 8 && bytes.readUInt32BE(0) === 0x89504e47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (bytes.length > 6 && bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1) return "image/x-icon";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (/<svg[\s>]/i.test(bytes.subarray(0, 2000).toString("utf8"))) return "image/svg+xml";
  return null;
}

export async function fetchLogoImage(url: string): Promise<Omit<LogoImage, "source"> | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const header = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (header.includes("html") || header.includes("json")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 100 || bytes.length > 12_000_000) return null;
    const type = header.startsWith("image/") ? header : typeFromBytes(bytes);
    if (!type) return null;
    // Store one browser-safe format. Some sites serve ICO or SVG, while the
    // existing bucket accepts PNG; never silently lose a successfully found logo.
    let source = bytes;
    if (type.includes("icon") && bytes.length >= 22) {
      const count = bytes.readUInt16LE(4);
      for (let i = count - 1; i >= 0; i--) {
        const at = 6 + i * 16;
        if (at + 16 > bytes.length) continue;
        const length = bytes.readUInt32LE(at + 8), offset = bytes.readUInt32LE(at + 12);
        if (offset + length <= bytes.length && length > 8 && bytes.readUInt32BE(offset) === 0x89504e47) {
          source = bytes.subarray(offset, offset + length); break;
        }
      }
    }
    const png = await sharp(source, { limitInputPixels: 16_000_000 }).resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return { bytes: png, type: "image/png", size: Math.max(png.readUInt32BE(16), png.readUInt32BE(20)) };

  } catch {
    return null;
  }
}

/** The best logo a company's own website offers, or null. Free: plain fetches. */
export async function findSiteLogo(domain: string): Promise<LogoImage | null> {
  let html = "";
  let base = `https://${domain}/`;
  try {
    const res = await fetch(base, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) {
      html = (await res.text()).slice(0, 400_000);
      base = res.url || base;
    }
  } catch {
    /* a site that turns servers away still keeps icons at the usual paths */
  }
  let origin = `https://${domain}`;
  try {
    origin = new URL(base).origin;
  } catch {
    /* keep the plain domain */
  }
  const tries = [
    ...iconsDeclared(html, base).slice(0, 5),
    { url: `${origin}/apple-touch-icon.png`, score: 180 },
    { url: `${origin}/favicon.ico`, score: 16 },
  ];
  const seen = new Set<string>();
  let small: LogoImage | null = null;
  for (const attempt of tries) {
    if (seen.has(attempt.url)) continue;
    seen.add(attempt.url);
    const image = await fetchLogoImage(attempt.url);
    if (!image) continue;
    if ((image.size ?? 0) >= 64) return { ...image, source: attempt.url };
    if ((image.size ?? 0) >= 32 && !small) small = { ...image, source: attempt.url };
  }
  const google = await fetchLogoImage(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`);
  if (google && (google.size ?? 0) >= 32 && (google.size ?? 0) > (small?.size ?? 0)) {
    return { ...google, source: "google favicon service" };
  }
  return small;
}

/** Copy a logo into our public bucket and hand back its lasting URL. */
export async function storeCompanyLogo(companyId: string, image: LogoImage): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const ext = image.type.includes("svg")
    ? "svg"
    : image.type.includes("png")
      ? "png"
      : image.type.includes("jpeg") || image.type.includes("jpg")
        ? "jpg"
        : image.type.includes("gif")
          ? "gif"
          : image.type.includes("webp")
            ? "webp"
            : "ico";
  const hash = createHash("sha1").update(image.bytes).digest("hex").slice(0, 16);
  const path = `logos/${companyId}-${hash}.${ext}`;
  const store = db.storage.from(MI_PHOTO_BUCKET);
  const { error } = await store.upload(path, image.bytes, {
    contentType: image.type,
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) return null;
  return store.getPublicUrl(path).data.publicUrl;
}

async function homepageFits(domain: string, name: string): Promise<boolean> {
  const short = name.replace(/[^a-z0-9]/gi, "").length <= 5;
  try {
    const res = await fetch(`https://${domain}`, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return !short;
    return !short || REGULATED_WORK.test((await res.text()).slice(0, 400_000));
  } catch {
    return !short;
  }
}

/**
 * THE COMPANY'S OWN SITE, LOOKED UP ONCE. `context` says what kind of company
 * it is ("a regulatory services company working in medical devices"), so an
 * acronym finds the right one; the checks run on the bare name.
 */
export async function findOfficialDomain(
  name: string,
  context: string,
  key: string | undefined
): Promise<{ domain: string | null; cost: number }> {
  const plain = name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (!key || !plain) return { domain: null, cost: 0 };
  try {
    const data = await requestMarketIntelSearch({
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "You identify a company's official website. Answer with the 1-based position of the search result that is the company's OWN site (not LinkedIn, Wikipedia, Crunchbase, a news article or a directory). If none of the results is the company's own site, answer 0.",
          },
          { role: "user", content: `Official company website of ${name}, ${context}. Reply with only the number.` },
        ],
        web_search_options: { search_context_size: "low" },
        max_tokens: 20,
      }, key, "logo-domain-lookup", name);
    const cost = typeof data?.usage?.cost?.total_cost === "number" ? data.usage.cost.total_cost : FALLBACK_COST_USD;
    const results: any[] = Array.isArray(data?.search_results) ? data.search_results : [];
    const index = Number(String(data?.choices?.[0]?.message?.content ?? "").match(/\d+/)?.[0] ?? 0);
    const domain = normalizeSiteDomain(index > 0 ? results[index - 1]?.url : null);
    if (!domain || NOT_THEIR_SITE.test(domain) || !domainMatchesName(domain, plain)) return { domain: null, cost };
    if (!(await homepageFits(domain, plain))) return { domain: null, cost };
    return { domain, cost };
  } catch {
    return { domain: null, cost: 0 };
  }
}

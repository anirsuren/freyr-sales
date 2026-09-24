/**
 * ENGLISH TITLES ONLY (Sep 13 loop). PwC Thailand's consumer survey reached
 * Thought Leadership titled in Thai. Freyr's team reads English, so a title
 * that is mostly another script is left out, on the next pull and on the
 * board already saved. Accented Latin ("Santé", "Meilleurs") still counts.
 */
export function readableTitle(title: string): boolean {
  const letters = title.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return false;
  const latin = title.match(/\p{Script=Latin}/gu) ?? [];
  return latin.length / letters.length >= 0.6;
}

/* ONE OUTLET, ONE NAME (Sep 13 loop). The same outlet was stored as "Yahoo
   Finance", "finance.yahoo.com" and "Finance": turning an address into a name
   dropped its last two parts, so "finance.yahoo.com" lost the "yahoo". The
   outlets seen most often in the feed take the name they use themselves (the
   name most of their stored items already carry); any other address becomes its
   site name, never a lone subdomain. */
const OUTLET_BY_HOST: Record<string, string> = {
  "finance.yahoo.com": "Yahoo Finance",
  "news.google.com": "Google News",
  "prnewswire.com": "PR Newswire",
  "businesswire.com": "Business Wire",
  "globenewswire.com": "GlobeNewswire",
  "reuters.com": "Reuters",
  "fiercepharma.com": "Fierce Pharma",
  "fiercebiotech.com": "Fierce Biotech",
  "tradingview.com": "TradingView",
  "investing.com": "Investing.com",
  "seekingalpha.com": "Seeking Alpha",
  "biospace.com": "BioSpace",
  "marketbeat.com": "MarketBeat",
  "theglobeandmail.com": "The Globe and Mail",
  "morningstar.com": "Morningstar",
  "stocktitan.net": "Stock Titan",
  "biopharmadive.com": "BioPharma Dive",
  "economictimes.indiatimes.com": "The Economic Times",
  "marketwatch.com": "MarketWatch",
  "firstwordpharma.com": "FirstWord Pharma",
  "simplywall.st": "Simply Wall St",
  "thepharmaletter.com": "The Pharma Letter",
  "marketscreener.com": "MarketScreener",
  "medicaldialogues.in": "Medical Dialogues",
  "ndtvprofit.com": "NDTV Profit",
};

/** Publisher label links to the publication, while a headline links to the
 * specific article. RSS and syndicated article URLs cannot identify the
 * publisher's homepage on their own, so resolve known names explicitly and
 * leave uncertain names unlinked rather than sending people to an aggregator. */
export function outletHomepage(label: string, articleUrl?: string): string | null {
  const name = outletName(label, articleUrl).toLowerCase();
  const known: Record<string, string> = {
    ...Object.fromEntries(Object.entries(OUTLET_BY_HOST).map(([host, outlet]) => [outlet.toLowerCase(), host])),
    "screener": "screener.in",
    "firstword pharma": "firstwordpharma.com",
    "ad hoc news": "ad-hoc-news.de",
    "tipranks": "tipranks.com",
    "buttondown": "buttondown.com",
    "pacermonitor": "pacermonitor.com",
    "stockgro": "stockgro.club",
  };
  const host = known[name];
  if (host) return `https://${host}/`;
  try {
    const url = new URL(articleUrl ?? "");
    const articleHost = url.hostname.replace(/^www\./, "").toLowerCase();
    if (!/^(?:news\.google\.com|google\.com|bing\.com|yahoo\.com)$/.test(articleHost)
      && cleanSourceLabel(articleHost).toLowerCase() === name) return `${url.protocol}//${url.host}/`;
  } catch { /* Unknown publisher: show its name without a misleading link. */ }
  return null;
}
const COUNTRY_SECOND_LEVEL = /^(co|com|net|org|gov|edu|ac|or|ne|go)$/i;

function hostLabels(address: string): string[] {
  return address
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split("/")[0]
    .replace(/^(www|m|amp)\./, "")
    .split(".")
    .filter(Boolean);
}

/** Index of the site's own label in its address ("yahoo" in finance.yahoo.com). */
function siteLabelIndex(labels: string[]): number {
  let end = labels.length - 1;
  if (labels[end]?.length === 2 && end >= 2 && COUNTRY_SECOND_LEVEL.test(labels[end - 1])) end -= 1;
  return Math.max(0, end - 1);
}

function outletFromHost(address: string): string {
  const labels = hostLabels(address);
  for (let i = 0; i < labels.length - 1; i++) {
    const known = OUTLET_BY_HOST[labels.slice(i).join(".")];
    if (known) return known;
  }
  if (labels.length < 2) return labels.join(".");
  return labels[siteLabelIndex(labels)].replace(/[-_]+/g, " ");
}

/** "MARKETSCREENER.COM" and "Fierce Pharma" were both wearing the source
 *  chip; every stored label is now a clean publication name. */
export function cleanSourceLabel(raw: string): string {
  let s = String(raw || "News").trim();
  /* A search provider's "Not specified in search results" is not an outlet. */
  if (/^(not specified|not available|unknown|n\/?a|none|null|undefined)\b/i.test(s)) return "News";
  if (/\.[a-z]{2,6}$/i.test(s) || /\.(com|net|org|io|co)\b/i.test(s)) {
    if (!/\s/.test(s)) {
      s = outletFromHost(s);
    } else {
      s = s.replace(/^www\./i, "").split("/")[0];
      s = s.replace(/\.[a-z]{2,6}$/i, "").replace(/\.[a-z]{2,6}$/i, "");
      s = s.replace(/[-_.]+/g, " ");
    }
  }
  s = s.replace(/\s+/g, " ").trim();
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    s = s
      .toLowerCase()
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  }
  /* Whole words only (Sep 13 loop): a hard cut at 32 letters stored "Court of
     Appeals for the Federal" and "Security Affairs newsletter Roun". */
  if (s.length > 48) {
    const cut = s.slice(0, 48);
    s = cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : 48).trim();
  }
  return s || "News";
}

/* ONE NAME PER OUTLET (Sep 13 loop). News arrived under page titles such as
   "Euronext Markets: Real-time Stock Market Data | live", some older items
   carry a bare address ("pharma.economictimes.indiatimes.com") or a search
   provider's "Not specified", and a card said "clinicaltrialvanguard.com:"
   beside "FirstWord Pharma:". Cards and pages show the outlet's name up to the
   first separator, ending on a whole word. */
export function outletName(label: string, url?: string): string {
  const stored = String(label || "News").trim().replace(/^www\./i, "");
  /* A one-word name that is only a subdomain of the story's own address was cut
     from it by the old rule ("Finance" for finance.yahoo.com): name the site. */
  const labels = url ? hostLabels(url) : [];
  const subdomainOnly =
    !/\s/.test(stored) && labels.length > 2 &&
    labels.indexOf(stored.toLowerCase()) >= 0 &&
    labels.indexOf(stored.toLowerCase()) < siteLabelIndex(labels);
  const raw = subdomainOnly
    ? cleanSourceLabel(labels.join("."))
    : /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(stored) || /^not specified/i.test(stored)
      ? cleanSourceLabel(stored)
      : stored;
  const first = raw.split(/\s+(?:\||\/|via|-|\u2013|\u2014)\s+|:\s+/i)[0]?.trim() ?? "";
  const name = first.length >= 3 ? first : raw;
  if (name.length <= 40) return name;
  const cut = name.slice(0, 40);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : 40).trim()}\u2026`;
}

/* A STORY ALWAYS HAS WORDS TO CLICK (Sep 13 loop). A Fortrea press release was
   stored with an empty title and showed as a blank link. Its address still says
   what it is, so the last readable part of the path stands in for the title. */
export function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => {
        try {
          return decodeURIComponent(part);
        } catch {
          return part;
        }
      })
      .map((part) => part.replace(/\.(html?|aspx?|php|pdf)$/i, ""));
    const slug = [...parts].reverse().find((part) => /[a-z]{3,}[-_ ]+[a-z]{2,}/i.test(part));
    if (!slug) return parsed.hostname.replace(/^www\./i, "");
    const words = slug.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  } catch {
    return "Open the story";
  }
}

/* CUT BY CHARACTERS, NOT CODE UNITS (Sep 13 loop). A post title cut at 160 with
   .slice() split an emoji in half; the server wrote the broken half as a
   replacement character and the browser kept it, so React reported a
   hydration mismatch on Worldwide Clinical Trials' page. */
export function clipText(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join("");
}

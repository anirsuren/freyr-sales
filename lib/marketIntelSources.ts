/**
 * WHO GETS SCRAPED AND HOW. One entry per company on the standing watch:
 * `li` = LinkedIn company slugs to try in order, `expect` must appear in the
 * returned author name or the result is thrown away (never store another
 * company's posts under this name), `newsQ` overrides the Google News query
 * when the display name alone is ambiguous. scripts/market-intel-ingest.mjs
 * carries the same list for manual full backfills.
 */

export type CompanySource = {
  id: string;
  name: string;
  li: string[] | null;
  expect: string;
  newsQ?: string;
};

/**
 * COMPETITOR WATCH (from the Aug 11 call: one tab per bucket — customers,
 * competitors, market). Seeded from the marketing team's dummy tracker
 * (Intertek, Veeva, IQVIA, Emergo, Parexel, TCS) topped up with the known
 * regulatory-services field; marketing's official list replaces or extends
 * this via Track a company on the Competitors tab.
 */
export const COMPETITOR_SOURCES: CompanySource[] = [
  { id: "veeva", name: "Veeva", li: ["veeva-systems"], expect: "veeva", newsQ: "Veeva Systems" },
  { id: "iqvia", name: "IQVIA", li: ["iqvia"], expect: "iqvia" },
  { id: "parexel", name: "Parexel", li: ["parexel"], expect: "parexel" },
  { id: "intertek", name: "Intertek", li: ["intertek"], expect: "intertek" },
  { id: "emergo", name: "Emergo by UL", li: ["emergo", "emergo-by-ul"], expect: "emergo", newsQ: "Emergo by UL" },
  { id: "tcs", name: "TCS", li: ["tata-consultancy-services"], expect: "tata", newsQ: "TCS life sciences regulatory" },
  { id: "certara", name: "Certara", li: ["certara"], expect: "certara" },
  { id: "icon-plc", name: "ICON plc", li: ["iconplc"], expect: "icon", newsQ: "ICON plc clinical" },
  { id: "ul-solutions", name: "UL Solutions", li: ["ul-solutions"], expect: "ul", newsQ: "UL Solutions" },
  { id: "nsf-international", name: "NSF", li: ["nsf-international"], expect: "nsf", newsQ: "NSF International certification" },
];

export const COMPANY_SOURCES: CompanySource[] = [
  { id: "takeda", name: "Takeda", li: ["takeda-pharmaceuticals"], expect: "takeda" },
  { id: "gsk", name: "GSK", li: ["gsk"], expect: "gsk" },
  { id: "novartis", name: "Novartis", li: ["novartis"], expect: "novartis" },
  { id: "incyte", name: "Incyte", li: ["incyte"], expect: "incyte" },
  { id: "gilead", name: "Gilead", li: ["gilead-sciences"], expect: "gilead" },
  { id: "jj-medtech", name: "J&J Medtech", li: ["johnson-johnson-medtech", "jnj-medtech"], expect: "johnson", newsQ: "Johnson & Johnson MedTech" },
  { id: "kenvue", name: "Kenvue", li: ["kenvue"], expect: "kenvue" },
  { id: "otsuka", name: "Otsuka", li: ["otsuka-pharmaceutical-companies", "otsuka-america-pharmaceutical"], expect: "otsuka", newsQ: "Otsuka Pharmaceutical" },
  { id: "opella", name: "Opella", li: ["opella"], expect: "opella", newsQ: "Opella healthcare" },
  { id: "zydus", name: "Zydus", li: ["zydus-group", "zyduslifesciences"], expect: "zydus", newsQ: "Zydus Lifesciences" },
  { id: "galderma", name: "Galderma", li: ["galderma"], expect: "galderma" },
  { id: "curateq", name: "CuraTeQ", li: ["curateq-biologics"], expect: "curateq", newsQ: "CuraTeQ Biologics" },
  { id: "pierre-fabre", name: "Pierre Fabre", li: ["pierre-fabre"], expect: "pierre fabre" },
  { id: "vertex", name: "Vertex", li: ["vertex-pharmaceuticals"], expect: "vertex", newsQ: "Vertex Pharmaceuticals" },
  // "Gideon" reads as Gedeon Richter; the author check keeps it honest.
  { id: "gideon", name: "Gideon", li: ["gedeonrichter", "gedeon-richter"], expect: "richter", newsQ: "Gedeon Richter" },
  { id: "novartis-cognizant", name: "Novartis + Cognizant", li: null, expect: "", newsQ: "Novartis Cognizant" },
  { id: "roche", name: "Roche", li: ["roche"], expect: "roche" },
  { id: "sanofi", name: "Sanofi", li: ["sanofi"], expect: "sanofi" },
  { id: "astrazeneca", name: "AstraZeneca", li: ["astrazeneca"], expect: "astrazeneca" },
  { id: "boehringer-ingelheim", name: "Boehringer Ingelheim", li: ["boehringer-ingelheim"], expect: "boehringer" },
  { id: "teva", name: "Teva", li: ["teva-pharmaceuticals"], expect: "teva", newsQ: "Teva Pharmaceuticals" },
  { id: "viatris", name: "Viatris", li: ["viatris"], expect: "viatris" },
  { id: "lupin", name: "Lupin", li: ["lupin"], expect: "lupin", newsQ: "Lupin pharmaceutical" },
  { id: "cipla", name: "Cipla", li: ["cipla"], expect: "cipla" },
  { id: "dr-reddy-s", name: "Dr. Reddy's", li: ["dr--reddys-laboratories", "dr-reddys-laboratories"], expect: "redd", newsQ: "Dr Reddy's Laboratories" },
  { id: "sun-pharma", name: "Sun Pharma", li: ["sun-pharmaceutical-industries-ltd", "sun-pharma"], expect: "sun pharma" },
  { id: "alkem", name: "Alkem", li: ["alkem-laboratories-ltd-", "alkem-laboratories"], expect: "alkem", newsQ: "Alkem Laboratories" },
  { id: "biocon", name: "Biocon", li: ["biocon"], expect: "biocon" },
  { id: "moderna", name: "Moderna", li: ["modernatx"], expect: "moderna" },
  { id: "amgen", name: "Amgen", li: ["amgen"], expect: "amgen" },
  { id: "bayer", name: "Bayer", li: ["bayer"], expect: "bayer" },
  { id: "merck-kgaa", name: "Merck KGaA", li: ["merck-group"], expect: "merck", newsQ: "Merck Group pharma" },
  { id: "eisai", name: "Eisai", li: ["eisai"], expect: "eisai" },
  { id: "daiichi-sankyo", name: "Daiichi Sankyo", li: ["daiichi-sankyo"], expect: "daiichi" },
];

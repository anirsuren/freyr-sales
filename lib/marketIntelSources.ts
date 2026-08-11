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
  // ---- Anir's real lists (Aug 11 screenshots: the Replacement Market slide
  // and the marketing competitor sheet). Platform giants are news-only with
  // scoped queries so the tab tracks the relevant product line, not the whole
  // conglomerate's feed.
  { id: "amplexor", name: "Amplexor", li: ["amplexor"], expect: "amplexor", newsQ: "Amplexor life sciences" },
  { id: "arisglobal", name: "ArisGlobal", li: ["arisglobal"], expect: "arisglobal" },
  { id: "calyx", name: "Calyx", li: ["calyx", "calyx-inc"], expect: "calyx", newsQ: "Calyx clinical trials" },
  { id: "ennov", name: "Ennov", li: ["ennov"], expect: "ennov", newsQ: "Ennov software" },
  { id: "extedo", name: "EXTEDO", li: ["extedo"], expect: "extedo" },
  { id: "generis", name: "Generis", li: ["generis-corporation", "generis"], expect: "generis", newsQ: "Generis CARA" },
  { id: "phlexglobal", name: "Phlexglobal", li: ["phlexglobal"], expect: "phlex" },
  { id: "lorenz", name: "LORENZ", li: ["lorenz-life-sciences", "lorenz-international"], expect: "lorenz", newsQ: "LORENZ Life Sciences" },
  { id: "dxc-technology", name: "DXC Technology", li: ["dxctechnology"], expect: "dxc", newsQ: "DXC Technology life sciences" },
  { id: "opentext", name: "OpenText", li: ["opentext"], expect: "opentext", newsQ: "OpenText Documentum" },
  { id: "sparta-systems", name: "Sparta Systems", li: ["sparta-systems"], expect: "sparta", newsQ: "Sparta Systems TrackWise" },
  { id: "sharepoint", name: "SharePoint", li: null, expect: "", newsQ: "Microsoft SharePoint" },
  { id: "reed-tech", name: "Reed Tech", li: ["reed-tech"], expect: "reed", newsQ: "Reed Tech life sciences" },
  { id: "navitas-life-sciences", name: "Navitas Life Sciences", li: ["navitas-life-sciences"], expect: "navitas", newsQ: "Navitas Life Sciences" },
  { id: "kalypso", name: "Kalypso", li: ["kalypso"], expect: "kalypso", newsQ: "Kalypso Rockwell digital" },
  { id: "regdocs365", name: "RegDocs365", li: ["regdocs365"], expect: "regdocs", newsQ: "RegDocs365" },
  { id: "schlafender-hase", name: "Schlafender Hase", li: ["schlafender-hase"], expect: "schlafender", newsQ: "Schlafender Hase TVT" },
  { id: "ddi", name: "DDi", li: ["makeitddi", "ddi-llc"], expect: "ddi", newsQ: "DDi regulatory technology" },
  { id: "instem", name: "Instem", li: ["instem"], expect: "instem", newsQ: "Instem life sciences" },
  { id: "dita-exchange", name: "Dita Exchange", li: ["dita-exchange"], expect: "dita", newsQ: "Dita Exchange" },
  { id: "glemser", name: "Glemser Technologies", li: ["glemser-technologies"], expect: "glemser", newsQ: "Glemser Technologies" },
  { id: "cortellis", name: "Cortellis", li: null, expect: "", newsQ: "Clarivate Cortellis" },
  { id: "regask", name: "RegASK", li: ["regask"], expect: "regask" },
  { id: "rimsys", name: "Rimsys", li: ["rimsys"], expect: "rimsys", newsQ: "Rimsys regulatory" },
  { id: "esko", name: "Esko", li: ["esko"], expect: "esko", newsQ: "Esko packaging software" },
  { id: "windchill", name: "Windchill", li: null, expect: "", newsQ: "PTC Windchill" },
  { id: "oracle", name: "Oracle", li: null, expect: "", newsQ: "Oracle Life Sciences" },
  { id: "sap", name: "SAP", li: null, expect: "", newsQ: "SAP life sciences" },
  { id: "siemens", name: "Siemens", li: null, expect: "", newsQ: "Siemens Digital Industries life sciences" },
  // The sheet's last three, resolved: i4i is the Toronto structured-content
  // labeling company (SPL/FHIR ePI); Orion is Orion Innovation, the Veeva
  // Vault RIM implementation partner. "Integras" has no LinkedIn company in
  // this space (the only match is a Belgian tax firm), so it runs as a
  // quoted news watch under the sheet's literal name — wrong-company data
  // never lands on its card.
  { id: "i4i", name: "i4i", li: ["i4i"], expect: "i4i", newsQ: "i4i structured content labeling" },
  { id: "orion-innovation", name: "Orion Innovation", li: ["orioninnovation", "orion-innovation"], expect: "orion", newsQ: "Orion Innovation life sciences" },
  { id: "integras", name: "Integras", li: null, expect: "", newsQ: "\"Integras\" regulatory" },
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

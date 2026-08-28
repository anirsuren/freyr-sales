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
  /**
   * The company's OWN domain, no scheme and no www — "takeda.com".
   *
   * A third source beside news outlets and LinkedIn (Anir, Aug 28: "can you
   * add updates from their respective official websites as well?"). It is a
   * hard filter, not a hint: the website pass searches this domain only and
   * throws away anything whose host is not it, so a company with no entry
   * here simply has no website column rather than a column of somebody
   * else's press releases. Tracked companies supply their own from the
   * Website field on the tracking form.
   */
  site?: string;
};

/**
 * COMPETITOR WATCH (from the Aug 11 call: one tab per bucket — customers,
 * competitors, market). Seeded from the marketing team's dummy tracker
 * (Intertek, Veeva, IQVIA, Emergo, Parexel, TCS) topped up with the known
 * regulatory-services field; marketing's official list replaces or extends
 * this via Track a company on the Competitors tab.
 */
export const COMPETITOR_SOURCES: CompanySource[] = [
  { id: "veeva", name: "Veeva", li: ["veeva-systems"], expect: "veeva", newsQ: "Veeva Systems", site: "veeva.com" },
  { id: "iqvia", name: "IQVIA", li: ["iqvia"], expect: "iqvia", site: "iqvia.com" },
  { id: "parexel", name: "Parexel", li: ["parexel"], expect: "parexel", site: "parexel.com" },
  { id: "intertek", name: "Intertek", li: ["intertek"], expect: "intertek", site: "intertek.com" },
  { id: "emergo", name: "Emergo by UL", li: ["emergo", "emergo-by-ul"], expect: "emergo", newsQ: "Emergo by UL", site: "emergobyul.com" },
  { id: "tcs", name: "TCS", li: ["tata-consultancy-services"], expect: "tata", newsQ: "TCS life sciences regulatory", site: "tcs.com" },
  { id: "certara", name: "Certara", li: ["certara"], expect: "certara", site: "certara.com" },
  { id: "icon-plc", name: "ICON plc", li: ["iconplc"], expect: "icon", newsQ: "ICON plc clinical", site: "iconplc.com" },
  { id: "ul-solutions", name: "UL Solutions", li: ["ul-solutions"], expect: "ul", newsQ: "UL Solutions", site: "ul.com" },
  { id: "nsf-international", name: "NSF", li: ["nsf-international"], expect: "nsf", newsQ: "NSF International certification", site: "nsf.org" },
  // ---- Anir's real lists (Aug 11 screenshots: the Replacement Market slide
  // and the marketing competitor sheet). Platform giants are news-only with
  // scoped queries so the tab tracks the relevant product line, not the whole
  // conglomerate's feed.
  { id: "amplexor", name: "Amplexor", li: ["amplexor"], expect: "amplexor", newsQ: "Amplexor life sciences", site: "amplexor.com" },
  { id: "arisglobal", name: "ArisGlobal", li: ["arisglobal"], expect: "arisglobal", site: "arisglobal.com" },
  { id: "calyx", name: "Calyx", li: ["calyx", "calyx-inc"], expect: "calyx", newsQ: "Calyx clinical trials", site: "calyx.ai" },
  { id: "ennov", name: "Ennov", li: ["ennov"], expect: "ennov", newsQ: "Ennov software", site: "ennov.com" },
  { id: "extedo", name: "EXTEDO", li: ["extedo"], expect: "extedo", site: "extedo.com" },
  { id: "generis", name: "Generis", li: ["generis-corporation", "generis"], expect: "generis", newsQ: "Generis CARA", site: "generiscorp.com" },
  { id: "phlexglobal", name: "Phlexglobal", li: ["phlexglobal"], expect: "phlex", site: "phlexglobal.com" },
  { id: "lorenz", name: "LORENZ", li: ["lorenz-life-sciences", "lorenz-international"], expect: "lorenz", newsQ: "LORENZ Life Sciences", site: "lorenz.cc" },
  { id: "dxc-technology", name: "DXC Technology", li: ["dxctechnology"], expect: "dxc", newsQ: "DXC Technology life sciences", site: "dxc.com" },
  { id: "opentext", name: "OpenText", li: ["opentext"], expect: "opentext", newsQ: "OpenText Documentum", site: "opentext.com" },
  { id: "sparta-systems", name: "Sparta Systems", li: ["sparta-systems"], expect: "sparta", newsQ: "Sparta Systems TrackWise", site: "spartasystems.com" },
  { id: "sharepoint", name: "SharePoint", li: null, expect: "", newsQ: "Microsoft SharePoint" },
  { id: "reed-tech", name: "Reed Tech", li: ["reed-tech"], expect: "reed", newsQ: "Reed Tech life sciences", site: "reedtech.com" },
  { id: "navitas-life-sciences", name: "Navitas Life Sciences", li: ["navitas-life-sciences"], expect: "navitas", newsQ: "Navitas Life Sciences", site: "navitaslifesciences.com" },
  { id: "kalypso", name: "Kalypso", li: ["kalypso"], expect: "kalypso", newsQ: "Kalypso Rockwell digital", site: "kalypso.com" },
  { id: "regdocs365", name: "RegDocs365", li: ["regdocs365"], expect: "regdocs", newsQ: "RegDocs365", site: "regdocs365.com" },
  { id: "schlafender-hase", name: "Schlafender Hase", li: ["schlafender-hase"], expect: "schlafender", newsQ: "Schlafender Hase TVT", site: "schlafender-hase.com" },
  { id: "ddi", name: "DDi", li: ["makeitddi", "ddi-llc"], expect: "ddi", newsQ: "DDi regulatory technology" },
  { id: "instem", name: "Instem", li: ["instem"], expect: "instem", newsQ: "Instem life sciences", site: "instem.com" },
  { id: "dita-exchange", name: "Dita Exchange", li: ["dita-exchange"], expect: "dita", newsQ: "Dita Exchange" },
  { id: "glemser", name: "Glemser Technologies", li: ["glemser-technologies"], expect: "glemser", newsQ: "Glemser Technologies", site: "glemser.com" },
  { id: "cortellis", name: "Cortellis", li: null, expect: "", newsQ: "Clarivate Cortellis" },
  { id: "regask", name: "RegASK", li: ["regask"], expect: "regask", site: "regask.com" },
  { id: "rimsys", name: "Rimsys", li: ["rimsys"], expect: "rimsys", newsQ: "Rimsys regulatory", site: "rimsys.io" },
  { id: "esko", name: "Esko", li: ["esko"], expect: "esko", newsQ: "Esko packaging software", site: "esko.com" },
  { id: "windchill", name: "Windchill", li: null, expect: "", newsQ: "PTC Windchill" },
  { id: "oracle", name: "Oracle", li: null, expect: "", newsQ: "Oracle Life Sciences", site: "oracle.com" },
  { id: "sap", name: "SAP", li: null, expect: "", newsQ: "SAP life sciences", site: "sap.com" },
  { id: "siemens", name: "Siemens", li: null, expect: "", newsQ: "Siemens Digital Industries life sciences", site: "siemens.com" },
  // The sheet's last three, resolved: i4i is the Toronto structured-content
  // labeling company (SPL/FHIR ePI); Orion is Orion Innovation, the Veeva
  // Vault RIM implementation partner. "Integras" has no LinkedIn company in
  // this space (the only match is a Belgian tax firm), so it runs as a
  // quoted news watch under the sheet's literal name — wrong-company data
  // never lands on its card.
  { id: "i4i", name: "i4i", li: ["i4i"], expect: "i4i", newsQ: "i4i structured content labeling" },
  { id: "orion-innovation", name: "Orion Innovation", li: ["orioninnovation", "orion-innovation"], expect: "orion", newsQ: "Orion Innovation life sciences", site: "orioninnovation.com" },
  { id: "integras", name: "Integras", li: null, expect: "", newsQ: "\"Integras\" regulatory" },
];

export const COMPANY_SOURCES: CompanySource[] = [
  { id: "takeda", name: "Takeda", li: ["takeda-pharmaceuticals"], expect: "takeda", site: "takeda.com" },
  { id: "gsk", name: "GSK", li: ["gsk"], expect: "gsk", site: "gsk.com" },
  { id: "novartis", name: "Novartis", li: ["novartis"], expect: "novartis", site: "novartis.com" },
  { id: "incyte", name: "Incyte", li: ["incyte"], expect: "incyte", site: "incyte.com" },
  { id: "gilead", name: "Gilead", li: ["gilead-sciences"], expect: "gilead", site: "gilead.com" },
  { id: "jj-medtech", name: "J&J Medtech", li: ["johnson-johnson-medtech", "jnj-medtech"], expect: "johnson", newsQ: "Johnson & Johnson MedTech", site: "jnjmedtech.com" },
  { id: "kenvue", name: "Kenvue", li: ["kenvue"], expect: "kenvue", site: "kenvue.com" },
  { id: "otsuka", name: "Otsuka", li: ["otsuka-pharmaceutical-companies", "otsuka-america-pharmaceutical"], expect: "otsuka", newsQ: "Otsuka Pharmaceutical", site: "otsuka.co.jp" },
  { id: "opella", name: "Opella", li: ["opella"], expect: "opella", newsQ: "Opella healthcare", site: "opella.com" },
  { id: "zydus", name: "Zydus", li: ["zydus-group", "zyduslifesciences"], expect: "zydus", newsQ: "Zydus Lifesciences", site: "zyduslife.com" },
  { id: "galderma", name: "Galderma", li: ["galderma"], expect: "galderma", site: "galderma.com" },
  { id: "curateq", name: "CuraTeQ", li: ["curateq-biologics"], expect: "curateq", newsQ: "CuraTeQ Biologics", site: "curateq.com" },
  { id: "pierre-fabre", name: "Pierre Fabre", li: ["pierre-fabre"], expect: "pierre fabre", site: "pierre-fabre.com" },
  { id: "vertex", name: "Vertex", li: ["vertex-pharmaceuticals"], expect: "vertex", newsQ: "Vertex Pharmaceuticals", site: "vrtx.com" },
  // "Gideon" reads as Gedeon Richter; the author check keeps it honest.
  { id: "gideon", name: "Gideon", li: ["gedeonrichter", "gedeon-richter"], expect: "richter", newsQ: "Gedeon Richter", site: "gedeonrichter.com" },
  { id: "novartis-cognizant", name: "Novartis + Cognizant", li: null, expect: "", newsQ: "Novartis Cognizant" },
  { id: "roche", name: "Roche", li: ["roche"], expect: "roche", site: "roche.com" },
  { id: "sanofi", name: "Sanofi", li: ["sanofi"], expect: "sanofi", site: "sanofi.com" },
  { id: "astrazeneca", name: "AstraZeneca", li: ["astrazeneca"], expect: "astrazeneca", site: "astrazeneca.com" },
  { id: "boehringer-ingelheim", name: "Boehringer Ingelheim", li: ["boehringer-ingelheim"], expect: "boehringer", site: "boehringer-ingelheim.com" },
  { id: "teva", name: "Teva", li: ["teva-pharmaceuticals"], expect: "teva", newsQ: "Teva Pharmaceuticals", site: "tevapharm.com" },
  { id: "viatris", name: "Viatris", li: ["viatris"], expect: "viatris", site: "viatris.com" },
  { id: "lupin", name: "Lupin", li: ["lupin"], expect: "lupin", newsQ: "Lupin pharmaceutical", site: "lupin.com" },
  { id: "cipla", name: "Cipla", li: ["cipla"], expect: "cipla", site: "cipla.com" },
  { id: "dr-reddy-s", name: "Dr. Reddy's", li: ["dr--reddys-laboratories", "dr-reddys-laboratories"], expect: "redd", newsQ: "Dr Reddy's Laboratories", site: "drreddys.com" },
  { id: "sun-pharma", name: "Sun Pharma", li: ["sun-pharmaceutical-industries-ltd", "sun-pharma"], expect: "sun pharma", site: "sunpharma.com" },
  { id: "alkem", name: "Alkem", li: ["alkem-laboratories-ltd-", "alkem-laboratories"], expect: "alkem", newsQ: "Alkem Laboratories", site: "alkemlabs.com" },
  { id: "biocon", name: "Biocon", li: ["biocon"], expect: "biocon", site: "biocon.com" },
  { id: "moderna", name: "Moderna", li: ["modernatx"], expect: "moderna", site: "modernatx.com" },
  { id: "amgen", name: "Amgen", li: ["amgen"], expect: "amgen", site: "amgen.com" },
  { id: "bayer", name: "Bayer", li: ["bayer"], expect: "bayer", site: "bayer.com" },
  { id: "merck-kgaa", name: "Merck KGaA", li: ["merck-group"], expect: "merck", newsQ: "Merck Group pharma", site: "merckgroup.com" },
  { id: "eisai", name: "Eisai", li: ["eisai"], expect: "eisai", site: "eisai.com" },
  { id: "daiichi-sankyo", name: "Daiichi Sankyo", li: ["daiichi-sankyo"], expect: "daiichi", site: "daiichisankyo.com" },
];

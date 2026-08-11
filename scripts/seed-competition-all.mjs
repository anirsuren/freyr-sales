// COMPETITION SEED — EVERY OFFERING (Anir, Aug 11: "for every one"). Each
// offering gets the real competitor products of its category, researched
// Aug 11, 2026 (Gartner Peer Insights, G2, Artixio, Grand View, Kallik/
// Clarivate/Rimsys vendor pages). Facts stay within what the research
// supports: what each product is + its official page. No pricing is filed —
// none of these vendors publish it; the team adds real pricing as they learn
// it. Rows the team already added are never touched; re-running never dupes.
//
//   node scripts/seed-competition-all.mjs

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const ADDED_BY = "Freyr AI research";
const now = () => new Date().toISOString();
const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const RIM = [
  { company: "Veeva Systems", product: "Vault RIM", link: "https://www.veeva.com/products/vault-rim/", about: "Cloud RIM suite covering registrations, submissions, submissions archive and health-authority correspondence on the Vault platform. Industry leader in cloud RIM; 2025-26 releases added Veeva AI Agents automating document summarization, compliance checks and HA question responses. Strongest with large sponsors already on other Vault applications." },
  { company: "ArisGlobal", product: "LifeSphere RIMS", link: "https://www.arisglobal.com/products/regulatory/", about: "End-to-end regulatory information management in the LifeSphere cloud platform: product and registration tracking, submission planning and collaboration, positioned on automation." },
  { company: "IQVIA", product: "IQVIA RIM Smart", link: "https://www.iqvia.com/solutions/safety-regulatory-and-quality-compliance/regulatory-affairs", about: "IQVIA's end-to-end RIM covering regulatory data, registrations, submission content and publishing, sold alongside their broader safety and compliance stack. Named among the leading RIM systems for 2026." },
  { company: "Ennov", product: "Ennov RIM", link: "https://en.ennov.com/solutions/regulatory/", about: "Regulatory suite (RIM, publishing, document management) from the French platform vendor; consistently listed among the leading RIM systems and often competitive on total cost against the US cloud suites." },
  { company: "EXTEDO", product: "EXTEDOpulse (RIManager)", link: "https://www.extedo.com/", about: "German regulatory-affairs platform spanning RIM, submission publishing (eCTDmanager) and pharmacovigilance; RIManager is the registration-tracking core, now part of the EXTEDOpulse platform." },
  { company: "LORENZ Life Sciences", product: "LORENZ drugTrack", link: "https://www.lorenz.cc/", about: "Registration and regulatory-activity tracking paired with docuBridge, their widely used submission publishing tool. Named among the key RIM players; strong installed base in publishing-led regulatory teams." },
  { company: "Rimsys", product: "Rimsys Platform", link: "https://www.rimsys.io/", about: "Medtech-focused RIM: registrations, UDI, EUDAMED, standards and essential principles in one platform. Claims 6 of the top 12 global medtech manufacturers — the one to watch on medical-device deals." },
  { company: "MasterControl", product: "MasterControl RIM", link: "https://www.mastercontrol.com/", about: "Quality-suite vendor listed among the leading RIM systems for 2026; regulatory capabilities sold within their broader quality and compliance platform, so it shows up where the customer already runs MasterControl QMS." },
  { company: "Generis", product: "CARA Life Sciences Platform", link: "https://www.generiscorp.com/", about: "Regulatory and R&D content-plus-data platform used across life sciences for regulatory document management and RIM; frequently the content backbone in deals where a full suite is not wanted." },
];

const SUBMISSIONS = [
  { company: "LORENZ Life Sciences", product: "LORENZ docuBridge", link: "https://www.lorenz.cc/", about: "One of the most widely deployed eCTD submission publishing and validation tools worldwide; the incumbent to displace in many regulatory-operations teams." },
  { company: "EXTEDO", product: "eCTDmanager", link: "https://www.extedo.com/", about: "Submission assembly, publishing and validation across eCTD and regional formats, part of the EXTEDOpulse platform; strong footprint with European sponsors and agencies." },
  { company: "Veeva Systems", product: "Vault Submissions & Publishing", link: "https://www.veeva.com/products/vault-rim/", about: "Submission content management and publishing inside Vault RIM — content, publishing and registrations in one suite is their core pitch against point publishing tools." },
  { company: "Ennov", product: "Ennov Publishing (Dossier)", link: "https://en.ennov.com/solutions/regulatory/", about: "eCTD publishing and dossier management within the Ennov regulatory suite; typically bundled with their document management." },
  { company: "Certara", product: "GlobalSubmit", link: "https://www.certara.com/", about: "Certara's eCTD publishing, validation and review software; also used by regulators for review, which they lean on in sales conversations." },
  { company: "PharmaLex (Cencora)", product: "Regulatory operations services", link: "https://www.pharmalex.com/", about: "Large outsourced regulatory-operations arm (submission publishing, dossier maintenance) — competes with Freyr on the services side of document operations." },
  { company: "Navitas Life Sciences", product: "Regulatory operations services", link: "https://www.navitaslifesciences.com/", about: "Services peer competing on outsourced submissions and regulatory operations for global sponsors." },
];

const INTEL = [
  { company: "Clarivate", product: "Cortellis Regulatory Intelligence", link: "https://clarivate.com/life-sciences-healthcare/research-development/regulatory-compliance-intelligence/regulatory-intelligence-solutions/", about: "Expert-curated regulatory intelligence across 80+ markets for biopharma and medtech, recently extended with an agentic Cortellis Regulatory AI Assistant. The reference database incumbent in most intelligence deals." },
  { company: "RegASK", product: "RegASK AI regulatory intelligence", link: "https://regask.com/", about: "AI-first regulatory-intelligence platform with agentic monitoring and expert network, aimed at the same always-current-requirements problem; strong in consumer health and medtech." },
  { company: "IQVIA", product: "Regulatory intelligence & consulting", link: "https://www.iqvia.com/solutions/safety-regulatory-and-quality-compliance", about: "Regulatory intelligence data and consulting sold within IQVIA's compliance stack — competes when the customer wants intelligence bundled with a bigger vendor relationship." },
  { company: "Redica Systems", product: "Redica Platform", link: "https://redica.com/", about: "Quality and regulatory intelligence mined from agency data (inspections, enforcement, guidance churn); competes on the data-driven end of regulatory surveillance." },
];

const LABELING = [
  { company: "Kallik", product: "Veraciti", link: "https://www.kallik.com/", about: "Cloud-native platform combining labeling and artwork management in one solution — manage all labeling and artwork, maintain compliance and increase speed to market. Frequent head-to-head in regulated artwork deals." },
  { company: "Loftware", product: "PRISYM 360", link: "https://www.loftware.com/", about: "Label lifecycle management with a 360° view of master data from design to inspection; part of Loftware's labeling portfolio (NiceLabel, Spectrum, PRISYM 360), strongest in medical device labeling." },
  { company: "Esko", product: "WebCenter", link: "https://www.esko.com/", about: "Packaging and artwork management workflow widely used by pharma packaging teams; the artwork-process incumbent in many accounts." },
  { company: "Schlafender Hase", product: "TVT (Text Verification Tool)", link: "https://www.schlafender-hase.com/", about: "The de-facto standard text-comparison and proofreading tool for labeling and artwork QC; competes with the verification slice of artwork services." },
  { company: "GlobalVision", product: "GlobalVision (Verify)", link: "https://www.globalvision.co/", about: "Automated proofreading and artwork inspection platform competing on the quality-control step of the labeling chain." },
];

const AGENTS = [
  { company: "Veeva Systems", product: "Veeva AI Agents", link: "https://www.veeva.com/", about: "Agentic AI shipped into Vault applications from 2025-26: document summarization, compliance checks and health-authority question response workflows. The suite play — agents arrive wherever Vault already is." },
  { company: "Clarivate", product: "Cortellis Regulatory AI Assistant", link: "https://clarivate.com/news/clarivate-presents-cortellis-regulatory-ai-assistant/", about: "Agentic assistant over Cortellis regulatory content announced to cut through safety and compliance complexity — competes with Freya agents on the intelligence-grounded Q&A side." },
  { company: "RegASK", product: "RegASK AI agents", link: "https://regask.com/", about: "Agent-style monitoring and question answering over regulatory requirements with a human expert network behind it." },
  { company: "ArisGlobal", product: "LifeSphere automation & AI", link: "https://www.arisglobal.com/", about: "Automation and AI capabilities across the LifeSphere platform (regulatory, safety, medical affairs) — their pitch mirrors Fusion's platform-plus-intelligence story." },
];

const RA_SERVICES = [
  { company: "Parexel", product: "Regulatory & Access Consulting", link: "https://www.parexel.com/", about: "Global CRO with a large regulatory consulting arm (strategy, submissions, agency interactions); the big-firm alternative in strategic regulatory outsourcing." },
  { company: "ICON plc", product: "Regulatory services", link: "https://www.iconplc.com/", about: "CRO-scale regulatory affairs and compliance services; competes for enterprise regulatory outsourcing programs." },
  { company: "PharmaLex (Cencora)", product: "Regulatory affairs services", link: "https://www.pharmalex.com/", about: "One of the largest specialist regulatory service providers (now part of Cencora); the closest like-for-like services competitor in many mid-size and large deals." },
  { company: "ProPharma Group", product: "Regulatory sciences services", link: "https://www.propharmagroup.com/", about: "Specialist regulatory, compliance and pharmacovigilance services firm competing across the same regulatory-affairs outsourcing spectrum." },
  { company: "Certara", product: "Synchrogenix regulatory writing", link: "https://www.certara.com/", about: "Regulatory writing and submission-content services (Synchrogenix) increasingly paired with AI authoring tools." },
  { company: "Navitas Life Sciences", product: "Regulatory affairs services", link: "https://www.navitaslifesciences.com/", about: "Services peer (part of TAKE Solutions lineage) competing on regulatory affairs and operations outsourcing for global sponsors." },
];

const SETS = {
  "Regulatory Information Management": RIM,
  "Submissions and Document Operations": SUBMISSIONS,
  "Global Regulatory Intelligence": INTEL,
  "Labeling and Artwork": LABELING,
  "Freya Fusion Platform & Agents": AGENTS,
  "Regulatory Affairs": RA_SERVICES,
};

const { data: offRow } = await sb.from("offering_catalog_state").select("catalog").eq("id", "default").maybeSingle();
const catalog = offRow?.catalog;
const offerings = Array.isArray(catalog) ? catalog : (catalog?.offerings ?? []);
if (!offerings.length) throw new Error("no offerings found in row 'default'");

const { data: compData } = await sb.from("offering_catalog_state").select("catalog").eq("id", "offering-competition").maybeSingle();
const row = compData?.catalog && typeof compData.catalog === "object" ? compData.catalog : { byOffering: {} };
if (!row.byOffering) row.byOffering = {};

const { data: trackingRow } = await sb.from("offering_catalog_state").select("catalog").eq("id", "market-intel:default").maybeSingle();
const trackedCompanies = trackingRow?.catalog?.companies ?? [];
const miIdFor = (company) => {
  const c = company.toLowerCase().split(" ")[0];
  const hit = trackedCompanies.find((t) => t.name.toLowerCase().includes(c));
  return hit?.id ?? null;
};

let totalAdded = 0;
const skipped = [];
for (const o of offerings) {
  const set = SETS[o.offering_category];
  if (!set) {
    skipped.push(`${o.id} ${o.offering_name} (${o.offering_category ?? "no category"})`);
    continue;
  }
  const list = (row.byOffering[o.id] ??= []);
  for (const entry of set) {
    if (list.some((c) => c.company.toLowerCase() === entry.company.toLowerCase() && c.product.toLowerCase() === entry.product.toLowerCase())) continue;
    list.push({
      id: uid("cp"),
      company: entry.company,
      product: entry.product,
      marketIntelId: miIdFor(entry.company),
      addedBy: ADDED_BY,
      addedAt: now(),
      materials: [
        { id: uid("cm"), kind: "about", label: "What it is", text: entry.about, addedBy: ADDED_BY, addedAt: now() },
        { id: uid("cm"), kind: "link", label: "Their product page", url: entry.link, addedBy: ADDED_BY, addedAt: now() },
      ],
    });
    totalAdded += 1;
  }
}

const { error } = await sb.from("offering_catalog_state").upsert({ id: "offering-competition", catalog: row, updated_at: now() });
if (error) throw new Error(error.message);
console.log(`seeded ${totalAdded} competitor products across ${offerings.length - skipped.length} offerings`);
if (skipped.length) console.log("needs manual competitors (unmapped category):", skipped.join(" · "));

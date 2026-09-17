import "server-only";
import { readMarketIntelTracking, type MarketIntelTracking } from "./marketIntelTracking";
import { summarizeCompany, summarizePerson, type FeedCompany, type FeedMeta, type PersonFeed, type FeedNews, type FeedPost, type MnaItem, type ThoughtItem } from "./marketIntelFeed";
import { CUSTOMER_SIGNALS, COMPETITOR_SIGNALS, SIGNAL_META, type ItemLabel } from "./marketIntelSignals";

/** Fictional, rolling samples only. Uses the same feed schema as real mode. */
export async function readDemoIntel() {
  return buildDemoIntel(await readMarketIntelTracking());
}
export function buildDemoIntel(tracking: MarketIntelTracking) {
  const companies: Record<string, FeedCompany> = {};
  const people: Record<string, PersonFeed> = {};
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * 86400_000).toISOString();
  const topics = ["advances a Phase II oncology trial", "opens a new manufacturing site", "appoints a regulatory affairs director", "expands its connected-device portfolio", "publishes safety surveillance findings", "launches a consumer health formulation", "starts a digital submission program", "announces a clinical research partnership", "secures funding for international expansion", "presents new evidence at an industry congress", "completes a quality-system audit", "introduces a lifecycle management service"];
  const companyNames = tracking.companies.map(company => company.name);
  for (const [index, tracked] of tracking.companies.entries()) {
    const signals = tracked.group === "competitor" ? COMPETITOR_SIGNALS : CUSTOMER_SIGNALS;
    const fetchedAt = ago((5 + index % 40) / 1440);
    const label = (i: number): ItemLabel => ({signals:[signals[i % signals.length]],relevant:i % 9 !== 8,industries:[],v:3,why:`Sample opportunity: ${tracked.name}'s ${SIGNAL_META[signals[i % signals.length]].label.toLowerCase()} activity may require regulatory planning, evidence preparation, or quality support.`});
    const date = (i: number) => ago(i < 4 ? (i+1)/8 : (i*7+index*3)%89 + 0.25);
    const link = (kind: string, i: number) => `https://market-intel.example/${tracked.id}/${kind}/${i}`;
    const posts: FeedPost[] = Array.from({length:36 + index%13},(_,i)=>({url:link("posts",i),text:`${tracked.name} ${topics[(i+index)%topics.length]}. Program ${i+1} brings together clinical, regulatory and quality teams across ${["Europe","North America","Asia-Pacific"][i%3]}. This is fictional sample activity for exploring the workspace.`,date:date(i),reactions:14+(i*19+index*7)%640,comments:2+i%31,reposts:i%18,label:label(i)}));
    const news: FeedNews[] = Array.from({length:64 + index%21},(_,i)=>({title:`${tracked.name} ${topics[(i+index)%topics.length]}: ${["clinical","commercial","research","compliance"][i%4]} program ${i+1}`,source:["Sample Life Sciences Review","Sample Regulatory Journal","Sample Device Monitor","Sample Clinical News"][i%4],url:link("news",i),published:date(i),summary:`In this fictional update, ${tracked.name} reports progress on program ${i+1}.${i % 7 === 0 && companyNames.length > 1 ? ` The report also discusses ${companyNames[(index + i + 1) % companyNames.length]}.` : ""} The work covers ${["trial evidence and submission readiness","manufacturing validation and market access","post-market surveillance and product labeling","international registration and portfolio integration"][i%4]}. Teams are preparing the next regional milestone.`,label:label(i+2)}));
    const site: FeedNews[] = Array.from({length:16 + index%7},(_,i)=>({...news[i],url:link("website",i),source:tracked.name,title:`${tracked.name}: ${["Research update","Company announcement","Quality milestone","Product launch"][i%4]} ${i+1}`,label:label(i+4)}));
    const hidden = new Set(tracking.mockHiddenStories?.[tracked.id] ?? []);
    companies[tracked.id]={id:tracked.id,name:tracked.name,slug:null,author:{name:tracked.name,followerCount:1200+index*830},group:tracked.group??"customer",logoUrl:tracked.logoUrl,fetchedAt,posts:posts.filter(p=>!hidden.has(p.url)),news:news.filter(n=>!hidden.has(n.url)),site:site.filter(n=>!hidden.has(n.url)),tldr:`Fictional briefing for ${tracked.name}: portfolio development, regulatory expansion, partnerships and team changes across the past three months.`};
    tracking.people.filter(p=>p.companyId===tracked.id).forEach((person,seat)=>{
      people[person.id]={fetchedAt,posts:Array.from({length:12+seat%7},(_,i)=>({url:link(`people/${person.id}`,i),text:`${person.name}, ${person.role}, shares a sample perspective on ${topics[(i+seat)%topics.length]}. Our team at ${tracked.name} is reviewing evidence, quality expectations and the next submission milestone.`,date:date(i+seat),reactions:12+i*7,comments:i%9,reposts:i%4,label:label(i+seat)}))};
    });
  }
  const names = tracking.companies.map(company=>company.name);
  const divisions = ["Medicinal Products","Medical Devices","Consumer"] as const;
  const mna: MnaItem[] = names.length ? Array.from({length:48},(_,i)=>({acquirer:names[i%names.length],target:`${["Silverleaf","Brookhaven","Evercrest","Northstar"][i%4]} ${["Therapeutics","Diagnostics","Wellness"][i%3]} ${i+1}`,status:i%2 ? "announced":"completed",division:divisions[i%3],valueLabel:`$${45+i*17}M`,date:ago(i<4 ? i/8 : i*1.7),summary:`Fictional transaction ${i+1}: the acquisition expands regional capabilities and introduces integration, labeling and quality-system work.`,sourceLabel:"Sample Market Transactions",sourceUrl:`https://market-intel.example/transactions/${i}`})) : [];
  const thought: ThoughtItem[] = Array.from({length:56},(_,i)=>({firm:["Sample Meridian Advisory","Sample Crestwell Research","Sample Harbor Institute","Sample Northvale Strategy"][i%4],title:`${["Regulatory modernization","Clinical evidence outlook","Connected device strategy","Consumer health trends","Quality transformation","Life sciences investment","Market access readiness"][i%7]}: study ${i+1}`,url:`https://market-intel.example/research/${i}`,date:ago(i<4?i/8:i*1.5),summary:"Fictional research exploring industry developments, operating priorities, and practical implications for regulatory and quality teams.",topic:(["Medicinal Products","Medical Devices","Consumer","Regulatory","Life sciences"] as const)[i%5],type:(["report","study","survey","outlook","article","webinar","podcast"] as const)[i%7]}));
  const meta: FeedMeta = {version:1,updatedAt:ago(5/1440),mna:{items:mna,total:mna.length,fetchedAt:ago(5/1440)},thought:{items:thought,total:thought.length,fetchedAt:ago(5/1440)}};
  return {tracking,companies,people,summaries:Object.fromEntries(Object.entries(companies).map(([id,c])=>[id,summarizeCompany(c)])),personSummaries:Object.fromEntries(Object.entries(people).map(([id,p])=>[id,summarizePerson(p)])),meta};
}

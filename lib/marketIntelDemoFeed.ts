import "server-only";
import { MI_COMPANIES, miDate, miNewsUrl, miPostUrl } from "./marketIntelMock";
import { readMarketIntelTracking, type MarketIntelTracking } from "./marketIntelTracking";
import { summarizeCompany, summarizePerson, type FeedCompany, type FeedMeta, type PersonFeed } from "./marketIntelFeed";

/** Sample records use the production feed schema and all the same presentation components. */
export async function readDemoIntel() {
  return buildDemoIntel(await readMarketIntelTracking());
}
export function buildDemoIntel(tracking:MarketIntelTracking) {
  const companies: Record<string, FeedCompany> = {};
  const people: Record<string, PersonFeed> = {};
  for (const [index, tracked] of tracking.companies.entries()) {
    const sample = MI_COMPANIES.find(c => c.id === tracked.id) ?? MI_COMPANIES[index % MI_COMPANIES.length];
    const rewrite = (text: string) => text.split(sample.name).join(tracked.name);
    const fetchedAt = new Date(Date.now() - (index % 45 + 5) * 60_000).toISOString();
    const posts = sample.posts.map((p, i) => ({ url: miPostUrl({name:tracked.name}, {...p,text:rewrite(p.text)}), text:rewrite(p.text), date:miDate(p.daysAgo).toISOString(), reactions:p.reactions, comments:p.comments, reposts:i * 2 }));
    const news = sample.news.map((n, i) => ({ title:rewrite(n.headline), source:n.source, url:miNewsUrl({...n,headline:rewrite(n.headline)}), published:miDate(n.daysAgo).toISOString(), summary:rewrite(n.summary), label:{signals:[sample.signals[i % sample.signals.length]?.kind ?? "others"], relevant:true, industries:[], v:3, why:rewrite(sample.signals[i % sample.signals.length]?.why ?? "")}}));
    companies[tracked.id] = { id:tracked.id, name:tracked.name, slug:null, author:{name:tracked.name,followerCount:1200+index*83}, group:tracked.group??"customer", logoUrl:tracked.logoUrl, fetchedAt, posts, news, site:news.slice(0,1).map(n=>({...n,source:tracked.name,url:tracked.website||n.url})), tldr:rewrite(sample.news[0]?.summary ?? "") };
    const hidden = new Set(tracking.mockHiddenStories?.[tracked.id] ?? []);
    companies[tracked.id].posts = posts.filter(p=>!hidden.has(p.url));
    companies[tracked.id].news = news.filter(n=>!hidden.has(n.url));
    companies[tracked.id].site = companies[tracked.id].site?.filter(n=>!hidden.has(n.url));
    const roster = tracking.people.filter(p => p.companyId === tracked.id);
    roster.forEach((p, i) => { people[p.id] = { fetchedAt, posts:posts.filter((p,j)=>!hidden.has(p.url) && j % Math.max(1,roster.length) === i) }; });
  }
  return { tracking, companies, people, summaries:Object.fromEntries(Object.entries(companies).map(([id,c])=>[id,summarizeCompany(c)])), personSummaries:Object.fromEntries(Object.entries(people).map(([id,p])=>[id,summarizePerson(p)])), meta:{version:1,updatedAt:new Date(Date.now()-5*60_000).toISOString()} as FeedMeta };
}

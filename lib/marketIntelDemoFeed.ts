import "server-only";
import { readMarketIntelTracking, type MarketIntelTracking } from "./marketIntelTracking";
import { summarizeCompany, summarizePerson, type FeedCompany, type FeedMeta, type PersonFeed, type FeedNews, type FeedPost, type ThoughtItem } from "./marketIntelFeed";
import { CUSTOMER_SIGNALS, COMPETITOR_SIGNALS, SIGNAL_META, type ItemLabel } from "./marketIntelSignals";
import { FROZEN_MARKET_INTEL_DEALS } from "./marketIntelFrozenDeals";
import { FROZEN_MARKET_INTEL_STORIES } from "./marketIntelFrozenStories";

/** Frozen review-workspace feed. Uses the same feed schema as real mode. */
export async function readDemoIntel() {
  return buildDemoIntel(await readMarketIntelTracking());
}
export function buildDemoIntel(tracking: MarketIntelTracking) {
  const companies: Record<string, FeedCompany> = {};
  const people: Record<string, PersonFeed> = {};
  /* Mock Market Intelligence is a frozen review workspace. The stories below
     were captured once from the public MHRA catalogue; neither their dates nor
     the workspace's collection clock move forward on reload. */
  const now = Date.parse("2026-09-21T14:00:00.000Z");
  const storyAt = (companyIndex: number, storyIndex: number) =>
    FROZEN_MARKET_INTEL_STORIES[(companyIndex * 19 + storyIndex) % FROZEN_MARKET_INTEL_STORIES.length];
  const sharedStoryUrl = (url: string, lane: string, companyId: string, index: number) =>
    `${url}#freyr-${lane}-${companyId}-${index}`;
  for (const [index, tracked] of tracking.companies.entries()) {
    const signals = tracked.group === "competitor" ? COMPETITOR_SIGNALS : CUSTOMER_SIGNALS;
    const fetchedAt = new Date(now - (5 + index % 40) * 60_000).toISOString();
    const label = (i: number): ItemLabel => ({signals:[signals[i % signals.length]],relevant:i % 9 !== 8,industries:[],v:3,why:`Commercial relevance: ${tracked.name}'s ${SIGNAL_META[signals[i % signals.length]].label.toLowerCase()} activity may require regulatory planning, evidence preparation, or quality support.`});
    const postCount = 12;
    const newsCount = 36;
    const siteCount = 8;
    const posts: FeedPost[] = Array.from({length:postCount},(_,i)=>{
      const story = storyAt(index, i * 3);
      return {url:sharedStoryUrl(story.url,"company",tracked.id,i),text:`${story.title}\n${story.summary}`,date:story.published,reactions:14+(i*19+index*7)%640,comments:2+i%31,reposts:i%18,label:label(i)};
    });
    const news: FeedNews[] = Array.from({length:newsCount},(_,i)=>{
      const story = storyAt(index, i);
      return {title:story.title,source:story.source,url:story.url,published:story.published,summary:story.summary,label:label(i+2)};
    });
    const site: FeedNews[] = Array.from({length:siteCount},(_,i)=>{
      const story = storyAt(index, i * 4 + 1);
      return {title:story.title,source:tracked.name,url:sharedStoryUrl(story.url,"website",tracked.id,i),published:story.published,summary:story.summary,label:label(i+4)};
    });
    const hidden = new Set(tracking.mockHiddenStories?.[tracked.id] ?? []);
    companies[tracked.id]={id:tracked.id,name:tracked.name,slug:null,author:{name:tracked.name,followerCount:1200+index*830},group:tracked.group??"customer",logoUrl:tracked.logoUrl,fetchedAt,posts:posts.filter(p=>!hidden.has(p.url)),news:news.filter(n=>!hidden.has(n.url)),site:site.filter(n=>!hidden.has(n.url)),tldr:`Briefing for ${tracked.name}: portfolio development, regulatory expansion, partnerships and team changes across the past three months.`};
    tracking.people.filter(p=>p.companyId===tracked.id).forEach((person,seat)=>{
      const personPostCount = 6;
      people[person.id]={fetchedAt,posts:Array.from({length:personPostCount},(_,i)=>{
        const story = storyAt(index, seat * 5 + i * 4);
        return {url:sharedStoryUrl(story.url,`person-${person.id}`,tracked.id,i),text:`${story.title}\n${story.summary}`,date:story.published,reactions:12+i*7,comments:i%9,reposts:i%4,label:label(i+seat)};
      })};
    });
  }
  const mna = FROZEN_MARKET_INTEL_DEALS;
  const thought: ThoughtItem[] = FROZEN_MARKET_INTEL_STORIES.slice(24,80).map((story,i)=>({firm:story.source,title:story.title,url:story.url,date:story.published,summary:story.summary,topic:(["Medicinal Products","Medical Devices","Consumer","Regulatory","Life sciences"] as const)[i%5],type:(["report","study","survey","outlook","article","webinar","podcast"] as const)[i%7]}));
  const meta: FeedMeta = {version:1,updatedAt:new Date(now).toISOString(),mna:{items:mna,total:mna.length,fetchedAt:new Date(now).toISOString()},thought:{items:thought,total:thought.length,fetchedAt:new Date(now).toISOString()}};
  return {tracking,companies,people,summaries:Object.fromEntries(Object.entries(companies).map(([id,c])=>[id,summarizeCompany(c)])),personSummaries:Object.fromEntries(Object.entries(people).map(([id,p])=>[id,summarizePerson(p)])),meta};
}

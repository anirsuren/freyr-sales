import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoIntel } from "../lib/marketIntelDemoFeed";
import {
  getHomePath,
  isOfferingsOnly,
  isOfferingsReleasePath,
  isReleased,
  isReleasedOnly,
} from "../lib/release";
import { buildBriefing, cardFromSummary } from "../lib/marketIntelFeed";
import type { MarketIntelTracking } from "../lib/marketIntelTracking";
import { FROZEN_WORKSPACE_TRACKING } from "../lib/marketIntelFrozenWorkspace";
const tracking: MarketIntelTracking = structuredClone(FROZEN_WORKSPACE_TRACKING);
const customer = tracking.companies.find((company) => company.group === "customer")!;
const competitor = tracking.companies.find((company) => company.group === "competitor")!;

test("both frozen real groups render through production cards and briefing builders",()=>{
  const demo=buildDemoIntel(tracking);
  assert.equal(demo.summaries[competitor.id].group,"competitor");
  for(const company of Object.values(demo.companies)) {
    const card=cardFromSummary(demo.summaries[company.id]);
    assert.ok(card.counts.posts + card.counts.news + card.counts.site > 0);
    assert.equal(buildBriefing(company,[]).name,company.name);
  }
  assert.ok(Object.values(demo.people).some((person)=>person.posts.length>0));
});
test("snapshot moderation removes a story from the card and briefing data",()=>{
  const before=buildDemoIntel(tracking);
  const url=before.companies[customer.id].news[0].url;
  const after=buildDemoIntel({...tracking,mockHiddenStories:{[customer.id]:[url]}});
  assert.ok(!after.companies[customer.id].news.some(n=>n.url===url));
  assert.equal(after.summaries[customer.id].counts.news,before.summaries[customer.id].counts.news-1);
});
test("frozen company charts have distinct histories",()=>{
  const demo=buildDemoIntel(tracking);
  const customerCard=cardFromSummary(demo.summaries[customer.id]);
  const competitorCard=cardFromSummary(demo.summaries[competitor.id]);
  assert.equal(customerCard.trend.length,12);
  assert.equal(competitorCard.trend.length,12);
  assert.notDeepEqual(customerCard.trend,competitorCard.trend);
  for (const card of [customerCard,competitorCard]) {
    const prior = Math.max(1, card.trend.at(-2) ?? 0);
    assert.ok((card.trend.at(-1) ?? 0) / prior < 2.5,"snapshot must not end in an artificial cliff spike");
  }
});

test("a company added after the capture waits for real collection",()=>{
  const unknown={id:"new-company",name:"New company",group:"customer" as const,industry:"",hq:"",website:"https://example.com",linkedinUrl:"",competitors:[],keywords:[],note:"",addedAt:"2026-09-21"};
  const demo=buildDemoIntel({...tracking,companies:[...tracking.companies,unknown]});
  assert.deepEqual(demo.companies[unknown.id].posts,[]);
  assert.deepEqual(demo.companies[unknown.id].news,[]);
});
test("Ready now contains only released modules while In progress exposes work in progress",()=>{
  assert.equal(isReleasedOnly("live"),true);
  assert.equal(isReleasedOnly("mock"),false);
  assert.equal(isOfferingsOnly("live"),false);
  for(const path of ["/market-intel","/performance/people","/offerings/a","/opportunities","/contracts","/solutioning"]) {
    assert.equal(isReleased(path,"live"),true,path);
    assert.equal(isReleased(path,"mock"),true,path);
  }
  for(const path of ["/dashboard","/analytics","/forecast","/recordings"]) {
    assert.equal(isReleased(path,"live"),false,path);
    assert.equal(isReleased(path,"mock"),true,path);
  }
  assert.equal(getHomePath("live"),"/offerings");
  assert.equal(getHomePath("mock"),"/dashboard");
});

test("released-route checks ignore view labels, tabs, filters, and fragments",()=>{
  for(const path of [
    "/market-intel?tab=competitors",
    "/opportunities?tab=deviations",
    "/settings?tab=profile",
    "/mock-mode/market-intel?tab=market#results",
  ]) assert.equal(isOfferingsReleasePath(path),true,path);
  assert.equal(isOfferingsReleasePath("/mock-mode/dashboard?tab=anything"),false);
});

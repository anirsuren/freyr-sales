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
const tracking:MarketIntelTracking = {companies:[
  {id:"test-customer",name:"Example Customer",group:"customer",industry:"Pharma",hq:"London",website:"https://example.com",linkedinUrl:"",competitors:[],keywords:[],note:"",addedAt:"2026-09-01"},
  {id:"test-competitor",name:"Example Competitor",group:"competitor",industry:"Software",hq:"Paris",website:"https://example.com",linkedinUrl:"",competitors:[],keywords:[],note:"",addedAt:"2026-09-01"},
],people:[{id:"person-1",companyId:"test-customer",name:"Maya Reed",role:"Director",linkedinUrl:"",addedAt:"2026-09-01"}]};
test("both sample groups render through production cards and briefing builders",()=>{
  const demo=buildDemoIntel(tracking);
  assert.equal(demo.summaries["test-competitor"].group,"competitor");
  for(const company of Object.values(demo.companies)) {
    const card=cardFromSummary(demo.summaries[company.id]);
    assert.ok(card.counts.posts>0);
    assert.ok(card.counts.news>0);
    assert.equal(buildBriefing(company,[]).name,company.name);
  }
  assert.ok(demo.people["person-1"].posts.length>0);
});
test("sample moderation removes a story from the card and briefing data",()=>{
  const before=buildDemoIntel(tracking);
  const url=before.companies["test-customer"].news[0].url;
  const after=buildDemoIntel({...tracking,mockHiddenStories:{"test-customer":[url]}});
  assert.ok(!after.companies["test-customer"].news.some(n=>n.url===url));
  assert.equal(after.summaries["test-customer"].counts.news,before.summaries["test-customer"].counts.news-1);
});
test("sample company charts have distinct, non-periodic histories",()=>{
  const demo=buildDemoIntel(tracking);
  const customer=cardFromSummary(demo.summaries["test-customer"]);
  const competitor=cardFromSummary(demo.summaries["test-competitor"]);
  assert.equal(customer.trend.length,12);
  assert.equal(competitor.trend.length,12);
  assert.notDeepEqual(customer.trend,competitor.trend);
  assert.ok(new Set(customer.trend).size>=4);
  assert.ok(new Set(competitor.trend).size>=4);
  for (const card of [customer,competitor]) {
    const prior = Math.max(1, card.trend.at(-2) ?? 0);
    assert.ok((card.trend.at(-1) ?? 0) / prior < 2.5,"sample must not end in an artificial cliff spike");
  }
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

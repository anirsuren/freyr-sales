import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemoIntel } from "../lib/marketIntelDemoFeed";
import { isReleased, getHomePath } from "../lib/release";
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
test("mode changes never change released routes or the home page",()=>{
  for(const path of ["/market-intel","/dashboard","/analytics","/forecast","/recordings","/performance/people","/offerings/a","/opportunities","/contracts","/solutioning"]) assert.equal(isReleased(path,"mock"),isReleased(path,"live"),path);
  assert.equal(getHomePath("mock"),getHomePath("live"));
});

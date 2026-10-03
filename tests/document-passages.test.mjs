import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { documentPassages } from "../lib/documentPassages.ts";

test("long slide continuations keep the original slide, and new slides cannot mix", () => {
  const text = `Introduction\nSlide 23: Commercials\n${"License includes twenty users. ".repeat(100)}\nEvery additional user costs $2,250 per year.\nSlide 24: Assumptions\nImplementation may vary with the number of users.`;
  const passages = documentPassages(text);
  const pricing = passages.find(p => p.text.includes("$2,250"));
  assert.equal(pricing.location, "Slide 23");
  assert.ok(passages.filter(p => p.location === "Slide 23").length > 2);
  assert.ok(passages.filter(p => p.location === "Slide 23").every(p => !p.text.includes("Implementation may vary")));
  assert.equal(passages.find(p => p.text.includes("Implementation may vary")).location, "Slide 24");
  assert.equal(passages[0].location, undefined);
});

test("PDF page labels survive continuation without inventing positions for plain documents", () => {
  const pages = documentPassages(`[Page 4]\n${"Regulated buyer requirements. ".repeat(90)}\nPage 5: Limitations\nNo integration price is stated.`);
  assert.equal(pages.at(-1).location, "Page 5");
  assert.ok(pages.slice(0, -1).every(p => p.location === "Page 4"));
  assert.ok(documentPassages("A long unnumbered document. ".repeat(200)).every(p => p.location === undefined));
});

test("long paragraphs and unbroken text retain every word", () => {
  const text = `${"word ".repeat(800)}${"x".repeat(2205)}`;
  const passages = documentPassages(text);
  assert.equal(passages.map(p => p.text).join("").replace(/\s/g, ""), text.replace(/\s/g, ""));
  assert.ok(passages.every(p => p.text.length <= 1100));
});

const require = createRequire(import.meta.url), Module = require("node:module"), load = Module._load;
const mocks = {
  "server-only": {},
  "./offerings": {listOfferings:()=>[],listCustomerTypes:()=>[],listMarkets:()=>[]},
  "./assignablePeople": {listAssignablePeople:async()=>[],redactUnverifiedOfferingPeople: o=>o},
  "./materialText": {loadMaterialText:async()=>({})},
};
Module._load = function(name,...args) {return mocks[name] ?? load.call(this,name,...args)};
const { buildKnowledgeBase, knowledgeBlock, searchKnowledge } = require("../lib/knowledgeBase.ts");
Module._load = load;

test("late pricing passages carry original locations through retrieval and rendering", () => {
  const text = Array.from({length:30},(_,i) => `Slide ${i+1}: Section\n${i===22 ? 'Commercials: license $50,000. Implementation cost may vary with total users.' : 'Platform overview and client needs.'}`).join("\n");
  const offering = {id:"offering",offering_name:"Offering",materials:[{id:"material",label:"Enterprise proposal",kind:"document",docsPath:"file.pptx"}]};
  const corpus = buildKnowledgeBase({"file.pptx":{offeringId:"offering",filename:"file.pptx",text,extractedAt:"2026-09-01"}},[offering]);
  const files = corpus.filter(p=>p.kind==='file');
  assert.ok(files.length>18);
  const hits = searchKnowledge("Commercials license implementation cost users",18,files);
  const commercial = hits.find(p=>p.text.includes("$50,000"));
  assert.equal(commercial.sourceLocation,"Slide 23");
  assert.equal(commercial.href,"/offerings/offering?tab=materials&material=material");
  const rendered = knowledgeBlock(hits);
  assert.match(rendered,/Original document location: Slide 23/);
  assert.match(rendered,/not a slide\/page number/);
  assert.match(rendered,/may vary with total users/);
});

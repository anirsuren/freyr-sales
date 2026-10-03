import test from "node:test";
import assert from "node:assert/strict";
import { priceQualificationBlock } from "../lib/agentPriceQualifications.ts";
import { selectedSourcePassages } from "../lib/agentSelectedSources.ts";

const files = [
  {id:'chosen#1',kind:'file',title:'Proposal',href:'/offerings/a?material=chosen',sourceLocation:'Slide 23',text:'Implementation cost may vary with the total number of users.\nLicense $50,000.'},
  {id:'chosen#2',kind:'file',title:'Proposal',href:'/offerings/a?material=chosen',sourceLocation:'Slide 24',text:'Bulk pricing is provided for larger user groups (50+ users).\nAny dashboards other than preconfigured will be created at additional charges.\nLicense costs are inclusive of support and maintenance.'},
  {id:'other#1',kind:'file',title:'Other quote',href:'/offerings/b?material=other',sourceLocation:'Page 2',text:'Implementation costs depend on migration volume.'},
];

test('pricing questions carry original implementation conditions and locations, not just amounts',()=>{
 const block=priceQualificationBlock(files.slice(0,2),'Calculate the first-year cost for 35 users.');
 assert.match(block,/Implementation cost may vary with the total number of users\./);
 assert.match(block,/Slide 23/);
 assert.match(block,/Bulk pricing is provided/);
 assert.match(block,/additional charges/);
 assert.doesNotMatch(block,/License \$50,000/);
 assert.match(block,/one-time charge is not necessarily fixed/);
});

test('conditions never expand the selected permission-filtered document scope',()=>{
 const scoped=selectedSourcePassages(files,[{kind:'material',id:'a:chosen'}]);
 const block=priceQualificationBlock(scoped,'Can we quote a fixed implementation fee?');
 assert.doesNotMatch(block,/migration volume|Other quote|offerings\/b/);
 assert.equal(priceQualificationBlock([], 'What is the implementation fee?'),'');
 assert.equal(priceQualificationBlock(files,'Summarize the regulatory workflow.'),'');
});

test('metadata is not evidence and duplicate chunks do not repeat qualifiers',()=>{
 const block=priceQualificationBlock([...files.slice(0,1),files[0],{...files[2],kind:'material'}],'What price can we quote?');
 assert.equal(block.split('Implementation cost may vary').length-1,1);
 assert.doesNotMatch(block,/migration volume/);
});

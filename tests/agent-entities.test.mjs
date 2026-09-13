import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalLoad = Module._load;
let signedIn = true,
  role = "bd_member",
  allowed = new Set(["/agent", "/offerings"]),
  reads = [];
const source = (name, value) => async () => {
  reads.push(name);
  return value;
};
const offering = {
  id: "of-1",
  offering_name: "Example Offering",
  owners: [],
  materials: [
    { id: "public", label: "Public guide", accessLevel: "sales" },
    { id: "private", label: "Private file", accessLevel: "agent-only" },
  ],
};
const mocks = {
  "@/lib/marketIntelFeed": {readMarketIntelFeed: source("marketFeed", {companies:{gsk:{author:{logoUrl:"https://example.com/logo.png"}}}})},
  "@/lib/memberScope": {
    verifiedRequestMemberScope: async () =>
      signedIn ? { workspaceId: "fixture", userId: "rep" } : null,
  },
  "@/lib/currentUser": {
    getCurrentUser: async () => ({ memberId: "rep", role }),
  },
  "@/lib/moduleAccessServer": {
    canOpenModule: async (path) => allowed.has(path),
  },
  "@/lib/db": {
    getDb: () => ({
      customers: {
        list: source("customers", [{ id: "c1", company_name: "Customer" }]),
      },
      contacts: { list: source("contacts", []) },
    }),
  },
  "@/lib/offerings": {
    initializeLiveOfferings: async () => {},
    listOfferings: () => [offering],
    listFdlComponents: () => [{ id: "fd1", name: "Component" }],
  },
  "@/lib/materialAccess": {
    canViewOfferingMaterial: (_o, m, _id, admin) =>
      admin || m.accessLevel === "sales",
  },
  "@/lib/accessStore": { listWorkspaceAccess: source("team", { members: [] }) },
  "@/lib/opportunities": {
    readOpportunities: source("opportunities", { opportunities: [] }),
  },
  "@/lib/contracts": { readContracts: source("contracts", { contracts: [] }) },
  "@/lib/leads": { readLeads: source("leads", { leads: [] }) },
  "@/lib/performance": { readPerformance: source("goals", { goals: [] }) },
  "@/lib/marketIntelTracking": {
    readMarketIntelTracking: source("market-intel", {
      companies: [{ id: "gsk", name: "GSK", logoUrl: "/logos/gsk.png" }],
      people: [{id:"p1",name:"Example Person",linkedinUrl:"https://www.linkedin.com/in/example-person/",photoUrl:"/images/person.webp"}],
    }),
  },
  "@/lib/solutioning": {
    readSolutioning: source("solutioning", {
      requests: [{ id: "s1", title: "Example proposal" }],
    }),
  },
};
Module._load = function (name, ...args) {
  return mocks[name] || originalLoad.call(this, name, ...args);
};
const { GET } = require("../app/api/agent/entities/route.ts");
Module._load = originalLoad;
// Rendering functions run without a browser or any network calls.
globalThis.React = require("react");
const {
  injectEntities,
  unambiguousEntities,
  entitiesForAnswer,
} = require("../components/agent/EntityPills.tsx");

test("unauthenticated index refuses before any data reads", async () => {
  signedIn = false;
  reads = [];
  assert.equal((await GET({})).status, 401);
  assert.deepEqual(reads, []);
  signedIn = true;
});
test("agent permission is required even for an authenticated member", async () => {
  allowed = new Set(["/offerings"]);
  reads = [];
  assert.equal((await GET({})).status, 403);
  assert.deepEqual(reads, []);
});
test("rep index never reads denied modules and excludes private material names", async () => {
  allowed = new Set(["/agent", "/offerings"]);
  reads = [];
  role = "bd_member";
  const response = await GET({});
  const data = await response.json();
  assert.deepEqual(reads, []);
  assert.deepEqual(
    data.materials.map((x) => x.name),
    ["Public guide"],
  );
  for (const kind of [
    "companies",
    "contacts",
    "components",
    "people",
    "deals",
    "contracts",
    "leads",
    "goals",
    "marketCompanies",
    "trackedPeople",
    "solutioning",
    "reports",
  ])
    assert.deepEqual(data[kind], [], kind);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
test("admin receives allowed market/solution detail identities and private files", async () => {
  allowed = new Set(["/agent", "/offerings", "/market-intel", "/solutioning"]);
  role = "admin";
  const data = await (await GET({})).json();
  assert.equal(data.materials.length, 2);
  assert.deepEqual(data.marketCompanies, [
    { id: "gsk", name: "GSK", logoUrl: "https://example.com/logo.png" },
  ]);
  assert.equal(data.solutioning[0].id, "s1");
  assert.deepEqual(data.trackedPeople,[{name:"Example Person",id:"https://www.linkedin.com/in/example-person/",logoUrl:"/images/person.webp"}]);
});
test("a module grant is respected independently of role", async () => {
  role = "bd_member";
  allowed = new Set(["/agent", "/market-intel"]);
  const data = await (await GET({})).json();
  assert.equal(data.marketCompanies.length, 1);
  assert.deepEqual(data.offerings, []);
});
test("ambiguous names never choose an arbitrary destination", () => {
  const entities = [
    { name: "GSK", id: "crm", kind: "company" },
    { name: "GSK", id: "intel", kind: "marketCompany" },
  ];
  assert.deepEqual(unambiguousEntities(entities), []);
  assert.deepEqual(injectEntities("GSK", entities, "x"), ["GSK"]);
});
test("longest names win; duplicates of same record are safe", () => {
  const a = { name: "Example", id: "a", kind: "company" },
    b = { name: "Example Pharma", id: "b", kind: "marketCompany" };
  assert.deepEqual(unambiguousEntities([a, b, a]), [b, a]);
  const nodes = injectEntities("Example Pharma.", [a, b], "x");
  assert.equal(nodes[0].props.href, "/market-intel/b");
  assert.equal(nodes[1], ".");
});
test("market and solution pills link to actual detail routes; path IDs are encoded", () => {
  for (const [kind, path] of [
    ["marketCompany", "market-intel"],
    ["solution", "solutioning"],
    ["company", "customers"],
    ["component", "components"],
    ["deal", "opportunities"],
    ["goal", "performance/goal"],
  ]) {
    const nodes = injectEntities(
      "Example Pharma",
      [{ name: "Example Pharma", id: "a/b", kind }],
      "x",
    );
    assert.equal(nodes[0].props.href, `/${path}/a%2Fb`);
  }
});
test("material pill opens its exact file and regular prose stays unlinked", () => {
  const nodes = injectEntities(
    "Product Video",
    [{ name: "Product Video", id: "of1:file/1", kind: "material" }],
    "x",
  );
  assert.equal(
    nodes[0].props.href,
    "/offerings/of1?tab=materials&material=file%2F1",
  );
  assert.deepEqual(
    injectEntities(
      "registrations",
      [{ name: "Registrations", id: "of1", kind: "offering" }],
      "x",
    ),
    ["registrations"],
  );
});

test("explicit first-mention links use the stored logo and exact destination", () => {
 const {entityLink} = require("../components/agent/EntityPills.tsx");
 const link = entityLink('/market-intel/tcs', 'TCS', [{id:'tcs',name:'TCS',kind:'marketCompany',logoUrl:'https://example.com/logo.png'}], 'first');
 assert.equal(link.props.href, '/market-intel/tcs');
 assert.equal(link.props.children[0].props.src, 'https://example.com/logo.png');
});


test("shared Team links match the named person and do not tag page navigation", () => {
 const {entityLink}=require("../components/agent/EntityPills.tsx");
 const people=[{id:"a",name:"Alice Example",kind:"person"},{id:"b",name:"Bob Example",kind:"person"}];
 const link=entityLink("/team","Bob Example",people,"bob");
 assert.equal(link.props.children[0].props.name,"Bob Example");
 assert.equal(link.props.href,"/team?member=b");
 assert.equal(entityLink("/team","Team",people,"team"),null);
 assert.equal(entityLink("/team","Unknown person",people,"unknown"),null);
});

 test("a single-word catalogue title does not tag another company's product", () => {
 const {entityLink}=require("../components/agent/EntityPills.tsx");
 const entities=[{id:"insights",name:"Insights",kind:"component"}];
 assert.deepEqual(injectEntities("Ash for Insights",entities,"x"),["Ash for Insights"]);
 assert.equal(entityLink("/components/insights","Insights",entities,"x").props.href,"/components/insights");
 });

test("tracked LinkedIn person gets their stored portrait and exact profile link", () => {
 const {entityLink}=require("../components/agent/EntityPills.tsx");
 const href="https://www.linkedin.com/in/example-person/";
 const link=entityLink(href,"Example Person",[{id:href,name:"Example Person",kind:"trackedPerson",logoUrl:"/api/images/person123"}],"x");
 assert.equal(link.props.children[0].props.src,"/api/images/person123");
 assert.equal(link.props.href,href);
 assert.equal(link.props.target,"_blank");
});


test('an explicit verified destination disambiguates earlier mentions without guessing',()=>{
 const crm={name:'Example',id:'crm',kind:'company'},intel={name:'Example',id:'intel',kind:'marketCompany'};
 assert.deepEqual(entitiesForAnswer('Example news. [Example briefing](/market-intel/intel)',[crm,intel]),[intel]);
 assert.deepEqual(entitiesForAnswer('Example news.',[crm,intel]),[crm,intel]);
 assert.deepEqual(entitiesForAnswer('[Example](/customers/crm) and [Example](/market-intel/intel)',[crm,intel]),[crm,intel]);
});
test('permitted answer context resolves first mentions but explicit record links win',()=>{
 const crm={name:'Example',id:'crm',kind:'company'},intel={name:'Example',id:'intel',kind:'marketCompany'};
 assert.deepEqual(entitiesForAnswer('Example news',[crm,intel],['/market-intel/intel']),[intel]);
 assert.deepEqual(entitiesForAnswer('[Example](/customers/crm)',[crm,intel],['/market-intel/intel']),[crm]);
 assert.deepEqual(entitiesForAnswer('Example news',[crm,intel],['/market-intel/unknown']),[crm,intel]);
});

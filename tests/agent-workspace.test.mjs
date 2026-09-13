import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  Module = require("node:module"),
  load = Module._load;
let allowed = true,
  reads = 0,
  viewerRole = "bd_member";
const actor = {
  userId: "rep",
  workspaceId: "fixture",
  role: "admin",
  name: "Rep",
  subject: "signed",
};
const companies = Array.from({ length: 76 }, (_, i) => ({
  id: `c${i}`,
  name: `Company ${i}`,
  group: i<31 ? "customer" : "competitor",
}));
const mocks = {
  "server-only": {},
  "./db": {getDb:()=>({customers:{list:async()=>[{id:"owned",company_name:"Owned",owner_user_id:"rep"},{id:"team",company_name:"Team",owner:null},{id:"other",company_name:"Other",owner_user_id:"other"}]}})},
  "./accessStore": {listWorkspaceAccess:async(workspace)=>{assert.equal(workspace,"fixture");reads++;return {members:[{id:"rep",name:"Rep",role:"bd_member",active:true,email:"private@example.test"},{id:"admin",name:"Admin",role:"admin",active:true},{id:"inactive",name:"Inactive",role:"admin",active:false}],invitations:[{email:"secret@example.test"}]};}},
  "./materialAccess": { canViewOfferingMaterial: () => true },
  "./moduleAccessServer": { canOpenModule: async () => allowed },
  "./viewerAccess": {
    resolveViewerAccess: async () => ({ role: viewerRole, access: {} }),
  },
  "./recordTeams": {readRecordTeams:async()=>({teams:{}}),teamFor:(_s,_type,id)=>id==="team"?{owner:"Other",members:["Rep"]}:undefined},
  "./meetings": {readMeetings:async()=>{reads++;return {meetings:[{id:"m/1",title:"Preparation",owner:"Other",attendees:["Rep"],presenters:[],notes:[],opportunityLabels:[]},{id:"m2",title:"Other meeting",owner:"Other",attendees:[],presenters:[],notes:[],opportunityLabels:[]}]};}},
  "./leads": {
    readLeads: async () => {
      reads++;
      return { leads: [] };
    },
  },
  "./opportunities": {
    readOpportunities: async () => ({
      opportunities: [
        {
          id: "o1",
          name: "Deal",
          customer: "Customer",
          owner: "Rep",
          value: 40000000,
          currency: "INR",
          estSignDate: "2027-01-01",
          estimatedAcv: 120000,
          confidence:100,
          lines:[{confidence:60,value:40000000}],
          offeringLabels: [],
        },
      ],
    }),
  },
  "./contracts": { readContracts: async () => ({ contracts: [] }) },
  "./solutioning": { readSolutioning: async () => ({ requests: [] }) },
  "./performance": {
    readPerformance: async () => ({
      goals: [
        {
          id: "g",
          name: "Goal",
          unit: "currency",
          year: 2026,
          target: 100,
          subgoals: [
            {
              people: [
                { name: "Rep", target: 10 },
                { name: "Other", target: 90 },
              ],
            },
          ],
          assignments: [{ person: "Rep" }, { person: "Other" }],
        },
      ],
      actuals: [
        { goalId: "g", person: "Rep", amount: 4, status:"verified", date:"2026-09-11" },
        { goalId: "g", person: "Other", amount: 70, status:"verified", date:"2026-09-11" },
      ],
      groups: [],
    }),
  },
  "./offerings": {
    initializeLiveOfferings: async () => {},
    listFdlComponents: () => [
      { id: "x", name: "Component", features: [], releases: [] },
    ],
    listOfferings: () => [
      {
        id: "own",
        offering_name: "Owned",
        materials: [],
        owners: [{ memberId: "rep", name: "Rep", status: "owner" }],
      },
      {
        id: "wrong",
        offering_name: "Namesake",
        materials: [],
        owners: [{ memberId: "other", name: "Rep", status: "owner" }],
      },
      {
        id: "pending",
        offering_name: "Pending",
        materials: [],
        owners: [{ memberId: "rep", name: "Rep", status: "requested" }],
      },
    ],
  },
  "./marketIntelBookmarks": {
    readMarketIntelBookmarks: async (scope) => {
      assert.equal(scope.userId, "rep");
      return { companyIds: companies.map((c) => c.id), starredIds: ["c75"] };
    },
  },
  "./marketIntelTracking": {
    readMarketIntelTracking: async () => ({ companies, people: [] }),
  },
};
Module._load = function (name, ...args) {
  return mocks[name] ?? load.call(this, name, ...args);
};
const { readAgentWorkspace } = require("../lib/agentWorkspace.ts");
Module._load = load;
test("denied module never reads records", async () => {
  allowed = false;
  reads = 0;
  assert.match(await readAgentWorkspace(actor, "leads"), /do not have access/);
  assert.equal(reads, 0);
  allowed = true;
});
test("offering ownership uses stable id and approved status", async () => {
  const r = JSON.parse(await readAgentWorkspace(actor, "offerings", "", true));
  assert.deepEqual(
    r.records.map((r) => r.id),
    ["own"],
  );
});
test("personal starred result beyond first50 is still present and pagination complete", async () => {
  const r = JSON.parse(
    await readAgentWorkspace(actor, "market_intel", "", true),
  );
  assert.equal(r.personal.trackedCount, 76);
  assert.deepEqual(r.personal.trackedByGroup,{customers:31,competitors:45});
  assert.equal(r.personal.starred[0].name, "Company 75");
  assert.equal(r.nextOffset, 50);
  const next = JSON.parse(
    await readAgentWorkspace(actor, "market_intel", "", true, r.nextOffset),
  );
  assert.equal(next.shown, 26);
  assert.deepEqual(next.personal.trackedByGroup,r.personal.trackedByGroup);
  assert.equal(next.nextOffset, null);
});
test("opportunity links open the specific record", async () => {
 const r=JSON.parse(await readAgentWorkspace(actor,"opportunities","",true));
 assert.equal(r.records[0].url,"/opportunities/o1");
 assert.equal(r.records[0].confidence,60);
});
test("FDL links use canonical component route", async () => {
  const r = JSON.parse(await readAgentWorkspace(actor, "components"));
  assert.equal(r.records[0].url, "/components/x");
});
test("opportunity preserves currency and dates rather than claiming USD", async () => {
  const r = JSON.parse(await readAgentWorkspace(actor, "opportunities"));
  assert.equal(r.records[0].currency, "INR");
  assert.equal(r.records[0].estSignDate, "2027-01-01");
});
test("goal privacy honors effective viewer role even when signed actor is admin", async () => {
  viewerRole = "bd_member";
  const r = JSON.parse(await readAgentWorkspace(actor, "goals"));
  assert.equal(JSON.stringify(r).includes("Other"), false);
  assert.equal(r.records[0].verifiedValue, 4);
});
test("unknown module does not read a store", async () => {
  assert.match(await readAgentWorkspace(actor, "secrets"), /Unknown module/);
});
test("upcoming and overdue opportunities filter open dates before pagination", async () => {
  const original = mocks['./opportunities'].readOpportunities;
  mocks['./opportunities'].readOpportunities = async () => ({opportunities: [
    {id:'past', status:'Open', estSignDate:'2000-01-01'},
    {id:'later', status:'Open', estSignDate:'2099-02-01'},
    {id:'near', status:'Open', estSignDate:'2099-01-01'},
    {id:'won', status:'Won', estSignDate:'2099-01-01'},
    {id:'undated', status:'Open'},
  ]});
  try {
    const upcoming = JSON.parse(await readAgentWorkspace(actor, 'opportunities', 'upcoming'));
    assert.deepEqual(upcoming.records.map(r => r.id), ['near', 'later']);
    assert.equal(upcoming.summary.filteredCount, 2);
    const overdue = JSON.parse(await readAgentWorkspace(actor, 'opportunities', 'overdue'));
    assert.deepEqual(overdue.records.map(r => r.id), ['past']);
  } finally { mocks['./opportunities'].readOpportunities = original; }
});


test("team lookup is workspace scoped, active-only and excludes private directory fields",async()=>{
 const result=JSON.parse(await readAgentWorkspace(actor,"team","Admin"));
 assert.deepEqual(result.records,[{id:"admin",name:"Admin",workspaceRole:"admin",url:"/team?member=admin"}]);
 assert.doesNotMatch(JSON.stringify(result),/private@example|secret@example|Inactive/);
 const mine=JSON.parse(await readAgentWorkspace(actor,"team","",true));assert.deepEqual(mine.records.map(r=>r.id),["rep"]);
 allowed=false;reads=0;try{assert.match(await readAgentWorkspace(actor,"team"),/do not have access/);assert.equal(reads,0);}finally{allowed=true;}
});


test("personal meetings include attendees and deny reads when forbidden",async()=>{
 allowed=true;
 const data=JSON.parse(await readAgentWorkspace(actor,"meetings","",true));
 assert.equal(data.records.length,1);assert.equal(data.records[0].url,"/meetings/m%2F1");
 allowed=false;reads=0;await readAgentWorkspace(actor,"meetings");assert.equal(reads,0);allowed=true;
});

test("customer team membership is read independently of blank customer owner",async()=>{
 allowed=true;
 const d=JSON.parse(await readAgentWorkspace(actor,"customers","",true));
 assert.deepEqual(d.records.map(r=>r.id),["owned","team"]);
 assert.equal(d.records[1].onMyTeam,true);assert.equal(d.records[1].ownedByMe,false);
});


test("line-item signing dates and ID-only offering links match the page", async()=>{
 const original=mocks['./opportunities'].readOpportunities;
 mocks['./opportunities'].readOpportunities=async()=>({opportunities:[{id:'line-date',owner:'Rep',status:'Open',value:100,lines:[{value:100,estSignDate:'2000-01-02'}],offeringIds:['own'],offeringLabels:[]}]});
 try {
  const data=JSON.parse(await readAgentWorkspace(actor,'opportunities','overdue'));
  assert.equal(data.records[0].estSignDate,'2000-01-02');
  assert.deepEqual(data.records[0].offerings,['Owned']);
  assert.equal(data.records[0].nextSteps,null);
 } finally {mocks['./opportunities'].readOpportunities=original;}
});


test("solutioning distinguishes requests from deliverables and includes workstream assignments",async()=>{
 const original=mocks['./solutioning'].readSolutioning;
 const common={customer:'QA',requestedBy:'Other',requestedAt:'2026-09-01',docs:[],opportunityIds:[],opportunityLabels:[]};
 mocks['./solutioning'].readSolutioning=async()=>({requests:[
  {...common,id:'request',type:'request',kind:'submission',status:'in_progress',workstreams:[{division:'MPR',primaryAssignee:'Rep',contributors:[]}]},
  {...common,id:'presentation',type:'presentation',kind:'presentation',status:'initiated',deliverableStatus:'Approved',owner:'Rep'},
  {...common,id:'other',type:'request',kind:'submission',status:'initiated'},
 ]});
 try {
  const data=JSON.parse(await readAgentWorkspace(actor,'solutioning','',true));
  assert.equal(data.records.length,2);
  assert.equal(data.records[0].assignedToMe,true);
  assert.equal(data.records[0].requestedByMe,false);
  assert.equal(data.records[1].type,'presentation');
  assert.equal(data.records[1].status,'Approved');
 } finally {mocks['./solutioning'].readSolutioning=original;}
});


test("managed-team scope includes teammates and excludes other owners before aggregation",async()=>{
 const oldPerf=mocks['./performance'].readPerformance, oldOpp=mocks['./opportunities'].readOpportunities;
 mocks['./performance'].readPerformance=async()=>({groups:[{id:'team',name:'Team',head:'Rep',members:['Rep','Colleague']}]});
 mocks['./opportunities'].readOpportunities=async()=>({opportunities:[{id:'mine',owner:'Rep',value:100,currency:'USD',status:'Qualify'},{id:'colleague',owner:'Colleague',value:200,currency:'INR',status:'Qualify'},{id:'unrelated',owner:'Other',value:9000,status:'Qualify'},{id:'closed',owner:'Rep',value:500,status:'Won'}]});
 try{
  const r=JSON.parse(await readAgentWorkspace(actor,'opportunities','',false,0,true));
  assert.deepEqual(r.records.map(r=>r.id),['mine','colleague','closed']);
  assert.deepEqual(r.summary.openValueByCurrency,{USD:100,INR:200});
  assert.equal(r.summary.openCount,2);
  mocks['./performance'].readPerformance=async()=>({groups:[]});
  const empty=JSON.parse(await readAgentWorkspace(actor,'opportunities','',false,0,true));
  assert.equal(empty.records.length,0);
 } finally {mocks['./performance'].readPerformance=oldPerf;mocks['./opportunities'].readOpportunities=oldOpp;}
});

test('team contracts include linked team deals even with an outside legal owner',async()=>{
 const p=mocks['./performance'].readPerformance,o=mocks['./opportunities'].readOpportunities,c=mocks['./contracts'].readContracts;
 mocks['./performance'].readPerformance=async()=>({groups:[{id:'t',head:'Rep',members:['Colleague']}]});
 mocks['./opportunities'].readOpportunities=async()=>({opportunities:[{id:'team-deal',owner:'Colleague'},{id:'other-deal',owner:'Other'}]});
 mocks['./contracts'].readContracts=async()=>({contracts:[{id:'linked',owner:'Legal',opportunityId:'team-deal'},{id:'owned',owner:'Rep'},{id:'unrelated',owner:'Legal',opportunityId:'other-deal'}]});
 try { const r=JSON.parse(await readAgentWorkspace(actor,'contracts','',false,0,true));assert.deepEqual(r.records.map(x=>x.id),['linked','owned']); }
 finally {mocks['./performance'].readPerformance=p;mocks['./opportunities'].readOpportunities=o;mocks['./contracts'].readContracts=c;}
});

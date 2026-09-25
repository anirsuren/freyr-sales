import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  Module = require("node:module"),
  load = Module._load;
let allowed = true,
  blockedSource = "",
  accrualAllowed = true,
  accrualFails = false,
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
  "./db": {getDb:()=>({
    customers:{list:async()=>[{id:"owned",company_name:"Owned",owner_user_id:"rep"},{id:"team",company_name:"Team",owner:null},{id:"other",company_name:"Other",owner_user_id:"other"}]},
    contacts:{list:async()=>[{id:"contact-1",customer_id:"owned",full_name:"Arjun Duarte"}]},
    pitchSessions:{list:async()=>[{id:"session-008",customer_id:"owned",contact_id:"contact-1",recommended_services:[{service_name:"Regulatory Submission Services"}],review_status:"changes_requested",created_at:"2026-06-15T10:00:00Z"}]},
    interactions:{list:async()=>[
      {id:"interaction-1",customer_id:"owned",contact_id:"contact-1",outcome:"interested",follow_up_date:"2026-09-24",created_at:"2026-06-16T10:00:00Z"},
      {id:"interaction-2",customer_id:"owned",contact_id:"contact-1",outcome:"interested",follow_up_date:"2026-09-26",created_at:"2026-06-17T10:00:00Z"},
    ]},
    sequenceEnrollments:{list:async()=>[{id:"enrollment-1",sequence_id:"reg-exec",customer_id:"owned",step_index:2}]},
  })},
  "./accessStore": {listWorkspaceAccess:async(workspace)=>{assert.equal(workspace,"fixture");reads++;return {members:[{id:"rep",name:"Rep",role:"bd_member",active:true,email:"private@example.test"},{id:"admin",name:"Admin",role:"admin",active:true},{id:"inactive",name:"Inactive",role:"admin",active:false}],invitations:[{email:"secret@example.test"}]};}},
  "./materialAccess": { canViewOfferingMaterial: () => true },
  "./moduleAccessServer": { canOpenModule: async (path) => allowed && path !== blockedSource && (path !== "/revenue-accruals" || accrualAllowed) },
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
  "./campaigns": {listCampaigns: () => [
    {id:"camp-seed-002",name:"Regulatory Intelligence pilot invite",status:"queued",objective:"pipeline",offering_name:"Regulatory Intelligence Services",owner:"Rep",owner_user_id:"rep",recipient_contact_ids:["c1","c2","c3","c4","c5"],sent_count:2,opens:1,replies:0,scheduled_at:null,queued_at:"2026-09-23",sent_at:null},
  ]},
  "./sequences": {listSequences: () => [
    {id:"reg-exec",name:"Regulatory Exec Outreach",status:"active",description:"Regulatory cadence",owner:"Rep",owner_user_id:"rep",steps:[
      {day:0,channel:"email",label:"Intro"},{day:2,channel:"email",label:"Follow-up"},
      {day:4,channel:"call",label:"Call"},{day:7,channel:"email",label:"Value"},
      {day:10,channel:"call",label:"Call again"},{day:14,channel:"email",label:"Case study"},
      {day:18,channel:"email",label:"Breakup"},
    ]},
  ]},
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
  "./revenueAccruals": {
    readRevenueAccruals: async () => {
      if (accrualFails) throw new Error("accrual store unavailable");
      return {plans:[{opportunityId:"o1",contractValue:40000000,signDateAtPlan:"2027-01-01",lines:[{month:"2027-02",amount:10000000,ots:10000000},{month:"2027-03",amount:30000000,arr:30000000}]}]};
    },
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
test("Sessions reader uses exact IDs and the page's outcome and review sources", async () => {
  const result = JSON.parse(await readAgentWorkspace(actor, "sessions", "Owned"));
  assert.equal(result.records.length, 1);
  assert.deepEqual({
    url: result.records[0].url,
    outcome: result.records[0].outcomeOnSessionsPage,
    review: result.records[0].reviewStatus,
    service: result.records[0].recommendedServices[0],
  }, {
    url: "/sessions/session-008",
    outcome: "Interested",
    review: "Changes requested",
    service: "Regulatory Submission Services",
  });
  assert.match(await readAgentWorkspace(actor, "sessions", "", true), /do not record a session owner/);
});
test("Tasks reader preserves review state, distinct follow-ups and exact destinations", async () => {
  const result = JSON.parse(await readAgentWorkspace(actor, "tasks", "Arjun Duarte"));
  assert.equal(result.matched, 3);
  assert.equal(result.summary.reviewCount, 1);
  assert.equal(result.summary.followUpCount, 2);
  assert.deepEqual(result.records.map(row => [row.kind, row.url]), [
    ["review", "/sessions/session-008"],
    ["follow-up", "/contacts/contact-1"],
    ["follow-up", "/contacts/contact-1"],
  ]);
  assert.equal(result.records[0].reviewStatus, "Changes requested");
  assert.equal(result.records[0].taskPageBadge, "Needs review");
  assert.deepEqual(result.records.slice(1).map(row => row.dueDate), ["2026-09-24", "2026-09-26"]);
  assert.ok(result.records.every(row => row.owner === null));
  assert.match(await readAgentWorkspace(actor, "tasks", "", true), /do not record a task owner/);
  blockedSource = "/contacts";
  try { assert.match(await readAgentWorkspace(actor, "tasks", "Arjun"), /source access is incomplete/); }
  finally { blockedSource = ""; }
});
test("Campaigns reader preserves partial delivery and exact link under permission", async () => {
  const result = JSON.parse(await readAgentWorkspace(actor, "campaigns", "Regulatory Intelligence pilot invite"));
  assert.equal(result.records.length, 1);
  assert.deepEqual((({status,recipients,sent,queued,opened,replied,url}) => ({status,recipients,sent,queued,opened,replied,url}))(result.records[0]),
    {status:"queued",recipients:5,sent:2,queued:3,opened:1,replied:0,url:"/campaigns/camp-seed-002"});
  blockedSource = "/campaigns";
  try { assert.match(await readAgentWorkspace(actor, "campaigns", "Regulatory"), /do not have access/); }
  finally { blockedSource = ""; }
});
test("Sequences reader uses selected-page URL, cadence counts and source access", async () => {
  const result = JSON.parse(await readAgentWorkspace(actor, "sequences", "Regulatory Exec Outreach"));
  const sequence = result.records[0];
  assert.equal(sequence.url, "/sequences?sequence=reg-exec");
  assert.deepEqual([sequence.status,sequence.stepCount,sequence.emailSteps,sequence.callSteps,sequence.cadenceDays], ["active",7,5,2,18]);
  assert.equal(typeof sequence.enrolledAccounts, "number");
  blockedSource = "/contacts";
  try {
    const restricted = JSON.parse(await readAgentWorkspace(actor, "sequences", "Regulatory Exec Outreach"));
    assert.equal(restricted.records[0].enrolledAccounts, null);
    assert.equal(restricted.summary.enrollmentAccess, "source access incomplete");
  } finally { blockedSource = ""; }
});
test("Forecast reader grounds page totals in pitch sessions and labels the fixed reference", async () => {
  const result = JSON.parse(await readAgentWorkspace(actor, "forecast"));
  assert.equal(result.summary.pageUrl, "/forecast");
  assert.equal(result.summary.pipelineUrl, "/pipeline");
  assert.equal(result.summary.referenceQuota, 3000000);
  assert.match(result.summary.quotaSource, /not a saved Goals target/);
  assert.match(result.summary.valueSource, /estimate derived from customer size/);
  assert.match(result.summary.repSource, /synthetic values/);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].url, "/deals/session-008");
  assert.equal(result.summary.openCount, 1);
  assert.equal(result.summary.bestCase, result.records[0].estimatedValue);
  assert.equal(result.summary.commit, result.records[0].weightedValue);
  blockedSource = "/contacts";
  try { assert.match(await readAgentWorkspace(actor, "forecast"), /source access is incomplete/); }
  finally { blockedSource = ""; }
  blockedSource = "/forecast";
  try { assert.match(await readAgentWorkspace(actor, "forecast"), /do not have access/); }
  finally { blockedSource = ""; }
});
test("opportunity preserves currency and dates rather than claiming USD", async () => {
  const r = JSON.parse(await readAgentWorkspace(actor, "opportunities"));
  assert.equal(r.records[0].currency, "INR");
  assert.equal(r.records[0].estSignDate, "2027-01-01");
});
test("opportunity accruals give exact months for a named deal", async () => {
  const r = JSON.parse(await readAgentWorkspace(actor, "opportunities", "Deal"));
  assert.equal(r.summary.accrualAccess, "available");
  assert.deepEqual(r.records[0].accrual.months.map(line => [line.month,line.amount]), [["2027-02",10000000],["2027-03",30000000]]);
  assert.equal(r.records[0].accrual.totalPlanned, 40000000);
  assert.equal(r.records[0].accrual.currency, "INR");
  const list = JSON.parse(await readAgentWorkspace(actor, "opportunities"));
  assert.equal(list.records[0].accrual.monthCount, 2);
  assert.equal(list.records[0].accrual.months, undefined);
});
test("opportunity accruals distinguish denied and unavailable access from no plan", async () => {
  accrualAllowed = false;
  let r = JSON.parse(await readAgentWorkspace(actor, "opportunities", "Deal"));
  assert.equal(r.summary.accrualAccess, "denied");
  assert.equal(r.records[0].accrual, undefined);
  accrualAllowed = true;
  accrualFails = true;
  r = JSON.parse(await readAgentWorkspace(actor, "opportunities", "Deal"));
  assert.equal(r.summary.accrualAccess, "unavailable");
  assert.equal(r.records[0].accrual, undefined);
  accrualFails = false;
});
test("duplicate opportunity names can be narrowed by the page's record ID", async () => {
  const original = mocks["./opportunities"].readOpportunities;
  mocks["./opportunities"].readOpportunities = async () => ({opportunities:[
    {id:"o1",name:"GRI. Lonza",customer:"Lonza",owner:"Rep",currency:"INR",value:40000000,offeringLabels:[]},
    {id:"o2",name:"GRI. Lonza",customer:"Lonza",owner:"Rep",currency:"USD",value:24000,offeringLabels:[]},
  ]});
  try {
    const byName = JSON.parse(await readAgentWorkspace(actor,"opportunities","GRI. Lonza"));
    assert.equal(byName.records.length,2);
    const byId = JSON.parse(await readAgentWorkspace(actor,"opportunities","o2"));
    assert.deepEqual(byId.records.map(record=>record.id),["o2"]);
    assert.deepEqual(byId.records[0].accrual,{recorded:false});
  } finally {
    mocks["./opportunities"].readOpportunities = original;
  }
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

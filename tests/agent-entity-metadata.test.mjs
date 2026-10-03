import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const m = require('../lib/agentEntityMetadata.ts');

test('file identity comes from the actual source, never the marketing category', () => {
  const pdf = m.materialMetadata({kind:'presentation', docsPath:'folder/brief.PDF', url:'', bytes:2097152, documentType:'case_study', folder:'Evidence/Q3', addedAt:'2026-10-01T23:30:00Z', description:'Evidence for a buyer'}, 'Product');
  assert.deepEqual(pdf.details, ['PDF', '2.0 MB', 'Success story / case study', 'Evidence/Q3', 'Added Oct 1, 2026']);
  assert.equal(pdf.description, 'Evidence for a buyer');
  const link = m.materialMetadata({kind:'whitepaper',url:'https://example.com/resource',label:'Not necessarily a PDF'}, 'Product');
  assert.equal(link.details[0], 'LINK');
  assert.ok(!link.details.some((d) => /PDF|pages|MB/.test(d)));
  assert.equal(m.materialMetadata({url:'https://example.com/deck.pptx'}, 'Product').details[0], 'PPTX');
});

test('money retains local currency and precise value; zero and absent targets differ', () => {
  assert.equal(m.pickerMoney(40000000, 'INR'), 'INR 40,000,000');
  assert.equal(m.pickerMoney(901000.35), 'USD 901,000.35');
  assert.equal(m.pickerMoney(0), 'USD 0');
  assert.equal(m.pickerMoney(NaN), undefined);
  assert.ok(m.opportunityMetadata({customer:'Buyer',level:'Negotiation',value:40000000,currency:'INR'}).details.includes('INR 40,000,000'));
  assert.ok(m.goalMetadata({year:2026,type:'Meetings',target:0,unit:'count',verified:false}).details.includes('Target not set'));
  assert.ok(m.goalMetadata({year:2026,type:'Revenue',target:901000,unit:'currency',currency:'EUR',verified:true}).details.includes('Target: EUR 901,000'));
});

test('dates preserve the stored day, and malformed dates are omitted', () => {
  assert.equal(m.pickerDate('2026-10-01T23:30:00-07:00'), 'Oct 1, 2026');
  assert.equal(m.pickerDate('2026-02-30'), undefined);
  assert.equal(m.pickerDate('not a date'), undefined);
  assert.equal(m.pickerDate(), undefined);
});

test('people distinguish employer, job title, location, and actual account role', () => {
  const a = m.contactMetadata({job_title:'Procurement',city:'Boston',country:'USA',email:'john@example.com',department:'Purchasing'}, 'Alpha');
  const b = m.contactMetadata({job_title:'Regulatory',city:'London',country:'UK'}, 'Beta');
  assert.equal(a.subtitle, 'Alpha · Procurement');
  assert.equal(b.subtitle, 'Beta · Regulatory');
  assert.deepEqual(a.details, ['Purchasing', 'Boston · USA', 'john@example.com']);
  assert.equal(m.contactMetadata({job_title:'Regulatory'}).subtitle, 'Regulatory');
  for (const [role, expected] of Object.entries({admin:'Admin',bd_owner:'BD Owner',bd_member:'BD Member',sol_member:'Solutioning Member'}))
    assert.deepEqual(m.teammateMetadata({role,accountType:'real'}).details, [expected]);
  assert.deepEqual(m.teammateMetadata({role:'bd_member',accountType:'test'}).details, ['BD Member', 'Test account']);
});

test('remaining categories expose concrete disambiguation without invented missing facts', () => {
  assert.deepEqual(m.customerMetadata({industry:'Biotech',geography:'US',owner:'Alice'}).facts, [{kind:'owner',text:'Alice'}]);
  assert.deepEqual(m.offeringMetadata({offering_type:'Software',offering_category:'RIM',current_version:'2',owners:[{status:'requested',name:'Pending'},{status:'owner',name:'Alice'}]}).details, ['Version 2','Owner: Alice']);
  assert.deepEqual(m.componentMetadata({type:'Agent',releases:[{version:'1',current:true,status:'released'},{version:'2',status:'next'}],features:[{},{}]}).details, ['Version 1','2 features']);
  assert.ok(m.contractMetadata({customer:'Buyer',reference:'FR-C-010',status:'Draft',value:0}).details.includes('FR-C-010'));
  assert.equal(m.leadMetadata({name:'John',company:'Pfizer',title:'Director',ref:'LEAD-002',status:'New',source:'Web'}).subtitle, 'Pfizer · Director');
  const solution = m.solutionMetadata({customer:'Buyer',ref:'REQ-002',kind:'submission',type:'request',subtype:'RFP',status:'in_progress',owner:'Alice',neededBy:'2026-10-05'});
  assert.deepEqual(solution.details, ['REQ-002','Request · RFP','In progress','Owner: Alice','Due Oct 5, 2026']);
  assert.equal(m.trackedPersonMetadata({role:'CFO',location:'Boston'}, 'Buyer').subtitle, 'Buyer · CFO');
  assert.deepEqual(m.marketCompanyMetadata({industry:'Biotech',hq:'US',group:'competitor',divisions:['MPR']}).details, ['Competitor','MPR']);
});


test('supporting company identities, owner portraits and field semantics survive all categories', () => {
  const article = m.articleMetadata('Buyer', '/logos/buyer.png', 'News source', '2026-10-01');
  assert.deepEqual(article.subtitleFacts, [{kind:'company',text:'Buyer',logoUrl:'/logos/buyer.png'},{kind:'source',text:'News source'}]);
  assert.deepEqual(article.facts, [{kind:'format',text:'Article'},{kind:'date',text:'Oct 1, 2026'}]);
  assert.deepEqual(m.contactMetadata({city:'Boston',email:'john@example.com'}, 'Buyer', '/logos/buyer.png').facts,
    [{kind:'location',text:'Boston'},{kind:'email',text:'john@example.com'}]);
  const offering=m.offeringMetadata({owners:[{name:'Alice',status:'owner'},{name:'Bob',status:'owner'},{name:'Pending',status:'requested'}]});
  assert.deepEqual(offering.facts, [{kind:'owner',text:'Alice'},{kind:'owner',text:'Bob'}]);
  for (const item of [
    m.customerMetadata({owner:'Alice'}),
    m.opportunityMetadata({customer:'Buyer',owner:'Alice',value:1}),
    m.contractMetadata({customer:'Buyer',owner:'Alice',value:1}),
    m.leadMetadata({owner:'Alice',country:'US'}),
    m.solutionMetadata({customer:'Buyer',owner:'Alice'}),
  ]) assert.ok(item.facts.some(f=>f.kind==='owner'&&f.text==='Alice'));
  assert.equal(m.materialMetadata({url:'https://example.com/deck.pptx'}, 'Product').fileType,'PPTX');
  assert.deepEqual(m.materialMetadata({addedBy:'Alice'},'Product').facts.filter(f=>f.kind==='uploader'),[{kind:'uploader',text:'Alice'}]);
  assert.ok(!m.materialMetadata({},'Product').facts.some(f=>f.kind==='uploader'));
  assert.deepEqual(m.materialMetadata({},'Product').subtitleFacts,[{kind:'offering',text:'Product'}]);
  assert.deepEqual(m.trackedPersonMetadata({location:'London'}, 'Buyer', '/logo.png').subtitleFacts,[{kind:'company',text:'Buyer',logoUrl:'/logo.png'}]);
  assert.ok(m.marketCompanyMetadata({hq:'Boston'}).subtitleFacts.some(f=>f.kind==='location'));
  assert.ok(!m.goalMetadata({year:2026,target:0}).facts.some(f=>f.kind==='owner')); // Creator is not owner.
});

test('client ignores unsupported metadata instead of rendering arbitrary objects', () => {
  const {readEntityFacts}=require('../lib/agentEntityVisuals.ts');
  assert.equal(readEntityFacts(null),undefined);
  assert.deepEqual(readEntityFacts([{kind:'owner',text:' Alice ',privateId:'secret'},{kind:'unknown',text:'x'},{kind:'company',text:''}]), [{kind:'owner',text:'Alice'}]);
});


test('material marks distinguish file formats in picker, tags and reply pills', () => {
  const {fileFormatIcon}=require('../components/agent/EntityFacts.tsx');
  const icons=require('lucide-react');
  for(const [format,icon] of Object.entries({PDF:'FileText',PPTX:'Presentation',MP4:'Video',MP3:'Music',XLSX:'Sheet',PNG:'Image',ZIP:'FileArchive',LINK:'Link2',Article:'Newspaper',UNKNOWN:'File'}))
    assert.equal(fileFormatIcon(format),icons[icon]);
  const {injectEntities}=require('../components/agent/EntityPills.tsx');
  const pill=injectEntities('Buyer guide',[{name:'Buyer guide',id:'o:m',kind:'material',fileType:'PDF'}],'guide')[0];
  assert.equal(pill.props.children[0].props['data-file-type'],'PDF');
});


test('picker previews share supported destinations and reject unsafe external links', () => {
  const {entityDestination}=require('../components/agent/EntityPills.tsx');
  assert.equal(entityDestination({kind:'marketItem',id:'https://example.com/news'}),'https://example.com/news');
  for(const id of ['javascript:alert(1)','data:text/html,x','http://example.com/news','/news'])assert.equal(entityDestination({kind:'marketItem',id}),null);
  assert.equal(entityDestination({kind:'trackedPerson',id:'https://www.linkedin.com/in/example/'}),'https://www.linkedin.com/in/example/');
  assert.equal(entityDestination({kind:'material',id:'offering:file/1'}),'/offerings/offering?tab=materials&material=file%2F1');
  assert.equal(entityDestination({kind:'person',id:'member/1',name:'Abhinaya Veeramally'}),'/analytics/reps/abhinaya-veeramally');
  assert.equal(entityDestination({kind:'person',id:'member/1'}),'/team');
  assert.equal(entityDestination({kind:'company',id:'buyer/1'}),'/customers/buyer%2F1');
});


test('lead metadata distinguishes the person from the company and its logo', () => {
  const lead=m.leadMetadata({name:'John QA',company:'Pfizer',title:'Director',status:'New'}, '/logos/pfizer.png');
  assert.deepEqual(lead.subtitleFacts,[{kind:'company',text:'Pfizer',logoUrl:'/logos/pfizer.png'},{kind:'role',text:'Director'}]);
  const entry=m.leadPickerEntity({id:'lead-1',name:'John QA',company:'Pfizer'}, '/logos/pfizer.png');
  assert.equal(entry.name,'John QA');assert.equal(entry.id,'lead-1');assert.equal(entry.logoUrl,undefined);
  assert.equal(m.leadPickerEntity({id:'lead-2',name:'',ref:'LEAD-002',company:'Pfizer'}).name,'LEAD-002');
  assert.equal(m.leadPickerEntity({id:'lead-3',name:'Jane',company:''}).name,'Jane');
});
test('picker previews prioritize useful details without dumping all fields into chips', () => {
  const {pickerPreviewFacts}=require('../lib/agentPickerPresentation.ts');
  const facts=[{kind:'folder',text:'Internal'},{kind:'format',text:'PDF'},{kind:'size',text:'2 MB'},{kind:'division',text:'MDV'},{kind:'uploader',text:'John'}];
  assert.deepEqual(pickerPreviewFacts('material',facts).map(f=>f.kind),['format','size','division']);
  assert.equal(facts.length,5,'searchable source data is preserved');
  assert.deepEqual(pickerPreviewFacts('lead',[{kind:'email',text:'john@example.com'},{kind:'status',text:'New'},{kind:'owner',text:'Jane'}]).map(f=>f.kind),['status','owner']);
});

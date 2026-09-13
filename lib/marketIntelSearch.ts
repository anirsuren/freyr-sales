import { runDurableMarketIntelActor } from "./marketIntelActor";
import { collectedInCurrentCycle } from "./marketIntelCadence";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { isAccessChallengeTitle } from './companyWebsiteNews';
import { load } from 'cheerio';

/** Google web results complement the smaller Google News publisher index.
 * Replays share the paid result; a timeout never triggers a second paid run. */
export async function requestMarketIntelWebSearch(queries:string[],token:string,company:string,maxPagesPerQuery:2|4=2):Promise<{pages:any[];cost:number;failed:boolean}> {
  if(process.env.FIRECRAWL_API_KEY){
    const input=[...new Set(queries)].slice(0,8),pages:any[]=[];const retry:string[]=[];
    let next=0;
    await Promise.all(Array.from({length:Math.min(3,input.length)},async()=>{
      while(next<input.length){const query=input[next++];
        try{pages.push(await requestFirecrawlWebSearch(query,process.env.FIRECRAWL_API_KEY!,company,maxPagesPerQuery*10));}
        catch{retry.push(query);}
      }
    }));
    if(!retry.length)return {pages,cost:0,failed:false};
    const fallback=await requestMarketIntelSearchActor(retry,token,company,maxPagesPerQuery,'web');
    return {...fallback,pages:[...pages,...fallback.pages]};
  }
  return requestMarketIntelSearchActor(queries,token,company,maxPagesPerQuery,'web');
}

async function requestFirecrawlWebSearch(query:string,key:string,company:string,limit:number):Promise<any>{
  const body={query:query.slice(0,500),limit,sources:['web'],timeout:30000};
  const id=`market-intel:search-cache:firecrawl:${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0,28)}`;
  const prior=await read(id);
  if(prior?.catalog?.response && collectedInCurrentCycle(prior.catalog.at))return prior.catalog.response;
  const response=await fetch('https://api.firecrawl.dev/v2/search',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(35000)});
  const data=await response.json();
  if(!response.ok || !data.success || !Array.isArray(data.data?.web))throw new Error(`Web search HTTP ${response.status}`);
  const page={organicResults:data.data.web.filter((hit:any)=>{
    try{return typeof hit.title==='string'&&/^https?:$/.test(new URL(hit.url).protocol);}catch{return false;}
  })};
  // Firecrawl is billed in the user's existing credits, separately from USD APIs.
  await write(id,await read(id),{response:page,at:new Date().toISOString(),company,creditsUsed:data.creditsUsed??null});
  return page;
}

export async function requestMarketIntelNewsSearch(query:string,token:string,company:string):Promise<{items:any[];cost:number;failed:boolean}> {
  const result=await requestMarketIntelSearchActor([query],token,company,2,'news');
  return {items:result.pages,cost:result.cost,failed:result.failed};
}

async function requestMarketIntelSearchActor(queries:string[],token:string,company:string,maxPagesPerQuery:2|4,kind:'web'|'news'):Promise<{pages:any[];cost:number;failed:boolean}> {
  const body=kind==='news'?{q:queries[0],maxItems:20}:{queries:[...new Set(queries)].slice(0,8).join('\n'),maxPagesPerQuery,countryCode:'us',languageCode:'en',includeUnfilteredResults:false};
  const purpose=kind==='news'?'google-news':'google-web-news';
  const id=`market-intel:search-cache:${kind}:${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0,28)}`;
  const prior=await read(id);
  if(prior?.catalog?.response && collectedInCurrentCycle(prior.catalog.at))return {pages:prior.catalog.response,cost:0,failed:prior.catalog.partial===true};
  if(prior?.catalog?.until>Date.now())throw new Error('Web news discovery is already running.');
  const requestId=randomUUID(),day=`market-intel:search-spend:${new Date().toISOString().slice(0,10)}`;
  if(!await write(id,prior,{requestId,until:Date.now()+300_000}))throw new Error('Web news discovery is already running.');
  try {await reserve(day,purpose,company,requestId,0.10);}catch(e){await write(id,await read(id),{until:0});throw e;}
  let accounted=false;
  try {
    const results = await runDurableMarketIntelActor(kind === 'news' ? 's-r~google-news' : 'apify~google-search-scraper', body, token);
    const cost = (results as any).collectionCostUsd ?? 0;
    await settle(day, requestId, cost, 'success'); accounted = true;
    const failed=results.some(p=>p['#error']);const pages=results.filter(p=>!p['#error']);
    await write(id,await read(id),{response:pages,at:new Date().toISOString(),until:0,company,purpose,partial:failed});
    return {pages,cost:cost??0,failed};
  }catch(e){if(!accounted)await settle(day,requestId,null,'unknown');await write(id,await read(id),{until:Date.now()+300_000,error:String(e),company});throw e;}
}

const RESERVATION_USD = 0.01;
const DAY_MS = 86400_000;
type Row = {catalog:any;updated_at:string};

/** A second search index. Only tool-returned URLs are accepted; model prose
 * never supplies article URLs, titles, dates, or company facts. */
export async function requestMarketIntelSourceSearch(query:string,key:string,company:string):Promise<{urls:string[];cost:number}>{
  const body={model:'gpt-5-mini',reasoning:{effort:'low'},store:false,max_output_tokens:2000,max_tool_calls:2,tools:[{type:'web_search',search_context_size:'medium'}],tool_choice:'required',include:['web_search_call.action.sources'],instructions:'Discover independent publisher articles using web search. Search once, examine the returned publishers, then make a complementary search excluding dominant publishers if useful. Use at most two tool calls. Return a concise source list; never invent URLs.',input:query.slice(0,4000)};
  const id=`market-intel:search-cache:source:${createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0,28)}`;
  const prior=await read(id);
  if(prior?.catalog?.urls&&collectedInCurrentCycle(prior.catalog.at))return {urls:prior.catalog.urls,cost:0};
  if(prior?.catalog?.until>Date.now())throw new Error('Source discovery is already running.');
  const requestId=randomUUID(),day=`market-intel:search-spend:${new Date().toISOString().slice(0,10)}`;
  if(!await write(id,prior,{requestId,until:Date.now()+120_000}))throw new Error('Source discovery is already running.');
  try{await reserve(day,'openai-source-discovery',company,requestId,.05);}catch(e){await write(id,await read(id),{until:0});throw e;}
  let accounted=false;
  try{
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90_000)});
    if(!response.ok){await settle(day,requestId,response.status<500?0:null,`HTTP ${response.status}`);accounted=true;throw new Error(`Source discovery HTTP ${response.status}`);}
    const data=await response.json();
    const calls=(data.output??[]).filter((b:any)=>b.type==='web_search_call');
    // GPT-5-mini: $0.25/M input ($0.025/M cached), $2/M output,
    // plus $0.01 per search. Reasoning tokens are included in output usage.
    const cached=data.usage?.input_tokens_details?.cached_tokens??0;
    const cost=data.usage ? calls.filter((b:any)=>b.action?.type==='search'||!b.action?.type).length*.01+(data.usage.input_tokens-cached)*.00000025+cached*.000000025+data.usage.output_tokens*.000002 : null;
    await settle(day,requestId,cost,'success');accounted=true;
    if(!calls.length||calls.some((b:any)=>b.status!=='completed'))throw new Error('Source discovery did not complete.');
    const urls:string[]=[...new Set<string>(calls.flatMap((b:any)=>b.action?.sources??[]).flatMap((s:any)=>{
      try{const u=new URL(s.url);if(!/^https?:$/.test(u.protocol)||u.username||u.password)return [];u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_/i.test(k))u.searchParams.delete(k);return [u.href];}catch{return [];}
    }))];
    await write(id,await read(id),{urls,at:new Date().toISOString(),until:0,company,usage:data.usage,responseId:data.id});
    return {urls,cost:cost??0};
  }catch(e){if(!accounted)await settle(day,requestId,null,'unknown');await write(id,await read(id),{until:Date.now()+60_000,error:String(e)});throw e;}
}

/** Browser-rendered fallback for public articles that reject a plain HTTP read.
 * Credits have their own usage ledger; they are never reported as dollars. */
export async function requestRenderedNewsPage(url:string,key:string,options:{website?:boolean;refresh?:boolean}={}):Promise<string|null>{
  const parsed=new URL(url);if(!/^https?:$/.test(parsed.protocol)||parsed.username||parsed.password)return null;
  const id=`market-intel:search-cache:render:${createHash('sha256').update(url).digest('hex').slice(0,28)}`;
  const prior=await read(id);
  const transientFailure=prior?.catalog?.status==='unknown'||[prior?.catalog?.status,prior?.catalog?.sourceStatus].some(status=>Number(status)>=500||Number(status)===429);
  const cacheTtl=prior?.catalog?.html ? DAY_MS : transientFailure ? 5*60_000 : DAY_MS;
  if(!options.refresh&&prior?.catalog?.at&&Date.now()-Date.parse(prior.catalog.at)<cacheTtl&&(prior.catalog.html||prior.catalog.readerVersion===3))return prior.catalog.html??null;
  if(prior?.catalog?.until>Date.now())return null;
  const requestId=randomUUID();if(!await write(id,prior,{until:Date.now()+90_000,requestId}))return null;
  const day=`market-intel:search-render-credits:${new Date().toISOString().slice(0,10)}`;
  // Provider credits are authorized; retain usage accounting without a hidden daily cutoff.
  const limit=null;
  let reserved=false;
  for(let attempt=0;attempt<8;attempt++){
    const row=await read(day);const used=Number(row?.catalog?.reservedCredits??0);
    // Record the request before calling the provider; reconcile returned usage.

    if(await write(day,row,{...row?.catalog,reservedCredits:used+1,limit,requests:[...(row?.catalog?.requests??[]),{id:requestId,url,reservedCredits:1,at:new Date().toISOString()}]})){reserved=true;break;}
  }
  if(!reserved){await write(id,await read(id),{until:0});return null;}
  let html:string|null=null;
  try {
    // Let Firecrawl choose its browser/proxy for the public page.
  // Several modern newsrooms render article metadata after hydration. One
  // second returned the homepage shell for Curebase article URLs; three
  // seconds returns the actual headline and publication date reliably.
  const response=await fetch('https://api.firecrawl.dev/v2/scrape',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({url,formats:['rawHtml'],proxy:options.website?'auto':'enhanced',maxAge:options.refresh?0:DAY_MS,waitFor:options.website?3000:5000,timeout:45000,parsers:[]}),signal:AbortSignal.timeout(55_000)});
    const data=await response.json();
    const credits=data.data?.metadata?.creditsUsed;
    if(typeof credits==='number'&&credits>=0)for(let attempt=0;attempt<8;attempt++){
      const row=await read(day);if(!row)break;
      const requests=(row.catalog.requests??[]).map((r:any)=>r.id===requestId?{...r,creditsUsed:credits}:r);
      if(await write(day,row,{...row.catalog,reservedCredits:Math.max(0,row.catalog.reservedCredits-1+credits),requests}))break;
    }
    if(response.ok&&data.success&&Number(data.data?.metadata?.statusCode??200)<400&&typeof data.data?.rawHtml==='string'&&data.data.rawHtml.length<3_000_000&&!isAccessChallengeTitle(data.data?.metadata?.title??'')&&!isAccessChallengeTitle(load(data.data.rawHtml)('head > title').first().text()))html=data.data.rawHtml;
    await write(id,await read(id),{at:new Date().toISOString(),until:0,html,url,readerVersion:3,creditsUsed:data.data?.metadata?.creditsUsed??null,status:response.status,sourceStatus:data.data?.metadata?.statusCode??null,sourceTitle:data.data?.metadata?.title??null});
  }catch{await write(id,await read(id),{at:new Date().toISOString(),until:0,html:null,url,readerVersion:3,status:'unknown'});}
  return html;
}
function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Search accounting is unavailable; paid search was not started.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false},global:{fetch:(input,init)=>fetch(input,{...init,cache:"no-store",signal:init?.signal?AbortSignal.any([init.signal,AbortSignal.timeout(30_000)]):AbortSignal.timeout(30_000)})}});
}
async function read(id:string):Promise<Row|null> {
  const r=await db().from("offering_catalog_state").select("catalog,updated_at").eq("id",id).maybeSingle();
  if(r.error)throw new Error(r.error.message);return r.data;
}
async function write(id:string,prior:Row|null,catalog:any):Promise<boolean> {
  const row={catalog,updated_at:new Date().toISOString()};
  const result=prior ? await db().from("offering_catalog_state").update(row).eq("id",id).eq("updated_at",prior.updated_at).select("id") : await db().from("offering_catalog_state").insert({id,...row}).select("id");
  if(result.error?.code==="23505")return false;
  if(result.error)throw new Error(result.error.message);return !!result.data?.length;
}

export function canReserveSearch(spent:number,reserved:number,limit:number,amount=RESERVATION_USD):boolean {
  return spent + reserved + amount <= limit + 1e-9;
}

async function reserve(day:string,purpose:string,company:string,requestId:string,amount=RESERVATION_USD):Promise<void> {
  const config=(await read("market-intel:config"))?.catalog;
  const configured=Number(config?.perplexityDailyLimitUsd ?? process.env.MARKET_INTEL_PERPLEXITY_DAILY_LIMIT_USD);
  const limit=Number.isFinite(configured) && configured>=0 ? configured : 10;
  for(let attempt=0;attempt<8;attempt++){
    const prior=await read(day);
    const ledger=prior?.catalog || {spent:0,reservations:{},requests:[]};
    const reserved=Object.values(ledger.reservations || {}).reduce<number>((sum,value:any)=>sum+Number(value.usd||0),0);
    if(!canReserveSearch(ledger.spent||0,reserved,limit,amount))throw new Error("Daily paid-search limit reached. Direct website and free news collection continue.");
    const next={...ledger,reservations:{...ledger.reservations,[requestId]:{usd:amount,purpose,company,at:new Date().toISOString()}},limit:Number.isFinite(limit)?limit:null};
    if(await write(day,prior,next))return;
  }
  throw new Error("Search accounting is busy; paid search was not started.");
}

async function settle(day:string,requestId:string,cost:number|null,status:string):Promise<void>{
  for(let attempt=0;attempt<8;attempt++){
    const prior=await read(day);if(!prior)return;
    const ledger=prior.catalog;const reservation=ledger.reservations?.[requestId];if(!reservation)return;
    const reservations={...ledger.reservations};
    // A network timeout may still be billed. Keep its reservation until reconciled.
    if(cost!==null)delete reservations[requestId];
    else reservations[requestId]={...reservation,status:"unknown"};
    const next={...ledger,reservations,spent:(ledger.spent||0)+(cost||0),requests:[...(ledger.requests||[]),{id:requestId,purpose:reservation.purpose,company:reservation.company,cost,status,at:new Date().toISOString()}]};
    if(await write(day,prior,next))return;
  }
  throw new Error("Search cost could not be recorded; its reservation remains in place.");
}

/** One billed result per identical query per day, shared by all app instances. */
export async function requestMarketIntelSearch(body:unknown,key:string,purpose:string,company:string,endpoint: "chat/completions" | "search" = "chat/completions"):Promise<any>{
  const payload=JSON.stringify(body);
  const cacheId=`market-intel:search-cache:${createHash("sha256").update(endpoint === "search" ? `search:${payload}` : payload).digest("hex").slice(0,32)}`;
  const prior=await read(cacheId);
  if(prior?.catalog?.response && Date.now()-Date.parse(prior.catalog.at)<DAY_MS && collectedInCurrentCycle(prior.catalog.at)){
    const data=structuredClone(prior.catalog.response);
    data.usage={...data.usage,cost:{...data.usage?.cost,total_cost:0}};
    return data;
  }
  if(prior?.catalog?.until>Date.now())throw new Error("This company search is already running. Please try again shortly.");
  const requestId=randomUUID();
  if(!(await write(cacheId,prior,{until:Date.now()+120_000,requestId})))throw new Error("This company search is already running.");
  const day=`market-intel:search-spend:${new Date().toISOString().slice(0,10)}`;
  try{await reserve(day,purpose,company,requestId);}catch(error){
    const current=await read(cacheId);if(current?.catalog?.requestId===requestId)await write(cacheId,current,{until:0});throw error;
  }
  let accounted=false;
  try{
    const response=await fetch(`https://api.perplexity.ai/${endpoint}`,{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:payload,signal:AbortSignal.timeout(90_000)});
    if(!response.ok){
      await settle(day,requestId,response.status<500?0:null,`HTTP ${response.status}`);accounted=true;
      throw new Error(`Perplexity HTTP ${response.status}`);
    }
    const data=await response.json();
    const cost=typeof data?.usage?.cost?.total_cost==="number"?data.usage.cost.total_cost:endpoint === "search" ? 0.005 : null;
    if(endpoint === "search") data.usage={...data.usage,cost:{total_cost:cost}};
    await settle(day,requestId,cost,"success");accounted=true;
    const current=await read(cacheId);
    if(current?.catalog?.requestId===requestId)await write(cacheId,current,{response:data,at:new Date().toISOString(),until:0,purpose,company});
    return data;
  }catch(error){
    if(!accounted)await settle(day,requestId,null,"unknown");
    const current=await read(cacheId);
    if(current?.catalog?.requestId===requestId)await write(cacheId,current,{until:Date.now()+60_000,error:String(error),purpose,company});
    throw error;
  }
}

"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpenText, BriefcaseBusiness, Check, CheckCircle2, ChevronRight, FileText, Globe2, Link2, Minus, Plus, Radio, Search, Sparkles, UsersRound } from "lucide-react";
import claudiaPhoto from "@/public/avatars/claudia-hofmann.png";
import gracePhoto from "@/public/avatars/grace-liu.png";
import s from "@/app/landing.module.css";

function Bar({ area }: { area: string }) {
  return <div className={s.featureDemoBar}><span className={s.featureDemoMark}>ƒ</span><strong>Freyr</strong><span className={s.featureDemoCrumb}>/ {area}</span><small>ILLUSTRATIVE WORKSPACE</small></div>;
}

function AgentView() {
  return <div className={s.featureDemo}><Bar area="Agent"/><div className={s.featureDemoBody}>
    <div className={s.featureAgentPrompt}>What changed at Meridian before my next meeting?</div>
    <div className={s.featureAgentAnswer}><span className={s.featureAgentIcon}><Sparkles size={17}/></span><div><small>ANSWERED FROM YOUR WORKSPACE</small><p>The <strong>Lifecycle Maintenance</strong> deal is approaching its expected sign date. <strong>Claudia Hofmann</strong> is a linked contact. Confirm scope before the customer call.</p><div className={s.featureSourceRow}><span><BriefcaseBusiness size={13}/> Opportunity <ArrowUpRight size={12}/></span><span><UsersRound size={13}/> Contact <ArrowUpRight size={12}/></span></div></div></div>
    <div className={s.featureAgentInput}><Search size={15}/> Ask a follow-up about the deal <ArrowRight size={15}/></div>
  </div></div>;
}

function FlowView() {
  const stages=[{icon:UsersRound,name:"Lead",detail:"Customer need"},{icon:BriefcaseBusiness,name:"Opportunity",detail:"Qualified deal"},{icon:Sparkles,name:"Solutioning",detail:"Scope in review"},{icon:FileText,name:"Contract",detail:"Next commitment"}];
  return <div className={s.featureDemo}><Bar area="Customer story"/><div className={s.featureDemoBody}>
    <div className={s.featureFlowHeader}><small>MERIDIAN PHARMACEUTICALS</small><strong>One story, from first signal to signature.</strong></div>
    <div className={s.featureFlowLine}>{stages.map(({icon:Icon,name,detail},i)=><div className={s.featureFlowStage} key={name}><span><Icon size={19}/></span><small>0{i+1}</small><strong>{name}</strong><em>{detail}</em>{i<stages.length-1&&<ChevronRight className={s.featureFlowArrow} size={18}/>}</div>)}</div>
    <div className={s.featureFlowPeople}><Image src={claudiaPhoto} alt="" width={36} height={36} sizes="36px"/><div><strong>Claudia Hofmann</strong><span>Linked customer contact</span></div><Image src={gracePhoto} alt="" width={36} height={36} sizes="36px"/><div><strong>Grace Liu</strong><span>Opportunity owner</span></div></div>
  </div></div>;
}

function IntelView() {
  return <div className={s.featureDemo}><Bar area="Market Intel"/><div className={s.featureDemoBody}>
    <div className={s.featureIntelTop}><span><Radio size={14}/> SIGNALS WORTH READING</span><small>Source attached to every update</small></div>
    <div className={s.featureIntelMain}><span className={s.featureIntelIcon}><Globe2 size={25}/></span><div><small>COMPANY UPDATE · TAKEDA</small><strong>Regulatory operations are changing.</strong><p>A sourced update appears beside the company, its people and the account context that makes it useful.</p></div></div>
    <div className={s.featureIntelInsight}><Sparkles size={16}/><div><small>WHY IT MATTERS</small><strong>Prepare a more relevant customer conversation.</strong></div></div>
    <div className={s.featureIntelSources}><span><CheckCircle2 size={13}/> Publisher and date visible</span><span>Open the source <ArrowUpRight size={13}/></span></div>
  </div></div>;
}

function GoalView() {
  const [zoom,setZoom]=useState(1);
  const months=[{name:"Apr",value:66},{name:"May",value:91},{name:"Jun",value:105},{name:"Jul",value:132},{name:"Aug",value:400}];
  const visible=zoom===1?months:months.slice(zoom===2?2:3);
  return <div className={s.featureDemo}><Bar area="Goals"/><div className={s.featureDemoBody}>
    <div className={s.featureGoalTop}><div><small>FY 2026/27 · EMAIL PROSPECTING</small><strong>See what counts. Then zoom in.</strong></div><div className={s.featureGoalZoom}><button type="button" aria-label="Zoom out of example goal" disabled={zoom===1} onClick={()=>setZoom(z=>z-1)}><Minus size={14}/></button><span>{zoom}×</span><button type="button" aria-label="Zoom into example goal" disabled={zoom===3} onClick={()=>setZoom(z=>z+1)}><Plus size={14}/></button></div></div>
    <div className={s.featureGoalSummary}><strong>400</strong><span>verified campaigns</span><em>of 5,000 target</em></div>
    <div className={s.featureGoalMonths}>{visible.map(month=><div key={month.name}><small>{month.name}</small><span><i style={{width:`${Math.max(month.value/400*100,7)}%`}}/></span><strong>{month.value}</strong></div>)}</div>
    <div className={s.featureGoalFoot}><span><Check size={13}/> Verified work counts now</span><span>Group and person detail <ArrowRight size={13}/></span></div>
  </div></div>;
}

function KnowledgeView() {
  return <div className={s.featureDemo}><Bar area="Offerings"/><div className={s.featureDemoBody}>
    <div className={s.featureKnowledgeHead}><span><BookOpenText size={20}/></span><div><small>OFFERING & MATERIALS</small><strong>Freya.Register</strong><p>Regulatory Information Management</p></div></div>
    <div className={s.featureKnowledgeQuestion}><Sparkles size={16}/><span>What should I bring to the customer call?</span></div>
    <div className={s.featureKnowledgeAnswer}>Start with the offering overview, then open the supporting material for the customer’s specific scope.</div>
    <div className={s.featureKnowledgeFiles}><span><FileText size={17}/><strong>Freya.Register overview</strong><small>Sales material</small><ArrowUpRight size={15}/></span><span><FileText size={17}/><strong>Capabilities presentation</strong><small>Supporting material</small><ArrowUpRight size={15}/></span></div>
    <div className={s.featureKnowledgeNote}><Link2 size={13}/> The source stays attached to the answer.</div>
  </div></div>;
}

/** Code-built, illustrative product vignettes, rather than static dashboard images. */
export function ProductScene({ index }: { index: number }) {
  return [<AgentView key="agent"/>,<FlowView key="flow"/>,<IntelView key="intel"/>,<GoalView key="goal"/>,<KnowledgeView key="knowledge"/>][index] ?? null;
}

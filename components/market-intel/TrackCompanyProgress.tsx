"use client";
import { Building2, Check, Loader2, Newspaper, Sparkles, BookmarkCheck } from "lucide-react";
import type { TrackProgress } from "@/lib/marketIntelTrackProgress";
const steps = [
  {id:"identity",label:"Confirming the company",note:"Checking the name and official sources",Icon:Building2},
  {id:"sources",label:"Collecting recent updates",note:"Company posts, news coverage and website updates",Icon:Newspaper},
  {id:"briefing",label:"Preparing your briefing",note:"Organising the updates into useful signals",Icon:Sparkles},
  {id:"saving",label:"Adding to your list",note:"Saving the company and its first briefing",Icon:BookmarkCheck},
];
export function TrackCompanyProgress({progress}:{progress:TrackProgress}) {
 const current=steps.findIndex(s=>s.id===progress.stage);
 return <div className="py-2" role="status" aria-live="polite" aria-busy="true">
  <p className="text-[22px] font-semibold tracking-tight text-text-primary">{progress.name || "Your next company briefing"}</p>
  <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">We’re checking the sources and collecting the first updates. Keep this window open.</p>
  <ol className="mt-6 space-y-1">
   {steps.map(({id,label,note,Icon},index)=><li key={id} className={`flex items-center gap-3 rounded-xl px-3 py-3 ${index===current?"bg-blue-primary/[0.06]":""}`} aria-current={index===current?"step":undefined}>
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${index<=current?"bg-blue-primary/10 text-blue-primary":"bg-surface-muted text-text-tertiary"}`}>
     {index<current?<Check size={17}/>:index===current?<Loader2 size={17} className="animate-spin motion-reduce:animate-none"/>:<Icon size={17}/>}
    </span>
    <div className="min-w-0"><p className={`text-[13px] font-semibold ${index<=current?"text-text-primary":"text-text-secondary"}`}>{label}</p><p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">{note}</p></div>
    {index<current&&<span className="ml-auto text-[11px] font-medium text-blue-primary">Done</span>}
   </li>)}
  </ol>
  <p className="mt-5 border-t border-border-light pt-4 text-[12px] leading-relaxed text-text-secondary">{progress.detail || "Some company sources take a few minutes to respond. Updates will appear here as each step finishes."}</p>
 </div>;
}

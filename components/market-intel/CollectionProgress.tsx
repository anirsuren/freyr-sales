"use client";
import { useEffect, useState } from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { AutoFresh } from "./AutoFresh";
import type { TrackedCompany } from "@/lib/marketIntelTracking";

export function CollectionProgress({ job }: { job: NonNullable<TrackedCompany["onboarding"]> }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const stages = ["identity", "sources", "briefing", "saving"];
  const labels = ["Company", "Sources", "Briefing", "Ready"];
  const current = stages.indexOf(job.stage || "");
  const seconds = now ? Math.max(0, Math.floor((now - Date.parse(job.stageStartedAt || job.updatedAt)) / 1000)) : 0;
  const failed = job.status === "failed";
  return <section aria-label="Collection progress" className="mb-4 rounded-xl border border-blue-primary/15 bg-blue-light/30 px-4 py-3">
    {!failed && <AutoFresh everyMs={15_000} />}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="flex items-center gap-2 text-[13px] font-medium text-blue-primary">
        {failed ? <AlertCircle size={16} /> : <Loader2 size={16} className="motion-safe:animate-spin" />}
        {failed ? "Collection needs attention" : "Updates are arriving"}
        {!failed && <span className="text-xs tabular-nums text-text-secondary">{Math.floor(seconds / 60)}m {String(seconds % 60).padStart(2, "0")}s in this step</span>}
      </p>
      <ol className="flex items-center gap-4 text-xs">
        {labels.map((label, i) => <li key={label} aria-current={i === current ? "step" : undefined} className={`flex items-center gap-1.5 ${i <= current ? "text-blue-primary" : "text-text-tertiary"}`}>
          {i < current ? <Check size={13} /> : <span className="tabular-nums">{i + 1}</span>}{label}
        </li>)}
      </ol>
    </div>
    <p className="mt-2 text-xs text-text-secondary">{failed ? job.error : "You can browse the available updates. More will appear here as collection finishes."}</p>
  </section>;
}

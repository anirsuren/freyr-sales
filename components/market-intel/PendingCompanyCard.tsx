"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { MiLogo } from "./MiLogo";
import { DivisionChips } from "./DivisionChips";
import type { TrackedCompany } from "@/lib/marketIntelTracking";
import type { Division } from "@/lib/offeringMaterials";
export function PendingCompanyCard({
  company,
  divisions,
}: {
  company: TrackedCompany;
  divisions: Division[];
}) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const steps = [
    { key: "identity", label: "Confirm company & LinkedIn", detail: "Checking official sources and reading company posts" },
    { key: "sources", label: "Collect news & website updates", detail: "Searching coverage and reading the company’s website" },
    { key: "briefing", label: "Build your briefing", detail: "Checking relevance and organising updates into signals" },
    { key: "saving", label: "Save to your intelligence feed", detail: "Saving the briefing and company logo" },
  ];
  const stageIndex = steps.findIndex(step => step.key === company.onboarding?.stage);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  // The worker adds stageStartedAt with its first progress report. Until then,
  // count from the durable onboarding/update timestamp so a newly-added card
  // never looks frozen at 0:00 while the first source request is starting.
  const timerStartedAt = company.onboarding?.stageStartedAt
    || company.onboarding?.updatedAt
    || company.addedAt;
  const stageSeconds = now && timerStartedAt
    ? Math.max(0, Math.floor((now - Date.parse(timerStartedAt)) / 1000)) : 0;
  const failed = company.onboarding?.status === "failed";
  async function retry() {
    setRetrying(true);
    setError("");
    try {
      const res = await fetch("/api/market-intel/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "company-retry", id: company.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not retry.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retry.");
    } finally {
      setRetrying(false);
    }
  }
  return (
    <article
      aria-label={`${company.name}: ${failed ? "collection needs attention" : "collecting updates"}`}
      aria-busy={!failed}
      className="relative flex min-h-[238px] flex-col rounded-xl border border-border-light bg-white p-4 shadow-card"
    >
      <Link href={`/market-intel/${company.id}`} aria-label={`Open ${company.name} while collection is in progress`} className="absolute inset-0 z-10 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary" />
      <div className="flex items-center gap-2.5">
        <MiLogo
          name={company.name}
          logoUrl={company.logoUrl}
          className="h-9 w-9 shrink-0"
        />
        <div className="min-w-0">
          <h3 className="truncate text-[14.5px] font-semibold text-text-primary">
            <Link href={`/market-intel/${company.id}`} className="hover:text-blue-primary hover:underline">{company.name}</Link>
          </h3>
          {!failed && <p className="mt-1 flex items-center gap-1.5 text-[12px] font-medium text-blue-primary">{stageIndex >= 0 ? ["Confirming company", "Collecting updates", "Preparing your briefing", "Saving your briefing"][stageIndex] : "Getting ready"}</p>}
        </div>
      </div>
      {failed ? (
        <div className="flex flex-1 flex-col justify-center py-5">
          <p className="text-[13px] font-medium text-text-primary">
            We couldn’t finish collecting updates
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-text-secondary">
            {error || company.onboarding?.error}
          </p>
        </div>
      ) : (
        <div className="my-4 flex-1">
          <div className="relative mb-3">
            <div className="absolute left-[12.5%] right-[12.5%] top-3.5 h-0.5 overflow-hidden rounded-full bg-border-light" aria-hidden="true">
              <div className="h-full bg-blue-primary transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${Math.max(0, stageIndex) / 3 * 100}%` }} />
            </div>
            <ol className="relative grid grid-cols-4" aria-label="Collection progress">
              {steps.map((step, index) => {
                const done = stageIndex > index;
                const active = stageIndex === index;
                return <li key={step.key} aria-current={active ? "step" : undefined} className="flex flex-col items-center gap-2">
                  <span className={`relative flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-white text-[11px] font-semibold ring-4 ring-white transition-colors duration-300 ${done ? "bg-blue-primary text-white" : active ? "bg-blue-light text-blue-primary" : "bg-surface text-text-tertiary"}`}>
                    {active && <span aria-hidden="true" className="absolute -inset-[3px] rounded-full border-2 border-blue-primary/20 border-t-blue-primary motion-safe:animate-spin" />}
                    {done ? <Check size={12} aria-label="Completed" /> : index + 1}
                  </span>
                  <span className={`text-[10px] font-medium ${active ? "text-blue-primary" : done ? "text-text-primary" : "text-text-tertiary"}`}>{["Company", "Sources", "Briefing", "Ready"][index]}</span>
                </li>;
              })}
            </ol>
          </div>
          <div className="rounded-xl border border-blue-primary/10 bg-blue-light/40 px-3 py-3" role="status">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-blue-primary">{stageIndex >= 0 ? `Step ${stageIndex + 1} of 4` : company.onboarding?.status === "queued" ? "In queue" : "Collection in progress"}</span>
              <span className="text-[10px] tabular-nums text-text-tertiary">{Math.floor(stageSeconds / 60)}m {String(stageSeconds % 60).padStart(2, "0")}s</span>
            </div>
            <div className="flex items-start gap-2.5">
              <Loader2 size={17} className="mt-0.5 shrink-0 text-blue-primary motion-safe:animate-spin" aria-hidden="true" />
              <div>
                <p className="text-[13px] font-semibold leading-5 text-text-primary">{stageIndex >= 0 ? steps[stageIndex].label : company.onboarding?.status === "queued" ? "Getting ready to start" : "Collecting your first updates"}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">{stageIndex >= 0 ? steps[stageIndex].detail : "The current stage will appear when the collector reports its next update."}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="relative z-20 flex min-h-8 items-center justify-between gap-2 border-t border-border-light pt-3">
        <span
          role="status"
          className="flex items-center gap-1.5 text-[12px] text-text-secondary"
        >
          {failed ? (
            <button
              disabled={retrying}
              onClick={() => void retry()}
              className="flex items-center gap-1.5 rounded text-blue-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary"
            >
              <RefreshCw size={12} className={retrying ? "animate-spin" : ""} />
              {retrying ? "Retrying…" : "Retry collection"}
            </button>
          ) : (
            <>
              <Link href={`/market-intel/${company.id}`} className="font-medium text-blue-primary hover:underline">View available updates →</Link>
            </>
          )}
        </span>
        <DivisionChips divisions={divisions} />
      </div>
    </article>
  );
}

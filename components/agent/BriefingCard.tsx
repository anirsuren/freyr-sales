import { Sparkles, ArrowRight } from "lucide-react";
import type { AccountBriefing } from "@/lib/agent";

// Presentational agent briefing card (V9 #73) — renders a deterministic briefing
// (no fetch). Used for the deal pre-call brief; the account version
// (AccountBriefing) is interactive with Claude narration + refresh/copy.
export function BriefingCard({
  briefing,
  label = "Agent briefing",
}: {
  briefing: AccountBriefing;
  label?: string;
}) {
  return (
    <div className="rounded-2xl border border-blue-subtle bg-blue-light/40 p-4">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="w-6 h-6 rounded-lg bg-blue-primary text-white flex items-center justify-center shrink-0">
          <Sparkles size={14} strokeWidth={1.9} />
        </span>
        <span className="text-[13px] font-semibold text-text-primary">{label}</span>
      </div>

      <p className="text-[14px] text-text-primary leading-relaxed mb-3">
        {briefing.narrative}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-1.5 mb-3">
        {briefing.reads.map((r) => (
          <div key={r.label} className="flex gap-2 text-[12px]">
            <span className="font-semibold text-text-primary shrink-0 w-[78px]">
              {r.label}
            </span>
            <span className="text-text-secondary">{r.text}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-2.5 border-t border-blue-subtle">
        <ArrowRight size={14} strokeWidth={2} className="text-blue-primary shrink-0" />
        <p className="text-[12px] text-text-primary">
          <span className="font-semibold">Recommended:</span>{" "}
          {briefing.recommendation}
        </p>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Newspaper, ShieldCheck, Flame, ArrowRight, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SendDigestButton } from "@/components/agent/SendDigestButton";
import type { AgentDigestData } from "@/lib/agent";

// The agent's daily briefing (V9 #22): what I did · what needs you · what to
// watch. Reads as a morning standup from the agent, not a passive dashboard.
export function AgentDigest({
  digest,
  source,
}: {
  digest: AgentDigestData;
  source?: "claude" | "mock";
}) {
  const clear = digest.needsApproval === 0 && digest.canHandle === 0;
  return (
    <Card className="bg-blue-light/40 border-blue-subtle">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2">
          <Newspaper size={17} strokeWidth={1.8} className="text-blue-primary" />
          Agent digest
          {source === "claude" && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.04em] text-blue-primary bg-blue-light rounded-full px-1.5 py-0.5">
              AI-written
            </span>
          )}
        </h2>
        <SendDigestButton />
      </div>

      <p className="text-[14px] text-text-primary mb-3">{digest.didSummary}</p>

      {digest.recent.length > 0 && (
        <ul className="space-y-1 mb-4">
          {digest.recent.map((r, i) => (
            <li
              key={i}
              className="flex items-center gap-2 text-[12px] text-text-secondary"
            >
              <Check size={13} strokeWidth={2.2} className="text-success shrink-0" />
              <span className="truncate">{r}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/agent/inbox"
          className="rounded-xl border border-border-light bg-white p-3 hover:border-blue-subtle transition-colors group"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary flex items-center gap-1.5 mb-1.5">
            <ShieldCheck size={13} strokeWidth={1.8} className="text-warning" />
            What needs you
          </p>
          {clear ? (
            <p className="text-[13px] text-text-secondary">
              Nothing waiting — you&apos;re clear.
            </p>
          ) : (
            <p className="text-[13px] text-text-primary">
              <span className="font-semibold tnum">{digest.needsApproval}</span>{" "}
              waiting for your approval ·{" "}
              <span className="font-semibold tnum">{digest.canHandle}</span> I can
              draft for you
            </p>
          )}
          <span className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary">
            Open inbox
            <ArrowRight
              size={12}
              strokeWidth={1.9}
              className="group-hover:translate-x-0.5 transition-transform"
            />
          </span>
        </Link>

        <div className="rounded-xl border border-border-light bg-white p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary flex items-center gap-1.5 mb-1.5">
            <Flame size={13} strokeWidth={1.8} className="text-error" />
            Watch list
          </p>
          {digest.cooling === 0 && digest.atRisk === 0 ? (
            <p className="text-[13px] text-text-secondary">
              No cooling or at-risk accounts. 🎉
            </p>
          ) : (
            <p className="text-[13px] text-text-primary">
              <span className="font-semibold tnum">{digest.cooling}</span> cooling
              deal{digest.cooling === 1 ? "" : "s"} ·{" "}
              <span className="font-semibold tnum">{digest.atRisk}</span> at-risk
              account{digest.atRisk === 1 ? "" : "s"}
            </p>
          )}
          <Link
            href="/pipeline"
            className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary"
          >
            View pipeline
            <ArrowRight size={12} strokeWidth={1.9} />
          </Link>
        </div>
      </div>
    </Card>
  );
}

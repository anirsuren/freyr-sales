import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HealthBadge } from "@/components/ui/HealthBadge";
import type { AccountHealth } from "@/lib/health";
import {
  formatMoney,
  STAGE_COLOR,
  type Stage,
} from "@/lib/pipeline";
import { OUTCOME_META } from "@/lib/utils";

export type AccountAttentionPreviewProps = {
  company: string;
  industry: string;
  segment: string;
  health: AccountHealth;
  openValue: number;
  dealCount: number;
  contactCount: number;
  largestDealValue: number;
  largestDealStage: string;
  stageBreakdown: { stage: Stage; count: number; value: number }[];
  lastTouch: string;
  latestOutcome: string | null;
  owner: string;
  recommendedAction: string;
  latestNote: string | null;
  primaryContact: string;
  primaryContactTitle: string;
};

export function AccountAttentionPreview(
  account: AccountAttentionPreviewProps
) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <CompanyLogo name={account.company} className="h-11 w-11 shrink-0 text-[9px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-text-primary">
            {account.company}
          </p>
          <p className="mt-0.5 truncate text-[10.5px] text-text-tertiary">
            {account.industry} · {account.segment}
          </p>
        </div>
        <HealthBadge health={account.health} />
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-border-light rounded-lg border border-border-light bg-surface/55 py-2.5 text-center">
        <div className="px-2">
          <p className="text-[14px] font-bold text-text-primary tnum">
            {formatMoney(account.openValue)}
          </p>
          <p className="mt-0.5 text-[9px] text-text-tertiary">Open pipeline</p>
        </div>
        <div className="px-2">
          <p className="text-[14px] font-bold text-text-primary tnum">
            {account.dealCount}
          </p>
          <p className="mt-0.5 text-[9px] text-text-tertiary">Open deals</p>
        </div>
        <div className="px-2">
          <p className="text-[14px] font-bold text-text-primary tnum">
            {formatMoney(account.largestDealValue)}
          </p>
          <p className="mt-0.5 truncate text-[9px] text-text-tertiary">
            Largest · {account.largestDealStage}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-red-100 bg-red-50/65 px-3 py-3">
        <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-error">
          <AlertTriangle size={12} strokeWidth={2.2} />
          Why it needs attention
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {account.health.factors.slice(0, 4).map((factor) => (
            <span
              key={factor.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white px-2 py-1 text-[10px] font-medium text-text-secondary shadow-sm"
            >
              <span
                className={factor.delta < 0 ? "font-bold text-error tnum" : "font-bold text-success tnum"}
              >
                {factor.delta > 0 ? "+" : ""}
                {factor.delta}
              </span>
              {factor.label}
            </span>
          ))}
        </div>
      </div>

      {account.stageBreakdown.length > 0 && (
        <div className="mt-3">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            Pipeline exposure
          </p>
          <div className="mt-1.5 space-y-1.5">
            {account.stageBreakdown.slice(0, 4).map((stage) => (
              <div
                key={stage.stage}
                className="grid grid-cols-[90px_minmax(0,1fr)_52px] items-center gap-2 text-[10px]"
              >
                <span className="flex min-w-0 items-center gap-1.5 font-medium text-text-secondary">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: STAGE_COLOR[stage.stage] }}
                  />
                  <span className="truncate">{stage.stage}</span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.max(
                        4,
                        (stage.value / Math.max(account.openValue, 1)) * 100
                      )}%`,
                      background: STAGE_COLOR[stage.stage],
                    }}
                  />
                </span>
                <span className="text-right font-semibold text-text-primary tnum">
                  {formatMoney(stage.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 rounded-lg border border-blue-subtle bg-blue-light/45 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-[0.06em] text-blue-primary">
          <CheckCircle2 size={12} strokeWidth={2.2} />
          Recommended next move
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
          {account.recommendedAction}
        </p>
        {account.latestNote && (
          <p className="mt-1.5 line-clamp-2 text-[10px] italic text-text-tertiary">
            Latest note: “{account.latestNote}”
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border-light pt-3">
        <Avatar name={account.primaryContact} className="h-7 w-7 shrink-0 text-[8px]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10.5px] font-semibold text-text-primary">
            {account.primaryContact}
          </span>
          <span className="block truncate text-[9.5px] text-text-tertiary">
            {account.primaryContactTitle} · {account.contactCount} mapped contacts
          </span>
        </span>
        <span className="text-right">
          <span className="flex items-center justify-end gap-1 text-[9.5px] text-text-tertiary">
            <Clock3 size={10} /> {account.lastTouch}
          </span>
          <span className="mt-0.5 block text-[9.5px] font-semibold text-text-secondary">
            {account.latestOutcome
              ? OUTCOME_META[account.latestOutcome]?.label || account.latestOutcome
              : `Owner · ${account.owner}`}
          </span>
        </span>
        <ArrowRight size={14} className="text-blue-primary" />
      </div>
    </div>
  );
}

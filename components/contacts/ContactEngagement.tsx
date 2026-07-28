import {
  Activity,
  Briefcase,
  CircleDollarSign,
  Percent,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  DonutChart,
  DonutLegend,
  Sparkline,
  type TipItem,
} from "@/components/charts/Charts";
import {
  OUTCOME_META,
  OUTCOME_CHART_COLOR,
  formatDate,
} from "@/lib/utils";
import {
  OPEN_STAGES,
  STAGE_PROBABILITY,
  formatMoney,
  type Deal,
} from "@/lib/pipeline";
import type { Interaction } from "@/lib/types";

// Chart-tip icon key per outcome — TIP_ICONS in the chart layer speaks stage
// vocabulary ("qualified", "meeting", …), so each outcome borrows the glyph of
// the stage it maps to. Strings on purpose: this is a server component and a
// component can't cross the client boundary.
const OUTCOME_TIP_ICON: Record<string, string> = {
  interested: "qualified",
  meeting_booked: "meeting",
  ai_call_completed: "meeting",
  in_progress: "engaged",
  no_response: "prospect",
  ai_call_failed: "prospect",
  not_interested: "lost",
};

const WEEKS = 10;
const WEEK_MS = 7 * 86400000;

function shortDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// The graphs Suren asked for on a contact (Jul 27: "there are no graphs on the
// contacts page… it probably needs some sort of graph"). Everything here is
// computed from data the page already loads — the touches logged with THIS
// person and the deals they sit on. No interactions = a calm line, no fake chart.
export function ContactEngagement({
  firstName,
  interactions,
  deals,
}: {
  firstName: string;
  interactions: Interaction[];
  deals: Deal[];
}) {
  const total = interactions.length;
  const now = Date.now();

  // Weekly touch buckets, oldest → newest, current week last — the same
  // 10-week window as the Team roster's ACTIVITY sparkline, just larger.
  const weekCounts: number[] = Array(WEEKS).fill(0);
  const weekTips: TipItem[][] = Array.from({ length: WEEKS }, () => []);
  const weekLabels: string[] = Array.from({ length: WEEKS }, (_, k) => {
    const end = now - (WEEKS - 1 - k) * WEEK_MS;
    return k === WEEKS - 1 ? "This week" : `Week of ${shortDay(end - WEEK_MS)}`;
  });
  for (const i of interactions) {
    const t = new Date(i.created_at).getTime();
    const age = now - t;
    if (age < 0 || age >= WEEKS * WEEK_MS) continue;
    const k = WEEKS - 1 - Math.floor(age / WEEK_MS);
    weekCounts[k] += 1;
    // The actual touch behind the point: what kind it was + when it happened.
    weekTips[k].push({
      name: OUTCOME_META[i.outcome]?.label || i.outcome,
      value: formatDate(i.created_at),
    });
  }
  const recentTotal = weekCounts.reduce((s, x) => s + x, 0);

  // How the touches landed — outcome mix, the same conventions (labels, chart
  // fills, per-slice touch lists) as the customer page's outcome donut.
  const counts = new Map<string, number>();
  const sliceTips = new Map<string, TipItem[]>();
  for (const i of [...interactions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )) {
    counts.set(i.outcome, (counts.get(i.outcome) || 0) + 1);
    const item: TipItem = {
      name: formatDate(i.created_at),
      sub: i.follow_up_date
        ? `Follow-up ${formatDate(i.follow_up_date)}`
        : undefined,
    };
    const arr = sliceTips.get(i.outcome);
    if (arr) arr.push(item);
    else sliceTips.set(i.outcome, [item]);
  }
  const outcomeMix = Array.from(counts.entries())
    .map(([k, v]) => ({
      label: OUTCOME_META[k]?.label || k,
      value: v,
      color: OUTCOME_CHART_COLOR[k] || "#AF9BF5",
      icon: OUTCOME_TIP_ICON[k],
      tip: sliceTips.get(k) || [],
    }))
    .sort((a, b) => b.value - a.value);

  // Deals this person sits on — count, open value, and the probability-weighted
  // figure the forecast uses. Only shown when there IS an open deal.
  const openDeals = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const openValue = openDeals.reduce((s, d) => s + d.value, 0);
  const weighted = Math.round(
    openDeals.reduce((s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0), 0)
  );

  return (
    <Card className="mb-8 p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
            <Activity size={16} strokeWidth={1.9} className="text-blue-primary" />
            Engagement
          </h2>
          <p className="text-[11px] text-text-tertiary mt-0.5">
            Every email, call and meeting logged with {firstName} — how often
            you reach out, and how it lands.
          </p>
        </div>
        {total > 0 && (
          <span className="text-[12px] text-text-secondary tnum shrink-0">
            {total} {total === 1 ? "touch" : "touches"} on record
          </span>
        )}
      </div>

      {total === 0 ? (
        <p className="mt-4 text-[13px] text-text-secondary">
          Nothing logged with {firstName} yet — after your first email, call or
          meeting, the charts fill in here.
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-0 items-stretch">
          {/* LEFT — outcome mix: donut + one-column legend, hover-linked */}
          <div className="flex flex-col lg:pr-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              How touches landed
            </p>
            <div className="flex-1 flex items-center gap-5 mt-3">
              <DonutChart
                segments={outcomeMix}
                size={140}
                thickness={15}
                centerLabel={String(total)}
                centerSub={total === 1 ? "touch" : "touches"}
                syncId="contact-touch-outcomes"
              />
              <DonutLegend
                items={outcomeMix}
                syncId="contact-touch-outcomes"
                className="flex-1"
              />
            </div>
          </div>

          {/* RIGHT — touch cadence over the last 10 weeks */}
          <div className="flex flex-col lg:border-l lg:border-border-light lg:pl-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                Touches · last 10 weeks
              </p>
              <span className="text-[11px] text-text-tertiary tnum">
                {recentTotal} in this window
              </span>
            </div>
            <div className="flex-1 flex flex-col justify-center mt-3">
              <Sparkline
                points={weekCounts}
                height={76}
                unit="touches"
                label="Touches"
                xLabels={weekLabels}
                pointTips={weekTips}
              />
              <div className="mt-1.5 flex justify-between text-[10px] text-text-tertiary tnum">
                <span>{weekLabels[0]}</span>
                <span>This week</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {openDeals.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border-light grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              icon: Briefcase,
              label: openDeals.length === 1 ? "Open deal" : "Open deals",
              value: String(openDeals.length),
              bg: "rgba(0,113,227,0.10)",
              color: "#0040A0",
            },
            {
              icon: CircleDollarSign,
              label: "Open value",
              value: formatMoney(openValue),
              bg: "rgba(5,150,105,0.12)",
              color: "#047857",
            },
            {
              icon: Percent,
              label: "Weighted (likely)",
              value: formatMoney(weighted),
              bg: "rgba(124,58,237,0.10)",
              color: "#6D28D9",
            },
          ].map((t) => (
            <div
              key={t.label}
              className="flex items-center gap-2.5 rounded-lg bg-surface px-3 py-2.5"
            >
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: t.bg, color: t.color }}
              >
                <t.icon size={14} strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  {t.label}
                </span>
                <span className="block text-[15px] font-bold text-text-primary tnum leading-tight">
                  {t.value}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

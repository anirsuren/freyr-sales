import { Wallet, Briefcase, Target } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { InfoHint } from "@/components/ui/InfoHint";
import { CountUp } from "@/components/ui/CountUp";
import { formatMoney } from "@/lib/pipeline";

interface StageStat {
  stage: string;
  count: number;
  value: number;
}
interface OutcomeStat {
  label: string;
  count: number;
  color: string;
}

function Donut({ pct }: { pct: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <svg width="130" height="130" viewBox="0 0 130 130">
      <circle cx="65" cy="65" r={r} fill="none" stroke="#E5E5EA" strokeWidth="12" />
      <circle
        cx="65"
        cy="65"
        r={r}
        fill="none"
        stroke="#0071E3"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 65 65)"
        className="donut-arc"
        style={{ ["--donut-c" as string]: c }}
      />
      <text
        x="65"
        y="65"
        textAnchor="middle"
        dominantBaseline="central"
        className="tnum"
        fontSize="26"
        fontWeight="700"
        fill="#1D1D1F"
      >
        {pct}%
      </text>
    </svg>
  );
}

export function AnalyticsView({
  stages,
  outcomes,
  winRate,
  totalDeals,
  openValue,
}: {
  stages: StageStat[];
  outcomes: OutcomeStat[];
  winRate: number;
  totalDeals: number;
  openValue: number;
}) {
  const maxStageVal = Math.max(1, ...stages.map((s) => s.value));
  const maxOutcome = Math.max(1, ...outcomes.map((o) => o.count));

  // Real supporting context for the stat cards (derived, not invented): how many
  // deals are still open vs. closed, so the two headline figures read as full,
  // intentional cards instead of a number floating in empty space.
  const openCount = stages
    .filter((s) => s.stage !== "Closed Lost")
    .reduce((n, s) => n + s.count, 0);
  const closedCount = Math.max(0, totalDeals - openCount);

  // A real conversion funnel: how many (open) deals have REACHED each step. A
  // deal in a later stage necessarily passed through the earlier ones, so each
  // rung is the running total from that stage onward — which makes it actually
  // narrow downward, unlike the raw per-stage snapshot. Closed-lost deals are
  // left out (we don't know how far they got), so this tracks the live pipeline.
  const funnelStages = stages.filter((s) => s.stage !== "Closed Lost");
  const funnel = funnelStages.map((s, i) => ({
    stage: s.stage,
    count: funnelStages.slice(i).reduce((sum, x) => sum + x.count, 0),
  }));
  const maxFunnel = Math.max(1, funnel[0]?.count ?? 1);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="h-full">
          <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0 mb-3">
            <Wallet size={16} strokeWidth={1.9} />
          </span>
          <p className="flex items-center gap-1 text-[13px] text-text-secondary">
            Open Pipeline Value
            <InfoHint text="The total dollar value of every deal still in play — nothing won or lost yet." />
          </p>
          <p className="text-[28px] font-bold text-text-primary mt-1.5 tnum">
            <CountUp value={openValue} unit="money" />
          </p>
          <p className="text-[13px] text-text-tertiary mt-1">
            Across {openCount} open {openCount === 1 ? "deal" : "deals"}
          </p>
        </Card>
        <Card className="h-full">
          <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0 mb-3">
            <Briefcase size={16} strokeWidth={1.9} />
          </span>
          <p className="flex items-center gap-1 text-[13px] text-text-secondary">
            Total Deals
            <InfoHint text="How many deals are in this view — open and closed — for the time range you picked." />
          </p>
          <p className="text-[28px] font-bold text-text-primary mt-1.5 tnum">
            <CountUp value={totalDeals} unit="count" />
          </p>
          <p className="text-[13px] text-text-tertiary mt-1">
            {openCount} open · {closedCount} closed
          </p>
        </Card>
        <Card className="h-full flex items-center justify-between">
          <div>
            <span className="w-8 h-8 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0 mb-3">
              <Target size={16} strokeWidth={1.9} />
            </span>
            <p className="flex items-center gap-1 text-[13px] text-text-secondary">
              Win Rate
              <InfoHint text="Of the deals you've actively worked (past the first-contact step), the share that reached Qualified or further — a quick read on how often effort turns into progress." />
            </p>
            <p className="text-[13px] text-text-tertiary mt-1 max-w-[140px]">
              Qualified or further, of all worked deals
            </p>
          </div>
          <Donut pct={winRate} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline by stage */}
        <Card>
          <h2 className="flex items-center gap-1.5 text-[17px] font-semibold text-text-primary mb-4">
            Pipeline by Stage
            <InfoHint text="Where your open dollars sit across the steps of your process — which stages are heavy and which are thin." />
          </h2>
          <div className="space-y-3">
            {stages.map((s) => (
              <div key={s.stage}>
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="text-text-secondary">{s.stage}</span>
                  <span className="text-text-primary font-medium tnum">
                    {formatMoney(s.value)}{" "}
                    <span className="text-text-tertiary">({s.count})</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-primary"
                    style={{ width: `${(s.value / maxStageVal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Outcome mix */}
        <Card>
          <h2 className="flex items-center gap-1.5 text-[17px] font-semibold text-text-primary mb-4">
            Outcome Mix
            <InfoHint text="What your logged touches led to — meetings booked, interest, no answer, and so on." />
          </h2>
          <div className="space-y-3">
            {outcomes.map((o) => (
              <div key={o.label}>
                <div className="flex justify-between text-[13px] mb-1">
                  <span className="text-text-secondary">{o.label}</span>
                  <span className="text-text-primary font-medium tnum">
                    {o.count}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(o.count / maxOutcome) * 100}%`,
                      backgroundColor: o.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Funnel */}
      <Card>
        <h2 className="flex items-center gap-1.5 text-[17px] font-semibold text-text-primary mb-4">
          Conversion Funnel
          <InfoHint text="How many open deals have reached each step. A real funnel narrows as deals convert — a sharp drop between two steps is where deals stall. Closed-lost deals aren't counted here." />
        </h2>
        <div className="space-y-2">
          {funnel.map((s) => (
            <div key={s.stage} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-[13px] text-text-secondary text-right">
                {s.stage}
              </span>
              <div className="flex-1 flex items-center">
                <div
                  className="h-9 rounded-md bg-blue-primary/90 flex items-center justify-end pr-3 text-white text-[13px] font-semibold tnum"
                  style={{
                    width: `${Math.max(8, (s.count / maxFunnel) * 100)}%`,
                  }}
                >
                  {s.count}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

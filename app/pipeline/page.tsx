import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { PipelineAgentBanner } from "@/components/pipeline/PipelineAgentBanner";
import { CountUp } from "@/components/ui/CountUp";
import { Briefcase, TrendingUp, Clock, AlertTriangle, type LucideIcon } from "lucide-react";
import {
  buildDeals,
  formatMoney,
  STAGE_PROBABILITY,
  ROTTING_DAYS,
} from "@/lib/pipeline";

export const metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const db = getDb();
  const [sessions, customers, contacts, interactions] = await Promise.all([
    db.pitchSessions.list(),
    db.customers.list(),
    db.contacts.list(),
    db.interactions.list(),
  ]);

  const deals = buildDeals(sessions, customers, contacts, interactions);
  const open = deals.filter((d) => d.stage !== "Closed Lost");
  const openValue = open.reduce((s, d) => s + d.value, 0);
  const weighted = deals.reduce(
    (s, d) => s + d.value * (STAGE_PROBABILITY[d.stage] ?? 0),
    0
  );
  const avgIdle = open.length
    ? Math.round(open.reduce((s, d) => s + d.staleDays, 0) / open.length)
    : 0;
  const stalled = open.filter((d) => d.staleDays > ROTTING_DAYS).length;

  const insights: {
    label: string;
    raw: number;
    unit: "count" | "money";
    suffix: string;
    warn: boolean;
    def: string;
    icon: LucideIcon;
  }[] = [
    {
      label: "Open deals",
      raw: open.length,
      unit: "count",
      suffix: "",
      warn: false,
      icon: Briefcase,
      def: "How many deals are still in play right now — not yet won or lost.",
    },
    {
      label: "Weighted forecast",
      raw: weighted,
      unit: "money",
      suffix: "",
      warn: false,
      icon: TrendingUp,
      def: "What your pipeline is realistically worth: every deal's value adjusted for how likely it is to close at its current stage. A more honest number than the full total.",
    },
    {
      label: "Avg idle",
      raw: avgIdle,
      unit: "count",
      suffix: "d",
      warn: false,
      icon: Clock,
      def: "On average, how many days since anything happened on your open deals. Lower is better — it means you're staying in touch.",
    },
    {
      label: "Stalled (14d+)",
      raw: stalled,
      unit: "count",
      suffix: "",
      warn: stalled > 0,
      icon: AlertTriangle,
      def: "Open deals with no activity for more than 14 days. These are going cold and need a nudge before you lose them.",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle={`${deals.length} deals · ${formatMoney(openValue)} open pipeline value`}
      />

      {/* Deal-velocity insights (V6) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {insights.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="h-[124px] flex flex-col">
              <span
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mb-3 ${
                  s.warn
                    ? "bg-error/10 text-error"
                    : "bg-blue-light text-blue-primary"
                }`}
              >
                <Icon size={16} strokeWidth={1.9} />
              </span>
              <Tooltip label={s.def} side="bottom" align="left">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary cursor-help">
                  {s.label}
                </span>
              </Tooltip>
              <span
                className={`mt-auto text-[24px] font-bold leading-none tnum ${
                  s.warn ? "text-error" : "text-text-primary"
                }`}
              >
                <CountUp value={s.raw} unit={s.unit} suffix={s.suffix} />
              </span>
            </Card>
          );
        })}
      </section>

      <PipelineAgentBanner coolingCount={stalled} />

      <PipelineBoard deals={deals} />
    </div>
  );
}

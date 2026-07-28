import Link from "next/link";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import { PipelineBoard } from "@/components/pipeline/PipelineBoard";
import { PipelineAnalytics } from "@/components/pipeline/PipelineAnalytics";
import { CountUp } from "@/components/ui/CountUp";
import { Briefcase, TrendingUp, Clock, AlertTriangle, Plus, type LucideIcon } from "lucide-react";
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
    // The page assembles top-to-bottom on arrival, the same way /dashboard and
    // /reports do: header → the four tiles → the agent line → the toolbar →
    // the columns. `.page-in` on AppShell is opacity-only (it can't use a
    // transform without trapping fixed descendants app-wide), so a page with no
    // per-element entrance lands completely flat — which is exactly how this
    // one read. Existing `.rise-in` / `.stagger` only; no new keyframes, and
    // both are already covered by the reduced-motion guard.
    <div>
      <div className="rise-in">
        <PageHeader
          title="Pipeline"
          subtitle={`${deals.length} deals · ${formatMoney(openValue)} open pipeline value`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/forecast"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border-light bg-white text-[13px] font-semibold text-text-primary hover:bg-surface transition-colors"
              >
                <TrendingUp size={15} strokeWidth={1.9} className="text-blue-primary" />
                Forecast
              </Link>
              <Link
                href="/intake"
                title="Start a sales session — that's how a new deal enters the pipeline"
                className="inline-flex items-center gap-1.5 h-9 pl-3 pr-3.5 rounded-full bg-blue-primary text-white text-[13px] font-semibold hover:bg-blue-hover transition-all shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
              >
                <Plus size={15} strokeWidth={2.2} />
                New deal
              </Link>
            </div>
          }
        />
      </div>

      {/* Deal-velocity insights (V6) — the forecast page's stat-tile idiom,
          exactly: 7×7 icon square, 11px uppercase tertiary label, and the
          number pinned to the bottom of a fixed-height card so the four tiles
          line up perfectly across the row. `stagger` walks the four tiles in
          left-to-right (0/40/80/120ms). */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 stagger">
        {insights.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="h-[116px] p-5 flex flex-col">
              <span
                className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 mb-2 ${
                  // Caution is burnt orange (#C2410C), never the raw error red —
                  // a stalled deal needs a nudge, it isn't a failure.
                  s.warn
                    ? "bg-warning/10 text-warning"
                    : "bg-blue-light text-blue-primary"
                }`}
              >
                <Icon size={16} strokeWidth={1.9} />
              </span>
              <Tooltip label={s.def} side="bottom" align="left">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary cursor-pointer">
                  {s.label}
                </span>
              </Tooltip>
              <span
                className={`mt-auto text-[25px] font-bold leading-none tnum ${
                  s.warn ? "text-warning" : "text-text-primary"
                }`}
              >
                <CountUp value={s.raw} unit={s.unit} suffix={s.suffix} />
              </span>
            </Card>
          );
        })}
      </section>

      {/* The analytics band sits directly under the tiles and above the board.
          The toolbar it would otherwise follow lives INSIDE PipelineBoard, and
          a chart wedged between a toolbar and the columns it filters would cut
          that pair in half. Here the order reads: headline numbers → the two
          graphs that explain them → the board you actually work. `rise-in`
          walks it on with the rest of the page. */}
      <div className="mb-4 rise-in">
        <PipelineAnalytics deals={deals} />
      </div>

      <PipelineBoard deals={deals} />
    </div>
  );
}

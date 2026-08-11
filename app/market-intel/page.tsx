import Link from "next/link";
import {
  Building2,
  type LucideIcon,
  Newspaper,
  Radar,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { LinkedInIcon } from "@/components/ui/LinkedInIcon";

// The house LinkedIn glyph, worn where a LucideIcon is expected. It takes
// size and className and ignores the rest, which is all these slots use.
const LinkedInGlyph = LinkedInIcon as unknown as LucideIcon;
import { Sparkline } from "@/components/charts/Charts";
import {
  MI_COMPANIES,
  MI_WATCHLIST,
  miDateLabel,
  miFreshMinutes,
  miTotals,
} from "@/lib/marketIntelMock";

/**
 * MARKET INTELLIGENCE - DESIGN MOCKUP (Anir, Aug 10, from Anant's ask): one
 * dashboard of every tracked company, click into a company for its full
 * briefing. Everything on these pages is sample content rendered against
 * today's date; Anir is wiring the real feeds himself.
 */
export const dynamic = "force-dynamic";

/** Week labels for the 12-week sparkline, so a hovered point says WHEN. */
function weekLabels(): string[] {
  const out: string[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 7 * 86_400_000);
    out.push(
      d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    );
  }
  return out;
}

export default function MarketIntelPage() {
  const totals = miTotals();
  const labels = weekLabels();
  return (
    <div>
      <PageHeader
        title="Market Intelligence"
        subtitle="What the market is saying about the companies you track. LinkedIn activity, news and competitive signals from the past 3 months."
        action={
          <span className="flex items-center gap-2 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-medium text-text-secondary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1A7A35] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#1A7A35]" />
            </span>
            Auto-refreshing. Sample data preview.
          </span>
        }
      />

      <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon={Building2}
          label="Companies tracked"
          value={String(totals.tracked)}
          sub="across your market"
        />
        <StatTile
          icon={LinkedInGlyph}
          label="LinkedIn posts"
          value={String(totals.posts)}
          sub="from tracked people, 90 days"
        />
        <StatTile
          icon={Newspaper}
          label="News picked up"
          value={String(totals.news)}
          sub="articles summarized, 90 days"
        />
        <StatTile
          icon={Radar}
          label="Signals live"
          value={String(totals.signals)}
          sub={`${totals.thisWeek} new this week`}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 stagger">
        {MI_COMPANIES.map((company) => {
          const latestNews = [...company.news].sort(
            (a, b) => a.daysAgo - b.daysAgo
          )[0];
          const up = company.momentum >= 0;
          const fresh = miFreshMinutes(company.id);
          return (
            <Link
              key={company.id}
              href={`/market-intel/${company.id}`}
              className="group block rounded-xl border border-border-light bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-lg active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <CompanyLogo
                    name={company.name}
                    className="h-9 w-9 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-semibold text-text-primary group-hover:text-blue-primary">
                      {company.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-text-tertiary">
                      {company.industry}
                    </span>
                  </span>
                </span>
                {/* Momentum wears a real status colour: green is more market
                    noise than last month, red is less. */}
                <span
                  className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tnum"
                  style={{
                    color: up ? "#1A7A35" : "#DC2626",
                    background: up
                      ? "rgba(26,122,53,0.10)"
                      : "rgba(220,38,38,0.10)",
                  }}
                >
                  {up ? (
                    <TrendingUp size={11} strokeWidth={2.4} />
                  ) : (
                    <TrendingDown size={11} strokeWidth={2.4} />
                  )}
                  {up ? "+" : ""}
                  {company.momentum}%
                </span>
              </div>

              <div className="mt-3">
                <Sparkline
                  points={company.trend}
                  height={36}
                  xLabels={labels}
                  unit="items"
                  label={`${company.name} market activity`}
                  interactive={false}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 rounded-full bg-[rgba(0,113,227,0.08)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0071E3]">
                  <LinkedInIcon size={10.5} />
                  {company.posts.length}{" "}
                  {company.posts.length === 1 ? "post" : "posts"}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-[rgba(15,118,110,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:#0F766E]">
                  <Newspaper size={10.5} strokeWidth={2.2} />
                  {company.news.length} news
                </span>
                <span className="flex items-center gap-1 rounded-full bg-[rgba(124,58,237,0.10)] px-2 py-0.5 text-[11px] font-semibold text-[color:#7C3AED]">
                  <Radar size={10.5} strokeWidth={2.2} />
                  {company.signals.length}{" "}
                  {company.signals.length === 1 ? "signal" : "signals"}
                </span>
              </div>

              {latestNews && (
                <p className="mt-3 border-t border-border-light pt-2.5 text-[12px] leading-snug text-text-secondary">
                  <span className="font-semibold text-text-primary">
                    {latestNews.source}:
                  </span>{" "}
                  {latestNews.headline}
                  <span className="text-text-tertiary">
                    {" "}
                    · {miDateLabel(latestNews.daysAgo)}
                  </span>
                </p>
              )}

              <p className="mt-2 flex items-center gap-1.5 text-[10.5px] font-medium text-text-tertiary">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[#1A7A35]" />
                Updated {fresh} min ago
              </p>
            </Link>
          );
        })}
      </section>

      <Card className="mt-6 p-5">
        <h2 className="text-[14px] font-semibold text-text-primary">
          Also tracking{" "}
          <span className="tnum font-normal text-text-tertiary">
            ({MI_WATCHLIST.length})
          </span>
        </h2>
        <p className="mt-0.5 text-[12px] text-text-secondary">
          Watched for signals, no notable activity in the past week.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {MI_WATCHLIST.map((name) => (
            <span
              key={name}
              className="flex items-center gap-1.5 rounded-full border border-border-light bg-white py-1 pl-1.5 pr-2.5 text-[12px] font-medium text-text-secondary"
            >
              <CompanyLogo name={name} className="h-[18px] w-[18px]" />
              {name}
            </span>
          ))}
        </div>
      </Card>

      <p className="mt-4 text-[11px] text-text-tertiary">
        Design preview. Companies are real, every person, post, article and
        signal on these pages is illustrative sample content.
      </p>
    </div>
  );
}

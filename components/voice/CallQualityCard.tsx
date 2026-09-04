"use client";

import {
  CalendarClock,
  Hourglass,
  PhoneCall,
  ThumbsUp,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { HoverCard } from "@/components/ui/HoverCard";
import { tint } from "@/lib/tint";

// Icons arrive as KEY STRINGS, never as components — the page that feeds this
// card is a server component and React can't serialise a function across the
// boundary (same convention as the charts' TIP_ICONS).
const METRIC_ICONS: Record<string, LucideIcon> = {
  connect: PhoneCall,
  length: Timer,
  longest: Hourglass,
  interested: ThumbsUp,
  follow_up: CalendarClock,
  people: Users,
};

export type QualityMetric = {
  key: string;
  label: string;
  value: string;
  /** Unit or denominator, so the number reads honestly without hovering. */
  sub: string;
  icon: string;
};

export type LengthBucket = {
  label: string;
  count: number;
  color: string;
  /** The actual calls in this bucket — the hover ADDS who, never restates. */
  calls: { id: string; name: string; company: string; length: string }[];
};

/**
 * "Call quality" — six honest metrics pinned to the top under the header, and a
 * real chart filling every pixel below them (Suren, Jul 27: "it's just a lot of
 * empty space… put more shit there, or move the metrics up and put some graph
 * below. You got to fill the space somehow"). Nothing floats in the middle any
 * more and the card has no dead band at rest.
 */
export function CallQualityCard({
  name,
  metrics,
  buckets,
}: {
  name: string;
  metrics: QualityMetric[];
  buckets: LengthBucket[];
}) {
  const maxBucket = Math.max(...buckets.map((b) => b.count), 1);
  const bucketTotal = buckets.reduce((sum, b) => sum + b.count, 0);

  return (
    <Card className="flex flex-col">
      <h3 className="text-[15px] font-semibold text-text-primary">Call quality</h3>
      <p className="mt-0.5 text-[12px] text-text-tertiary">
        How {name}&apos;s conversations are going.
      </p>

      {/* Six metrics, three rows of two, hard against the header. */}
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
        {metrics.map((metric) => {
          const Icon = METRIC_ICONS[metric.icon] ?? PhoneCall;
          return (
            <div key={metric.key} className="flex items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
                <Icon size={15} strokeWidth={1.9} />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                  {metric.label}
                </span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[17px] font-bold leading-tight tnum text-text-primary">
                    {metric.value}
                  </span>
                  <span className="text-[10px] leading-tight text-text-tertiary tnum">
                    {metric.sub}
                  </span>
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {/* The graph that fills the rest of the card. */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <p className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
            How long calls run
          </span>
          <span className="text-[10px] text-text-tertiary">calls</span>
        </p>
        <div
          data-length-plot
          className="flex flex-1 flex-col justify-between gap-1 min-h-[92px]"
        >
          {buckets.map((bucket) => {
            const share = bucketTotal
              ? Math.round((bucket.count / bucketTotal) * 100)
              : 0;
            return (
              <HoverCard
                key={bucket.label}
                side="top"
                width={250}
                delayMs={0}
                clearAncestor="[data-length-plot]"
                className="grid cursor-pointer grid-cols-[18px_minmax(0,auto)_auto_auto_minmax(40px,1fr)] items-center gap-x-2 rounded-md px-1 py-[3px] transition-all hover:bg-surface"
                content={
                  <div>
                    <p className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: bucket.color }}
                      />
                      {bucket.label}
                      <span className="ml-auto tnum">
                        {bucket.count} {bucket.count === 1 ? "call" : "calls"}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] text-text-tertiary">
                      {share}% of the calls someone picked up.
                    </p>
                    {bucket.calls.length > 0 && (
                      <div className="mt-2.5 space-y-1.5 border-t border-border-light pt-2.5">
                        {bucket.calls.slice(0, 5).map((call) => (
                          <div key={call.id} className="flex items-center gap-2 text-[12px]">
                            <Avatar name={call.name} className="h-6 w-6 shrink-0 text-[8px]" />
                            <span className="min-w-0 flex-1 leading-tight">
                              <span className="block font-medium text-text-primary">
                                {call.name}
                              </span>
                              <span className="flex items-center gap-1 text-[10.5px] text-text-tertiary">
                                <CompanyLogo
                                  name={call.company}
                                  className="h-[14px] w-[14px] shrink-0 text-[6px]"
                                />
                                {call.company}
                              </span>
                            </span>
                            <span className="shrink-0 tnum text-text-secondary">
                              {call.length}
                            </span>
                          </div>
                        ))}
                        {bucket.calls.length > 5 && (
                          <p className="text-[10.5px] text-text-tertiary">
                            +{bucket.calls.length - 5} more
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                }
              >
                <span
                  className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md"
                  style={{ color: bucket.color, background: tint(bucket.color, 14) }}
                  aria-hidden="true"
                >
                  <Timer size={12} strokeWidth={2.2} />
                </span>
                <span className="min-w-0 text-[12px] text-text-secondary">
                  {bucket.label}
                </span>
                <span className="justify-self-end text-[12.5px] font-semibold text-text-primary tnum">
                  {bucket.count}
                </span>
                <span className="justify-self-end text-[11px] text-text-tertiary tnum">
                  {share}%
                </span>
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full rounded-full transition-all"
                    style={{
                      width: `${bucket.count ? Math.max((bucket.count / maxBucket) * 100, 4) : 0}%`,
                      background: bucket.color,
                    }}
                  />
                </span>
              </HoverCard>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

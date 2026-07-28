import { CalendarClock, MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoHint } from "@/components/ui/InfoHint";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Interaction } from "@/lib/types";
import { daysSince, whenLabel } from "./dealTime";
import { outcomeMark, outcomeMix } from "./dealOutcome";

/* ---------------------------------------------------------------------------
   THE ACTIVITY COLUMN.

   The shared <InteractionTimeline> is a good timeline, but it paints its status
   chips through lib/utils' OUTCOME_META — and that map still renders "IN
   PROGRESS" as a YELLOW pill with brown type (lib/utils.ts:107-112) and "No
   Response" as gray on gray. Yellow is banned app-wide and a category chip is
   never gray, so this page draws its own touches through `outcomeMark()`, where
   an activity takes the colour of the stage it moves the deal to.

   It also stopped being just a list: three counted facts and the real mix of
   what has been logged sit above it, so this column carries the same weight as
   the services column beside it and neither one bottoms out in white.
--------------------------------------------------------------------------- */

const EYEBROW =
  "text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary";

export function DealActivity({
  interactions,
  nowIso,
}: {
  interactions: Interaction[];
  nowIso: string;
}) {
  const total = interactions.length;
  // db.interactions.list() hands these back newest-first; the timeline reads
  // that way and the "first touch" comes off the tail.
  const newest = interactions[0] || null;
  const oldest = interactions[total - 1] || null;
  const mix = outcomeMix(interactions);
  const followUps = interactions.filter((i) => i.follow_up_date).length;

  if (total === 0) {
    return (
      <div>
        <ActivityHeading />
        <Card className="p-0">
          <EmptyState
            icon={MessageSquareText}
            title="No touches logged yet"
            description="Log an outcome after your first call, email or note and the whole history shows up here."
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <ActivityHeading />

      <Card className="p-0">
        {/* Three counted facts, the compact trio idiom off the team roster. */}
        <div className="grid grid-cols-3 gap-2 border-b border-border-light p-4">
          {[
            {
              l: "Touches logged",
              v: String(total),
              n: followUps > 0 ? `${followUps} with a follow-up` : "no follow-up booked",
            },
            {
              l: "First touch",
              v: oldest ? formatDate(oldest.created_at) : "—",
              n: oldest ? whenLabel(daysSince(oldest.created_at, nowIso)) : "",
            },
            {
              l: "Latest touch",
              v: newest ? formatDate(newest.created_at) : "—",
              n: newest ? whenLabel(daysSince(newest.created_at, nowIso)) : "",
            },
          ].map((s) => (
            <div key={s.l} className="min-w-0 rounded-lg bg-surface px-2.5 py-2">
              <p className={`${EYEBROW} whitespace-nowrap`}>{s.l}</p>
              <p className="mt-0.5 text-[14px] font-bold leading-none text-text-primary tnum">
                {s.v}
              </p>
              <p className="mt-1 text-[10px] leading-snug text-text-tertiary">
                {s.n}
              </p>
            </div>
          ))}
        </div>

        {/* The real mix of what has been logged — one segment per outcome that
            actually exists on this deal, sized by its true count. The counts sit
            RIGHT AFTER their labels, never stranded at the far edge. */}
        <div className="border-b border-border-light p-4">
          <p className={`${EYEBROW} mb-2`}>What has been logged</p>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface">
            {mix.map((m) => (
              // flexGrow on the OUTER span, which is the actual flex item. The
              // width used to live on the Tooltip's child, so it resolved
              // against a zero-width wrapper and painted nothing at all.
              <span
                key={m.outcome}
                className="h-full"
                style={{ flexGrow: m.count, flexBasis: 0 }}
              >
                <Tooltip
                  label={`${m.count} ${m.count === 1 ? "touch" : "touches"} logged as ${m.label} — ${Math.round(m.share)}% of everything on this deal.`}
                  side="top"
                  className="block h-full w-full cursor-pointer"
                >
                  <span
                    className="block h-full w-full transition-[filter] hover:brightness-110"
                    style={{ background: m.color }}
                  />
                </Tooltip>
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {mix.map((m) => (
              <span
                key={m.outcome}
                className="inline-flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2.5 text-[11.5px] font-semibold leading-tight"
                style={{ background: `${m.color}14`, color: m.color }}
              >
                <span
                  className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: m.color }}
                >
                  <m.icon size={10} strokeWidth={2.3} />
                </span>
                {m.label}
                <span className="tnum font-bold">{m.count}</span>
              </span>
            ))}
          </div>
        </div>

        {/* The history itself. Newest at the top, a spine down the left, a node
            per touch in that touch's own colour. */}
        <div className="max-h-[420px] overflow-y-auto p-4">
          <ol className="relative">
            <div className="absolute bottom-1.5 left-[6px] top-1.5 w-px bg-border-light" />
            {interactions.map((it) => {
              const m = outcomeMark(it.outcome);
              const Icon = m.icon;
              return (
                <li key={it.id} className="relative pb-5 pl-7 last:pb-0">
                  <span
                    className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full ring-4 ring-[color:var(--bg,#fff)]"
                    style={{ background: m.color }}
                  />
                  <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {/* Colour + icon, never a gray word — and never the yellow
                        band the shared badge still paints "In Progress" in. */}
                    <span
                      className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ background: `${m.color}1A`, color: m.color }}
                    >
                      <Icon size={11} strokeWidth={2.2} className="shrink-0" />
                      {m.label}
                    </span>
                    <span className="whitespace-nowrap text-[11.5px] text-text-secondary tnum">
                      {formatDateTime(it.created_at)}
                    </span>
                    <span className="whitespace-nowrap text-[11.5px] text-text-tertiary tnum">
                      {whenLabel(daysSince(it.created_at, nowIso))}
                    </span>
                  </div>
                  {it.notes && (
                    <p className="text-[13.5px] leading-relaxed text-text-secondary">
                      {it.notes}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-text-tertiary">
                    {it.follow_up_date && (
                      <span className="inline-flex items-center gap-1 tnum">
                        <CalendarClock size={12} strokeWidth={1.7} />
                        Follow-up {formatDate(it.follow_up_date)}
                      </span>
                    )}
                    {it.logged_by && (
                      <span className="inline-flex items-center gap-1.5">
                        <Avatar name={it.logged_by} className="h-5 w-5 text-[7px]" />
                        Logged by {it.logged_by}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </Card>
    </div>
  );
}

function ActivityHeading() {
  return (
    <div className="mb-3 flex items-start gap-1.5">
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">Activity</h2>
        <p className="mt-0.5 text-[11px] text-text-tertiary">
          Every call, email and note logged on this deal
        </p>
      </div>
      <InfoHint text="Each touch is coloured by the stage it moved the deal to, so this history and the stage tracker at the top of the page tell one story." />
    </div>
  );
}

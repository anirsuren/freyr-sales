import { CalendarClock, MessageSquareText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfoHint } from "@/components/ui/InfoHint";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { Interaction } from "@/lib/types";
import { daysSince, whenLabel } from "./dealTime";
import { outcomeMark } from "./dealOutcome";

/* ---------------------------------------------------------------------------
   THE ACTIVITY COLUMN, AND IT IS A VERTICAL TIMELINE.

   Anir, Jul 28: "This should look more like a vert timeline. I thought I already
   had this. Why does it look like that?" It had become a stack of full-width
   bordered rows split by hairlines, which reads as a table. It is now one
   continuous spine down the left with a marker per touch sitting ON it in that
   touch's own colour, and the record to its right. No box per entry, no
   separators, newest at the top.

   The spine is drawn PER ENTRY (a marker, then a line that grows to fill the
   rest of that entry's height) rather than as one absolutely-positioned rule
   behind the list. An absolute rule has to be masked at every marker with a ring
   in the card's background colour, and `bg-white` is re-skinned under `.dark`
   while `ring-[color:var(--white)]` is not, so that ring goes wrong in dark mode. Growing the
   line inside each row needs no mask at all.

   COLOURS. The shared <InteractionTimeline> paints its status chips through
   lib/utils' OUTCOME_META, and that map still renders "In Progress" as a YELLOW
   pill with brown type (lib/utils.ts:107-112) and "No Response" as gray on gray.
   Yellow is banned app-wide and a category chip is never gray, so this page
   draws its own touches through `outcomeMark()`, where an activity takes the
   colour of the stage it moves the deal to.

   WHAT WAS DELETED, AND WHY (Anir, Jul 28: "if a block does not answer a
   question a rep actually has, delete it rather than restyling it").

     A trio of stat tiles: "Touches logged", "First touch", "Latest touch". All
     three restated the list directly beneath them: the count is the length of
     the list, the first touch is its last row, and the latest touch is already
     printed in Key facts as LAST ACTIVITY.

     A "What has been logged" proportion rail with an outcome legend under it. A
     deal with one logged outcome drew it as a single full-width line and a
     single chip, which is a chart of nothing.

   The list this renders has already had agent-written rows filtered out of it
   upstream (see `humanTouches` and app/deals/[id]/page.tsx), so the count in the
   heading is the count of what is actually listed.
--------------------------------------------------------------------------- */

export function DealActivity({
  interactions,
  nowIso,
}: {
  interactions: Interaction[];
  nowIso: string;
}) {
  const total = interactions.length;

  if (total === 0) {
    return (
      <div>
        <ActivityHeading count={0} />
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
      <ActivityHeading count={total} />

      <Card className="p-5">
        {/* db.interactions.list() hands these back newest-first, and that is the
            order a rep reads them in. */}
        <ol className="max-h-[560px] overflow-y-auto">
          {interactions.map((it, i) => {
            const m = outcomeMark(it.outcome);
            const Icon = m.icon;
            const last = i === interactions.length - 1;
            return (
              <li key={it.id} className="flex gap-3">
                {/* The spine: this touch's marker, then the run down to the
                    next one. The last entry ends the line at its own marker. */}
                <div className="flex w-[22px] shrink-0 flex-col items-center">
                  <span
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: m.color }}
                  >
                    <Icon size={12} strokeWidth={2.3} />
                  </span>
                  {!last && (
                    <span
                      aria-hidden
                      className="mt-1 w-px flex-1 bg-border-light"
                    />
                  )}
                </div>

                <div className={`min-w-0 flex-1 ${last ? "" : "pb-6"}`}>
                  {/* What it was on the left, when it happened hard against the
                      right edge, so every entry lines up on one straight edge. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className="min-w-0 break-normal text-[13px] font-semibold leading-snug"
                      style={{ color: m.color }}
                    >
                      {m.label}
                    </span>
                    <span className="shrink-0 text-right text-[11.5px] leading-snug text-text-tertiary tnum">
                      {whenLabel(daysSince(it.created_at, nowIso))}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-text-tertiary tnum">
                    {formatDateTime(it.created_at)}
                  </p>

                  {it.notes && (
                    <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
                      {it.notes}
                    </p>
                  )}

                  {(it.logged_by || it.follow_up_date) && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                      {it.logged_by ? (
                        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-text-tertiary">
                          <Avatar
                            name={it.logged_by}
                            className="h-5 w-5 text-[7px]"
                          />
                          {it.logged_by}
                        </span>
                      ) : (
                        <span />
                      )}
                      {it.follow_up_date && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-light px-2 py-0.5 text-[11px] font-semibold text-blue-primary tnum">
                          <CalendarClock size={11} strokeWidth={2.1} />
                          Follow-up {formatDate(it.follow_up_date)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

function ActivityHeading({ count }: { count: number }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="flex items-start gap-1.5">
        <div>
          <h2 className="text-[15px] font-semibold text-text-primary">
            Activity
          </h2>
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            Every call, email and note logged on this deal
          </p>
        </div>
        <InfoHint text="Each touch is coloured by the stage it moved the deal to, so this history and the stage tracker at the top of the page tell one story." />
      </div>
      {count > 0 && (
        <span className="shrink-0 rounded-full bg-blue-light px-2.5 py-1 text-[11.5px] font-semibold text-blue-primary tnum">
          {count} {count === 1 ? "touch" : "touches"}
        </span>
      )}
    </div>
  );
}

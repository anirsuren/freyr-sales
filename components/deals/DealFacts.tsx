import Link from "next/link";
import {
  CalendarPlus,
  Clock,
  Flame,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { SizeBadge } from "@/components/ui/Badge";
import { InfoHint } from "@/components/ui/InfoHint";
import { formatDate, formatDateTime } from "@/lib/utils";
import { daysLabel, daysSince } from "./dealTime";

/* ---------------------------------------------------------------------------
   THE FACTS BAND.

   This used to be two cards side by side, "Owner" and "Last activity", each
   holding a single line on top of a wall of white. That was the dead space
   Suren pointed at, and it was also where the page's rhythm broke: two loose
   p-5 cards sitting between two properly-built panelled cards.

   So it is built from the SAME parts as the snapshot directly above it: one
   card, one heading, then equal-height bordered panels with a tiny uppercase
   eyebrow, one value line and one note (PANEL/EYEBROW/NOTE are literal copies
   of DealSnapshot's constants, so the two bands cannot drift apart). Every
   entity in here carries its own mark, the owner their headshot, the account
   its logo, and nothing in it is printed anywhere else on the page.
--------------------------------------------------------------------------- */

// Lifted verbatim from DealSnapshot so the two bands share one rhythm.
const PANEL = "flex h-full flex-col rounded-xl border border-border-light p-4";
const EYEBROW =
  "text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary";
const NOTE = "text-[11.5px] leading-snug text-text-secondary";
const VALUE = "text-[14.5px] font-semibold leading-snug text-text-primary";

/** The measure blue the snapshot uses for "your number today". */
const MEASURE = "#0071E3";
/** Real red, earned only once the deal has actually gone quiet — the same rule
 *  and the same hex the snapshot's runway track follows, and the app's one
 *  "this is a problem" red everywhere else (tasks, analytics, account cards). */
const RISK = "#B02020";

function Tile({ color, Icon }: { color: string; Icon: LucideIcon }) {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
      style={{ background: `${color}1A`, color }}
    >
      <Icon size={15} strokeWidth={1.95} />
    </span>
  );
}

export function DealFacts({
  owner,
  isCurrentOwner,
  companyName,
  customerId,
  sizeTier,
  lastActivityAt,
  quietDays,
  rotting,
  openedAt,
  nowIso,
}: {
  owner: string;
  isCurrentOwner: boolean;
  companyName: string;
  customerId: string | null;
  sizeTier: string | null;
  /** Timestamp of the newest logged touch, or null when nothing is logged. */
  lastActivityAt: string | null;
  quietDays: number;
  rotting: boolean;
  /** When the deal was created — session.created_at. */
  openedAt: string;
  nowIso: string;
}) {
  const ageDays = daysSince(openedAt, nowIso) ?? 0;
  const activityColor = rotting ? RISK : MEASURE;

  return (
    <Card className="mb-6">
      <div className="mb-5">
        <div className="flex items-center gap-1.5">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Key facts
          </h2>
          <InfoHint text="The plain facts: who owns this deal, which account it is for, when it opened, and when someone last touched it. The money and the odds are in the snapshot above." />
        </div>
        <p className="mt-0.5 text-[11px] text-text-tertiary">
          Who owns it, where it sits, and how recently it moved
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1 — OWNER. Keeps its headshot: a person on this page is never a
            bare name (standing rule). */}
        <section className={PANEL}>
          <div className="flex items-start justify-between gap-2">
            <span className={EYEBROW}>Owner</span>
            <Tile color={MEASURE} Icon={UserRound} />
          </div>
          <span className="mt-2.5 flex min-w-0 items-center gap-2">
            <Avatar
              name={owner}
              className="h-6 w-6 shrink-0 text-[9px]"
              tooltip={`Owner: ${owner}${isCurrentOwner ? ", that's you" : ""}`}
            />
            {/* Wraps rather than truncating — a rep is never "Patricia M…". */}
            <span className={`${VALUE} min-w-0 break-normal`}>
              {owner}
              {isCurrentOwner ? " · you" : ""}
            </span>
          </span>
          <p className={`mt-auto pt-2 ${NOTE}`}>
            {isCurrentOwner
              ? "You're running this deal."
              : owner === "Unassigned"
                ? "No teammate owns this deal yet."
                : `${owner} is running this deal.`}
          </p>
        </section>

        {/* 2 — THE ACCOUNT, with its logo, its size chip, and a way through to
            it. Deliberately NOT a heading: the page header above already owns
            the one heading that carries this account's name. */}
        <section className={PANEL}>
          <div className="flex items-start justify-between gap-2">
            <span className={EYEBROW}>Account</span>
            <CompanyLogo
              name={companyName}
              className="h-7 w-7 shrink-0 text-[9px]"
            />
          </div>
          {customerId ? (
            <Link
              href={`/customers/${customerId}`}
              className={`mt-2.5 ${VALUE} break-normal transition-colors hover:text-blue-primary hover:underline`}
            >
              {companyName}
            </Link>
          ) : (
            <span className={`mt-2.5 ${VALUE} break-normal`}>{companyName}</span>
          )}
          <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
            <SizeBadge tier={sizeTier} />
          </span>
        </section>

        {/* 3 — WHEN IT OPENED. The deal's own age, which lives nowhere else:
            the snapshot counts days on the CURRENT stage, not the whole run. */}
        <section className={PANEL}>
          <div className="flex items-start justify-between gap-2">
            <span className={`${EYEBROW} inline-flex items-center gap-1`}>
              Deal opened
              <InfoHint text={"The day this deal was created.\nThe snapshot counts days on the stage it is on now.\nThis counts the whole run, start to today."} />
            </span>
            <Tile color={MEASURE} Icon={CalendarPlus} />
          </div>
          <span className={`mt-2.5 ${VALUE} tnum`}>{formatDate(openedAt)}</span>
          <p className={`mt-auto pt-2 ${NOTE}`}>
            {ageDays <= 0
              ? "Opened today."
              : `${daysLabel(ageDays)} in the pipeline.`}
          </p>
        </section>

        {/* 4 — LAST ACTIVITY. Red is EARNED here, exactly as on the snapshot's
            quiet track: this only stops being blue once the deal has actually
            gone past the quiet line. */}
        <section className={PANEL}>
          <div className="flex items-start justify-between gap-2">
            <span className={EYEBROW}>Last activity</span>
            <Tile color={activityColor} Icon={rotting ? Flame : Clock} />
          </div>
          <span
            className={`mt-2.5 ${VALUE} tnum`}
            style={rotting ? { color: RISK } : undefined}
          >
            {lastActivityAt ? formatDateTime(lastActivityAt) : "No activity yet"}
          </span>
          <p className={`mt-auto pt-2 ${NOTE}`}>
            {lastActivityAt
              ? `Your last logged call, email or note. ${
                  quietDays > 0 ? `${daysLabel(quietDays)} ago` : "today"
                }.`
              : "No call, email or note logged yet."}
          </p>
        </section>
      </div>
    </Card>
  );
}

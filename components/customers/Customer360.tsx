"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  CalendarClock,
  Contact as ContactIcon,
  FileSignature,
  FileText,
  Presentation,
  Target,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { InfoHint } from "@/components/ui/InfoHint";
import { formatMoney } from "@/lib/pipeline";
import { cn, formatDate } from "@/lib/utils";

/**
 * THE WHOLE ACCOUNT, IN ONE SHOT (Suren, Aug 25).
 *
 * His ask, verbatim: "when I go to a particular customer, I want to get all
 * the view of the customer one shot for that customer — how many opportunities
 * are running, how many meetings are happening, how many presentations are
 * happening, how many submissions have I done. That view has to come together
 * within the customer… so one customer perspective will get everything, one
 * shot. Every time you look at that particular module, what are all connected,
 * everything should come together."
 *
 * The page already had nine tabs holding these facts one at a time, which is
 * the opposite of one shot: answering "what is going on at Takeda" meant
 * opening four of them and remembering the numbers. This is the top of the
 * Overview tab — every connected thing, counted, with the three most recent of
 * each and a way through to the module that owns it.
 *
 * WHAT IT NEVER DOES is invent a section. A band with nothing in it says so in
 * plain words rather than showing a zero and letting you wonder whether the
 * data failed to load.
 */

export type Customer360Item = {
  id: string;
  title: string;
  sub?: string;
  when?: string;
  amount?: number;
  href?: string;
  tone?: string;
};

export type Customer360Band = {
  key: string;
  label: string;
  /**
   * A KEY, NOT A COMPONENT. This crosses the server/client boundary, and a
   * React component is a function — Next refuses to serialise one ("only plain
   * objects can be passed to Client Components"). Same rule the charts learned:
   * the server names the icon, the client resolves it.
   */
  icon: BandIconKey;
  color: string;
  count: number;
  /** Money where money is the point — deals and contracts. */
  total?: number;
  items: Customer360Item[];
  href?: string;
  hrefLabel?: string;
  /** Shown instead of the list when the band is empty. */
  empty: string;
};

const BAND_ICON_MAP = {
  opportunities: Target,
  submissions: FileText,
  presentations: Presentation,
  meetings: CalendarClock,
  contacts: ContactIcon,
  leads: UserPlus,
  contracts: FileSignature,
} satisfies Record<string, LucideIcon>;

export type BandIconKey = keyof typeof BAND_ICON_MAP;

/** The names a server page may use. Values are the keys, not the components. */
export const BAND_ICONS = {
  opportunities: "opportunities",
  submissions: "submissions",
  presentations: "presentations",
  meetings: "meetings",
  contacts: "contacts",
  leads: "leads",
  contracts: "contracts",
} satisfies Record<BandIconKey, BandIconKey>;

/**
 * The same panel answers the same question for a PERSON (Suren, Aug 25: "I
 * click on the person's name… wherever he's been called an owner, those will
 * come… I want one-shot understanding of what is this guy doing"). Only the
 * heading changes, so it takes one rather than growing a second component that
 * would drift away from this one.
 */
export function Customer360({
  company,
  bands,
  heading,
  emptyLine,
}: {
  company: string;
  bands: Customer360Band[];
  heading?: string;
  emptyLine?: string;
}) {
  const live = bands.filter((b) => b.count > 0);
  /**
   * ONE TAB PER AREA (Anir, Aug 27, on the rep profile: "maybe have four
   * different tabs, just like you do on offerings, for each of these four
   * things" — after "I hate when you have something on the left and then I
   * have to look like a hundred thousand pixels to the right just to see
   * it"). The 2x2 card grid put four half-filled boxes side by side, flushed
   * every amount to the far edge, and left a void under any short list. The
   * strip keeps every count in one glance — the one-shot Suren asked for —
   * and the panel below gives the active area the full width, with each
   * row's facts sitting BESIDE its words.
   */
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active =
    live.find((b) => b.key === activeKey) ?? (live.length ? live[0] : null);

  return (
    <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
        <Briefcase size={15} strokeWidth={2} className="text-blue-primary" />
        {heading ?? `Everything on ${company}`}
        <InfoHint text="Every module that has something on this account, counted in one place: deals, submissions, presentations, meetings, contacts, leads and contracts. Each tab shows that area; Open jumps to the module that owns it." />
      </h2>
      <p className="mt-0.5 text-[12.5px] text-text-secondary">
        {live.length === 0
          ? (emptyLine ?? "Nothing is connected to this account yet.")
          : `${live.length} of ${bands.length} areas have something here.`}
      </p>

      {live.length > 0 && active && (
        <>
          {/* The same strip the offering page uses — counts stay readable in
              one pass even while only one area's rows are showing. */}
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-b border-border-light">
            {live.map((b) => {
              const Icon = BAND_ICON_MAP[b.icon] ?? Target;
              const isActive = b.key === active.key;
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setActiveKey(b.key)}
                  aria-selected={isActive}
                  className={cn(
                    "-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 pb-2.5 text-[13.5px] transition-colors",
                    isActive
                      ? "border-blue-primary font-medium text-text-primary"
                      : "border-transparent text-text-secondary hover:text-text-primary"
                  )}
                >
                  <Icon size={13.5} strokeWidth={2.2} style={{ color: b.color }} />
                  {b.label}
                  <b className="tnum font-semibold">{b.count}</b>
                  {b.total !== undefined && b.total > 0 && (
                    <span className="tnum text-[12px] text-text-secondary">
                      · {formatMoney(b.total)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Keyed so switching areas animates the panel, never the strip. */}
          <div key={active.key} className="tab-panel" data-c360-band={active.key}>
            <ul className="mt-1 divide-y divide-border-light">
              {active.items.slice(0, 8).map((item) => (
                <li key={item.id} className="py-2.5">
                  {/* THE FACTS SIT BESIDE THE WORDS — the amount rides the
                      title line and the date rides the sub line, so nothing
                      asks the eye to cross the card for one number. */}
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="inline-block max-w-full truncate font-semibold text-text-primary hover:text-blue-primary"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <span className="inline-block max-w-full truncate font-semibold text-text-primary">
                        {item.title}
                      </span>
                    )}
                    {item.amount !== undefined && item.amount > 0 && (
                      <b
                        className="tnum text-[12.5px] font-semibold"
                        style={{ color: active.color }}
                      >
                        {formatMoney(item.amount)}
                      </b>
                    )}
                  </p>
                  {(item.sub || item.when) && (
                    <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[12px] text-text-secondary">
                      {item.sub && <span className="min-w-0">{item.sub}</span>}
                      {item.when && (
                        <span className="tnum text-text-tertiary">
                          {formatDate(item.when)}
                        </span>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            {(active.count > 8 || active.href) && (
              <p className="mt-2 flex items-baseline justify-between gap-3 border-t border-border-light pt-2 text-[12px] text-text-tertiary">
                <span>
                  {active.count > 8 ? `and ${active.count - 8} more` : "\u00A0"}
                </span>
                {active.href && (
                  <Link
                    href={active.href}
                    className="font-semibold text-blue-primary hover:underline"
                  >
                    {active.hrefLabel ?? "Open"} &rsaquo;
                  </Link>
                )}
              </p>
            )}
          </div>
        </>
      )}

      {/* Empty bands, named rather than silent — the gap is the useful part. */}
      {bands.some((b) => b.count === 0) && (
        <p className="mt-3 text-[12px] text-text-tertiary">
          Nothing yet on:{" "}
          {bands
            .filter((b) => b.count === 0)
            .map((b) => b.label.toLowerCase())
            .join(", ")}
          .
        </p>
      )}
    </section>
  );
}

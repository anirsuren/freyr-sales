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
  return (
    <section className="rounded-xl border border-border-light bg-white p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-primary">
        <Briefcase size={15} strokeWidth={2} className="text-blue-primary" />
        {heading ?? `Everything on ${company}`}
        <InfoHint text="Every module that has something on this account, counted in one place: deals, submissions, presentations, meetings, contacts, leads and contracts. Each band opens the module that owns it." />
      </h2>
      <p className="mt-0.5 text-[12.5px] text-text-secondary">
        {live.length === 0
          ? (emptyLine ?? "Nothing is connected to this account yet.")
          : `${live.length} of ${bands.length} areas have something here.`}
      </p>

      {/* The counts first, so the whole picture reads in one glance before any
          list does. */}
      {/* ONE ROW, WHATEVER THE COUNT. A customer has seven bands and a person
          has nine; a fixed grid-cols-7 left the person's row as 7 + 2 orphans,
          and auto-fit made it 8 + 1. Symmetry is a standing rule here, not a
          preference, so the column count IS the band count on desktop and the
          row is always full. Narrow screens fall back to four, then two — both
          of which divide every count we produce. */}
      <div
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:[grid-template-columns:repeat(var(--c360-cols),minmax(0,1fr))]"
        style={{ ["--c360-cols" as string]: String(bands.length) }}
      >
        {bands.map((b) => {
          const Icon = BAND_ICON_MAP[b.icon] ?? Target;
          const on = b.count > 0;
          const tile = (
            <span
              className={cn(
                "flex h-full flex-col justify-between rounded-lg border px-3 py-2.5 transition-colors",
                on
                  ? "border-border-light bg-surface/50 hover:border-blue-subtle hover:bg-blue-light/40"
                  : "border-dashed border-border-light"
              )}
            >
              {/* WRAP, DON'T TRUNCATE. At nine columns "PRESENTATIONS" and
                  "SUBMISSIONS" both ellipsed, and a label you cannot read is
                  worse than one on two lines. The tiles stretch to a common
                  height in the grid row, so a wrapped label costs nothing. */}
              <span className="flex items-start gap-1.5">
                <Icon
                  size={12}
                  strokeWidth={2.3}
                  className="mt-[1px] shrink-0"
                  style={{ color: on ? b.color : "var(--text-tertiary)" }}
                />
                <span className="text-[10.5px] font-semibold uppercase leading-[1.25] tracking-[0.03em] text-text-tertiary">
                  {b.label}
                </span>
              </span>
              <span
                className="mt-1 block text-[20px] font-bold tnum"
                style={{ color: on ? "var(--text-primary)" : "var(--text-tertiary)" }}
              >
                {b.count}
              </span>
              {b.total !== undefined && b.count > 0 && (
                <span className="block text-[11.5px] font-semibold tnum text-text-secondary">
                  {formatMoney(b.total)}
                </span>
              )}
            </span>
          );
          return b.href && on ? (
            <Link key={b.key} href={b.href} className="block">
              {tile}
            </Link>
          ) : (
            <span key={b.key} className="block">
              {tile}
            </span>
          );
        })}
      </div>

      {/* Then the substance: what those numbers actually are. */}
      {live.length > 0 && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {live.map((b) => {
            const Icon = BAND_ICON_MAP[b.icon] ?? Target;
            return (
              <div
                key={b.key}
                data-c360-band={b.key}
                className="rounded-lg border border-border-light p-3.5"
              >
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
                  <Icon size={13} strokeWidth={2.2} style={{ color: b.color }} />
                  {b.label}
                  <span className="font-normal text-text-secondary tnum">
                    ({b.count}
                    {b.total !== undefined ? ` · ${formatMoney(b.total)}` : ""})
                  </span>
                  {b.href && (
                    <Link
                      href={b.href}
                      className="ml-auto text-[11.5px] font-semibold text-blue-primary hover:underline"
                    >
                      {b.hrefLabel ?? "Open"}
                    </Link>
                  )}
                </p>
                <ul className="mt-2 divide-y divide-border-light">
                  {b.items.slice(0, 3).map((item) => (
                    <li key={item.id} className="flex items-center gap-2 py-1.5">
                      <span className="min-w-0 flex-1">
                        {item.href ? (
                          <Link
                            href={item.href}
                            className="block truncate text-[12.5px] font-semibold text-text-primary hover:text-blue-primary"
                          >
                            {item.title}
                          </Link>
                        ) : (
                          <span className="block truncate text-[12.5px] font-semibold text-text-primary">
                            {item.title}
                          </span>
                        )}
                        {item.sub && (
                          <span className="block truncate text-[11.5px] text-text-secondary">
                            {item.sub}
                          </span>
                        )}
                      </span>
                      {item.amount !== undefined && item.amount > 0 && (
                        <span className="shrink-0 text-[12px] font-semibold tnum text-text-primary">
                          {formatMoney(item.amount)}
                        </span>
                      )}
                      {item.when && (
                        <span className="shrink-0 text-[11.5px] tnum text-text-tertiary">
                          {formatDate(item.when)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {b.count > 3 && (
                  <p className="mt-1 text-[11.5px] text-text-tertiary">
                    and {b.count - 3} more
                  </p>
                )}
              </div>
            );
          })}
        </div>
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

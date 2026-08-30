"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ArrowUpRight,
  ChevronDown,
  PanelsTopLeft,
  Rows3,
  SearchX,
  Plus,
  Users,
} from "lucide-react";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { CompanyLogo } from "@/components/ui/CompanyLogo";
import { Avatar } from "@/components/ui/Avatar";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { useToast } from "@/components/ui/Toast";
import { useStoredView } from "@/lib/useStoredView";
import { cn, formatDate } from "@/lib/utils";
import { NewMeetingDialog } from "@/components/meetings/NewMeetingDialog";
import { meetingTypeMeta } from "@/components/meetings/meetingTypeMeta";
import { SolutioningTabs } from "@/components/solutioning/SolutioningTabs";
import {
  groupMeetingsByPeriod,
  type Meeting,
  type MeetingsState,
} from "@/lib/meetings";

export type CustomerOption = { id: string; name: string };
export type ContactOption = {
  id: string;
  name: string;
  customerId: string | null;
  title: string;
};
export type OpportunityOption = {
  id: string;
  label: string;
  customer: string;
  customerId: string | null;
};

/**
 * MEETINGS (Suren, Aug 28): "when I look at the meeting page, all the meetings
 * are there... these are all completed meetings and these are planned
 * meetings."
 *
 * Two rooms, because those are two different questions. Planned answers "what
 * is coming and am I ready", which is why it groups by week or month — "the
 * planned meetings is what I want to see month on month, week on [week]...
 * there will be thousands of meetings". Completed answers "what happened",
 * newest first.
 */

/**
 * EVERYTHING ABOUT ONE MEETING, IN A PANEL.
 *
 * The row's fold and the split view's right pane are the same component rather
 * than two drawings of it (Anir, Aug 30: "you probably want to have the table
 * and the split view too on all the solutioning ones").
 */
function MeetingPanel({ m }: { m: Meeting }) {
  return (
    <div className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-[minmax(0,1fr)_240px]">
                              <div className="min-w-0">
                                <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                  What came out of it
                                </span>
                                {m.notes.length === 0 ? (
                                  <p className="mt-1.5 text-[12.5px] text-text-tertiary">
                                    Nothing written down yet.
                                  </p>
                                ) : (
                                  <p className="mt-1.5 max-w-[68ch] whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary">
                                    {m.notes[m.notes.length - 1].text}
                                  </p>
                                )}
                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-text-secondary">
                                  <span>
                                    <b className="tnum text-text-primary">
                                      {m.notes.length}
                                    </b>{" "}
                                    {m.notes.length === 1 ? "note" : "notes"}
                                  </span>
                                  <span>
                                    <b className="tnum text-text-primary">
                                      {m.docs.length}
                                    </b>{" "}
                                    {m.docs.length === 1 ? "document" : "documents"}
                                  </span>
                                  <Link
                                    href={`/meetings/${m.id}`}
                                    className="font-semibold text-blue-primary hover:underline"
                                  >
                                    Open the meeting
                                  </Link>
                                </div>
                              </div>
                              <div className="min-w-0 sm:border-l sm:border-border-light sm:pl-6">
                                <span className="block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                  Ran it
                                </span>
                                <span className="mt-1.5 flex items-center gap-1.5">
                                  <Avatar name={m.owner} className="h-[20px] w-[20px] text-[7px]" />
                                  <span className="truncate text-[12.5px] text-text-primary">
                                    {m.owner}
                                  </span>
                                </span>
                                <span className="mt-3 block text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                                  From {m.customer}
                                </span>
                                {m.contactNames.length === 0 ? (
                                  <p className="mt-1.5 text-[12.5px] text-text-tertiary">
                                    Nobody recorded.
                                  </p>
                                ) : (
                                  <ul className="mt-1.5 space-y-1">
                                    {m.contactNames.map((n) => (
                                      <li key={n} className="flex items-center gap-1.5">
                                        <Avatar name={n} className="h-[20px] w-[20px] text-[7px]" />
                                        <span className="truncate text-[12.5px] text-text-primary">
                                          {n}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
    </div>
  );
}

export function MeetingsModule({
  state: initial,
  meName,
  members,
  customers,
  contacts,
  opportunities,
}: {
  state: MeetingsState;
  meName: string;
  members: string[];
  customers: CustomerOption[];
  contacts: ContactOption[];
  opportunities: OpportunityOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState(initial);
  const [room, setRoom] = useStoredView<"planned" | "completed">(
    "freyr.meetings.room",
    "planned",
    ["planned", "completed"] as const
  );
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) =>
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [period, setPeriod] = useStoredView<"week" | "month">(
    "freyr.meetings.period",
    "month",
    ["week", "month"] as const
  );
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  /* THE SAME TWO WAYS TO READ A LIST AS EVERY OTHER MODULE (Anir, Aug 30:
     "the table and the split view too on all the solutioning ones"). Meetings
     is the fourth room in that strip, so it gets the toggle as well — the
     grouping by week or month survives into the split's left column. */
  const [view, pickView] = useStoredView<"table" | "split">(
    `freyr.meetings.${room}.view`,
    "table",
    ["table", "split"] as const
  );
  const [pickedId, setPickedId] = useState<string | null>(null);

  const all = state.meetings;
  const planned = all.filter((m) => m.status === "planned");
  const completed = all.filter((m) => m.status === "completed");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (room === "planned" ? planned : completed).filter((m) =>
      !q
        ? true
        : [m.title, m.customer, m.type, m.owner, m.ref, ...m.presenters, ...m.attendees]
            .join(" ")
            .toLowerCase()
            .includes(q)
    );
    return rows;
  }, [room, planned, completed, query]);

  /* Soonest first while planning, most recent first when looking back. */
  const groups = useMemo(() => {
    const g = groupMeetingsByPeriod(shown, period);
    return room === "planned" ? g : [...g].reverse();
  }, [shown, period, room]);

  /** What the split is standing on; the first meeting on screen by default. */
  const picked =
    shown.find((m) => m.id === pickedId) ??
    groups[0]?.meetings?.[0] ??
    null;

  const nextUp = useMemo(
    () =>
      [...planned]
        .filter((m) => m.meetingAt >= new Date().toISOString().slice(0, 10))
        .sort((a, b) => a.meetingAt.localeCompare(b.meetingAt))[0],
    [planned]
  );

  return (
    <div>
      {/* THE FOURTH ROOM, IN THE SAME STRIP (Anir, Aug 28: "you added the
          meetings thing, but there's no fourth thing at the top right"). The
          strip owns the title and the subtitle, so a PageHeader here would
          say the page name twice. */}
      <SolutioningTabs
        active="meetings"
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-4 py-2 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus size={15} strokeWidth={2.4} /> New meeting
          </button>
        }
      >

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={CalendarClock} label="Planned" value={String(planned.length)} color="#0071E3" sub="still to happen" />
        <StatTile icon={CheckCircle2} label="Completed" value={String(completed.length)} color="#16A34A" sub="written up" />
        <StatTile
          icon={CalendarDays}
          label="Next one"
          value={nextUp ? formatDate(nextUp.meetingAt) : "None"}
          color="#7C3AED"
          sub={nextUp ? nextUp.customer : "nothing scheduled"}
        />
        <StatTile
          icon={Users}
          label="Accounts met"
          value={String(new Set(all.map((m) => m.customer)).size)}
          color="#B4318F"
          sub="distinct customers"
        />
      </div>

      {/* The same two-room strip Solutioning and Goals use. */}
      <div role="tablist" className="mt-5 flex flex-wrap items-end gap-x-6 border-b border-border-light">
        {(
          [
            ["planned", "Planned", planned.length],
            ["completed", "Completed", completed.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={room === key}
            onClick={() => setRoom(key)}
            className={cn(
              "-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 pb-2.5 text-[13.5px] transition-colors",
              room === key
                ? "border-blue-primary font-medium text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            )}
          >
            {label}
            <b className="tnum font-semibold">{count}</b>
          </button>
        ))}
      </div>

      <PageToolbar
        className="mt-4"
        query={query}
        onQuery={setQuery}
        placeholder="Search meetings, customers, people…"
        searchAriaLabel="Search meetings"
        sortLabel="Group"
        view={
          <span
            role="group"
            aria-label="How to show meetings"
            className="flex shrink-0 items-center gap-0.5 rounded-full bg-surface p-0.5"
          >
            {(
              [
                { key: "table", label: "Table", icon: Rows3 },
                { key: "split", label: "Split", icon: PanelsTopLeft },
              ] as const
            ).map((o) => {
              const Icon = o.icon;
              const on = view === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => pickView(o.key)}
                  aria-pressed={on}
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold transition-all",
                    on
                      ? "bg-white text-text-primary shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  )}
                >
                  <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
                  {o.label}
                </button>
              );
            })}
          </span>
        }
        sort={
          <ColorSelect
            value={period}
            ariaLabel="Group meetings by"
            minWidth={150}
            onChange={(v) => setPeriod(v as "week" | "month")}
            options={[
              { value: "month", label: "By month", color: "#0071E3", icon: CalendarDays },
              { value: "week", label: "By week", color: "#7C3AED", icon: CalendarClock },
            ]}
          />
        }
      />

      {groups.length === 0 ? (
        <div className="mt-4">
          {/* AN EMPTY LIST AND AN EMPTY SEARCH ARE NOT THE SAME THING.
              Typing a name that matches nothing produced "No meetings planned
              — create a meeting and it shows up here", on a page whose own
              tile said PLANNED 1 two inches above it (found in the browser,
              Aug 28). It told the reader to create a meeting when the thing to
              do was clear the search, and it contradicted the count on the
              same screen. */}
          {query.trim() ? (
            <EmptyState
              icon={SearchX}
              title={`Nothing matches "${query.trim()}"`}
              description={(() => {
                const n = (room === "planned" ? planned : completed).length;
                return `There ${n === 1 ? "is" : "are"} ${n} ${
                  room === "planned" ? "planned" : "completed"
                } ${
                  n === 1 ? "meeting" : "meetings"
                }, none of them matching. Search covers titles, customers and the people in the room.`;
              })()}
              action={
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-blue-primary"
                >
                  Clear the search
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={CalendarClock}
              title={room === "planned" ? "No meetings planned" : "No completed meetings"}
              description={
                room === "planned"
                  ? "Create a meeting and it shows up here, grouped by when it happens."
                  : "A meeting moves here once somebody marks it done."
              }
            />
          )}
        </div>
      ) : view === "split" ? (
        /* THE GROUPING SURVIVES INTO THE LEFT COLUMN. A meeting is read by
           when it is, so week and month headings stay; what changes is that
           the one you pick opens beside the list instead of inside it. */
        <div
          key="split"
          className="tab-panel mt-4 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]"
        >
          <div className="max-h-[720px] overflow-y-auto rounded-xl border border-border-light bg-white">
            {groups.map((g) => (
              <Fragment key={g.key}>
                <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border-light bg-surface px-3 py-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary">
                    {g.label}
                  </span>
                  <span className="tnum ml-auto text-[11px] font-semibold text-text-tertiary">
                    {g.meetings.length}
                  </span>
                </div>
                {[...g.meetings]
                  .sort((a, b) => a.meetingAt.localeCompare(b.meetingAt))
                  .map((m) => {
                    const on = picked?.id === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPickedId(m.id)}
                        aria-current={on ? "true" : undefined}
                        title={m.title}
                        className={cn(
                          "flex w-full cursor-pointer items-start gap-2.5 border-b border-border-light px-3 py-2.5 text-left transition-colors last:border-b-0",
                          on
                            ? "bg-blue-light/50 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]"
                            : "hover:bg-surface"
                        )}
                      >
                        <CompanyLogo
                          name={m.customer}
                          className="mt-0.5 h-7 w-7 shrink-0 text-[9px]"
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-[12.5px] font-semibold",
                              on ? "text-blue-primary" : "text-text-primary"
                            )}
                          >
                            {m.title}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-text-tertiary">
                            <span className="min-w-0 truncate">{m.customer}</span>
                            <span className="shrink-0 tnum">
                              · {formatDate(m.meetingAt)}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
              </Fragment>
            ))}
          </div>
          <div
            key={picked?.id ?? "none"}
            className="tab-panel min-w-0 overflow-hidden rounded-xl border border-border-light bg-white"
          >
            {picked ? (
              <>
                <div className="flex flex-wrap items-center gap-2.5 border-b border-border-light bg-surface px-4 py-3">
                  <CompanyLogo
                    name={picked.customer}
                    className="h-8 w-8 shrink-0 text-[10px]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-text-primary">
                      {picked.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-text-secondary tnum">
                      {picked.customer} · {formatDate(picked.meetingAt)}
                    </span>
                  </span>
                  <Link
                    href={`/meetings/${picked.id}`}
                    title="Open the meeting"
                    aria-label={`Open ${picked.title}`}
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                  >
                    <ArrowUpRight size={15} strokeWidth={2.2} />
                  </Link>
                </div>
                <div className="px-4 py-4">
                  <MeetingPanel m={picked} />
                </div>
              </>
            ) : (
              <p className="px-2 py-10 text-center text-[12.5px] text-text-secondary">
                Pick a meeting on the left.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div key="table" className="tab-panel mt-4 space-y-5">
          {groups.map((g) => (
            <section key={g.key}>
              {/* THE PERIOD IS THE HEADING, not a column (Suren: "month on
                  month, week on week"). A thousand meetings read as a handful
                  of weeks rather than a thousand rows. */}
              <h2 className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
                {g.label}
                {/* A COUNT, NOT PART OF THE DATE (Anir, Aug 28: "this is ugly,
                    looks like it's the year 2026 1"). A bare numeral set in
                    the same weight one space after the year read as a fourth
                    digit of it. A pill is unmistakably a count. */}
                <span className="tnum inline-flex min-w-[20px] items-center justify-center rounded-full bg-surface px-1.5 py-0.5 text-[11px] font-bold normal-case tracking-normal text-text-secondary">
                  {g.meetings.length}
                </span>
                <span className="h-0 flex-1 border-t border-border-light" aria-hidden="true" />
              </h2>
              <ul className="mt-2 divide-y divide-border-light overflow-hidden rounded-xl border border-border-light bg-white">
                {[...g.meetings]
                  .sort((a, b) => a.meetingAt.localeCompare(b.meetingAt))
                  .map((m) => (
                    <li key={m.id}>
                      {/* THE ROW OPENS WHERE IT SITS (Anir, Aug 28: "also
                          probably want the same thing dropdown here"). Same
                          chevron the solutioning rows carry: a glance at who
                          was in the room and what came out of it without
                          leaving the list, and the title still opens the
                          meeting itself. */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleRow(m.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleRow(m.id);
                          }
                        }}
                        className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface/60"
                      >
                        <CompanyLogo name={m.customer} className="h-8 w-8 shrink-0 text-[9px]" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[10.5px] font-bold tnum text-text-tertiary">
                              {m.ref}
                            </span>
                            {/* THE TITLE STILL OPENS THE MEETING (Anir, Aug 28:
                                "couldn't I click on the meeting and go to a
                                separate page before"). Adding the fold-open
                                chevron turned the whole row into a toggle and
                                took the navigation away with it — the same
                                mistake the solutioning table made and fixed:
                                the title is a link, the rest of the row folds,
                                and the link stops the click reaching the
                                toggle. */}
                            <Link
                              href={`/meetings/${m.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="truncate text-[13.5px] font-semibold text-text-primary hover:text-blue-primary hover:underline"
                            >
                              {m.title}
                            </Link>
                            {(() => {
                              const meta = meetingTypeMeta(String(m.type));
                              const TypeIcon = meta.icon;
                              return (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                                  style={{ background: `${meta.color}18`, color: meta.color }}
                                >
                                  <TypeIcon size={10} strokeWidth={2.5} />
                                  {m.type}
                                </span>
                              );
                            })()}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-text-secondary">
                            <span>{m.customer}</span>
                            {m.opportunityLabels.length > 0 && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="truncate">
                                  {m.opportunityLabels.join(", ")}
                                </span>
                              </>
                            )}
                          </span>
                        </span>
                        <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                          {m.presenters.slice(0, 3).map((p) => (
                            <Avatar key={p} name={p} className="h-6 w-6 text-[8px]" />
                          ))}
                          {m.presenters.length > 3 && (
                            <span className="text-[11px] text-text-tertiary tnum">
                              +{m.presenters.length - 3}
                            </span>
                          )}
                        </span>
                        <span className="w-[96px] shrink-0 text-right text-[12.5px] font-semibold tnum text-text-primary">
                          {formatDate(m.meetingAt)}
                        </span>
                        <span
                          aria-hidden="true"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary"
                        >
                          <ChevronDown
                            size={15}
                            strokeWidth={2.2}
                            className={cn(
                              "transition-transform duration-200",
                              openIds.has(m.id) && "rotate-180"
                            )}
                          />
                        </span>
                      </div>
                      {openIds.has(m.id) && (
                        <div className="bg-surface px-4 pb-4 pl-7 pt-1 [box-shadow:inset_3px_0_0_0_var(--blue-primary)]">
                          <div className="tab-panel overflow-hidden rounded-xl border border-border-light bg-white px-4 py-4">
                            <MeetingPanel m={m} />
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {creating && (
        <NewMeetingDialog
          meName={meName}
          members={members}
          customers={customers}
          contacts={contacts}
          opportunities={opportunities}
          onClose={() => setCreating(false)}
          onCreate={async (input) => {
            const res = await fetch("/api/meetings", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ op: "create", ...input }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) {
              toast(data?.error || "That didn't save.", "error");
              return false;
            }
            setState(data.state);
            setCreating(false);
            toast(`${data.meeting.ref} planned for ${input.customer}.`);
            router.refresh();
            return true;
          }}
        />
      )}
      </SolutioningTabs>
    </div>
  );
}

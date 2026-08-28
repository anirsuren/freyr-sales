"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Plus,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
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
  const [period, setPeriod] = useStoredView<"week" | "month">(
    "freyr.meetings.period",
    "month",
    ["week", "month"] as const
  );
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

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

  const nextUp = useMemo(
    () =>
      [...planned]
        .filter((m) => m.meetingAt >= new Date().toISOString().slice(0, 10))
        .sort((a, b) => a.meetingAt.localeCompare(b.meetingAt))[0],
    [planned]
  );

  return (
    <div>
      <PageHeader
        title="Meetings"
        subtitle="Customer meetings: who is in the room on both sides, what was presented, and what came out of it."
        action={
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Plus size={15} strokeWidth={2.4} /> New meeting
          </button>
        }
      />

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <EmptyState
            icon={CalendarClock}
            title={room === "planned" ? "No meetings planned" : "No completed meetings"}
            description={
              room === "planned"
                ? "Create a meeting and it shows up here, grouped by when it happens."
                : "A meeting moves here once somebody marks it done."
            }
          />
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map((g) => (
            <section key={g.key}>
              {/* THE PERIOD IS THE HEADING, not a column (Suren: "month on
                  month, week on week"). A thousand meetings read as a handful
                  of weeks rather than a thousand rows. */}
              <h2 className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
                {g.label}
                <span className="tnum font-semibold text-text-secondary">
                  {g.meetings.length}
                </span>
                <span className="h-0 flex-1 border-t border-border-light" aria-hidden="true" />
              </h2>
              <ul className="mt-2 divide-y divide-border-light overflow-hidden rounded-xl border border-border-light bg-white">
                {[...g.meetings]
                  .sort((a, b) => a.meetingAt.localeCompare(b.meetingAt))
                  .map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/meetings/${m.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface/60"
                      >
                        <CompanyLogo name={m.customer} className="h-8 w-8 shrink-0 text-[9px]" />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[10.5px] font-bold tnum text-text-tertiary">
                              {m.ref}
                            </span>
                            <span className="truncate text-[13.5px] font-semibold text-text-primary">
                              {m.title}
                            </span>
                            <span className="rounded-full bg-blue-light/70 px-2 py-0.5 text-[10.5px] font-semibold text-blue-primary">
                              {m.type}
                            </span>
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
                      </Link>
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
    </div>
  );
}

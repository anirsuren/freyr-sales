"use client";

import { useMemo, useState } from "react";
import { useEscapeToClose } from "@/components/ui/useDismissable";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  visiblePeople,
  scopeStateToPeople,
  type PerformanceState,
  fmtAmount,
  type PrimaryGoal,
} from "@/lib/performanceShared";
import { OrgPerformanceTab } from "./OrgPerformanceTab";
import { SetShareModal } from "./bits";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import {
  MyEntriesCard,
  SentBackCard,
  SentBackWatchCard,
  VerifyQueueCard,
} from "./EntryCards";
import { RoleChip } from "./bits";
import type { RunOp } from "./PerformanceModule";

/**
 * PEOPLE PERFORMANCE — the Org screen pointed at one person (Suren, Aug 15:
 * same UI, same overall structure, everywhere).
 *
 * Same component as Org and Group: four tiles, both charts, the filter row,
 * the goal table with its drill-down. Only the data is narrowed, so "Actual"
 * is what this person logged and "Target" is what they personally carry.
 *
 * You land on yourself. Searching a name shows anyone the server lets you
 * see, which for most people is exactly themselves (Suren, Aug 12: "you
 * cannot list all the people, but if somebody wants to search some people
 * name, then that people name can come").
 */
export function PeopleTab({
  focusGoalId = null,
  state,
  live,
  run,
  meName,
  memberRoles,
  onLogActual,
  onEditGoal,
  onEditSubgoal,
  initialPerson = null,
}: {
  /** Deep-linked goal, opened on arrival. */
  focusGoalId?: string | null;
  state: PerformanceState;
  live: boolean;
  run: RunOp;
  meName: string;
  memberRoles?: Record<string, string>;
  onLogActual: (prefill?: { goalId: string; subgoalId: string | null; person: string }) => void;
  onEditGoal: (g: PrimaryGoal) => void;
  onEditSubgoal: (g: PrimaryGoal, s: PrimaryGoal["subgoals"][number]) => void;
  /** Landed here from a search on another tab: open on that person. */
  initialPerson?: string | null;
}) {
  const router = useRouter();
  /**
   * ONLY THE PEOPLE YOU MAY LOOK AT (Anir, Aug 16: "Restrict"). Admins get the
   * whole workspace; everybody else gets themselves plus the groups they head.
   * See visiblePeople — this list is also what a `?person=` link is validated
   * against below, so a link cannot reach past it.
   */
  const names = useMemo(
    () => visiblePeople(state, meName, memberRoles?.[meName.trim()]),
    [state, meName, memberRoles]
  );
  /** Nobody else you may look at: the name is a label, not a control. */
  const canSwitch = names.length > 1;

  /**
   * HOW MANY GOALS EACH NAME CARRIES (Anir, Aug 30: "when I'm looking at them,
   * let me actually see the goals in this drop-down. Maybe underneath or
   * something, you'll see how many goals there are for each person, so I don't
   * have to click on them to see it").
   *
   * Counted the way this page counts them for the person you are already on:
   * goals assigned to them directly, plus the goals they carry through a group
   * they are in. Picking a name was a blind click before — the only way to know
   * whether somebody had six goals or none was to go and look.
   */
  const goalsPerPerson = useMemo(() => {
    const out = new Map<string, number>();
    for (const n of names) {
      const key = n.trim().toLowerCase();
      const groupsOfMine = (state.groups ?? []).filter((g) =>
        [g.head, ...(g.members ?? [])].some(
          (m) => (m ?? "").trim().toLowerCase() === key
        )
      );
      const groupIds = new Set(groupsOfMine.map((g) => g.id));
      const count = (state.goals ?? []).filter((g) => {
        if ((g.assignments ?? []).some((a) => a.person.trim().toLowerCase() === key))
          return true;
        return (g.groupAssignments ?? []).some((a) => {
          if (!groupIds.has(a.groupId)) return false;
          /* Somebody taken off a group's goal does not carry it. */
          return !(a.excludedPeople ?? []).some(
            (p) => (p ?? "").trim().toLowerCase() === key
          );
        });
      }).length;
      out.set(n, count);
    }
    return out;
  }, [names, state.goals, state.groups]);

  /**
   * A NAME IN A LINK IS A REQUEST, NOT A FACT (found Aug 16, sweeping the
   * detail routes for ids that do not exist). `?person=` seeded the selection
   * with whatever the URL said, unchecked — so
   * /performance/people?person=ZZ Ghost Person drew that name in the picker,
   * generated initials for an avatar beside it, and announced "Nothing
   * assigned to ZZ yet", as though a colleague by that name worked here and
   * had simply been given no goals. A stale link, a misspelling, or somebody
   * who has left all produce it.
   *
   * The workspace's own list of people is right here, so the link only wins
   * when it names one of them. Anything else falls back to the documented
   * default — your own performance — instead of inventing a teammate.
   */
  const validInitial = useMemo(() => {
    const requested = (initialPerson ?? "").trim();
    if (!requested) return null;
    return (
      names.find((n) => n.toLowerCase() === requested.toLowerCase()) ?? null
    );
  }, [initialPerson, names]);

  const [picked, setPicked] = useState<string | null>(validInitial);
  const [pickOpen, setPickOpen] = useState(false);
  useEscapeToClose(pickOpen, () => setPickOpen(false));
  /** The goal whose PERSONAL share is being set — see scope.onSetTarget. */
  const [shareGoal, setShareGoal] = useState<PrimaryGoal | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const person = picked ?? meName;
  const first = person.trim().split(/\s+/)[0] || person;

  const scoped = useMemo(
    () => scopeStateToPeople(state, [person]),
    [state, person]
  );

  /**
   * WHO YOU ARE LOOKING AT. Nothing more — the search that used to live out
   * here was a second box doing what the filter row's box already does (Anir,
   * Aug 15: "why is there a search a person button there? That makes zero
   * sense. There's already a search bar on the left with the filters").
   * People and groups are matched by that one bar now, below.
   */
  const picker = (
    <div className="flex flex-wrap items-center gap-3">
      {/* WHO YOU ARE LOOKING AT, AND HOW TO LOOK AT SOMEONE ELSE.
          Suren, via Anir, Aug 15: "when I go to people performance and then
          look at only Ananth, for that I have to log in as Ananth. What the
          heck?" You never had to — but after the duplicate search box came out
          the only way left was to type a name into the filter bar, which reads
          as filtering YOUR goals, not switching person. So the name itself is
          the control now. */}
      <span className="relative flex items-center gap-2.5">
        <Avatar name={person} className="h-9 w-9 text-[12px]" />
        <span className="min-w-0">
          <button
            type="button"
            onClick={() => canSwitch && setPickOpen((v) => !v)}
            aria-expanded={canSwitch ? pickOpen : undefined}
            disabled={!canSwitch}
            className={cn(
              "flex items-center gap-2 rounded-lg px-1.5 py-0.5 -mx-1.5 text-[14px] font-bold text-text-primary transition-colors",
              canSwitch ? "cursor-pointer hover:bg-surface" : "cursor-default"
            )}
          >
            {person}
            {person === meName && (
              <span className="rounded-full bg-blue-light px-2 py-0.5 text-[10px] font-bold text-blue-primary">
                YOU
              </span>
            )}
            {memberRoles?.[person.trim()] && (
              <RoleChip role={memberRoles[person.trim()]} />
            )}
            {/* No chevron when there is nobody else to switch to — an arrow
                that opens an empty menu is a promise the page cannot keep. */}
            {canSwitch && (
              <ChevronDown
                size={15}
                strokeWidth={2.4}
                aria-hidden="true"
                className={cn(
                  "text-text-tertiary transition-transform",
                  pickOpen && "rotate-180"
                )}
              />
            )}
          </button>
          <span className="block text-[11.5px] text-text-secondary">
            {person !== meName
              ? `viewing ${first}'s goals`
              : canSwitch
                ? "your goals. Pick a name to see somebody else's"
                : "your goals"}
          </span>
        </span>

        {pickOpen && (
          <>
            <span
              className="fixed inset-0 z-20"
              onClick={() => setPickOpen(false)}
              aria-hidden="true"
            />
            <div className="menu-in absolute left-11 top-full z-30 mt-1.5 max-h-[320px] w-[280px] overflow-y-auto rounded-xl border border-border-light bg-white p-1 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]">
              {names.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setPicked(n === meName ? null : n);
                    setPickOpen(false);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface",
                    n === person && "bg-blue-light/50"
                  )}
                >
                  <Avatar name={n} className="h-7 w-7 shrink-0 text-[10px]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-text-primary">
                        {n}
                      </span>
                      {n === meName && (
                        <span className="rounded-full bg-blue-light px-1.5 py-0.5 text-[9px] font-bold text-blue-primary">
                          YOU
                        </span>
                      )}
                      {memberRoles?.[n.trim()] && <RoleChip role={memberRoles[n.trim()]} />}
                    </span>
                    {/* The count, underneath, so picking a name is not a blind
                        click (Anir, Aug 30). */}
                    <span className="block text-[11px] text-text-tertiary tnum">
                      {(() => {
                        const c = goalsPerPerson.get(n) ?? 0;
                        return c === 0
                          ? "no goals yet"
                          : `${c} ${c === 1 ? "goal" : "goals"}`;
                      })()}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </span>
    </div>
  );

  /** Everyone the server lets you see, plus every group, reachable from the
   *  one search bar in the filter row. */
  /**
   * The claim the rejected-claims card sent you to, so the table below can
   * open it and scroll it into view.
   *
   * The counter is load-bearing (Anir, Aug 20: "I pressed Fix It and then I
   * closed it, and now it's not letting me open it again"). Storing the id
   * alone meant pressing Fix it on the SAME claim set state to the value it
   * already held, React saw no change, and the effect that opens the form
   * never re-ran — so the second press did nothing at all.
   */
  const [focusEntry, setFocusEntry] = useState<{ id: string; n: number } | null>(
    null
  );
  const askFix = (id: string) =>
    setFocusEntry((prev) => ({ id, n: (prev?.n ?? 0) + 1 }));

  const jumps = useMemo(
    () => [
      ...names
        .filter((n) => n !== person)
        .map((n) => ({
          kind: "person" as const,
          id: n,
          name: n,
          sub: memberRoles?.[n.trim()],
          go: () => setPicked(n),
        })),
      ...state.groups.map((g) => ({
        kind: "group" as const,
        id: g.id,
        name: g.name,
        sub: `${g.head} · group`,
        go: () => router.push(`/performance/groups?group=${encodeURIComponent(g.id)}`),
      })),
    ],
    [names, person, memberRoles, state.groups, router]
  );

  return (
    <div>
      {/* The verification queue and this person's own entries stay: they are
          about claims, not goals, and the Org screen has no equivalent.

          THE REJECTED ONES GO FIRST, above even the owner's queue: a claim
          somebody has already refused outranks one nobody has read yet. */}
      <div className="mb-4 space-y-4">
        <SentBackCard
          state={state}
          person={person}
          isMe={person === meName}
          onFix={askFix}
        />
        <VerifyQueueCard state={state} run={run} meName={meName} busy={false} />
        {/* WHAT YOU SENT BACK, under what is waiting on you (Anir, Aug 24:
            "where the fuck did it go... it's not showing up anywhere"). The
            verify queue answers "what needs me?"; this answers "what am I
            waiting on?", which had no answer at all on a manager's screen. */}
        <SentBackWatchCard state={state} meName={meName} />
      </div>

      <OrgPerformanceTab
        focusGoalId={focusGoalId}
        state={scoped}
        meName={meName}
        live={live}
        run={run}
        onLogActual={onLogActual}
        /* This button read "Open the Goal Master" and did nothing (Aug 23
           audit). It goes there now. */
        onGoToMaster={() => router.push("/performance/goal-master")}
        onEditGoal={onEditGoal}
        onEditSubgoal={onEditSubgoal}
        scope={{
        subjectKey: person,
          /* "Set target" on a person's row sets THAT PERSON'S share (Anir,
             Aug 23) — the row shows their share, so the button edits it. */
          onSetTarget: (g) => setShareGoal(g),
          goals: scoped.goals,
          noun: "goals",
          picker,
          jumps,
          accent: "#B4318F",
          exportLabel: `person-${person}`,
          // Named after the person you are looking at, so the screen says who
          // it is about before you check which tab is lit (Anir, Aug 15).
          words: {
            trackedLabel:
              person === meName ? "Goals you carry" : `Goals ${first} carries`,
            trackedSub:
              person === meName
                ? "assigned to you or picked up by you"
                : `assigned to ${first} or picked up by them`,
            verifiedSub:
              person === meName
                ? "signed off by your group owner"
                : `signed off by ${first}'s group owner`,
            barTitle:
              person === meName
                ? "How far along you are on each goal"
                : `How far along ${first} is on each goal`,
            donutTitle:
              person === meName ? "Where you stand" : `Where ${first} stands`,
            searchPlaceholder:
              person === meName
                ? "Search your goals and subgoals…"
                : `Search ${first}'s goals and subgoals…`,
          },
          emptyTitle:
            person === meName
              ? "You carry no goals yet"
              : `Nothing assigned to ${person.split(" ")[0]} yet`,
          emptyDescription:
            person === meName
              ? "Pick one up from the Goal Master, or a manager assigns you one. It shows up here with its target and everything you log against it."
              : "A goal reaches someone either way: they pick it up from the Goal Master, or leadership assigns it to them.",
        }}
      />

      <div className="mt-4">
        <MyEntriesCard
          state={state}
          person={person}
          run={run}
          meName={meName}
          focusEntry={focusEntry}
        />
      </div>

      {shareGoal && (() => {
        /* The UNSCOPED goal, for the context line — the scoped copy's target
           IS the share being edited, which is the confusion this fixes. */
        const org = state.goals.find((g) => g.id === shareGoal.id);
        const current =
          (org?.assignments ?? []).find((a) => a.person === person)?.target ?? 0;
        return (
          <SetShareModal
            open
            title={`${first}'s target on ${shareGoal.name}`}
            contextLine={
              org && org.target > 0
                ? `The goal's annual target is ${fmtAmount(org.unit, org.target)}. This sets ${first}'s own share of it.`
                : `This sets ${first}'s own share of this goal. The goal itself has no annual target yet — that lives in the Goal Master.`
            }
            unit={shareGoal.unit}
            initial={current}
            busy={shareBusy}
            onSave={async (target) => {
              setShareBusy(true);
              const ok = await run(
                { op: "assign-goal", goalId: shareGoal.id, person, target },
                `${first}'s target on ${shareGoal.name} is now ${fmtAmount(shareGoal.unit, target)}`
              );
              setShareBusy(false);
              if (ok) setShareGoal(null);
            }}
            onEditGoal={() => {
              const full = state.goals.find((g) => g.id === shareGoal.id);
              setShareGoal(null);
              if (full) onEditGoal(full);
            }}
            onClose={() => setShareGoal(null)}
          />
        );
      })()}
    </div>
  );
}

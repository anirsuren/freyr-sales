"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ChevronDown, ExternalLink, Loader2, Plus, Search, Trash2, Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { tint } from "@/lib/tint";

/**
 * WHO ELSE IS ON THIS DEAL.
 *
 * Anir, Sep 1, looking at the Overview tab: "if I want to add people, how do I
 * do that? Shouldn't that be there? There should be a plus button on people,
 * right, and then I can add people. Obviously, the owner is fine. What about
 * other people?"
 *
 * So the Owner picker above stays exactly as it is, and this is everybody else.
 * The store for them has existed since Aug 28 (lib/recordTeams: "owner is one
 * and then there should be other people is a team") and the customer page has
 * written it since the same week. The deal page never had the door.
 *
 * THIS IS THE SAME DOOR THE CUSTOMER PAGE HAS, in the shape the Overview needs.
 * components/team/RecordTeamButton posts the identical body to the identical
 * route; that one is a button that opens a dialog beside a band, this one is a
 * list that lives inside a section and has to look like the deal's people
 * rather than like a settings screen. Same endpoint, same two facts, so the two
 * can disagree about presentation and never about what is stored.
 *
 * PUTTING SOMEBODY ON A DEAL HANDS THEM THE PEN. Since Sep 1 record membership
 * is what lib/recordScope reads to answer whether a deal is editable, so this
 * is the strongest write on the page and not a note about who to ring. The
 * section says so out loud rather than leaving somebody to discover it: a deal
 * nobody is on is open to anybody with the privilege, and the moment one name
 * goes on it, it belongs to those names.
 *
 * WHICH IS WHY THE SERVER DECIDES, NOT THIS FILE. `mayChangeTeam` is the deal
 * page's own answer from recordWriteRefusal — the same call /api/record-team
 * makes before it writes. Hiding the control is the courtesy; the route is the
 * rule, and a request from somebody who is not on the deal comes back 403 with
 * the reason whether or not they ever saw a button.
 */

/** The two facts the store keeps against one record. Null means nobody. */
export type DealTeam = { owner?: string; members: string[] } | null;

type WorkItem = {
  id: string;
  title: string;
  customer: string;
  role: string;
  status: string;
  due: string | null;
  dateLabel: string;
  href: string;
};
type Workload = {
  deals: WorkItem[];
  solutioning: WorkItem[];
  solutioningAvailable: boolean;
};

/**
 * A NAME THAT MEANS NOBODY, matching lib/recordScope's own list. Every deal
 * imported from the pipeline sheet reads "Unassigned" in its owner column,
 * which is a label rather than a person and must never get a face.
 */
const NOBODY = new Set(["", "unassigned", "none", "nobody", "-", "n/a"]);

function isSomebody(name: string | null | undefined): boolean {
  return typeof name === "string" && !NOBODY.has(name.trim().toLowerCase());
}

function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * ONE PERSON, WITH THEIR FACE ON.
 *
 * Never rendered for a placeholder: Avatar resolves a photo from the NAME, so
 * a row reading "Nobody yet" would go and find somebody's actual headshot for
 * a person who does not exist.
 */
function PersonRow({
  name,
  role,
  tone,
  icon: Icon,
  you,
  action,
}: {
  name: string;
  role: string;
  tone: string;
  icon: typeof Users;
  you: boolean;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border-light bg-surface/60 px-3 py-2.5">
      <Avatar name={name} className="h-9 w-9 shrink-0 text-[12px]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold text-text-primary">
            {name}
          </span>
          {you && (
            <span className="shrink-0 rounded-full bg-blue-light px-1.5 py-0.5 text-[10px] font-bold text-blue-primary">
              You
            </span>
          )}
        </span>
        {/* A ROLE CHIP CARRIES A COLOUR AND AN ICON, never plain words on a
            plain background. Both are the app's blue (Anir, Sep 1: "I don't
            like the colors. Just make them all blue"), so the two roles are
            told apart by their icon and their word rather than by hue. */}
        <span
          className="mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold"
          style={{ background: tint(tone, 8), color: tone }}
        >
          <Icon size={10} strokeWidth={2.6} aria-hidden="true" />
          {role}
        </span>
      </span>
      {action}
    </li>
  );
}

export function DealPeople({
  dealId,
  dealName,
  owner,
  team,
  people,
  meName,
  mayChangeTeam,
}: {
  dealId: string;
  /** For the dialog's title, so it says which deal is being staffed. */
  dealName: string;
  /** The deal's own owner field, live from the picker above this. */
  owner: string;
  /** Who is recorded on the deal today, or null when nobody is. */
  team: DealTeam;
  /** The workspace roster people are picked from. */
  people: string[];
  /** Whoever is looking, so they are marked and sorted first. */
  meName: string;
  /**
   * The server's answer to "may this person change who is on this deal",
   * from recordWriteRefusal — the same call the route makes.
   */
  mayChangeTeam: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [workloads, setWorkloads] = useState<Record<string, Workload>>({});
  const [workloadLoading, setWorkloadLoading] = useState<string | null>(null);
  const [workloadErrors, setWorkloadErrors] = useState<Record<string, string>>({});

  async function showWorkload(name: string, retry = false) {
    if (!retry && same(expanded ?? "", name)) {
      setExpanded(null);
      return;
    }
    setExpanded(name);
    setWorkloadErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
    if (workloads[name] && !retry) return;
    setWorkloadLoading(name);
    try {
      const params = new URLSearchParams({ person: name, excludeDeal: dealId });
      const res = await fetch(`/api/opportunities/team-workload?${params}`);
      const data = await res.json() as Workload & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not load current work.");
      setWorkloads((current) => ({ ...current, [name]: data }));
    } catch (error) {
      setWorkloadErrors((current) => ({ ...current, [name]: error instanceof Error ? error.message : "Could not load current work." }));
    } finally {
      setWorkloadLoading((current) => same(current ?? "", name) ? null : current);
    }
  }

  function workHref(href: string) {
    return pathname?.startsWith("/mock-mode/") ? `/mock-mode${href}` : href;
  }

  /**
   * EVERYBODY ON THE DEAL WHO IS NOT THE OWNER.
   *
   * The store keeps its own owner slot as well as the member list, and this
   * reads BOTH. If the deal's owner field has since been changed to somebody
   * else, the person the store still calls owner is a person who can still
   * edit this deal — so they appear here, as a member, rather than quietly
   * holding the pen from a row nobody draws. Saving the section writes the
   * current owner back into that slot, which heals the drift.
   */
  const others = useMemo(() => {
    const all = [...(team?.owner ? [team.owner] : []), ...(team?.members ?? [])];
    const out: string[] = [];
    for (const n of all) {
      if (!isSomebody(n)) continue;
      if (isSomebody(owner) && same(n, owner)) continue;
      if (out.some((x) => same(x, n))) continue;
      out.push(n);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [team, owner]);

  /** Everyone who could be added: the roster, minus whoever is already on. */
  const addable = useMemo(() => {
    const on = new Set(
      [...others, ...(isSomebody(owner) ? [owner] : [])].map((n) =>
        n.trim().toLowerCase()
      )
    );
    return people
      .filter((n) => isSomebody(n) && !on.has(n.trim().toLowerCase()))
      .sort(
        (a, b) =>
          Number(same(b, meName)) - Number(same(a, meName)) || a.localeCompare(b)
      );
  }, [people, others, owner, meName]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? addable.filter((n) => n.toLowerCase().includes(q)) : addable;
  }, [addable, query]);

  /**
   * WRITE THE WHOLE PICTURE, the way the store expects it.
   *
   * setRecordTeam replaces both facts at once, so a partial body would clear
   * whichever one it left out. The owner slot is always the deal's own owner
   * field: without that, adding the first team member would lock the person
   * whose deal it is out of their own deal.
   */
  async function save(members: string[], done: () => void) {
    setBusy(true);
    try {
      const res = await fetch("/api/record-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "opportunity",
          id: dealId,
          ...(isSomebody(owner) ? { owner } : {}),
          members,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        toast(data?.error || "That did not save.", "error");
        return;
      }
      done();
      router.refresh();
    } catch {
      toast("That did not save.", "error");
    } finally {
      setBusy(false);
    }
  }

  const nobodyOnIt = !isSomebody(owner) && others.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[12px] font-semibold text-text-primary">
          Other people
          <span className="ml-1.5 font-normal text-text-secondary">
            {others.length === 0
              ? "nobody else yet"
              : `${others.length} besides the owner`}
          </span>
        </h4>
        <span className="flex shrink-0 items-center gap-1.5">
          {busy && (
            <Loader2
              size={13}
              aria-hidden="true"
              className="animate-spin text-blue-primary"
            />
          )}
          {/* THE PLUS BUTTON HE ASKED FOR, on the People section, beside the
              heading. Never inside another button: this sits as a sibling of
              the <h4>, which is exactly the nesting mistake that broke
              hydration on /opportunities. */}
          {mayChangeTeam && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPicked([]);
                setQuery("");
                setExpanded(null);
                setWorkloads({});
                setAdding(true);
              }}
              aria-label="Add people to this deal"
              title="Add people to this deal"
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-blue-subtle bg-blue-light text-blue-primary transition-colors hover:bg-blue-subtle disabled:opacity-50"
            >
              <Plus size={14} strokeWidth={2.6} />
            </button>
          )}
        </span>
      </div>

      {others.length === 0 ? (
        /* THE EMPTY BOX IS THE BUTTON (Anir, Sep 15: "I should also be able to
           add people without even clicking the plus. There has to be a place
           where it says 'Nobody else is on this deal.' In the middle, there
           should be some button that says that, and then I can click on it
           because it'll be a lot easier"). The plus beside the heading stays
           for people who already know where it is; this is the target you
           cannot miss, and it opens the same picker.

           NO AVATAR ON A PLACEHOLDER. Avatar resolves a headshot by name, so
           giving an empty row one is how a real person's face lands on a deal
           nobody is on. */
        mayChangeTeam ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPicked([]);
              setQuery("");
              setExpanded(null);
              setWorkloads({});
              setAdding(true);
            }}
            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-light px-3 py-3 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-blue-primary hover:bg-blue-light hover:text-blue-primary disabled:opacity-50"
          >
            <Plus size={14} strokeWidth={2.6} aria-hidden="true" />
            Nobody else is on this deal. Add somebody.
          </button>
        ) : (
          <p className="mt-2 rounded-xl border border-dashed border-border-light px-3 py-2.5 text-[12.5px] text-text-tertiary">
            Nobody else is on this deal.
          </p>
        )
      ) : (
        <ul className="mt-2 space-y-2">
          {others.map((n) => (
            <PersonRow
              key={n}
              name={n}
              role="On the deal"
              tone="var(--ink-bright-blue)"
              icon={Users}
              you={same(n, meName)}
              action={
                mayChangeTeam ? (
                  /* RED, AND BEHIND A CONFIRMATION. Taking somebody off a deal
                     takes their pen away with them, which is exactly the kind
                     of thing a mis-click should not do silently. */
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setRemoving(n)}
                    aria-label={`Take ${n} off this deal`}
                    className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-error transition-colors hover:bg-error/10 disabled:opacity-50"
                  >
                    <Trash2 size={14} strokeWidth={2} />
                  </button>
                ) : undefined
              }
            />
          ))}
        </ul>
      )}

      {/* WHAT PUTTING A NAME HERE ACTUALLY DOES, said plainly, because it is
          not what "team" usually means. Two different sentences, because a deal
          nobody is on genuinely behaves differently from one that has been
          claimed. */}
      <p className="mt-2.5 text-[11.5px] leading-snug text-text-tertiary">
        {nobodyOnIt
          ? "Nobody is on this deal yet, so anybody with Opportunities access can change it. Put a name here and it becomes theirs."
          : "The owner and the people here can change this deal. Everybody else can see it and cannot change it."}
      </p>

      <ConfirmDialog
        open={!!removing}
        person={removing}
        onClose={() => setRemoving(null)}
        busy={busy}
        title="Take them off this deal?"
        body={
          <>
            <b>{removing}</b> comes off {dealName || "this deal"}.
          </>
        }
        detail="They keep seeing the deal. They stop being able to change it."
        confirmLabel="Take them off"
        onConfirm={() => {
          const gone = removing;
          if (!gone) return;
          void save(
            others.filter((n) => !same(n, gone)),
            () => setRemoving(null)
          );
        }}
      />

      {/* A LIST IN A DIALOG GETS A REAL RECTANGLE AND FILLS IT — pinned height,
          the roster scrolling inside it, so the frame never resizes as the
          search narrows it down. */}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title={`Who else is on ${dealName || "this deal"}?`}
        size="workflow"
        tall
        dialogClassName="h-[min(760px,calc(100vh-2rem))]"
        bodyClassName="flex flex-col"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <label className="relative block shrink-0">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find somebody by name"
              aria-label="Find somebody by name"
              className="h-10 w-full rounded-lg border border-border-light bg-white pl-9 pr-3 text-[13px] text-text-primary outline-none transition-shadow focus:border-blue-subtle focus:shadow-input-focus"
            />
          </label>

          <p className="mt-2 text-[12px] text-text-secondary">
            Select a name to see their current work. Use the checkbox to add them.
          </p>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-border-light">
            {shown.length === 0 ? (
              <p className="p-5 text-[13px] text-text-tertiary">
                {addable.length === 0
                  ? "Everybody on this workspace is already on this deal."
                  : "Nobody by that name."}
              </p>
            ) : (
              <ul className="divide-y divide-border-light">
                {shown.map((n) => {
                  const on = picked.some((p) => same(p, n));
                  const isExpanded = same(expanded ?? "", n);
                  const workload = workloads[n];
                  return (
                    <li key={n}>
                      <div
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 transition-colors",
                          on ? "bg-blue-light/60" : isExpanded ? "bg-surface" : "hover:bg-surface"
                        )}
                      >
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={`workload-${n.replace(/[^a-z0-9]/gi, "-")}`}
                          onClick={() => void showWorkload(n)}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary"
                        >
                          <Avatar name={n} className="h-8 w-8 shrink-0 text-[11px]" />
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text-primary">
                            {n}
                          </span>
                          {same(n, meName) && (
                            <span className="shrink-0 rounded-full bg-blue-light px-1.5 py-0.5 text-[10px] font-bold text-blue-primary">
                              You
                            </span>
                          )}
                          {workload && (
                            <span className="shrink-0 text-[11px] text-text-tertiary">
                              {workload.deals.length + workload.solutioning.length} active
                            </span>
                          )}
                          <ChevronDown size={16} className={cn("shrink-0 text-text-tertiary transition-transform", isExpanded && "rotate-180")} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`${on ? "Remove" : "Select"} ${n} ${on ? "from" : "for"} this deal`}
                          aria-pressed={on}
                          onClick={() => setPicked((cur) => on ? cur.filter((p) => !same(p, n)) : [...cur, n])}
                          className={cn(
                            "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-primary",
                            on
                              ? "border-blue-primary bg-blue-primary text-white"
                              : "border-border"
                          )}
                        >
                          {on && <Check size={12} strokeWidth={3} />}
                        </button>
                      </div>
                      {isExpanded && (
                        <div id={`workload-${n.replace(/[^a-z0-9]/gi, "-")}`} className="border-t border-border-light bg-surface/60 px-4 py-4 sm:px-6">
                          {workloadLoading === n && !workload ? (
                            <p className="flex items-center gap-2 text-[12px] text-text-secondary"><Loader2 size={14} className="animate-spin" />Loading current work…</p>
                          ) : workloadErrors[n] && !workload ? (
                            <p className="text-[12px] text-error">{workloadErrors[n]} <button type="button" onClick={() => void showWorkload(n, true)} className="font-semibold underline">Retry</button></p>
                          ) : workload ? (
                            <div className="space-y-4">
                              <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-text-primary">
                                <span className="rounded-full bg-blue-light px-2.5 py-1 text-blue-primary">{workload.deals.length} active deal{workload.deals.length === 1 ? "" : "s"}</span>
                                {workload.solutioningAvailable && <span className="rounded-full bg-blue-light px-2.5 py-1 text-blue-primary">{workload.solutioning.length} Solutioning item{workload.solutioning.length === 1 ? "" : "s"}</span>}
                              </div>
                              {workload.deals.length + workload.solutioning.length === 0 ? (
                                <p className="text-[12px] text-text-secondary">No other active assignments are recorded for {n}.</p>
                              ) : (
                                <div className="grid gap-4 md:grid-cols-2">
                                  {([ ["Deals", workload.deals], ["Solutioning", workload.solutioning] ] as const).map(([label, items]) => items.length > 0 && (
                                    <section key={label}>
                                      <h5 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-tertiary">{label}</h5>
                                      <ul className="space-y-2">
                                        {items.map((item) => (
                                          <li key={item.id} className="rounded-lg border border-border-light bg-white p-2.5">
                                            <a href={workHref(item.href)} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline">
                                              <span className="truncate">{item.title}</span><ExternalLink size={12} className="shrink-0" aria-hidden="true" />
                                            </a>
                                            <p className="mt-0.5 text-[11px] text-text-secondary">{item.customer} · {item.role}</p>
                                            <p className="mt-1 text-[11px] text-text-tertiary">{item.status}{item.due ? ` · ${item.dateLabel} ${new Date(`${item.due}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : ""}</p>
                                          </li>
                                        ))}
                                      </ul>
                                    </section>
                                  ))}
                                </div>
                              )}
                              <p className="text-[11px] text-text-tertiary">Based on recorded assignments; this does not measure hours or availability.</p>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="mt-3 shrink-0 text-[11.5px] leading-snug text-text-tertiary">
            Anybody you add here can change this deal, not just read it.
          </p>

          <div className="mt-3 flex shrink-0 items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="cursor-pointer rounded-lg border border-border-light bg-white px-3.5 py-2 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || picked.length === 0}
              onClick={() =>
                void save([...others, ...picked], () => setAdding(false))
              }
              className="cursor-pointer rounded-lg bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? "Adding…"
                : picked.length === 0
                  ? "Add to the deal"
                  : `Add ${picked.length} to the deal`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronRight, Plus, Package, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { InfoHint } from "@/components/ui/InfoHint";
import { ScrollHint } from "@/components/ui/ScrollHint";
import { useToast } from "@/components/ui/Toast";
import { OfferingActivities } from "@/components/customers/OfferingActivities";
import type {
  CustomerOfferingEngagementVersion,
  OfferingUsage,
} from "@/lib/types";

/**
 * WHERE YOU LOG A LEAD, AN OPPORTUNITY, A PILOT, A CONTRACT, A DELIVERY.
 *
 * These five are Suren's own vocabulary from the workbook, and the tab called
 * "Activity" is where a person goes looking for them. It was showing the
 * interaction log instead — a different, older thing that happens to share the
 * word — so the answer to "why can I not log a customer as that?" was that the
 * only door was buried inside a card on the Offerings tab (Anir, Aug 9: "he
 * went to this page and he expected me to have it so that I could create a new
 * activity").
 *
 * An activity always belongs to a customer AND an offering, so logging one
 * starts by picking the offering. Every offering in the catalogue is offerable
 * here, not just the ones already in use — a Lead is by definition something
 * they are not using yet.
 */
export function CustomerActivityTab({
  customerId,
  usage,
  offerings,
  canEdit,
  children,
}: {
  customerId: string;
  usage: OfferingUsage[];
  offerings: Array<{ id: string; name: string; category?: string | null }>;
  canEdit: boolean;
  /** The interaction log, kept below as the touch history it always was. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [state, setState] = useState<OfferingUsage[]>(usage);
  /** Offerings the reader has folded shut. Open is the default, because a
   *  collapsed-by-default list hides the thing the tab exists to show. */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggleOffering(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const [picking, setPicking] = useState(false);
  /** Offering section pending removal (Anir, Aug 18: "How do I delete them?
   *  There's no button… only a button to delete the activity, not the
   *  offering"). */
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const byId = new Map(offerings.map((o) => [o.id, o]));
  // Offerings with a history, newest activity first, so the account's live
  // work is what you land on.
  const withActivity = state
    .filter((u) => (u.engagement_versions || []).length > 0 && byId.has(u.offering_id))
    .sort(
      (a, b) =>
        (b.engagement_versions?.length || 0) - (a.engagement_versions?.length || 0)
    );

  const total = withActivity.reduce(
    (sum, u) => sum + (u.engagement_versions?.length || 0),
    0
  );

  async function save(
    offeringId: string,
    versions: CustomerOfferingEngagementVersion[]
  ) {
    const existing = state.find((u) => u.offering_id === offeringId);
    const next = state.filter((u) => u.offering_id !== offeringId);
    if (versions.length || existing?.revenue_lines?.length) {
      next.push({
        offering_id: offeringId,
        revenue_lines: existing?.revenue_lines || [],
        engagement_versions: versions,
        engagement_draft: existing?.engagement_draft ?? null,
      });
    }
    setState(next);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offering_usage: next }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("Activity saved.");
        router.refresh();
      } else {
        toast(data.error || "Couldn't save that.", "error");
      }
    } catch {
      toast("Couldn't save that.", "error");
    }
  }

  /** Start a history for an offering that has none, so its card appears. */
  /** The offering whose editor should open itself on next render — set by the
   *  picker, consumed by that offering's OfferingActivities. */
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [pickQuery, setPickQuery] = useState("");
  const pickNeedle = pickQuery.trim().toLowerCase();
  const shownOfferings = pickNeedle
    ? offerings.filter((o) =>
        `${o.name} ${o.category ?? ""}`.toLowerCase().includes(pickNeedle)
      )
    : offerings;

  function begin(offeringId: string) {
    setPicking(false);
    /* PICKING AN OFFERING OPENS ITS EDITOR (Anir, Sep 4: "if I click on one,
       it doesn't do anything, bro"). This used to close the dialog and, when
       the offering was already on the account — which it is for every row
       wearing an "N logged" badge — return without doing anything at all: no
       scroll, no editor, no visible consequence of the click. Now the group
       unfolds, the page walks to it, and the activity form is already open
       when you arrive, whether the offering was on the account or not. */
    if (!state.some((u) => u.offering_id === offeringId)) {
      setState((prev) => [
        ...prev,
        {
          offering_id: offeringId,
          revenue_lines: [],
          engagement_versions: [],
          engagement_draft: null,
        },
      ]);
    }
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.delete(offeringId);
      return next;
    });
    setAddingFor(offeringId);
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-offering-group="${offeringId}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function removeOffering(offeringId: string) {
    setConfirmRemove(null);
    const next = state.filter((u) => u.offering_id !== offeringId);
    setState(next);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offering_usage: next }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("Offering removed from this account.");
        router.refresh();
      } else {
        toast(data.error || "Couldn't remove that.", "error");
      }
    } catch {
      toast("Couldn't remove that.", "error");
    }
  }

  const started = state.filter((u) => byId.has(u.offering_id));

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-[16px] font-semibold text-text-primary">
              Offering activity
              <InfoHint text={"There are five kinds of activity: Lead, Opportunity, Pilot, Contract and Delivery.\nEach one is either Initiated, Under progress or Completed.\nOne activity per offering is marked Current, and that is the one the Coverage heat map shows."} />
            </h2>
            <p className="mt-0.5 text-[12.5px] text-text-secondary">
              {total > 0
                ? `${total} logged across ${withActivity.length} ${
                    withActivity.length === 1 ? "offering" : "offerings"
                  }.`
                : "Every lead, opportunity, pilot, contract and delivery for this account."}
            </p>
          </div>
          {canEdit && (
            <Button className="shrink-0" onClick={() => setPicking(true)}>
              <Plus size={14} strokeWidth={2.2} /> Log an activity
            </Button>
          )}
        </div>

        {started.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-white px-6 py-10 text-center">
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-light text-blue-primary">
              <Package size={20} strokeWidth={1.8} />
            </span>
            <p className="text-[14px] font-semibold text-text-primary">
              Nothing logged for this account yet.
            </p>
            <p className="mx-auto mt-1 max-w-[420px] text-[12.5px] text-text-secondary">
              Pick the offering you are selling and say where it stands. A first
              conversation is a Lead. A paid trial is a Pilot. You can also log
              something that has not happened yet by giving it a future date.
            </p>
            {canEdit && (
              <Button className="mt-4" onClick={() => setPicking(true)}>
                <Plus size={14} strokeWidth={2.2} /> Log the first activity
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {[...started]
              .sort(
                (a, b) =>
                  (b.engagement_versions?.length || 0) -
                  (a.engagement_versions?.length || 0)
              )
              .map((u) => {
                const offering = byId.get(u.offering_id)!;
                const logged = (u.engagement_versions || []).length;
                const open = !collapsed.has(u.offering_id);
                return (
                  <div
                    key={u.offering_id}
                    data-offering-group={u.offering_id}
                    className="entry-card p-4 scroll-mt-4"
                  >
                    {/* EACH OFFERING FOLDS (Anir, Aug 9: "since they're grouped
                        by offering, let's have drop-downs for each of them").
                        An account on eight offerings was eight stacked tables
                        you had to scroll past to reach the one you came for.
                        The header is the control, so the whole strip is the hit
                        target, and the count stays visible while it is shut. */}
                    <button
                      type="button"
                      onClick={() => toggleOffering(u.offering_id)}
                      aria-expanded={open}
                      /* mb-2 pb-2.5, was mb-3.5 pb-3 (Anir, Sep 4: "you see
                         how far the start of the table is from the header?").
                         The header's bottom padding, this margin, the panel's
                         own pt and the column row's padding all stacked into
                         ~40px of nothing between the offering name and its
                         table. The rule stays; the air goes. */
                      className={`-mx-4 flex w-[calc(100%+2rem)] cursor-pointer items-center gap-2.5 px-4 text-left transition-colors hover:bg-surface/60 ${
                        open ? "entry-card__head mb-2 pb-2.5" : "pb-0"
                      }`}
                    >
                      <ChevronRight
                        size={15}
                        strokeWidth={2.2}
                        className={`shrink-0 text-text-tertiary transition-transform duration-200 ${
                          open ? "rotate-90" : ""
                        }`}
                      />
{/* No glyph beside the offering name (Anir, Sep 2: "can you just
                          remove these icons from all the offering names?
                          They're not really needed"). */}
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold text-text-primary">
                          {offering.name}
                        </span>
                        {offering.category && (
                          <span className="block text-[11.5px] text-text-tertiary">
                            {offering.category}
                          </span>
                        )}
                      </span>
                      {/* AN EMPTY OFFERING HAS TO SAY SO WHILE IT IS SHUT
                          (Anir, Aug 28: "if this one does not have an activity
                          put something so that even when i have it closed it
                          shows up that i need to add it"). "0 activities" in
                          the same quiet grey as "4 activities" is a count, not
                          a prompt: you had to read the number to notice. A
                          missing activity is work owed, so it wears the amber
                          every other piece of owed work wears here. */}
                      {logged === 0 ? (
                        <span className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[rgba(180,83,9,0.1)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--ink-amber)]">
                          <AlertTriangle size={11} strokeWidth={2.4} aria-hidden="true" />
                          No activity yet
                        </span>
                      ) : (
                        <span className="ml-auto shrink-0 whitespace-nowrap text-[11.5px] font-semibold text-text-secondary tnum">
                          {logged} {logged === 1 ? "activity" : "activities"}
                        </span>
                      )}
                      {canEdit && (
                        /* Inside the header BUTTON, so it is a span with a
                           button role — nested <button>s are invalid HTML. */
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Remove ${offering.name} from this account`}
                          title="Remove this offering from the account"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmRemove(u.offering_id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              setConfirmRemove(u.offering_id);
                            }
                          }}
                          className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-[color:var(--status-red)] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
                        >
                          <Trash2 size={14} strokeWidth={2.1} />
                        </span>
                      )}
                    </button>
                    {open && (
                      <div className="tab-panel">
                        <OfferingActivities
                          customerId={customerId}
                          versions={u.engagement_versions || []}
                          onSave={(versions) => void save(u.offering_id, versions)}
                          startAdding={addingFor === u.offering_id}
                          onStartedAdding={() => setAddingFor(null)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </section>

      {children && (
        <section className="border-t border-border-light pt-5">
          <h2 className="text-[16px] font-semibold text-text-primary">
            Interactions
          </h2>
          <p className="mb-3 mt-0.5 text-[12.5px] text-text-secondary">
            Calls, emails and meetings as they were logged. Separate from the
            five activities above.
          </p>
          {children}
        </section>
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && void removeOffering(confirmRemove)}
        title="Remove this offering from the account?"
        body={(() => {
          if (!confirmRemove) return "";
          const u = state.find((x) => x.offering_id === confirmRemove);
          const n = u?.engagement_versions?.length || 0;
          const name = byId.get(confirmRemove)?.name ?? "this offering";
          return n > 0
            ? `${name} and its ${n} logged ${n === 1 ? "activity" : "activities"} come off this account. The offering itself stays in the catalogue.`
            : `${name} comes off this account. Nothing has been logged on it, so nothing else is lost.`;
        })()}
        confirmLabel="Remove it"
      />

      {/* WIDE, TALL, PINNED, SEARCHABLE (Anir, Sep 4: "I don't even know why
          the screen is so small. There should be a search part here" — and the
          standing rule: a list in a dialog gets a wide, fixed-height frame the
          list FILLS). The catalogue is 29 offerings and growing; a palm-sized
          scroll box with no search was a list you had to spelunk. */}
      <Modal
        open={picking}
        onClose={() => {
          setPicking(false);
          setPickQuery("");
        }}
        size="workflow"
        title="Which offering is this activity for?"
      >
        <p className="mb-3 text-[12.5px] text-text-secondary">
          Every activity belongs to one offering. Pick the offering and the
          editor opens below it.
        </p>
        <input
          value={pickQuery}
          onChange={(e) => setPickQuery(e.target.value)}
          placeholder="Search the catalogue…"
          aria-label="Search offerings"
          autoFocus
          className="mb-3 h-10 w-full shrink-0 rounded-md border border-border bg-surface px-3.5 text-[14px] outline-none transition focus:border-blue-primary focus:shadow-focus"
        />
        {/* FIXED HEIGHT ON THE LIST ITSELF (the popup-size rule: the frame
            never moves). h-[560px] on the modal body lost to its own flex
            sizing, so the dialog grew with the catalogue and shrank the
            moment the search cut it to one row. The list area is pinned
            instead: 29 offerings scroll inside it, one result leaves the
            frame exactly where it was. */}
        <ScrollHint className="h-[420px]">
          <ul className="space-y-1.5">
            {shownOfferings.length === 0 && (
              <li className="py-8 text-center text-[13px] text-text-tertiary">
                Nothing in the catalogue matches “{pickQuery.trim()}”.
              </li>
            )}
            {shownOfferings.map((offering) => {
              const logged =
                state.find((u) => u.offering_id === offering.id)
                  ?.engagement_versions?.length || 0;
              return (
                <li key={offering.id}>
                  <button
                    type="button"
                    onClick={() => begin(offering.id)}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border-light px-3 py-2 text-left transition-colors hover:border-blue-subtle hover:bg-blue-light/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-text-primary">
                        {offering.name}
                      </span>
                      {offering.category && (
                        <span className="block text-[11px] text-text-tertiary">
                          {offering.category}
                        </span>
                      )}
                    </span>
                    {logged > 0 && (
                      <span className="shrink-0 rounded-full bg-blue-light px-2 py-0.5 text-[11px] font-semibold text-blue-primary tnum">
                        {logged} logged
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollHint>
      </Modal>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Package, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { InfoHint } from "@/components/ui/InfoHint";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
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
  function begin(offeringId: string) {
    setPicking(false);
    if (state.some((u) => u.offering_id === offeringId)) return;
    setState([
      ...state,
      {
        offering_id: offeringId,
        revenue_lines: [],
        engagement_versions: [],
        engagement_draft: null,
      },
    ]);
  }

  const started = state.filter((u) => byId.has(u.offering_id));

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-[16px] font-semibold text-text-primary">
              Offering activity
              <InfoHint text="There are five kinds of activity: Lead, Opportunity, Pilot, Contract and Delivery. Each one is either Initiated, Under progress or Completed. One activity per offering is marked Current, and that is the one the heat map reads." />
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
              Pick the offering you are selling and record where it stands, a
              first conversation is a Lead, a paid trial is a Pilot. You can log
              one that has not happened yet by dating it in the future.
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
                  <div key={u.offering_id} className="entry-card p-4">
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
                      className={`entry-card__head -mx-4 flex w-[calc(100%+2rem)] cursor-pointer items-center gap-2.5 px-4 text-left transition-colors hover:bg-surface/60 ${
                        open ? "mb-3.5 pb-3" : "pb-0"
                      }`}
                    >
                      <ChevronRight
                        size={15}
                        strokeWidth={2.2}
                        className={`shrink-0 text-text-tertiary transition-transform duration-200 ${
                          open ? "rotate-90" : ""
                        }`}
                      />
                      <OfferingIcon name={offering.name} className="h-8 w-8 shrink-0" />
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
                      <span className="ml-auto shrink-0 whitespace-nowrap text-[11.5px] font-semibold text-text-secondary tnum">
                        {logged} {logged === 1 ? "activity" : "activities"}
                      </span>
                    </button>
                    {open && (
                      <div className="tab-panel">
                        <OfferingActivities
                          versions={u.engagement_versions || []}
                          onSave={(versions) => void save(u.offering_id, versions)}
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

      <Modal
        open={picking}
        onClose={() => setPicking(false)}
        title="Which offering is this activity for?"
      >
        <p className="mb-3 text-[12.5px] text-text-secondary">
          Every activity belongs to one offering. Pick the offering and the
          editor opens below it.
        </p>
        <ScrollHint className="max-h-80">
          <ul className="space-y-1.5">
            {offerings.map((offering) => {
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
                    <OfferingIcon name={offering.name} className="h-7 w-7 shrink-0" />
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
        <div className="mt-4 flex justify-end">
        </div>
      </Modal>
    </div>
  );
}

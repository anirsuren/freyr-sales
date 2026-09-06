"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { EditDealDialog } from "./EditDealDialog";
import { AccrualPlanDialog } from "@/components/accruals/AccrualPlanDialog";
import type { DealTeam } from "./DealPeople";
import type { Opportunity } from "@/lib/opportunitiesShared";

/**
 * THE CLIENT HALF OF THE EDIT PAGE.
 *
 * The page itself is a server component, so the save call and the refresh live
 * here. It is deliberately thin: the form is the same component the deal page's
 * Overview tab renders, so the two can never drift.
 *
 * VIEW-ONLY IS NOT A DIFFERENT SCREEN. It used to be a card saying "this deal
 * is not yours to change" and nothing else, so somebody without the pen could
 * not even read the deal's own figures here. The editor draws every field as a
 * value instead of a control and says why at the top, which is the same answer
 * and a usable page.
 */
export function DealEditScreen({
  deal,
  customers = [],
  offerings = [],
  people = [],
  meName = "",
  team = null,
  mayChangeTeam = false,
  mayEdit,
  mayDelete = false,
  why,
  accrual = null,
}: {
  deal: Opportunity;
  customers?: { id: string; name: string }[];
  offerings?: { id: string; name: string; type?: string }[];
  people?: string[];
  meName?: string;
  /** Who is on the deal, so the People section reads the same here as on the
   *  Overview tab — one form, one set of facts, either door. */
  team?: DealTeam;
  mayChangeTeam?: boolean;
  mayEdit: boolean;
  /** Deleting is its own privilege, asked the way the route asks it. */
  mayDelete?: boolean;
  why: string;
  /**
   * THE ACCRUAL SCHEDULE LIVES ON THIS SCREEN NOW.
   *
   * It was mounted on the deal's Overview tab, which is where Manoj asked for
   * it (his item 5). Anir took editing off the overview entirely on Sep 3 —
   * "I have to press edit deal to edit anything" — and Edit deal is this page.
   * So the same component comes here: Manoj still gets the whole month-on-month
   * scheduler beside the deal's own fields, on the screen you open to change
   * something rather than the one you open to read.
   */
  accrual?: {
    mayPlan: boolean;
    plan: NonNullable<React.ComponentProps<typeof AccrualPlanDialog>["plans"]>[number] | null;
    deal: NonNullable<React.ComponentProps<typeof AccrualPlanDialog>["deals"]>[number];
  } | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /**
   * DELETING THE DEAL, FROM THE SCREEN YOU OPEN TO CHANGE IT.
   *
   * Anir, Sep 6: "on this edit new opportunity screen, we probably need a
   * delete button at the very end. Same for like everything. And make sure to
   * have popup confirmation." The list had a remove; the edit screen did not,
   * so the one place you go to fix a deal was the one place you could not
   * scrap it.
   *
   * Same op the list uses — one route, one set of rules — and the route takes
   * the deal's accrual plan and its unverified met entries with it.
   */
  async function remove() {
    setDeleting(true);
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "remove", id: deal.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "That didn't delete.");
      toast(`${deal.name || "The deal"} deleted.`);
      setConfirming(false);
      router.push("/opportunities");
      router.refresh();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "That didn't delete.",
        "error"
      );
      setDeleting(false);
    }
  }

  return (
    <>
    <EditDealDialog
      asPage
      deal={deal}
      mayEdit={mayEdit}
      why={why}
      customers={customers}
      offerings={offerings}
      people={people}
      meName={meName}
      team={team}
      mayChangeTeam={mayChangeTeam}
      accrualPlan={accrual?.plan ?? null}
      /* THE SAME COMPONENT THE ACCRUALS MODULE MOUNTS, without its modal
         chrome — not a copy, so the two cannot drift (Suren, Sep 1: "both the
         screens have to be the same"). */
      accrualScheduler={
        accrual?.mayPlan && mayEdit ? (
          <AccrualPlanDialog
            inline
            dealId={accrual.deal.id}
            deals={[accrual.deal]}
            pickable={[]}
            plans={accrual.plan ? [accrual.plan] : []}
            onClose={() => undefined}
            onSaved={() => router.refresh()}
          />
        ) : null
      }
      /* NOTHING NAVIGATES ON SAVE ANY MORE. Each field commits on its own, so
         a push back to the deal would fire the moment somebody left the first
         box and take the rest of the form away with it. */
      onClose={() => router.push(`/opportunities/${deal.id}`)}
      onSaved={() => router.refresh()}
      onSave={async (patch) => {
        const send = () =>
          fetch("/api/opportunities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            /* SPREAD, NOT NESTED. The route reads the changed fields off the
               TOP LEVEL of the body (`body(raw)` in app/api/opportunities), so
               a `patch` object was never looked at and every field arrived
               undefined: the page navigated back cheerfully and saved nothing. */
            body: JSON.stringify({ op: "update", id: deal.id, ...patch }),
          });

        let res = await send();

        /**
         * A TIMED-OUT PASS IS NOT A REFUSAL (Anir, Sep 4).
         *
         * The workspace pass lasts fifteen minutes and every navigation
         * quietly renews it — but this screen is one somebody SITS on, staging
         * edits without saving. Take a call, come back, press Save, and the
         * pass has lapsed: the route answered 403 "Workspace owner approval
         * required", which reads as a permissions problem and sends people
         * hunting for an admin. Pressing Save again did nothing, because
         * nothing on this page renewed it. The only thing that did was
         * reloading, and reloading throws away everything typed.
         *
         * So: on that one specific answer, renew the pass and send the save
         * again. A real permission refusal (a deal that is not yours) says
         * something else and is passed straight through untouched.
         */
        if (res.status === 403) {
          const body = await res.clone().json().catch(() => ({}));
          if (/approval required/i.test(String(body?.error ?? ""))) {
            await fetch("/api/auth/access", { method: "POST" }).catch(() => undefined);
            res = await send();
          }
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) return data?.error || "That did not save.";
        return null;
      }}
    >
      {/* AT THE VERY END, AND RED. Nothing else on this screen is
          destructive, so it gets its own band rather than sitting in the run
          of fields — and it asks first. */}
      {mayDelete && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(220,38,38,0.25)] bg-[rgba(220,38,38,0.04)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-text-primary">
              Delete this deal
            </p>
            <p className="text-[12px] text-text-secondary">
              It comes off the pipeline and off any goal that counted it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(220,38,38,0.35)] bg-white px-3.5 py-2 text-[13px] font-semibold text-[color:var(--status-red)] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
          >
            <Trash2 size={14} strokeWidth={2} />
            Delete deal
          </button>
        </div>
      )}
    </EditDealDialog>

    <ConfirmDialog
      open={confirming}
      onClose={() => setConfirming(false)}
      onConfirm={() => void remove()}
      busy={deleting}
      tone="destructive"
      title="Delete this deal?"
      body={
        <>
          <b>{deal.name || "This deal"}</b> comes off the pipeline, and off any
          goal that counted it as a line item. Its accrual plan goes with it.
        </>
      }
      detail="Results already verified against it stay; they simply stop naming a deal."
      confirmLabel="Delete deal"
    />
    </>
  );
}

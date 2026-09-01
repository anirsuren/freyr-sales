"use client";

import { useRouter } from "next/navigation";
import { EditDealDialog } from "./EditDealDialog";
import { InfoHint } from "@/components/ui/InfoHint";
import type { Opportunity } from "@/lib/opportunitiesShared";
import type { Customer360Band } from "@/components/customers/Customer360";

/**
 * THE CLIENT HALF OF THE EDIT PAGE.
 *
 * The page itself is a server component, so the save call, the router refresh
 * and the "you may only look" case live here. It is deliberately thin: the
 * form is the same component the customer screen opens inline, asked to render
 * as a page instead of as a dialog, so the two can never drift.
 */
export function DealEditScreen({
  deal,
  bands,
  createOptions,
  mayEdit,
  why,
}: {
  deal: Opportunity;
  bands: Customer360Band[];
  createOptions: React.ComponentProps<typeof EditDealDialog>["createOptions"];
  mayEdit: boolean;
  why: string;
}) {
  const router = useRouter();

  /* Read-only is said once, at the top, rather than by an editor that refuses
     every field one at a time. */
  if (!mayEdit) {
    return (
      <div className="rounded-2xl border border-border-light bg-white p-6">
        <p className="text-[14px] font-semibold text-text-primary">
          This deal is not yours to change
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-text-secondary">
          {why}
          <InfoHint text={why} />
        </p>
      </div>
    );
  }

  return (
    <EditDealDialog
      asPage
      deal={deal}
      bands={bands}
      createOptions={createOptions}
      onCreated={() => router.refresh()}
      onClose={() => router.push(`/opportunities/${deal.id}`)}
      onSave={async (patch) => {
        const res = await fetch("/api/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          /* SPREAD, NOT NESTED. The route reads the changed fields off the
             TOP LEVEL of the body (`body(raw)` in app/api/opportunities), so a
             `patch` object was never looked at and every field arrived
             undefined: the page navigated back cheerfully and saved nothing.

             Found in the loop by editing a probe deal's name, pressing Save,
             and reading the store back — the name had not moved. The dialog
             version in OpportunityDetail has always spread it, which is why
             the old flow worked and this one silently did not. */
          body: JSON.stringify({ op: "update", id: deal.id, ...patch }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) return data?.error || "That did not save.";
        router.push(`/opportunities/${deal.id}`);
        router.refresh();
        return null;
      }}
    />
  );
}

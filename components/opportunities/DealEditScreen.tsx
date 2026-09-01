"use client";

import { useRouter } from "next/navigation";
import { EditDealDialog } from "./EditDealDialog";
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
  why,
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
  why: string;
}) {
  const router = useRouter();

  return (
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
      /* NOTHING NAVIGATES ON SAVE ANY MORE. Each field commits on its own, so
         a push back to the deal would fire the moment somebody left the first
         box and take the rest of the form away with it. */
      onClose={() => router.push(`/opportunities/${deal.id}`)}
      onSaved={() => router.refresh()}
      onSave={async (patch) => {
        const res = await fetch("/api/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          /* SPREAD, NOT NESTED. The route reads the changed fields off the
             TOP LEVEL of the body (`body(raw)` in app/api/opportunities), so a
             `patch` object was never looked at and every field arrived
             undefined: the page navigated back cheerfully and saved nothing. */
          body: JSON.stringify({ op: "update", id: deal.id, ...patch }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.error) return data?.error || "That did not save.";
        return null;
      }}
    />
  );
}

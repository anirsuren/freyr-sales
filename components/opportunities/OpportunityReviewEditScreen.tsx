"use client";

import { useRouter } from "next/navigation";
import type { OpportunityReview, OpportunityReviewOptions } from "@/lib/opportunitiesShared";
import { OpportunityReviewTab } from "./OpportunityReviewTab";

export function OpportunityReviewEditScreen({ dealId, review, options, copiedFromId }: { dealId: string; review?: OpportunityReview; options: OpportunityReviewOptions; copiedFromId?: string }) {
  const router = useRouter();
  const back = () => router.push(`/opportunities/${dealId}?tab=review`);

  async function save(next: OpportunityReview, reviewedOn: string) {
    try {
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "update", id: dealId, review: next, reviewDate: reviewedOn, copiedFromReviewId: copiedFromId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return { error: data?.error || "That didn't save." };
      router.refresh();
      return { error: null, review: data?.opportunity?.review as OpportunityReview | undefined };
    } catch {
      return { error: "That didn't save." };
    }
  }

  return <OpportunityReviewTab review={review} mayEdit dealId={dealId} editPage onSave={save} onCancel={back} options={options} copiedFromId={copiedFromId} />;
}

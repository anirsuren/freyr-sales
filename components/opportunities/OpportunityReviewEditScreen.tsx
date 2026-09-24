"use client";

import { useRouter } from "next/navigation";
import type { OpportunityReview } from "@/lib/opportunitiesShared";
import { OpportunityReviewTab } from "./OpportunityReviewTab";

export function OpportunityReviewEditScreen({ dealId, review }: { dealId: string; review?: OpportunityReview }) {
  const router = useRouter();
  const back = () => router.push(`/opportunities/${dealId}?tab=review`);

  async function save(next: OpportunityReview) {
    try {
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "update", id: dealId, review: next }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) return { error: data?.error || "That didn't save." };
      router.refresh();
      return { error: null, review: data?.opportunity?.review as OpportunityReview | undefined };
    } catch {
      return { error: "That didn't save." };
    }
  }

  return <OpportunityReviewTab review={review} mayEdit dealId={dealId} editPage onSave={save} onCancel={back} />;
}

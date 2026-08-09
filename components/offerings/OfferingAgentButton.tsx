"use client";

import { Sparkles } from "lucide-react";
import { askFreyrAgent } from "@/lib/agentEvents";

export function OfferingAgentButton({
  offeringId,
  offeringName,
}: {
  offeringId: string;
  offeringName: string;
}) {
  // THE PAGE ALREADY NAMES THE OFFERING. Repeating it made the widest button
  // on the row and pushed the header into a second line (Anir, Aug 8: "these
  // four buttons look so bad, just one after the other"). The full sentence
  // stays as the tooltip and the accessible name.
  const label = "Ask Freyr AI";
  const fullLabel = `Ask Freyr AI about ${offeringName}`;

  return (
    <button
      type="button"
      onClick={() =>
        askFreyrAgent({
          offering: { id: offeringId, name: offeringName },
          newConversation: true,
        })
      }
      aria-label={fullLabel}
      title={fullLabel}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border-light bg-white px-3 py-2 text-[13px] font-medium text-text-primary transition-colors hover:border-blue-subtle hover:bg-blue-light hover:text-blue-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary focus-visible:ring-offset-2"
    >
      <Sparkles size={14} strokeWidth={2} className="shrink-0" />
      <span>{label}</span>
    </button>
  );
}

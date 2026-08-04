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
  const label = `Ask Freyr AI about ${offeringName}`;

  return (
    <button
      type="button"
      onClick={() =>
        askFreyrAgent({
          offering: { id: offeringId, name: offeringName },
          newConversation: true,
        })
      }
      aria-label={label}
      title={label}
      className="inline-flex max-w-[330px] items-center gap-2 whitespace-nowrap rounded-md bg-blue-primary px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,113,227,0.20)] transition-all hover:bg-blue-hover hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary focus-visible:ring-offset-2"
    >
      <Sparkles size={15} strokeWidth={2} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

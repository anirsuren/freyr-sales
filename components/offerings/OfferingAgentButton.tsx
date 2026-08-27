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
      /* Not another outlined rectangle (Anir, Aug 27: "it's just a regular
         button, it should look a little bit better"). The gradient, glow and
         one-pass sheen live in .ai-button — see globals.css — so anywhere
         else the assistant is offered can wear the same identity. */
      className="ai-button group/ai inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary focus-visible:ring-offset-2"
    >
      <Sparkles
        size={14}
        strokeWidth={2.4}
        className="relative shrink-0 transition-transform duration-300 group-hover/ai:rotate-12 group-hover/ai:scale-110"
      />
      <span className="relative">{label}</span>
    </button>
  );
}

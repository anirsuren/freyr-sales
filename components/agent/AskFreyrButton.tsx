"use client";

import { Sparkles } from "lucide-react";
import { askFreyrAgent, type AgentOfferingContext } from "@/lib/agentEvents";
import { cn } from "@/lib/utils";

/**
 * ASK FREYR AI, ON ANY RECORD PAGE.
 *
 * Anir, Sep 2: "I want to ask the Freyr AI thing on the FDL components page
 * too... is there anywhere else you think the Ask Freyr AI button should be?"
 *
 * `OfferingAgentButton` already did this, but only for offerings: it took an
 * offeringId and an offeringName and could not be pointed at anything else.
 * Rather than copy its markup onto a second page and let the two drift, this
 * is the same button with the record it is about handed in.
 *
 * WHY A PROMPT AND NOT A FAKE OFFERING. The agent's structured context slot
 * (`AgentOfferingContext`) means an offering specifically, and the assistant
 * reads it as one. Passing a component through it would have the agent believe
 * a component is an offering, which is the kind of quiet lie that produces a
 * confidently wrong answer. So a caller with a real offering passes `offering`
 * and gets the structured path; everybody else passes `prompt` and the agent
 * is simply asked a question in words.
 *
 * The look lives in `.ai-button` in globals.css, so every place the assistant
 * is offered wears one identity.
 */
export function AskFreyrButton({
  /** What the button says. Short, because it sits in a row of actions. */
  label = "Ask Freyr AI",
  /** The record's name, for the tooltip and the accessible name. */
  about,
  /** Structured context. Offerings only. */
  offering,
  /** What to ask when there is no structured context. */
  prompt,
  className,
}: {
  label?: string;
  about: string;
  offering?: AgentOfferingContext;
  prompt?: string;
  className?: string;
}) {
  const fullLabel = `Ask Freyr AI about ${about}`;
  return (
    <button
      type="button"
      onClick={() =>
        askFreyrAgent({
          ...(offering ? { offering } : {}),
          ...(prompt && !offering ? { prompt } : {}),
          newConversation: true,
        })
      }
      aria-label={fullLabel}
      title={fullLabel}
      className={cn(
        "ai-button group/ai inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-primary focus-visible:ring-offset-2",
        className
      )}
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

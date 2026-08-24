"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen } from "lucide-react";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  type AccessLevel,
} from "@/lib/offeringMaterials";

/**
 * WHAT THE TAGS ACTUALLY MEAN.
 *
 * Straight out of the rep feedback, via Saras (Aug 21): "they had given their
 * feedback that they're a bit confused about what the tags mean, which is
 * understandable... what does an awareness stage even mean? What does a
 * client-facing file mean, what does an internal-only file mean?" Five words
 * on the page carry rules nobody wrote down anywhere a rep can reach.
 *
 * Top right of the Sales Materials header, which she left to my judgement:
 * the filters that USE these words are on the row below, so the definition
 * sits directly above the control it explains, and it is out of the way of
 * anybody who already knows.
 *
 * It lists only the access levels the reader can actually see. "Freyr AI Only"
 * is not a rep's business, and defining a level they can never select would
 * raise the question the glossary exists to answer.
 */
const STAGE_COPY: Record<string, string> = {
  awareness:
    "The buyer is working out whether they have a problem. Overviews, thought leadership, anything that frames the need without pitching.",
  evaluation:
    "The buyer is comparing options, ours included. Demos, battle cards, product detail, proof it does what we say.",
  decision:
    "The buyer is choosing and needs to justify it. Proposals, pricing, case studies, references.",
};

const ACCESS_COPY: Record<AccessLevel, string> = {
  client_facing: "Safe to send to a customer as it is. No internal pricing, no internal names.",
  internal_only: "For Freyr people only. Useful in preparing for a customer, never sent to one.",
  agent_only:
    "Never shown to a customer or a rep. It exists to train Freyr AI, and only its offering owner and app admins can open it.",
};

export function MaterialTagGlossary({
  /** Owners and admins also see the AI-only level, so it is defined for them. */
  includeAgentOnly = false,
}: {
  includeAgentOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const node = buttonRef.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      setBox({ top: r.bottom + 6, right: window.innerWidth - r.right });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const levels = ACCESS_LEVELS.filter(
    (level) => includeAgentOnly || level !== "agent_only"
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border-light bg-white px-2.5 text-[12px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
      >
        <BookOpen size={13} strokeWidth={2.1} />
        What do these filters mean?
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="What the material tags mean"
            style={{ top: box.top, right: box.right, width: 340 }}
            className="menu-in fixed z-[130] max-h-[70vh] overflow-y-auto rounded-xl border border-border-light bg-white p-3.5 shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
              Buyer&apos;s journey stage
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-text-secondary">
              Where the customer is in making up their mind. A file can carry
              more than one.
            </p>
            <ul className="mt-2 space-y-2.5">
              {JOURNEY_STAGES.map((stage) => {
                const meta = JOURNEY_STAGE_META[stage];
                const Icon = meta.icon;
                return (
                  <li key={stage} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-[3px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full"
                      style={{ background: `${meta.color}1F`, color: meta.color }}
                    >
                      <Icon size={10.5} strokeWidth={2.5} />
                    </span>
                    <span className="min-w-0">
                      <span
                        className="block text-[12.5px] font-semibold"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <span className="block text-[12px] leading-snug text-text-secondary">
                        {STAGE_COPY[stage]}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 border-t border-border-light pt-3 text-[11px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
              Who can view this file
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-text-secondary">
              Freyr AI reads every uploaded file. This says who among people
              may open it.
            </p>
            <ul className="mt-2 space-y-2.5">
              {levels.map((level) => {
                const meta = ACCESS_LEVEL_META[level];
                const Icon = meta.icon;
                return (
                  <li key={level} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-[3px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full"
                      style={{ background: `${meta.color}1F`, color: meta.color }}
                    >
                      <Icon size={10.5} strokeWidth={2.5} />
                    </span>
                    <span className="min-w-0">
                      <span
                        className="block text-[12.5px] font-semibold"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <span className="block text-[12px] leading-snug text-text-secondary">
                        {ACCESS_COPY[level]}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}

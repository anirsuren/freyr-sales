"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Route, ShieldCheck } from "lucide-react";
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
 * IT READS AS A GLOSSARY BAR, not a question (Saras, Aug 26: "can you replace
 * this 'What do these filters mean?' button with the same Glossary bar as the
 * main offerings page? So the new version will look like: GLOSSARY | Buyer's
 * Journey Stages (3) | Access Levels (3)"). Same shape as
 * OfferingsGlossaryBar, one difference that matters: those entries are links
 * to master lists someone maintains, and these two are definitions with no
 * page to go to, so each opens its own short panel instead of navigating.
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

type GlossaryGroup = "stages" | "access";

export function MaterialTagGlossary({
  /** Owners and admins also see the AI-only level, so it is defined for them. */
  includeAgentOnly = false,
}: {
  includeAgentOnly?: boolean;
}) {
  /** Which of the two definitions is showing, if either. */
  const [open, setOpen] = useState<GlossaryGroup | null>(null);
  const buttonRefs = useRef<Record<GlossaryGroup, HTMLButtonElement | null>>({
    stages: null,
    access: null,
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const node = buttonRefs.current[open];
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
      if (Object.values(buttonRefs.current).some((n) => n?.contains(target)))
        return;
      setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
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

  const groups = [
    {
      key: "stages" as const,
      label: "Buyer's journey stages",
      icon: Route,
      color: "#7C3AED",
      count: JOURNEY_STAGES.length,
    },
    {
      key: "access" as const,
      label: "Access levels",
      icon: ShieldCheck,
      color: "#0891B2",
      count: levels.length,
    },
  ];

  const rows =
    open === "stages"
      ? JOURNEY_STAGES.map((stage) => ({
          key: stage,
          meta: JOURNEY_STAGE_META[stage],
          copy: STAGE_COPY[stage],
        }))
      : open === "access"
        ? levels.map((level) => ({
            key: level,
            meta: ACCESS_LEVEL_META[level],
            copy: ACCESS_COPY[level],
          }))
        : [];

  const heading =
    open === "stages"
      ? {
          title: "Buyer's journey stage",
          hint: "Where the customer is in making up their mind. A file can carry more than one.",
        }
      : {
          title: "Who can view this file",
          hint: "Freyr AI reads every uploaded file. This says who among people may open it.",
        };

  return (
    <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
        Glossary
      </span>
      {groups.map((group) => {
        const Icon = group.icon;
        const isOpen = open === group.key;
        return (
          <button
            key={group.key}
            ref={(node) => {
              buttonRefs.current[group.key] = node;
            }}
            type="button"
            onClick={() => setOpen(isOpen ? null : group.key)}
            aria-expanded={isOpen}
            className={`group inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] transition-colors hover:bg-surface hover:text-text-primary ${
              isOpen ? "bg-surface text-text-primary" : "text-text-secondary"
            }`}
          >
            {/* The icon carries the colour, the same way the offerings bar
                keeps one identity per list without tinting the whole row. */}
            <Icon
              size={13}
              strokeWidth={2.2}
              aria-hidden="true"
              style={{ color: group.color }}
            />
            {group.label}
            <b className="tnum font-semibold text-text-primary group-hover:text-blue-primary">
              {group.count}
            </b>
          </button>
        );
      })}

      {open &&
        box &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={heading.title}
            style={{ top: box.top, right: box.right, width: 340 }}
            className="menu-in fixed z-[130] max-h-[70vh] overflow-y-auto rounded-xl border border-border-light bg-white p-3.5 shadow-[0_18px_48px_-16px_rgba(15,23,42,0.34)]"
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-tertiary">
              {heading.title}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-text-secondary">
              {heading.hint}
            </p>
            <ul className="mt-2 space-y-2.5">
              {rows.map((row) => {
                const Icon = row.meta.icon;
                return (
                  <li key={row.key} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-[3px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full"
                      style={{ background: `${row.meta.color}1F`, color: row.meta.color }}
                    >
                      <Icon size={10.5} strokeWidth={2.5} />
                    </span>
                    <span className="min-w-0">
                      <span
                        className="block text-[12.5px] font-semibold"
                        style={{ color: row.meta.color }}
                      >
                        {row.meta.label}
                      </span>
                      <span className="block text-[12px] leading-snug text-text-secondary">
                        {row.copy}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
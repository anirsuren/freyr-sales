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
import { tint } from "@/lib/tint";

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
/**
 * THE DEFINITIONS ARE SARAS'S, WORD FOR WORD (Aug 26: "can you replace the
 * Sales Materials Glossary definitions with this content").
 *
 * They are not paraphrased and they are not tightened. Every one of these
 * words is a rule about what a rep may send to a customer, and she owns that
 * rule — an edit here that reads better is an edit to Freyr's policy made by
 * somebody who does not set it.
 *
 * Examples are hers too, and they are what makes a definition usable: "the
 * client is comparing Freyr against other options" tells a rep nothing about
 * whether their battle card belongs there. Freyr AI Only carries none because
 * she gave none, so the field is optional rather than invented.
 */
type Definition = { definition: string; examples?: string };

const STAGE_COPY: Record<string, Definition> = {
  awareness: {
    definition:
      "The client is learning about their problem, and may not even know that any suitable solutions exist. Sales materials labeled with this stage explain the challenge & broad solution.",
    examples: "Thought Leadership, Introductory Emails, Short Sales Decks etc.",
  },
  evaluation: {
    definition:
      "The client knows what they need, and is comparing Freyr against other options. Sales materials labeled with this stage show how our solution works and why it's a strong fit.",
    examples: "Battle Cards, Client Demos, Client Testimonials etc.",
  },
  decision: {
    definition:
      "The client has shortlisted Freyr, and needs to finalise and justify the purchase internally. Sales materials labeled with this stage support approval, budgeting, and contracting.",
    examples: "Proposals, Success Stories/Case Studies etc.",
  },
};

const ACCESS_COPY: Record<AccessLevel, Definition> = {
  client_facing: {
    definition:
      "Sales material can be shared with a client as it is/ after some client-based customization. Contains no confidential content.",
    examples: "Marketing Videos, Thought Leadership, Sales Decks, Intro Emails etc.",
  },
  internal_only: {
    definition:
      "Sales material for Freyr employees only - Useful to prepare for a client interaction, but must never be sent to a client. Contains confidential content.",
    examples: "battle cards, internal pricing, deal notes, competitor analysis.",
  },
  agent_only: {
    definition:
      "Sales material not visible to anybody except the offering owner uploading it & app admins. Uploaded solely so Freyr AI chatbot can use it when answering questions.",
  },
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
      label: "Buyer's Journey Stages",
      icon: Route,
      color: "var(--ink-violet-soft)",
      count: JOURNEY_STAGES.length,
    },
    {
      key: "access" as const,
      label: "Access Levels",
      icon: ShieldCheck,
      color: "#0891B2",
      count: levels.length,
    },
  ];

  const rows =
    open === "stages"
      ? JOURNEY_STAGES.map((stage) => ({
          key: stage,
          /* `short` is "Awareness", `label` is "Awareness Stage" — and under a
             panel already headed "Buyer's Journey Stage(s)" the long one says
             Stage twice. Short is also exactly what Saras called them. */
          meta: { ...JOURNEY_STAGE_META[stage], label: JOURNEY_STAGE_META[stage].short },
          copy: STAGE_COPY[stage],
        }))
      : open === "access"
        ? levels.map((level) => ({
            key: level,
            meta: ACCESS_LEVEL_META[level],
            copy: ACCESS_COPY[level],
          }))
        : [];

  /* Her group definitions, also verbatim. The "three stages" / "three
     options" lines in her note are list headers, not body copy, so they are
     not rendered — the rows below ARE the list, and printing a count that
     could disagree with what a given reader sees would be worse than useless. */
  const heading =
    open === "stages"
      ? {
          title: "Buyer's Journey Stage(s)",
          hint: "The stage(s) of a client's buying decision journey that the sales material is meant to support. A sales material can support multiple stages.",
        }
      : {
          title: "Access Level",
          hint: "Identifies who is allowed to access the sales material, and whether it can be shared outside Freyr. Note: Freyr AI accesses every sales material regardless of this setting.",
        };

  return (
    /* EVERY PIECE ON THE SAME LINE BOX (Anir, Aug 27: "these aren't even
       aligned"). items-center centres BOXES, and the four things on this row
       — an 11px uppercase label, a 13px icon, 12.5px text and a bold count —
       had four different box heights, so their centres agreed and their
       glyphs sat about a pixel apart. Pinning each one to the icon's 13px
       makes the boxes identical, and identical boxes centre the glyphs too. */
    <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1">
      <span className="mr-1 text-[11px] font-semibold uppercase leading-[13px] tracking-[0.06em] text-text-tertiary">
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
            <span className="leading-[13px]">{group.label}</span>
            <b className="tnum font-semibold leading-[13px] text-text-primary group-hover:text-blue-primary">
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
            style={{ top: box.top, right: box.right, width: 380 }}
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
                      style={{ background: tint(row.meta.color, 12), color: row.meta.color }}
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
                        {row.copy.definition}
                      </span>
                      {row.copy.examples && (
                        /* Set apart from the definition, because a rep
                           skimming for "is my battle card an Evaluation
                           file?" is looking for the examples, not the rule. */
                        <span className="mt-1 block text-[11.5px] leading-snug text-text-tertiary">
                          <b className="font-semibold">Examples:</b>{" "}
                          {row.copy.examples}
                        </span>
                      )}
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
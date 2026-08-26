"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ListChecks } from "lucide-react";
import { CollapsibleDescription } from "@/components/offerings/CollapsibleDescription";
import {
  renderBriefInline,
  stripBriefFormatting,
} from "@/components/offerings/BriefText";
import { offeringMark, serviceCardMark } from "@/components/ui/OfferingIcon";
import type { ServiceCardStyle } from "@/lib/serviceCardStyle";
import { componentGroupRank, componentNoun } from "@/lib/componentGroups";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------
// Suren's offering descriptions came straight out of the spreadsheet as bullet
// LISTS, and the page used to dump them as pre-wrapped text — which read
// exactly like what it was, a paste (Suren: "it looks like you just
// copy-pasted whatever they said from the spreadsheet"). His read was right:
// each bullet is a SERVICE WITHIN THE SERVICE, so it belongs on the page as a
// real list of things, not as prose.
//
// Three shapes exist in the catalog, and the parser handles each on its own
// terms:
//   1. A flat bullet list            → one capability per bullet.
//   2. A bullet with a numbered
//      parenthetical                 → the text before "(" is the capability,
//                                      the "1. … 2. …" inside are its parts.
//   3. Intro prose + a section
//      heading + indented "–" lines  → the heading groups its own capabilities.
// Anything with no list markers at all stays prose — never force-split.

export type Capability = {
  /** The capability itself, e.g. "Regulatory Toxicology". Never truncated. */
  title: string;
  /** Parts named inside a parenthetical, e.g. "F-Value Reports for CRP". */
  subItems: string[];
  /**
   * The source line with its bullet stripped and nothing else touched. The
   * editor round-trips THIS, never the split pieces — re-joining sub-items on
   * commas would corrupt a part that contains one of its own.
   */
  raw: string;
  /** List semantics retained for safe Markdown round-tripping/display. */
  listStyle?: "bullet" | "number";
  depth?: number;
  ordinal?: number;
};

export type CapabilityGroup = {
  /** Section heading from the source, e.g. "Product & Portfolio Strategy". */
  title: string;
  items: Capability[];
};

export type ParsedBrief =
  | { kind: "prose"; text: string }
  | {
      kind: "capabilities";
      /** Lead-in paragraph(s) that sat above the list, kept as prose. */
      intro: string;
      groups: CapabilityGroup[];
      count: number;
    };

// A glyph + a space, or a "1." / "1)" style number + a space. The trailing
// space matters: without it "Non-clinical Development Strategy" would read as
// a bullet, and "eCTD 4.0" as a numbered item.
const BULLET_RE = /^[\s ]*[•▪◦‣*–—-][\s ]+/;
const NUMBER_RE = /^[\s ]*\d+[.)][\s ]+/;
// Splits the inside of a parenthetical on its "1." "2." "3." markers.
const ENUM_SPLIT_RE = /\s*\b\d+\.\s+/;
const ENUM_TEST_RE = /\b\d+\.\s/;

function isListLine(line: string) {
  return BULLET_RE.test(line) || NUMBER_RE.test(line);
}

function stripMarker(line: string) {
  return line.replace(BULLET_RE, "").replace(NUMBER_RE, "").trim();
}

function listMetadata(line: string): Pick<
  Capability,
  "listStyle" | "depth" | "ordinal"
> {
  const leading = line.match(/^[\t ]*/)?.[0] ?? "";
  const spaces = leading.replace(/\t/g, "  ").length;
  const numbered = line.trimStart().match(/^(\d+)[.)]\s+/);
  return {
    listStyle: numbered ? "number" : "bullet",
    depth: Math.floor(spaces / 2),
    ordinal: numbered ? Number(numbered[1]) : undefined,
  };
}

// Find the parenthetical that opens at `from`, honouring nesting — the
// toxicology bullet has "(CRP)", "(TRA)" and "(ERA)" nested inside the outer
// one, so a naive indexOf(")") would cut it in half.
function matchParen(line: string, from: number): number {
  let depth = 0;
  for (let i = from; i < line.length; i++) {
    if (line[i] === "(") depth++;
    else if (line[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Split one list line into its capability title and any sub-items named in a
// parenthetical. A parenthetical is only lifted out when it is genuinely a
// list — enumerated ("1. … 2. …") or a comma-separated clarifier that closes
// the line. An inline acronym must stay put, or "Structured Product Labeling
// (SPL) and Structured Product Monograph (SPM)" would lose half its meaning.
export function splitCapability(source: string): Capability {
  const line = source.trim();
  const whole: Capability = { title: line, subItems: [], raw: line };
  const open = line.indexOf("(");
  if (open <= 0) return whole;
  const close = matchParen(line, open);
  if (close === -1) return whole;

  const title = line.slice(0, open).trim();
  const inner = line.slice(open + 1, close).trim();
  const tail = line.slice(close + 1).trim();
  if (!title || !inner) return whole;

  const clean = (parts: string[]) =>
    parts
      .map((p) => p.trim().replace(/[;,]$/, "").trim())
      .filter((p) => p && !/^etc\.?$/i.test(p));

  if (ENUM_TEST_RE.test(inner)) {
    const parts = clean(inner.split(ENUM_SPLIT_RE));
    if (parts.length >= 2)
      return { title: tail ? `${title} ${tail}` : title, subItems: parts, raw: line };
  }
  // Only a trailing parenthetical can be a sub-list; anything mid-sentence is
  // an aside that belongs to the title.
  if (!tail && inner.includes(",")) {
    const parts = clean(inner.split(/\s*,\s*/));
    if (parts.length >= 2) return { title, subItems: parts, raw: line };
  }
  return whole;
}

// A short, unpunctuated line sitting directly above a run of list lines is a
// SECTION HEADING ("Product & Portfolio Strategy"), not a capability. A long
// paragraph in the same position is the offering's lead-in and stays prose.
const HEADING_MAX = 90;
// What the pieces of an offering are CALLED, by offering type.
/* One word for what an offering is made of, wherever the offering came from.
   It was "modules" for Freya Fusion and "services" for everything else until
   the vocabulary settled on components. See lib/componentGroups.ts. */

const GENERIC_LEAD_IN = /^(services|offerings|capabilities|these)?\s*(include|includes|are)$/i;

function asHeading(line: string): string | null {
  const t = line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/[:：]$/, "")
    .trim();
  if (!t || t.length > HEADING_MAX || /[.!?]$/.test(t)) return null;
  // "Services include:" is a lead-in, not a name worth showing as a label.
  return GENERIC_LEAD_IN.test(t) ? "" : t;
}

/**
 * Older briefs were saved as an opening paragraph followed by labelled prose:
 * "Products: …", "Applications: …", and so on. That is real structure, but
 * it predates the formatted editor and therefore carries no list markers. Turn
 * that specific legacy shape into safe Markdown before parsing so it renders
 * as the same polished component cards the owner now creates in the editor.
 * Nothing is written back to the database until the owner explicitly saves.
 */
function structureLabelledParagraphs(source: string): string {
  const paragraphs = source
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length < 3) return source;

  const labelled = paragraphs.slice(1).map((paragraph) =>
    paragraph.match(/^([^:\n]{2,55}:)\s+([\s\S]+)$/)
  );
  if (labelled.length < 2 || !labelled.every(Boolean)) return source;

  return [
    paragraphs[0],
    ...labelled.map((match) => {
      const label = match?.[1].trim() ?? "";
      const body = match?.[2].trim() ?? "";
      return `• **${label}** ${body}`;
    }),
  ].join("\n\n");
}

export function parseCapabilities(text: string): ParsedBrief {
  const source = structureLabelledParagraphs(
    (text || "").replace(/\r\n?/g, "\n")
  );
  const lines = source.split("\n");
  const hasList = lines.some(isListLine);
  // One prose paragraph, or several — with no list markers anywhere there is
  // nothing to structure, so it renders exactly as it always has.
  if (!hasList) return { kind: "prose", text: source.trim() };

  const introParts: string[] = [];
  const groups: CapabilityGroup[] = [];
  let current: CapabilityGroup | null = null;
  let seenList = false;

  const push = (item: Capability) => {
    let group = current;
    if (!group) {
      group = { title: "", items: [] };
      groups.push(group);
      current = group;
    }
    group.items.push(item);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    if (isListLine(line)) {
      seenList = true;
      const body = stripMarker(line);
      if (body) push({ ...splitCapability(body), ...listMetadata(line) });
      continue;
    }

    // A non-list line: heading if a list follows immediately, else prose.
    const next = lines.slice(i + 1).find((l) => l.trim());
    const heading = next && isListLine(next) ? asHeading(line) : null;
    if (heading !== null) {
      current = { title: heading, items: [] };
      groups.push(current);
      continue;
    }
    // Trailing prose after the list would read as an orphan; only the lead-in
    // is kept, which is where every description in the catalog puts it.
    if (!seenList) introParts.push(line.trim());
  }

  const kept = groups.filter((g) => g.items.length > 0);
  const count = kept.reduce((n, g) => n + g.items.length, 0);
  if (count === 0) return { kind: "prose", text: source.trim() };
  return { kind: "capabilities", intro: introParts.join("\n\n"), groups: kept, count };
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

function CapabilityCard({
  item,
  style,
}: {
  item: Capability;
  style?: ServiceCardStyle;
}) {
  // Every tile carries a colour AND an icon, never flat gray — offeringMark is
  // the app's stable name→glyph+hue map, the same one the offering cards and
  // ServiceTag use, so a capability reads as the mini-offering it is.
  const displayTitle = stripBriefFormatting(item.title);
  const { icon: Icon, color, light } = serviceCardMark(displayTitle, style);
  const many = item.subItems.length >= 3;
  // Titles run from three words ("Building QMS") to a full sentence that wraps
  // onto two lines, so a row used to pair a squat card with a tall one and the
  // icon tiles stopped lining up (Suren: "some of them are one line, and some
  // of them are two lines… especially with the alignment with the icon").
  // Two rules fix it without truncating a single service name:
  //   • one floor height for every card, so a row of short titles is exactly as
  //     tall as a row with a wrapped one (`h-full` then matches them inside the
  //     stretched grid row);
  //   • a title-only card centres its icon + text as a pair, so a one-line and
  //     a two-line card both read as icon-beside-title. Cards that carry
  //     sub-items keep the icon at the TOP, where a list belongs.
  return (
    <li
      className={cn(
        // EVERY CARD STARTS ITS TEXT ON THE SAME LINE. Cards used to centre
        // their text vertically when they carried no sub-items, so a 3-line
        // card sitting beside a 4-line one pushed its first line down and the
        // pair read as misaligned (Anir, Aug 7: "these are not symmetrical,
        // the right column clearly has the text a little bit up"). Top-aligned,
        // the row's first lines share a baseline whatever the lengths are; the
        // cards still stretch to one height inside the grid row.
        "flex h-full min-h-[64px] items-start gap-2.5 rounded-xl border border-border-light bg-white p-3.5 transition-colors hover:border-blue-subtle",
        many && "md:col-span-2"
      )}
      style={
        item.depth
          ? {
              marginLeft: `${Math.min(item.depth, 4) * 16}px`,
              width: `calc(100% - ${Math.min(item.depth, 4) * 16}px)`,
            }
          : undefined
      }
    >
      {/* No glyph tile. The icons were decoration — they carried no meaning
          of their own and pulled the eye away from the sentence that does
          (Anir, Aug 7: "we don't really need them, you can just keep the
          box"). */}
      <span className="min-w-0 flex-1">
        {/* Wraps, never truncates — these are full service names. */}
        {/* Same type as the brief paragraph above it — size, leading and
            colour — so the section reads as one voice instead of two (Anir,
            Aug 7: "keep that entire font and font style the same as the text
            here, let's just make that uniform"). The lead-in label stays bold
            because the source text marks it bold. */}
        <span className="block break-words text-[14px] leading-relaxed text-text-secondary">
          {item.listStyle === "number" && (
            <span className="mr-1.5 text-blue-primary tnum">
              {item.ordinal ?? 1}.
            </span>
          )}
          {renderBriefInline(item.title, "capability-title")}
        </span>
        {item.subItems.length > 0 &&
          (many ? (
            <span className="mt-2 grid grid-cols-1 gap-1.5 md:grid-cols-2">
              {item.subItems.map((sub, si) => (
                <span key={`${si}-${sub}`} className="flex items-start gap-1.5">
                  <span
                    className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  <span className="break-words text-[11.5px] leading-snug text-text-secondary">
                    {renderBriefInline(sub, `capability-sub-${si}`)}
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {item.subItems.map((sub, si) => (
                <span
                  key={`${si}-${sub}`}
                  className="inline-block break-words rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold leading-snug"
                  style={{ background: `${color}14`, color }}
                >
                  {renderBriefInline(sub, `capability-pill-${si}`)}
                </span>
              ))}
            </span>
          ))}
      </span>
    </li>
  );
}

const PREVIEW = 6;

export function OfferingCapabilities({
  text,
  offeringName,
  styles = [],
  className,
}: {
  text: string;
  offeringName: string;
  styles?: ServiceCardStyle[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseCapabilities(text);

  // Plain prose keeps the behaviour it always had, Show more and all.
  if (parsed.kind === "prose")
    return <CollapsibleDescription text={parsed.text} threshold={520} className={className} />;

  const accent = offeringMark(offeringName).color;
  const collapsible = parsed.count > PREVIEW;
  const limit = !collapsible || open ? parsed.count : PREVIEW;

  let styleIndex = 0;
  const styledGroups = parsed.groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ item, style: styles[styleIndex++] })),
  }));
  /* THE READER'S ORDER, NOT THE AUTHOR'S. Services, then Modules, then
     Module Agents, then Add-on Agents, whatever order the brief was typed in
     (Saras, Aug 26). Anything that is not one of the four keeps its authored
     position, after the four. Sorted before the preview limit is applied, so
     "show 3 of 9" shows the first three a reader would read. */
  const ordered = styledGroups
    .map((group, index) => ({ group, index }))
    .sort(
      (a, b) =>
        componentGroupRank(a.group.title) - componentGroupRank(b.group.title) ||
        a.index - b.index
    )
    .map(({ group }) => group);

  let seen = 0;
  const visibleGroups = ordered.map((group) => {
    const items = group.items.filter(() => seen++ < limit);
    return { title: group.title, items };
  });

  return (
    <div className={className}>
      {parsed.intro && (
        <p className="whitespace-pre-line text-[14px] leading-relaxed text-text-secondary">
          {renderBriefInline(parsed.intro, "brief-intro")}
        </p>
      )}

      <div className={cn("flex items-center gap-2", parsed.intro && "mt-5")}>
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{ background: `${accent}1F`, color: accent }}
        >
          <ListChecks size={13} strokeWidth={2.1} aria-hidden="true" />
        </span>
        <h3 className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-text-secondary">
          What&apos;s included
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
          style={{ background: `${accent}14`, color: accent }}
        >
          {parsed.count} {componentNoun(parsed.count)}
        </span>
      </div>

      <div className="mt-3 space-y-4">
        {visibleGroups.map((group, gi) =>
          group.items.length === 0 ? null : (
            <div key={group.title || `group-${gi}`}>
              {group.title && (
                <p
                  className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em]"
                  style={{ color: accent }}
                >
                  <span
                    className="h-[3px] w-5 rounded-full"
                    style={{ background: accent }}
                    aria-hidden="true"
                  />
                  {renderBriefInline(group.title, `group-${gi}`)}
                </p>
              )}
              {/* `items-stretch` is the grid default, but it is the thing that
                  makes `h-full` on the card mean "as tall as my neighbour",
                  spelled out so a later refactor can't quietly drop it.

                  A group holding ONE card gets the whole row rather than half
                  of it (Saras, Aug 26: "If there's only 1 single component
                  card within a group, the card should automatically extend &
                  utilize the whole whitespace in view mode"). */}
              <ul
                className={cn(
                  "grid grid-cols-1 items-stretch gap-2.5",
                  group.items.length > 1 && "md:grid-cols-2"
                )}
              >
                {group.items.map(({ item, style }, ii) => (
                  <CapabilityCard
                    key={`${ii}-${item.title}`}
                    item={item}
                    style={style}
                  />
                ))}
              </ul>
            </div>
          )
        )}
      </div>

      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-blue-primary hover:underline"
        >
          {open ? (
            <>
              Show less <ChevronUp size={14} strokeWidth={2} />
            </>
          ) : (
            <>
              Show {parsed.count - PREVIEW} more <ChevronDown size={14} strokeWidth={2} />
            </>
          )}
        </button>
      )}
    </div>
  );
}

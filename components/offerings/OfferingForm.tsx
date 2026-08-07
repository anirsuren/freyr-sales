"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Trash2,
  Package,
  Layers,
  ListChecks,
  List,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading2,
  Heading3,
  Link2,
  RemoveFormatting,
  Undo2,
  Redo2,
  PencilLine,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  Building2,
  FolderOpen,
  Folder,
  Route,
  CalendarClock,
  ChevronDown,
  Check,
  CircleCheck,
  CircleHelp,
  AlertCircle,
  X,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { hasOfferingEditChanges } from "@/lib/offeringEditDirty";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type {
  CustomerType,
  Market,
  OfferingCategory,
  OfferingRoadmapDetails,
  ServiceCardStyle,
} from "@/lib/offerings";
import {
  RoadmapEditorFields,
  blankRoadmapDetails,
} from "@/components/offerings/OfferingReleasesTab";
import { ColorSelect, MultiColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import { SIZE_TIER_META } from "@/components/ui/Badge";
import { FILTER_PALETTE } from "@/components/offerings/filterPalette";
import {
  offeringMark,
  serviceCardMark,
  SERVICE_CARD_ICON_COMPONENTS,
} from "@/components/ui/OfferingIcon";
import {
  SERVICE_CARD_COLOR_OPTIONS,
  SERVICE_CARD_ICON_OPTIONS,
} from "@/lib/serviceCardStyle";
import { parseCapabilities } from "@/components/offerings/OfferingCapabilities";
import { stripBriefFormatting } from "@/components/offerings/BriefText";
import { cn } from "@/lib/utils";
import { PeoplePicker, type PickablePerson } from "@/components/ui/PeoplePicker";
import { pocNames } from "@/lib/pocNames";
import { sectionId } from "@/lib/sectionId";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  ACCESS_LEVEL_VISIBILITY_COPY,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  MATERIAL_COLOR,
  MATERIAL_FORMATS,
  MATERIAL_ICON,
  MATERIAL_META,
  allFolders,
  materialFolderLabel,
  canonicalMaterialFolder,
  materialJourneyStages,
  type OfferingMaterial,
  type AccessLevel,
  type JourneyStage,
  type MaterialKind,
} from "@/lib/offeringMaterials";

type MaterialRow = Omit<OfferingMaterial, "id"> & { id?: string };

// CR-3 tag dropdowns for each material row — colour-coded, matching the
// AddMaterialButton popup so tagging feels the same everywhere.
const STAGE_OPTIONS: ColorOption[] = JOURNEY_STAGES.map((s) => ({
  value: s,
  label: JOURNEY_STAGE_META[s].label,
  color: JOURNEY_STAGE_META[s].color,
  icon: JOURNEY_STAGE_META[s].icon,
}));
const ACCESS_OPTIONS: ColorOption[] = ACCESS_LEVELS.map((l) => ({
  value: l,
  label: ACCESS_LEVEL_VISIBILITY_COPY[l].label,
  description: ACCESS_LEVEL_VISIBILITY_COPY[l].description,
  color: ACCESS_LEVEL_META[l].color,
  icon: ACCESS_LEVEL_META[l].icon,
}));
// Item 9: uploads choose from FOUR formats. The nine older types are still
// real on existing files, so a row that carries one keeps it as an extra
// option — the dropdown shows what the material actually is instead of
// silently re-typing a case study as a video, and the owner can move it onto
// one of the four whenever they like.
const kindOption = (k: MaterialKind): ColorOption => ({
  value: k,
  label: MATERIAL_META[k].label,
  color: MATERIAL_COLOR[k],
  icon: MATERIAL_ICON[k],
});
const FORMAT_OPTIONS: ColorOption[] = MATERIAL_FORMATS.map(kindOption);
function kindOptionsFor(kind: MaterialKind): ColorOption[] {
  return (MATERIAL_FORMATS as MaterialKind[]).includes(kind)
    ? FORMAT_OPTIONS
    : [...FORMAT_OPTIONS, kindOption(kind)];
}

// A material link a rep pastes as a bare domain ("example.com/deck.pdf") would
// render as a relative href and 404 on click. Give it a scheme; leave full URLs
// and root-relative paths (/internal/...) alone.
function normalizeUrl(u: string) {
  const t = u.trim();
  if (!t || /^https?:\/\//i.test(t) || t.startsWith("/")) return t;
  return `https://${t}`;
}

function readableOfferingSaveError(message: string): string {
  if (/every new material needs/i.test(message))
    return "One or more sales materials is incomplete. Open Sales materials and add its name, file or link, format, folder, buyer stage, and viewing access.";
  return message || "The offering could not be saved. Review the highlighted section and try again.";
}

const FIELD =
  "h-10 w-full min-w-0 rounded-lg border border-border-light bg-white px-3 text-[13.5px] text-text-primary placeholder:text-text-tertiary transition-[border-color] hover:border-blue-subtle focus:border-blue-primary focus:outline-none";
const LABEL =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary";

// Current availability is a pick list (Suren's change #5): currently available,
// a date (month + year), or to be decided — nothing else.
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
type AvailMode = "" | "current" | "date" | "tbd";

// Same colour language the read-only AvailabilityPill uses, so the picker and
// the pill it produces are obviously the same thing.
const AVAIL_META: Record<AvailMode, { color: string; icon: LucideIcon }> = {
  "": { color: "#8A8A8E", icon: CircleHelp },
  current: { color: "#1A7A35", icon: CircleCheck },
  // Orange-700 is the app-wide "caution / upcoming" token; the yellow band is
  // banned as text or a chip accent.
  date: { color: "#C2410C", icon: Clock },
  tbd: { color: "#4338CA", icon: CircleHelp },
};


// Every picker in this form speaks the app's dropdown language: a colour and an
// icon per option, exactly like the filters on the offerings table (Anir, Jul
// 28: "look at how you did all the other dropdowns, like the filters on the
// tables. That's how it should look: icons, colors, tags").
const AVAIL_OPTIONS: ColorOption[] = [
  { value: "", label: "Not set", color: AVAIL_META[""].color, icon: AVAIL_META[""].icon },
  { value: "current", label: "Currently available", color: AVAIL_META.current.color, icon: AVAIL_META.current.icon },
  { value: "date", label: "Available from a date", color: AVAIL_META.date.color, icon: AVAIL_META.date.icon },
  { value: "tbd", label: "To be decided", color: AVAIL_META.tbd.color, icon: AVAIL_META.tbd.icon },
];

const MONTH_OPTIONS: ColorOption[] = [
  { value: "", label: "Month", color: "#64748B", icon: CalendarClock },
].concat(
  MONTHS.map((m, i) => ({
  value: m,
  label: m,
    color: FILTER_PALETTE[i % FILTER_PALETTE.length],
    icon: CalendarClock,
  }))
);

const YEAR_OPTIONS: ColorOption[] = [
  { value: "", label: "Year", color: "#64748B", icon: CalendarClock },
].concat(
  Array.from({ length: 8 }, (_, k) => {
    const y = String(2026 - 1 + k);
    return {
      value: y,
      label: y,
      color: FILTER_PALETTE[k % FILTER_PALETTE.length],
      icon: CalendarClock,
    };
  })
);

// Family accents match the offering detail page exactly (violet / rose / blue).
const FAMILY_COLOR: Record<string, string> = {
  Pharmaceutical: "#0071E3",
  Biologics: "#DB2777",
  "Bio Pharmaceutical": "#7C3AED",
  "Medical Devices": "#0F766E",
  "Consumer Products": "#C2410C",
};

// Markets carry a flag + their own colour here for the same reason they do on
// the offering page: a chip is never plain gray.
const MARKET_STYLE: { match: RegExp; color: string; flag: string }[] = [
  { match: /usa|united states/i, color: "#0071E3", flag: "🇺🇸" },
  { match: /europe|^eu$/i, color: "#5E5CE6", flag: "🇪🇺" },
  { match: /japan/i, color: "#C81E67", flag: "🇯🇵" },
  { match: /china/i, color: "#C0362C", flag: "🇨🇳" },
  { match: /korea/i, color: "#0F9E8E", flag: "🇰🇷" },
];
function marketStyle(name: string) {
  return (
    MARKET_STYLE.find((m) => m.match.test(name)) || {
      color: "#4F46E5",
      flag: "🌐",
    }
  );
}

function sizeMeta(size: string) {
  const s = size.toLowerCase();
  if (s.startsWith("small")) return SIZE_TIER_META.small;
  if (s.startsWith("large")) return SIZE_TIER_META.large;
  return SIZE_TIER_META.mid;
}

// Parse a stored availability string back into the picker's state. Legacy
// free-text (e.g. "V1 is available now") maps to the closest option.
function parseAvailability(val?: string): {
  mode: AvailMode;
  month: string;
  year: string;
} {
  const v = (val || "").trim();
  if (!v) return { mode: "", month: "", year: "" };
  if (/^to be decided$/i.test(v)) return { mode: "tbd", month: "", year: "" };
  const m = v.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m && MONTHS.includes(m[1]))
    return { mode: "date", month: m[1], year: m[2] };
  return { mode: "current", month: "", year: "" };
}

function buildAvailability(mode: AvailMode, month: string, year: string) {
  if (mode === "current") return "Currently available";
  if (mode === "tbd") return "To be decided";
  if (mode === "date") return month && year ? `${month} ${year}` : "";
  return "";
}

// ---------------------------------------------------------------------------
// The capability list editor
// ---------------------------------------------------------------------------
// Suren: "we just have them so I can add them. Don't just fucking put it
// hard-coded as a bullet point." The stored field is still ONE string — this
// just gives it a row-per-service editor instead of a free-text box, and
// serialises straight back to the same "• one per line" shape the catalog
// already holds. A paste box stays one click away for bulk entry from a sheet.

type CapRow = {
  kind: "item" | "section";
  text: string;
  style?: ServiceCardStyle;
  listStyle?: "bullet" | "number";
  depth?: number;
  ordinal?: number;
};

function toRows(
  text: string,
  styles: ServiceCardStyle[] = []
): { intro: string; rows: CapRow[] } {
  const parsed = parseCapabilities(text);
  // Plain prose has no rows to show — keep it whole as the opening line so
  // nothing a previous author wrote can be lost by opening this form.
  if (parsed.kind !== "capabilities") return { intro: parsed.text, rows: [] };
  const rows: CapRow[] = [];
  let styleIndex = 0;
  for (const group of parsed.groups) {
    if (group.title) rows.push({ kind: "section", text: group.title });
    for (const item of group.items)
      rows.push({
        kind: "item",
        text: item.raw,
        style: styles[styleIndex++],
        listStyle: item.listStyle,
        depth: item.depth,
        ordinal: item.ordinal,
      });
  }
  return { intro: parsed.intro, rows };
}

function composeDescription(intro: string, rows: CapRow[]): string {
  const blocks: string[] = [];
  if (intro.trim()) blocks.push(intro.trim());
  let block: string[] = [];
  const flush = () => {
    if (block.length) blocks.push(block.join("\n"));
    block = [];
  };
  for (const row of rows) {
    const text = row.text.trim();
    if (!text) continue;
    if (row.kind === "section") {
      flush();
      block.push(text);
    } else {
      const indent = "  ".repeat(Math.max(0, row.depth ?? 0));
      const marker =
        row.listStyle === "number" ? `${row.ordinal ?? 1}.` : "•";
      block.push(`${indent}${marker} ${text}`);
    }
  }
  flush();
  return blocks.join("\n\n");
}

function serviceCardFields(text: string): { heading: string; description: string } {
  const source = text.trim();
  const labelled = source.match(/^\*\*([^*\n]{1,80}?):\*\*\s*([\s\S]*)$/);
  if (labelled)
    return {
      heading: stripBriefFormatting(labelled[1]).trim(),
      description: labelled[2].trim(),
    };
  return { heading: "", description: source };
}

function serviceCardText(heading: string, description: string): string {
  const cleanHeading = heading.trim().replace(/:$/, "");
  const cleanDescription = description.trim();
  if (!cleanHeading) return cleanDescription;
  return `**${cleanHeading}:**${cleanDescription ? ` ${cleanDescription}` : ""}`;
}

type BriefFormat = "bold" | "italic" | "underline" | "strike" | "heading" | "subheading" | "link" | "clear" | "bullets" | "numbers" | "indent" | "outdent";

function escapeBriefHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function briefInlineHtml(value: string): string {
  return escapeBriefHtml(value)
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\+\+([^+\n]+)\+\+/g, "<u>$1</u>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>");
}

/** Convert the safe stored Markdown subset into editable document HTML. */
function briefMarkdownToHtml(value: string): string {
  const output: string[] = [];
  let list: "ul" | "ol" | null = null;
  const closeList = () => {
    if (list) output.push(`</${list}>`);
    list = null;
  };
  for (const rawLine of value.split("\n")) {
    const line = rawLine.trimEnd();
    const bullet = line.match(/^\s*[•▪◦‣*–—-]\s+(.*)$/);
    const number = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || number) {
      const nextList = bullet ? "ul" : "ol";
      if (list !== nextList) {
        closeList();
        list = nextList;
        output.push(`<${nextList}>`);
      }
      output.push(`<li>${briefInlineHtml((bullet || number)?.[1] || "")}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) {
      output.push("<p><br></p>");
    } else if (/^###\s+/.test(line)) {
      output.push(`<h3>${briefInlineHtml(line.replace(/^###\s+/, ""))}</h3>`);
    } else if (/^##\s+/.test(line)) {
      output.push(`<h2>${briefInlineHtml(line.replace(/^##\s+/, ""))}</h2>`);
    } else {
      output.push(`<p>${briefInlineHtml(line)}</p>`);
    }
  }
  closeList();
  return output.join("");
}

function briefElementToMarkdown(element: Element, depth = 0): string {
  const children = () =>
    Array.from(element.childNodes)
      .map((node) => briefNodeToMarkdown(node, depth))
      .join("");
  const tag = element.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "strong" || tag === "b") return `**${children()}**`;
  if (tag === "em" || tag === "i") return `*${children()}*`;
  if (tag === "u") return `++${children()}++`;
  if (tag === "s" || tag === "strike" || tag === "del") return `~~${children()}~~`;
  if (tag === "a") {
    const href = element.getAttribute("href") || "";
    return /^https?:\/\//i.test(href) ? `[${children()}](${href})` : children();
  }
  if (tag === "h1" || tag === "h2") return `## ${children().trim()}\n\n`;
  if (tag === "h3") return `### ${children().trim()}\n\n`;
  if (tag === "ul" || tag === "ol") {
    const ordered = tag === "ol";
    return Array.from(element.children)
      .filter((child) => child.tagName.toLowerCase() === "li")
      .map((child, index) => {
        const body = Array.from(child.childNodes)
          .filter((node) => !(node instanceof Element && ["ul", "ol"].includes(node.tagName.toLowerCase())))
          .map((node) => briefNodeToMarkdown(node, depth + 1))
          .join("")
          .trim();
        const nested = Array.from(child.children)
          .filter((nestedChild) => ["ul", "ol"].includes(nestedChild.tagName.toLowerCase()))
          .map((nestedChild) => briefElementToMarkdown(nestedChild, depth + 1))
          .join("");
        return `${"  ".repeat(depth)}${ordered ? `${index + 1}.` : "•"} ${body}\n${nested}`;
      })
      .join("");
  }
  if (tag === "p" || tag === "div") return `${children().trimEnd()}\n\n`;
  return children();
}

function briefNodeToMarkdown(node: Node, depth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent || "").replace(/\u00a0/g, " ");
  return node instanceof Element ? briefElementToMarkdown(node, depth) : "";
}

function editableBriefToMarkdown(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .map((node) => briefNodeToMarkdown(node))
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Google-Docs-style editing while retaining the existing safe storage format. */
function RichBriefEditor({
  value,
  onChange,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const internalValueRef = useRef(value);

  useEffect(() => {
    if (!ref.current || value === internalValueRef.current) return;
    internalValueRef.current = value;
    ref.current.innerHTML = briefMarkdownToHtml(value);
  }, [value]);

  useEffect(() => {
    if (ref.current && !ref.current.innerHTML)
      ref.current.innerHTML = briefMarkdownToHtml(value);
  }, [value]);

  function emitFromEditor() {
    if (!ref.current) return;
    const next = editableBriefToMarkdown(ref.current);
    internalValueRef.current = next;
    onChange(next);
  }

  function format(kind: BriefFormat) {
    ref.current?.focus();
    const command: Partial<Record<BriefFormat, string>> = {
      bold: "bold", italic: "italic", underline: "underline", strike: "strikeThrough",
      bullets: "insertUnorderedList", numbers: "insertOrderedList", indent: "indent",
      outdent: "outdent", clear: "removeFormat",
    };
    if (kind === "link") {
      const href = window.prompt("Paste a link");
      if (href && /^https?:\/\//i.test(href)) document.execCommand("createLink", false, href);
    } else if (kind === "heading" || kind === "subheading") {
      document.execCommand("formatBlock", false, kind === "heading" ? "h2" : "h3");
    } else if (command[kind]) {
      document.execCommand(command[kind] as string, false);
      if (kind === "clear") document.execCommand("formatBlock", false, "p");
    }
    emitFromEditor();
  }

  const tools: Array<{
    kind: BriefFormat;
    label: string;
    icon: LucideIcon;
  }> = [
    { kind: "heading", label: "Heading", icon: Heading2 },
    { kind: "subheading", label: "Subheading", icon: Heading3 },
    { kind: "bold", label: "Bold", icon: Bold },
    { kind: "italic", label: "Italic", icon: Italic },
    { kind: "underline", label: "Underline", icon: Underline },
    { kind: "strike", label: "Strikethrough", icon: Strikethrough },
    { kind: "bullets", label: "Bulleted list", icon: List },
    { kind: "numbers", label: "Numbered list", icon: ListOrdered },
    { kind: "outdent", label: "Outdent", icon: IndentDecrease },
    { kind: "indent", label: "Indent", icon: IndentIncrease },
    { kind: "link", label: "Add link", icon: Link2 },
    { kind: "clear", label: "Clear formatting", icon: RemoveFormatting },
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-border-light bg-white transition-[border-color] focus-within:border-blue-primary">
      <div className="flex flex-wrap items-center gap-1 border-b border-border-light bg-surface/60 px-2 py-1.5">
        <div
          className="flex flex-wrap items-center gap-1"
          role="toolbar"
          aria-label="Offering brief formatting"
        >
          <button
            type="button"
            title="Undo"
            aria-label="Undo"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => { ref.current?.focus(); document.execCommand("undo"); emitFromEditor(); }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-blue-light hover:text-blue-primary"
          >
            <Undo2 size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            title="Redo"
            aria-label="Redo"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => { ref.current?.focus(); document.execCommand("redo"); emitFromEditor(); }}
            className="mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-blue-light hover:text-blue-primary"
          >
            <Redo2 size={15} strokeWidth={2} />
          </button>
          {tools.map(({ kind, label, icon: Icon }, index) => (
            <button
              key={kind}
              type="button"
              title={label}
              aria-label={label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => format(kind)}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-blue-light hover:text-blue-primary",
                (index === 2 || index === 6 || index === 10) && "ml-1"
              )}
            >
              <Icon size={15} strokeWidth={2} />
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        {!value.trim() && (
          <p className="pointer-events-none absolute left-4 top-3 text-[14px] text-text-tertiary">{placeholder}</p>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          onInput={emitFromEditor}
          className="min-h-[260px] w-full bg-white px-4 py-3 text-[14px] leading-relaxed text-text-primary outline-none [&_a]:text-blue-primary [&_a]:underline [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-2.5 [&_h3]:text-base [&_h3]:font-semibold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared form furniture
// ---------------------------------------------------------------------------

function FormSection({
  icon: Icon,
  title,
  hint,
  count,
  action,
  defaultOpen = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  count?: number;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionSlug = sectionId(title);
  const panelId = `${sectionSlug}-panel`;

  return (
    // NO overflow-hidden. It clipped every dropdown that opened inside the
    // card, which is why the POC picker's search bar was cut off (Anir, Jul
    // 28). The header carries its own top radius instead.
    <section
      id={sectionSlug}
      className={cn(
        "scroll-mt-24 rounded-2xl border bg-white shadow-[0_3px_14px_rgba(15,23,42,0.055)] transition-[border-color,box-shadow] duration-200",
        open
          ? "border-blue-primary/25 shadow-[0_5px_20px_rgba(15,23,42,0.075)] ring-1 ring-blue-primary/5"
          : "border-[#D9E2EC]"
      )}
    >
      <header
        className={cn(
          "relative flex items-center gap-3 px-5 py-4 transition-colors",
          open
            ? "rounded-t-[15px] bg-blue-light/25"
            : "rounded-[15px] bg-[#FAFBFC] hover:bg-blue-light/15"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-y-4 left-0 w-[3px] rounded-r-full transition-colors",
            open ? "bg-blue-primary" : "bg-transparent"
          )}
        />
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          className="group flex min-w-0 flex-1 items-start gap-3 text-left outline-none"
        >
          <span
            className={cn(
              "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors",
              open
                ? "border-blue-primary/15 bg-white text-blue-primary shadow-sm"
                : "border-blue-primary/10 bg-blue-light text-blue-primary group-hover:bg-white"
            )}
          >
            <Icon size={16} strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span role="heading" aria-level={2} className="text-[14.5px] font-semibold text-text-primary">
                {title}
              </span>
              {typeof count === "number" && (
                <span className="tnum inline-flex min-w-6 items-center justify-center rounded-full bg-blue-light px-2 py-0.5 text-[11px] font-semibold text-blue-primary">
                  {count}
                </span>
              )}
            </span>
            <span className="mt-1 block text-[12px] leading-snug text-text-tertiary">
              {hint}
            </span>
          </span>
          <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition-colors group-hover:bg-white group-hover:text-blue-primary">
            <ChevronDown
              size={17}
              strokeWidth={2}
              className={cn("transition-transform duration-200", open && "rotate-180")}
            />
          </span>
        </button>
        {open && action && <div className="shrink-0">{action}</div>}
      </header>
      {open && (
        <div
          id={panelId}
          className="space-y-4 rounded-b-2xl border-t border-[#DCE5EE] bg-[#FBFCFE] p-5"
        >
          {children}
        </div>
      )}
    </section>
  );
}

/** A native <select> wearing the app's field styling — colour + icon tile on
 *  the left, chevron on the right. Keeps real keyboard and mobile behaviour. */
function SelectField({
  ariaLabel,
  value,
  onChange,
  accent,
  icon: Icon,
  children,
  className,
}: {
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  accent: string;
  icon: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex h-10 items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 transition-[border-color] hover:border-blue-subtle focus-within:border-blue-primary",
        className
      )}
    >
      <span
        className="pointer-events-none flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${accent}1F`, color: accent }}
      >
        <Icon size={13} strokeWidth={2.1} />
      </span>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-6 text-[13.5px] font-medium text-text-primary outline-none"
      >
        {children}
      </select>
      <ChevronDown
        size={15}
        strokeWidth={2}
        className="pointer-events-none absolute right-2.5 text-text-tertiary"
      />
    </div>
  );
}

/** The same shell around a free-text input, for fields that must stay typeable. */
function FieldShell({
  accent,
  icon: Icon,
  children,
}: {
  accent: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-10 items-center gap-2 rounded-lg border border-border-light bg-white px-2.5 transition-[border-color] hover:border-blue-subtle focus-within:border-blue-primary">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${accent}1F`, color: accent }}
      >
        <Icon size={13} strokeWidth={2.1} />
      </span>
      {children}
    </div>
  );
}

const BARE_INPUT =
  "h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-text-primary placeholder:text-text-tertiary outline-none focus:shadow-none";

export function OfferingForm({
  customerTypes,
  markets,
  existingTypes = [],
  offeringCategories = [],
  people = [],
  offeringId,
  roadmapDetails,
  roadmapEditable = false,
  initial,
}: {
  customerTypes: CustomerType[];
  markets: Market[];
  existingTypes?: string[];
  offeringCategories?: OfferingCategory[];
  /** Everyone in the workspace, for the POC picker. */
  people?: PickablePerson[];
  offeringId?: string;
  /** The structured roadmap, edited inline in the Product roadmap section. */
  roadmapDetails?: OfferingRoadmapDetails;
  /** False in Mock: the sample roadmap overlay must never be saved as real. */
  roadmapEditable?: boolean;
  initial?: {
    offering_type?: string;
    offering_category?: string;
    offering_name?: string;
    offering_description?: string;
    service_card_styles?: ServiceCardStyle[];
    current_availability?: string;
    future_availability?: string;
    poc?: string;
    customer_type_ids?: string[];
    market_ids?: string[];
    materials?: MaterialRow[];
    materialFolders?: string[];
  };
}) {
  const router = useRouter();
  // The roadmap is part of THIS form: it lives in the Product roadmap
  // section below and saves with the page's one Save button — no separate
  // save, no separate page (Anir, Aug 5: "there's already a save button at
  // the very end... everything's part of the same thing").
  const [roadmapDraft, setRoadmapDraft] = useState<OfferingRoadmapDetails>(
    () => structuredClone(roadmapDetails ?? blankRoadmapDetails())
  );
  const { toast } = useToast();
  const isEdit = !!offeringId;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Adding a material opens a proper dialog. It used to append a blank row
  // straight into the list, so the "form" was a wall of half-filled rows
  // (Anir, Jul 28: "the add material thing... that's not the way we work. It
  // should still be a nice pop-up").
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [draftMaterial, setDraftMaterial] = useState<MaterialRow>({
    kind: "video",
    label: "",
    url: "",
    journeyStage: "awareness",
    journeyStages: ["awareness"],
    accessLevel: "client_facing",
    folder: "Others",
  });
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        toast("Offering deleted.");
        router.push("/offerings");
        router.refresh();
      } else {
        toast(data.error || "Couldn't delete the offering.", "error");
        setDeleting(false);
      }
    } catch {
      toast("Couldn't delete the offering.", "error");
      setDeleting(false);
    }
  }

  const nameRef = useRef<HTMLInputElement>(null);
  const params = useSearchParams();
  // Arriving from a pre-filled copy (?focus=name) → land the cursor in the
  // name, text selected, so renaming is a single keystroke away.
  useEffect(() => {
    if (params.get("focus") === "name") {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [params]);
  const [offeringType, setOfferingType] = useState(initial?.offering_type ?? "");
  const [offeringCategory, setOfferingCategory] = useState(
    initial?.offering_category ?? ""
  );
  const [offeringName, setOfferingName] = useState(initial?.offering_name ?? "");

  // --- capability editor state ---------------------------------------------
  const seeded = useMemo(
    () =>
      toRows(
        initial?.offering_description ?? "",
        initial?.service_card_styles ?? []
      ),
    [initial?.offering_description, initial?.service_card_styles]
  );
  const [intro, setIntro] = useState(seeded.intro);
  const introRef = useRef<HTMLTextAreaElement>(null);
  const [capRows, setCapRows] = useState<CapRow[]>(seeded.rows);
  const [appearanceRow, setAppearanceRow] = useState<number | null>(null);
  /**
   * ADDING SOMETHING OPENS A POPUP. His standing rule, and this row was
   * breaking it: "Add capability" appended a blank input in the middle of an
   * already long form, so the thing you had just asked for appeared as an
   * empty box you had to go find (Anir, Jul 30: "what is this ad capability
   * thing, and why is that not a pop-up").
   *
   * `null` = closed. Otherwise it carries which kind of row is being added, so
   * one dialog serves both buttons.
   */
  const [addingCap, setAddingCap] = useState<null | CapRow["kind"]>(null);
  const [capDraft, setCapDraft] = useState("");
  const [capDescriptionDraft, setCapDescriptionDraft] = useState("");
  // Formatting is the primary authoring experience. The structured service
  // card editor remains available for owners who prefer one row at a time.
  // A structured brief renders as service cards on Overview, so open the same
  // card-shaped editor by default. Plain prose still opens as a document.
  const [pasteMode, setPasteMode] = useState(seeded.rows.length === 0);
  const [pasted, setPasted] = useState(
    composeDescription(seeded.intro, seeded.rows)
  );
  const description = pasteMode ? pasted : composeDescription(intro, capRows);
  const serviceCardStyles = capRows
    .filter((row) => row.kind === "item")
    .map((row) => row.style ?? {});
  while (
    serviceCardStyles.length &&
    !serviceCardStyles.at(-1)?.icon &&
    !serviceCardStyles.at(-1)?.color
  )
    serviceCardStyles.pop();
  const capCount = capRows.filter((r) => r.kind === "item" && r.text.trim()).length;
  const appearanceCard =
    appearanceRow === null ? undefined : capRows[appearanceRow];
  const appearanceFields = serviceCardFields(appearanceCard?.text ?? "");
  const appearanceStyleKey =
    stripBriefFormatting(appearanceCard?.text ?? "") || "service";
  const appearanceMark = serviceCardMark(
    appearanceStyleKey,
    appearanceCard?.style
  );
  const AppearanceIcon = appearanceMark.icon;
  const appearanceAutomaticMark = offeringMark(
    appearanceStyleKey
  );
  const AppearanceAutomaticIcon = appearanceAutomaticMark.icon;

  function updateAppearance(style: Partial<ServiceCardStyle>) {
    if (appearanceRow === null) return;
    setCapRows((rows) =>
      rows.map((row, index) =>
        index === appearanceRow
          ? { ...row, style: { ...row.style, ...style } }
          : row
      )
    );
  }

  // The opening overview is often several sentences. Keep the whole value in
  // view instead of forcing the owner to scroll inside a two-line field.
  useEffect(() => {
    const field = introRef.current;
    if (!field || pasteMode) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [intro, pasteMode]);

  function openPaste() {
    setPasted(composeDescription(intro, capRows));
    setPasteMode(true);
  }
  function openList() {
    const next = toRows(pasted, serviceCardStyles);
    setIntro(next.intro);
    setCapRows(next.rows);
    setPasteMode(false);
  }

  const initAvail = parseAvailability(initial?.current_availability);
  const [availMode, setAvailMode] = useState<AvailMode>(initAvail.mode);
  const [availMonth, setAvailMonth] = useState(initAvail.month);
  const [availYear, setAvailYear] = useState(initAvail.year);
  const current = buildAvailability(availMode, availMonth, availYear);
  const [future, setFuture] = useState(initial?.future_availability ?? "");
  const [poc, setPoc] = useState(initial?.poc ?? "");
  // `poc` stays ONE string on the record (every card, the CSV export and search
  // read it); the picker just works in list form.
  const pocList = useMemo(() => pocNames(poc), [poc]);
  // The catalogue's own offering types, each with a stable colour + the mark
  // that type already wears elsewhere, plus whatever this offering carries.
  const typeOptions: ColorOption[] = useMemo(() => {
    const names = Array.from(
      new Set([...existingTypes, offeringType].filter(Boolean))
    );
    return [
      { value: "", label: "No type set", color: "#64748B", icon: Package },
      ...names.map((t, i) => ({
        value: t,
        label: t,
        color: FILTER_PALETTE[i % FILTER_PALETTE.length],
        icon: Package,
      })),
    ];
  }, [existingTypes, offeringType]);

  // Each category wears the same hue it wears on the cards and the filters.
  const categoryOptions: ColorOption[] = useMemo(() => {
    const names = Array.from(
      new Set([
        ...offeringCategories.map((c) => c.name),
        ...(offeringCategory ? [offeringCategory] : []),
      ])
    );
    return [
      { value: "", label: "No category", color: "#64748B", icon: Layers },
      ...names.map((n, i) => ({
        value: n,
        label: n,
        color: FILTER_PALETTE[(i + 3) % FILTER_PALETTE.length],
        icon: Layers,
      })),
    ];
  }, [offeringCategories, offeringCategory]);
  const [ctIds, setCtIds] = useState<string[]>(initial?.customer_type_ids ?? []);
  const [mktIds, setMktIds] = useState<string[]>(initial?.market_ids ?? []);
  const initialMaterials = useMemo<MaterialRow[]>(
    () =>
      // Legacy rows without CR-3 tags get the default pairing here, visibly —
      // what the dropdowns show is exactly what saving will persist.
      (initial?.materials ?? []).map((m) => ({
        ...m,
        journeyStage: materialJourneyStages(m)[0] ?? "awareness",
        journeyStages: materialJourneyStages(m).length
          ? materialJourneyStages(m)
          : (["awareness"] as JourneyStage[]),
        folder: canonicalMaterialFolder(m as never),
        accessLevel: m.accessLevel ?? "client_facing",
      })),
    [initial?.materials]
  );
  const [materials, setMaterials] = useState<MaterialRow[]>(initialMaterials);
  const materialFolderOptions = allFolders(
    materials,
    initial?.materialFolders ?? []
  );
  const materialsChanged =
    JSON.stringify(materials) !== JSON.stringify(initialMaterials);
  // These snapshots deliberately mirror every owner-editable value sent by
  // submit(). A field missing here can hide Save and lose that edit, so the
  // regression test changes every key individually.
  const currentEditSnapshot: Record<string, unknown> = {
    offeringType,
    offeringCategory,
    offeringName,
    description,
    serviceCardStyles,
    current,
    future,
    poc,
    ctIds,
    mktIds,
    materials,
    ...(isEdit && roadmapEditable ? { roadmapDraft } : {}),
  };
  const initialEditSnapshot: Record<string, unknown> = {
    offeringType: initial?.offering_type ?? "",
    offeringCategory: initial?.offering_category ?? "",
    offeringName: initial?.offering_name ?? "",
    description: composeDescription(seeded.intro, seeded.rows),
    serviceCardStyles: initial?.service_card_styles ?? [],
    current: buildAvailability(
      initAvail.mode,
      initAvail.month,
      initAvail.year
    ),
    future: initial?.future_availability ?? "",
    poc: initial?.poc ?? "",
    ctIds: initial?.customer_type_ids ?? [],
    mktIds: initial?.market_ids ?? [],
    materials: initialMaterials,
    ...(isEdit && roadmapEditable
      ? { roadmapDraft: roadmapDetails ?? blankRoadmapDetails() }
      : {}),
  };
  const hasOfferingChanges =
    !isEdit ||
    hasOfferingEditChanges(currentEditSnapshot, initialEditSnapshot);

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  // Group the customer-type chips by family for scannable selection.
  const CT_FAMILY_ORDER = ["Pharmaceutical", "Biologics", "Bio Pharmaceutical", "Medical Devices", "Consumer Products"];
  const ctGroups = CT_FAMILY_ORDER.map((fam) => ({
    fam,
    types: customerTypes.filter((c) => c.family === fam),
  })).filter((g) => g.types.length > 0);
  const ctOther = customerTypes.filter(
    (c) => !CT_FAMILY_ORDER.includes(c.family)
  );

  const categoryAccent = (() => {
    const i = offeringCategories.findIndex((c) => c.name === offeringCategory);
    return i >= 0 ? FILTER_PALETTE[i % FILTER_PALETTE.length] : "#0071E3";
  })();
  const typeAccent = (() => {
    const i = existingTypes.indexOf(offeringType);
    return i >= 0 ? FILTER_PALETTE[(i + 3) % FILTER_PALETTE.length] : "#0071E3";
  })();
  const availAccent = AVAIL_META[availMode].color;

  async function submit() {
    setSaveError(null);
    if (!offeringName.trim()) {
      setSaveError("Give the offering a name first.");
      nameRef.current?.focus();
      nameRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    // A material row with only a name or only a link is a half-filled mistake —
    // it would be silently dropped on save. Flag it so the user doesn't lose it.
    const partial = materials.find(
      (m) =>
        (m.label.trim() && !m.url.trim()) || (!m.label.trim() && m.url.trim())
    );
    if (partial) {
      setSaveError(
        partial.label.trim()
          ? `Add a link for “${partial.label.trim()}”: or remove that material.`
          : "Add a name for that material: or remove the empty link."
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        isEdit ? `/api/offerings/${offeringId}` : "/api/offerings",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offering_type: offeringType,
            offering_category: offeringCategory,
            offering_name: offeringName,
            offering_description: description,
            service_card_styles: serviceCardStyles,
            current_availability: current,
            future_availability: future,
            poc,
            customer_type_ids: ctIds,
            market_ids: mktIds,
            // The roadmap edits ride the same save as everything else on
            // this page. Never sent from Mock: the sample overlay must not
            // overwrite the real roadmap.
            ...(isEdit && roadmapEditable
              ? { roadmap_details: roadmapDraft }
              : {}),
            ...(!isEdit || materialsChanged
              ? {
                  materials: materials
                    .filter((m) => m.label.trim() && m.url.trim())
                    .map((m) => ({ ...m, url: normalizeUrl(m.url) })),
                }
              : {}),
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        setSaveError(null);
        toast(isEdit ? "Offering updated." : "Offering saved.");
        router.push(`/offerings/${isEdit ? offeringId : data.offering.id}`);
        router.refresh();
      } else {
        setSaveError(
          readableOfferingSaveError(
            data.error || "The offering could not be saved."
          )
        );
      }
    } catch {
      setSaveError(
        "The offering could not be saved because the connection failed. Your edits are still here; try Save changes again."
      );
    } finally {
      setSaving(false);
    }
  }

  const modeButton = (on: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
      on
        ? "bg-white text-blue-primary shadow-card"
        : "text-text-secondary hover:text-text-primary"
    );

  return (
    // Width belongs to the PAGE, not the form. This used to be a hard
    // max-w-[880px], which on a normal monitor pinned every field to the left
    // edge with a third of the screen empty beside it (Anir, Jul 28: "I don't
    // know why everything is aligned to the left").
    <div className="w-full space-y-4">
      {/* ------------------------------------------------------ the basics */}
      <FormSection
        icon={Package}
        title="The basics"
        hint="What this offering is called, where it sits in the catalog, and who owns it."
        defaultOpen
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Offering type</label>
            {/* A colour+icon picker like every other dropdown in the app. It
                was a bare text input wearing a datalist, which renders as the
                browser's own grey autocomplete and looked nothing like the
                rest of the product. */}
            <ColorSelect
              value={offeringType}
              options={typeOptions}
              onChange={setOfferingType}
              ariaLabel="Offering type"
            />
            {existingTypes.length > 0 && (
              <datalist id="offering-types">
                {existingTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            )}
          </div>
          <div>
            <label className={LABEL}>
              Offering name <span className="text-error">*</span>
            </label>
            <input
              ref={nameRef}
              className={FIELD}
              value={offeringName}
              onChange={(e) => setOfferingName(e.target.value)}
              placeholder="e.g. Freya.Register"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Offering category</label>
            {/* The last raw <select> in this form. It rendered as the
                browser's own grey list, no colour, no icon, nothing like the
                pickers beside it. */}
            <ColorSelect
              value={offeringCategory}
              options={categoryOptions}
              onChange={setOfferingCategory}
              ariaLabel="Offering category"
            />
            <p className="mt-1 text-[11.5px] text-text-tertiary">
              Manage the list under{" "}
              <span className="font-medium">Offering categories</span>.
            </p>
          </div>
          <div>
            <label className={LABEL}>Service delivery POC</label>
            {/* A picker over the people already in the workspace, with faces,
                not a box you have to spell a name into. */}
            <PeoplePicker
              people={people}
              value={pocList}
              onChange={(next) => setPoc(next.join(" / "))}
              emptyLabel="Pick who a rep should call"
              placeholder="Search people in your workspace…"
            />
          </div>
        </div>
      </FormSection>

      {/* ------------------------------------------------- what's included */}
      <FormSection
        icon={ListChecks}
        title="Offering brief & service cards"
        hint="Edit the opening overview and the same service cards sellers see on the offering page."
        action={
          <div className="flex items-center gap-1 rounded-lg bg-surface p-1">
            <button
              type="button"
              onClick={openPaste}
              className={modeButton(pasteMode)}
            >
              <PencilLine size={12} strokeWidth={2.2} /> Document editor
            </button>
            <button
              type="button"
              onClick={openList}
              className={modeButton(!pasteMode)}
            >
              <List size={12} strokeWidth={2.2} /> Service cards
            </button>
          </div>
        }
      >
        {!pasteMode && (
          <div>
            <label className={LABEL}>Opening line (optional)</label>
            <textarea
              ref={introRef}
              className={`${FIELD} h-auto min-h-[112px] resize-none overflow-hidden py-2.5 leading-relaxed`}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="One or two sentences of context before the list."
              aria-label="Opening line"
            />
          </div>
        )}

        {pasteMode ? (
          <div>
            <label className={LABEL}>Offering brief</label>
            <RichBriefEditor
              value={pasted}
              onChange={setPasted}
              placeholder={"Add an overview, then format services with headings, bold labels and lists."}
              ariaLabel="Offering brief"
            />
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Formatting is saved safely. Each bulleted service becomes a card
              on Overview; use <span className="font-medium">Service cards</span>
              to edit those cards directly.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#DCE5EE] px-0.5 pb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-[14px] font-semibold text-text-primary">
                    Included services
                  </h3>
                  <span className="tnum inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-light px-2 text-[11px] font-semibold text-blue-primary">
                    {capCount}
                  </span>
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-text-tertiary">
                  These cards appear under What&apos;s included on the seller view.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCapDraft("");
                    setCapDescriptionDraft("");
                    setAddingCap("section");
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#CFDAE6] bg-white px-3 py-2 text-[12.5px] font-semibold text-text-secondary shadow-sm transition-colors hover:border-blue-subtle hover:text-text-primary"
                >
                  <Layers size={14} strokeWidth={2} /> Add heading
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCapDraft("");
                    setCapDescriptionDraft("");
                    setAddingCap("item");
                  }}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-3 py-2 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-hover"
                >
                  <Plus size={14} strokeWidth={2.2} /> Add service
                </button>
              </div>
            </div>
            {capRows.length === 0 && (
              <p className="rounded-lg border border-dashed border-border-light px-3 py-4 text-center text-[12.5px] text-text-secondary">
                Nothing listed yet. Add the services that make up this offering,
                one per row.
              </p>
            )}
            {capRows.map((row, i) => {
              const isSection = row.kind === "section";
              const fields = serviceCardFields(row.text);
              const mark = serviceCardMark(
                stripBriefFormatting(row.text) || offeringName || "offering",
                row.style
              );
              const accent = isSection ? "#0071E3" : mark.color;
              const RowIcon = isSection ? Layers : mark.icon;
              const iconLabel = mark.iconLabel;
              const colorLabel = mark.colorLabel;
              const updateCard = (heading: string, cardDescription: string) =>
                setCapRows((list) =>
                  list.map((item, index) =>
                    index === i
                      ? {
                          ...item,
                          text: serviceCardText(heading, cardDescription),
                        }
                      : item
                  )
                );
              return (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl border border-border-light bg-white p-3.5",
                    isSection && "items-center bg-surface/40"
                  )}
                >
                  {isSection ? (
                    <div className="flex items-end gap-3">
                      <span
                        className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                        style={{ background: `${accent}1F`, color: accent }}
                      >
                        <RowIcon size={16} strokeWidth={2} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <label className={LABEL}>Group heading</label>
                        <input
                          className={cn(FIELD, "font-semibold")}
                          value={row.text}
                          onChange={(event) =>
                            setCapRows((list) =>
                              list.map((item, index) =>
                                index === i ? { ...item, text: event.target.value } : item
                              )
                            )
                          }
                          placeholder="e.g. Product & Portfolio Strategy"
                          aria-label="Group heading"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setCapRows((l) => l.filter((_, j) => j !== i))}
                        aria-label="Remove group heading"
                        className="mb-1 shrink-0 rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-error"
                      >
                        <Trash2 size={15} strokeWidth={1.7} />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 rounded-xl border border-border-light bg-surface/55 p-3">
                        <button
                          type="button"
                          onClick={() => setAppearanceRow(i)}
                          aria-label={`Change ${fields.heading || "service"} card icon and color`}
                          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm outline-none transition-transform hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-blue-primary/30"
                          style={{
                            backgroundImage: `linear-gradient(135deg, ${mark.color}, ${mark.light})`,
                          }}
                        >
                          <RowIcon size={20} strokeWidth={2} />
                          <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-primary text-white shadow-sm">
                            <PencilLine size={9} strokeWidth={2.4} />
                          </span>
                        </button>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">
                            Seller view preview
                          </p>
                          <p className="mt-1 text-[13.5px] leading-relaxed text-text-primary">
                            <span className="font-semibold">
                              {fields.heading || "Untitled service"}
                              {fields.description ? ": " : ""}
                            </span>
                            {fields.description || "Add a description to show what this service includes."}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCapRows((l) => l.filter((_, j) => j !== i))}
                          aria-label="Remove service"
                          className="shrink-0 rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-white hover:text-error"
                        >
                          <Trash2 size={15} strokeWidth={1.7} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)]">
                        <div className="min-w-0">
                          <label className={LABEL}>Card heading</label>
                          <input
                            className={cn(FIELD, "font-semibold")}
                            value={fields.heading}
                            onChange={(event) =>
                              updateCard(event.target.value, fields.description)
                            }
                            placeholder="e.g. Products"
                            aria-label={`Card ${i + 1} heading`}
                          />
                        </div>
                        <div className="min-w-0">
                          <label className={LABEL}>Card description</label>
                          <textarea
                            className={`${FIELD} h-auto min-h-[72px] resize-y py-2 leading-relaxed`}
                            value={fields.description}
                            onChange={(event) =>
                              updateCard(fields.heading, event.target.value)
                            }
                            placeholder="Explain what this service does for the seller."
                            aria-label={`Card ${i + 1} description`}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-light bg-white p-2.5">
                        <span className="mr-auto text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                          Card appearance
                        </span>
                        <button
                          type="button"
                          onClick={() => setAppearanceRow(i)}
                          className="inline-flex min-w-[142px] items-center gap-2 rounded-lg border border-border-light px-2.5 py-2 text-left transition-colors hover:border-blue-subtle hover:bg-blue-light/30"
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white"
                            style={{
                              backgroundImage: `linear-gradient(135deg, ${mark.color}, ${mark.light})`,
                            }}
                          >
                            <RowIcon size={13} strokeWidth={2} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[10px] uppercase tracking-[0.04em] text-text-tertiary">Icon</span>
                            <span className="block truncate text-[12.5px] font-semibold text-text-primary">{iconLabel}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAppearanceRow(i)}
                          className="inline-flex min-w-[142px] items-center gap-2 rounded-lg border border-border-light px-2.5 py-2 text-left transition-colors hover:border-blue-subtle hover:bg-blue-light/30"
                        >
                          <span
                            className="h-7 w-7 shrink-0 rounded-full border border-white shadow-sm"
                            style={{
                              backgroundImage: `linear-gradient(135deg, ${mark.color}, ${mark.light})`,
                            }}
                          />
                          <span className="min-w-0">
                            <span className="block text-[10px] uppercase tracking-[0.04em] text-text-tertiary">Color</span>
                            <span className="block truncate text-[12.5px] font-semibold text-text-primary">{colorLabel}</span>
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <Modal
              open={appearanceRow !== null && appearanceCard?.kind === "item"}
              onClose={() => setAppearanceRow(null)}
              title="Card appearance"
            >
              <div className="space-y-5">
                <div className="flex items-center gap-3 rounded-xl border border-border-light bg-surface/40 p-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${appearanceMark.color}, ${appearanceMark.light})`,
                    }}
                  >
                    <AppearanceIcon size={19} strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                      Preview
                    </p>
                    <p className="truncate text-[14px] font-semibold text-text-primary">
                      {appearanceFields.heading || "Untitled service"}
                    </p>
                  </div>
                </div>

                <div>
                  <label className={LABEL}>Icon</label>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    <button
                      type="button"
                      onClick={() => {
                        if (appearanceRow === null) return;
                        setCapRows((rows) =>
                          rows.map((row, index) => {
                            if (index !== appearanceRow) return row;
                            const next = { ...row.style };
                            delete next.icon;
                            return { ...row, style: next };
                          })
                        );
                      }}
                      aria-label={`Use suggested ${appearanceAutomaticMark.iconLabel} icon`}
                      className={cn(
                        "relative flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[10px] font-medium transition-colors",
                        !appearanceCard?.style?.icon
                          ? "border-blue-primary bg-blue-light text-blue-primary"
                          : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                      )}
                    >
                      <AppearanceAutomaticIcon size={17} strokeWidth={2} />
                      {appearanceAutomaticMark.iconLabel}
                      {!appearanceCard?.style?.icon && (
                        <Check className="absolute right-1 top-1" size={11} strokeWidth={2.5} />
                      )}
                    </button>
                    {SERVICE_CARD_ICON_OPTIONS.map((option) => {
                      const Icon = SERVICE_CARD_ICON_COMPONENTS[option.value];
                      const selected = appearanceCard?.style?.icon === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateAppearance({ icon: option.value })}
                          aria-label={`Use ${option.label} icon`}
                          className={cn(
                            "relative flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[10px] font-medium transition-colors",
                            selected
                              ? "border-blue-primary bg-blue-light text-blue-primary"
                              : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-text-primary"
                          )}
                        >
                          <Icon size={17} strokeWidth={2} />
                          {option.label}
                          {selected && (
                            <Check className="absolute right-1 top-1" size={11} strokeWidth={2.5} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className={LABEL}>Color</label>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    <button
                      type="button"
                      onClick={() => {
                        if (appearanceRow === null) return;
                        setCapRows((rows) =>
                          rows.map((row, index) => {
                            if (index !== appearanceRow) return row;
                            const next = { ...row.style };
                            delete next.color;
                            return { ...row, style: next };
                          })
                        );
                      }}
                      aria-label={`Use suggested ${appearanceAutomaticMark.colorLabel} color`}
                      className={cn(
                        "relative flex h-11 items-center gap-2 rounded-lg border px-2 text-[11px] font-medium transition-colors",
                        !appearanceCard?.style?.color
                          ? "border-blue-primary bg-blue-light text-blue-primary"
                          : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                      )}
                    >
                      <span
                        className="h-5 w-5 rounded-full"
                        style={{
                          backgroundImage: `linear-gradient(135deg, ${appearanceAutomaticMark.color}, ${appearanceAutomaticMark.light})`,
                        }}
                      />
                      {appearanceAutomaticMark.colorLabel}
                      {!appearanceCard?.style?.color && (
                        <Check className="absolute right-1.5 top-1.5" size={11} strokeWidth={2.5} />
                      )}
                    </button>
                    {SERVICE_CARD_COLOR_OPTIONS.map((option) => {
                      const selected = appearanceCard?.style?.color === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => updateAppearance({ color: option.value })}
                          aria-label={`Use ${option.label} color`}
                          className={cn(
                            "relative flex h-11 items-center gap-2 rounded-lg border px-2 text-[11px] font-medium transition-colors",
                            selected
                              ? "border-blue-primary bg-blue-light text-blue-primary"
                              : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                          )}
                        >
                          <span
                            className="h-5 w-5 rounded-full"
                            style={{
                              backgroundImage: `linear-gradient(135deg, ${option.color}, ${option.light})`,
                            }}
                          />
                          {option.label}
                          {selected && (
                            <Check className="absolute right-1.5 top-1.5" size={11} strokeWidth={2.5} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-border-light pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (appearanceRow === null) return;
                      setCapRows((rows) =>
                        rows.map((row, index) =>
                          index === appearanceRow ? { ...row, style: undefined } : row
                        )
                      );
                    }}
                    disabled={!appearanceCard?.style?.icon && !appearanceCard?.style?.color}
                    className="text-[12.5px] font-semibold text-text-secondary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Reset to automatic
                  </button>
                  <Button onClick={() => setAppearanceRow(null)}>Done</Button>
                </div>
              </div>
            </Modal>
            <Modal
              open={addingCap !== null}
              onClose={() => setAddingCap(null)}
              title={
                addingCap === "section" ? "Add a group heading" : "Add a service"
              }
            >
              <div className="space-y-4">
                <p className="text-[12.5px] leading-relaxed text-text-secondary">
                  {addingCap === "section"
                    ? "A heading groups the services under it on the offering page — use it when the list is long enough to need sections."
                    : "One thing Freyr actually does inside this offering. Each one becomes its own card on the offering page, so a rep can point at it in a conversation."}
                </p>
                {addingCap === "section" ? (
                  <div>
                    <label className={LABEL}>Group heading</label>
                    <input
                      autoFocus
                      className={FIELD}
                      value={capDraft}
                      onChange={(event) => setCapDraft(event.target.value)}
                      placeholder="e.g. Product & Portfolio Strategy"
                      aria-label="Group heading"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className={LABEL}>Card heading</label>
                      <input
                        autoFocus
                        className={FIELD}
                        value={capDraft}
                        onChange={(event) => setCapDraft(event.target.value)}
                        placeholder="e.g. Products"
                        aria-label="New service card heading"
                      />
                    </div>
                    <div>
                      <label className={LABEL}>Card description</label>
                      <textarea
                        className={`${FIELD} h-auto min-h-[88px] resize-y py-2 leading-relaxed`}
                        value={capDescriptionDraft}
                        onChange={(event) =>
                          setCapDescriptionDraft(event.target.value)
                        }
                        placeholder="Explain what this service does for the seller."
                        aria-label="New service card description"
                      />
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setAddingCap(null)}>
                    Done
                  </Button>
                  <Button
                    disabled={!capDraft.trim()}
                    onClick={() => {
                      setCapRows((l) => [
                        ...l,
                        {
                          kind: addingCap ?? "item",
                          text:
                            addingCap === "section"
                              ? capDraft.trim()
                              : serviceCardText(
                                  capDraft,
                                  capDescriptionDraft
                                ),
                        },
                      ]);
                      setAddingCap(null);
                    }}
                  >
                    {addingCap === "section" ? "Add heading" : "Add service"}
                  </Button>
                </div>
              </div>
            </Modal>
          </div>
        )}
      </FormSection>

      {/* ------------------------------------------------------- who it's for */}
      <FormSection
        icon={Building2}
        title="Who it's for"
        hint="The customer types this offering applies to: by family and company size."
      >
        {ctGroups.map(({ fam, types }) => {
          const ids = types.map((t) => t.id);
          const allOn = ids.every((id) => ctIds.includes(id));
          const famColor = FAMILY_COLOR[fam] || "#0071E3";
          return (
            <div
              key={fam}
              className="rounded-xl border border-border-light bg-surface/30 p-3"
              style={{ borderLeft: `3px solid ${famColor}` }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.05em]"
                  style={{ color: famColor }}
                >
                  {fam}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setCtIds((l) =>
                      allOn
                        ? l.filter((id) => !ids.includes(id))
                        : Array.from(new Set([...l, ...ids]))
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-border-light bg-white px-2 py-0.5 text-[10.5px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
                >
                  {allOn ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {types.map((c) => {
                  const on = ctIds.includes(c.id);
                  const meta = sizeMeta(c.size);
                  const TierIcon = meta.icon;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setCtIds((l) => toggle(l, c.id))}
                      aria-pressed={on}
                      aria-label={c.name}
                      title={c.name}
                      style={
                        on
                          ? { background: meta.bg, color: meta.color, borderColor: meta.color }
                          : undefined
                      }
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                        !on &&
                          "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                      )}
                    >
                      <TierIcon size={12} strokeWidth={2.2} aria-hidden="true" />
                      {c.size}
                      {on && <Check size={12} strokeWidth={2.8} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {ctOther.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ctOther.map((c) => {
              const on = ctIds.includes(c.id);
              const meta = sizeMeta(c.size);
              const TierIcon = meta.icon;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCtIds((l) => toggle(l, c.id))}
                  aria-pressed={on}
                  style={
                    on
                      ? { background: meta.bg, color: meta.color, borderColor: meta.color }
                      : undefined
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                    !on &&
                      "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                  )}
                >
                  <TierIcon size={12} strokeWidth={2.2} aria-hidden="true" />
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </FormSection>

      {/* ------------------------------------------------ where + when */}
      <FormSection
        icon={CalendarClock}
        title="Where it's available"
        hint="When customers can buy it, and the markets it's cleared for."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Current availability</label>
            <ColorSelect
              value={availMode}
              options={AVAIL_OPTIONS}
              onChange={(v) => setAvailMode(v as AvailMode)}
              ariaLabel="Current availability"
            />
            {availMode === "date" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <ColorSelect
                  value={availMonth}
                  options={MONTH_OPTIONS}
                  onChange={setAvailMonth}
                  ariaLabel="Availability month"
                />
                <ColorSelect
                  value={availYear}
                  options={YEAR_OPTIONS}
                  onChange={setAvailYear}
                  ariaLabel="Availability year"
                />
              </div>
            )}
          </div>
          <div>
            <label className={LABEL}>Availability comments</label>
            <FieldShell accent="#4F46E5" icon={Clock}>
              <input
                className={BARE_INPUT}
                value={future}
                onChange={(e) => setFuture(e.target.value)}
                placeholder="e.g. Version 1 · pilot now · end of this year"
                aria-label="Availability comments"
              />
            </FieldShell>
          </div>
        </div>

        <div>
          <label className={LABEL}>Applicable markets</label>
          <div className="flex flex-wrap gap-2">
            {markets.map((m) => {
              const on = mktIds.includes(m.id);
              const st = marketStyle(m.name);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMktIds((l) => toggle(l, m.id))}
                  aria-pressed={on}
                  style={
                    on
                      ? {
                          background: `${st.color}14`,
                          color: st.color,
                          borderColor: st.color,
                        }
                      : undefined
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                    !on &&
                      "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                  )}
                >
                  <span aria-hidden="true" className="text-[13px] leading-none">
                    {st.flag}
                  </span>
                  {m.name}
                  {on && <Check size={12} strokeWidth={2.8} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </FormSection>

      {/* ------------------------------------------------ product roadmap */}
      {/* The complete roadmap editor lives right here in the accordion and
          saves with the page's ONE Save button — no inner save, no separate
          page, no new tab. */}
      {isEdit && offeringId && (
        <FormSection
          icon={Route}
          title="Product roadmap"
          hint="The version timeline, modules, comparison and history sellers see on the Roadmap tab. Saves with this page's Save button."
        >
          {roadmapEditable ? (
            <div className="space-y-4">
              <RoadmapEditorFields
                draft={roadmapDraft}
                onChange={setRoadmapDraft}
                canSeeNext
              />
            </div>
          ) : (
            <p className="rounded-xl border border-border-light bg-surface/60 p-4 text-[12.5px] leading-relaxed text-text-secondary">
              The roadmap shown in Mock is a read-only sample. Switch to Real
              mode to edit the actual roadmap.
            </p>
          )}
        </FormSection>
      )}

      {/* ---------------------------------------------------- sales materials */}
      <FormSection
        icon={FolderOpen}
        title="Sales materials"
        hint="Videos, presentations, documents: anything a rep hands a customer."
        count={materials.length}
        action={
          <button
            type="button"
            onClick={() => {
              setDraftMaterial({
                kind: "video",
                label: "",
                url: "",
                journeyStage: "awareness",
                journeyStages: ["awareness"],
                accessLevel: "client_facing",
                folder: "Others",
              });
              setAddingMaterial(true);
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-light px-2.5 py-1.5 text-[12.5px] font-semibold text-blue-primary transition-colors hover:bg-blue-subtle/60"
          >
            <Plus size={14} strokeWidth={2.2} /> Add material
          </button>
        }
      >
        {materials.length === 0 && (
          <p className="rounded-lg border border-dashed border-border-light px-3 py-4 text-center text-[12.5px] text-text-secondary">
            Nothing attached yet. Add the materials behind this offering, a
            video, a presentation, a document, or anything else a rep hands a
            customer. The name you give each file says what it is.
          </p>
        )}
        {/* THE LIST SCROLLS INSIDE ITSELF. Twenty-five materials, each two rows
            tall, pushed everything below them — including Save — thousands of
            pixels down the page (Anir, Jul 30: "for the sales material, it's
            just way too long. It should be contained within a container that I
            can scroll through"). Capped at roughly four rows so the section
            reads as one block you scroll, and everything after it stays where
            you left it. Under five materials it never scrolls at all. */}
        <div
          className={cn(
            "space-y-2",
            materials.length > 4 &&
              "material-scroll max-h-[460px] overflow-y-auto rounded-xl border border-border-light bg-white p-2"
          )}
        >
        {materials.map((m, i) => {
          const MaterialIcon = MATERIAL_ICON[m.kind] || Package;
          const linkedMaterial = /^https?:\/\//i.test(m.url);
          return (
            <div
              key={i}
              className="rounded-xl border border-border-light bg-[var(--surface)] p-3.5"
            >
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-light text-blue-primary">
                  <MaterialIcon size={16} strokeWidth={1.9} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-text-primary">
                    {m.label || `Material ${i + 1}`}
                  </p>
                  <p className="text-[11px] text-text-tertiary">
                    {linkedMaterial ? "Linked material" : "Uploaded file"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMaterials((l) => l.filter((_, j) => j !== i))}
                  aria-label={`Remove ${m.label || "material"}`}
                  className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-[color:#B02020]/10 hover:text-[color:#B02020]"
                >
                  <Trash2 size={15} strokeWidth={1.8} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div className="xl:col-span-2">
                  <label className={LABEL}>Name</label>
                  <input
                    value={m.label}
                    onChange={(e) => setMaterials((l) => l.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                    placeholder="Material name"
                    className={FIELD}
                  />
                </div>
                <div>
                  <label className={LABEL}>Format</label>
                  <ColorSelect
                    value={m.kind}
                    options={kindOptionsFor(m.kind)}
                    onChange={(v) => setMaterials((l) => l.map((x, j) => j === i ? { ...x, kind: v as MaterialKind } : x))}
                    ariaLabel="File format"
                    minWidth={0}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className={LABEL}>Folder</label>
                  <ColorSelect
                    value={m.folder || "Others"}
                    options={materialFolderOptions.map((folder) => ({ value: folder, label: materialFolderLabel(folder), color: "#0071E3", icon: Folder }))}
                    onChange={(folder) => setMaterials((list) => list.map((item, index) => index === i ? { ...item, folder } : item))}
                    ariaLabel="Material folder"
                    minWidth={0}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className={LABEL}>Buyer stage</label>
                  <MultiColorSelect
                    values={m.journeyStages ?? [m.journeyStage ?? "awareness"]}
                    options={STAGE_OPTIONS}
                    onChange={(values) => setMaterials((l) => l.map((x, j) => j === i ? { ...x, journeyStage: values[0] as JourneyStage, journeyStages: values as JourneyStage[] } : x))}
                    allLabel="Journey stages"
                    allIcon={Route}
                    allColor="#7C3AED"
                    ariaLabel="Buyer's journey stage"
                    minWidth={0}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className={LABEL}>Viewing access</label>
                  <ColorSelect
                    value={m.accessLevel ?? "client_facing"}
                    options={ACCESS_OPTIONS}
                    onChange={(v) => setMaterials((l) => l.map((x, j) => j === i ? { ...x, accessLevel: v as AccessLevel } : x))}
                    ariaLabel="Who can view this file?"
                    minWidth={0}
                    compactTrigger
                    className="w-full"
                  />
                </div>
                {linkedMaterial && (
                  <div className="md:col-span-2 xl:col-span-4">
                    <label className={LABEL}>Source link</label>
                    <input
                      value={m.url}
                      onChange={(e) => setMaterials((l) => l.map((x, j) => j === i ? { ...x, url: e.target.value } : x))}
                      placeholder="https://…"
                      className={FIELD}
                    />
                  </div>
                )}
                <div className={linkedMaterial ? "md:col-span-2 xl:col-span-2" : "md:col-span-2 xl:col-span-6"}>
                  <label className={LABEL}>Description <span className="font-normal normal-case tracking-normal">(optional)</span></label>
                  <input
                    value={m.description ?? ""}
                    onChange={(e) => setMaterials((l) => l.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                    placeholder="What this material is for"
                    className={FIELD}
                  />
                </div>
              </div>
            </div>
          );
        })}
        </div>
        {materials.length > 4 && (
          <p className="text-[11.5px] text-text-tertiary">
            <span className="tnum font-semibold">{materials.length}</span>{" "}
            materials — scroll inside the box above to reach them all.
          </p>
        )}
      </FormSection>

      {/* Add material: a real dialog with one field per line, instead of a
          blank row appended to the list. */}
      <Modal
        open={addingMaterial}
        onClose={() => setAddingMaterial(false)}
        title="Add a sales material"
      >
        <div className="space-y-3">
          <div>
            <label className={LABEL}>What is it</label>
            <ColorSelect
              value={draftMaterial.kind}
              options={kindOptionsFor(draftMaterial.kind)}
              onChange={(v) =>
                setDraftMaterial((d) => ({ ...d, kind: v as MaterialKind }))
              }
              ariaLabel="File format"
              minWidth={0}
              className="w-full"
            />
          </div>
          <div>
            <label className={LABEL}>Name</label>
            <input
              autoFocus
              className={FIELD}
              value={draftMaterial.label}
              onChange={(e) =>
                setDraftMaterial((d) => ({ ...d, label: e.target.value }))
              }
              placeholder="e.g. Freya.Register overview deck"
            />
          </div>
          <div>
            <label className={LABEL}>Link</label>
            <input
              className={FIELD}
              value={draftMaterial.url}
              onChange={(e) =>
                setDraftMaterial((d) => ({ ...d, url: e.target.value }))
              }
              placeholder="https://…"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Where it fits</label>
              <MultiColorSelect
                values={draftMaterial.journeyStages ?? [draftMaterial.journeyStage ?? "awareness"]}
                options={STAGE_OPTIONS}
                onChange={(values) =>
                  setDraftMaterial((d) => ({ ...d, journeyStage: values[0] as JourneyStage, journeyStages: values as JourneyStage[] }))
                }
                allLabel="Journey stages"
                allIcon={Route}
                allColor="#7C3AED"
                ariaLabel="Buyer's journey stage"
                minWidth={0}
                fluid
                className="w-full"
              />
            </div>
            <div>
              <label className={LABEL}>Who can see it</label>
              <ColorSelect
                value={draftMaterial.accessLevel ?? "client_facing"}
                options={ACCESS_OPTIONS}
                onChange={(v) =>
                  setDraftMaterial((d) => ({ ...d, accessLevel: v as AccessLevel }))
                }
                ariaLabel="Who can see it"
                minWidth={0}
                compactTrigger
                className="w-full"
              />
            </div>
          </div>
          <div>
            <label className={LABEL}>Folder</label>
            <ColorSelect
              value={draftMaterial.folder || "Others"}
              options={materialFolderOptions.map((folder) => ({ value: folder, label: materialFolderLabel(folder), color: "#0071E3", icon: Folder }))}
              onChange={(folder) => setDraftMaterial((draft) => ({ ...draft, folder }))}
              ariaLabel="Material folder"
              minWidth={0}
              className="w-full"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <span className="text-[12px] text-text-tertiary">
              It joins the list here; the offering saves when you press save.
            </span>
            <button
              type="button"
              onClick={() => setAddingMaterial(false)}
              className="ml-auto text-[13.5px] font-semibold text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
            <Button
              onClick={() => {
                if (!draftMaterial.label.trim() && !draftMaterial.url.trim()) return;
                setMaterials((l) => [...l, draftMaterial]);
                setAddingMaterial(false);
              }}
            >
              Add material
            </Button>
          </div>
        </div>
      </Modal>


      {/* Save follows you down the page. The form is five sections tall, so a
          plain button at the bottom meant scrolling the whole way back to
          commit an edit made near the top. */}
      {/* Save sits on the RIGHT, where a commit button belongs, with the note
          on the left (Anir, Jul 28: "I don't know why the Save Changes button
          is on the left. Shouldn't it be on the right like normal?"). Sticky,
          because the form is five sections tall. */}
      <div className="sticky bottom-0 z-20 -mx-1 rounded-xl border border-border-light bg-white/95 px-4 py-3 shadow-card backdrop-blur">
        {saveError && (
          <div
            role="alert"
            className="mb-3 flex items-start gap-2.5 rounded-lg border border-error/20 bg-error/5 px-3 py-2.5 text-[12.5px] leading-relaxed text-text-primary"
          >
            <AlertCircle size={17} strokeWidth={1.8} className="mt-0.5 shrink-0 text-error" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-error">Changes were not saved</p>
              <p className="mt-0.5">{saveError}</p>
            </div>
            <button
              type="button"
              onClick={() => setSaveError(null)}
              aria-label="Dismiss save error"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-white hover:text-text-primary"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-tertiary">
            {isEdit ? "Changes apply the moment you save." : "Nothing is saved until you press save."}
          </span>
          <button
            type="button"
            onClick={() =>
              router.push(isEdit ? `/offerings/${offeringId}` : "/offerings")
            }
            className="ml-auto text-[14px] font-semibold text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          {hasOfferingChanges && (
            <Button onClick={submit} loading={saving}>
              {isEdit ? "Save changes" : "Save offering"}
            </Button>
          )}
        </div>
      </div>

      {isEdit && (
        <div className="mt-2 border-t border-border-light pt-4">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-error hover:underline"
            >
              <Trash2 size={14} strokeWidth={1.8} /> Delete offering
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-text-secondary">
                Delete this offering? This can&apos;t be undone.
              </span>
              <Button variant="destructive" onClick={remove} loading={deleting}>
                Delete
              </Button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-[13px] font-semibold text-text-secondary hover:text-text-primary"
              >
                Keep
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

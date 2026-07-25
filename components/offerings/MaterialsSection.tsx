"use client";

import { useState } from "react";
import {
  BookOpen,
  DollarSign,
  ExternalLink,
  File,
  FileText,
  FilterX,
  Presentation,
  Quote,
  Shapes,
  Swords,
  Table2,
  Video,
  type LucideIcon,
} from "lucide-react";
import { ColorSelect } from "@/components/ui/ColorSelect";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  MATERIAL_META,
  type AccessLevel,
  type JourneyStage,
  type MaterialKind,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";

const MATERIAL_ICON: Record<MaterialKind, LucideIcon> = {
  video: Video,
  presentation: Presentation,
  whitepaper: FileText,
  pricing: DollarSign,
  competition: Swords,
  case_study: BookOpen,
  reference: Quote,
  one_pager: File,
  datasheet: Table2,
};

const KIND_ORDER: MaterialKind[] = [
  "video",
  "presentation",
  "whitepaper",
  "pricing",
  "case_study",
  "reference",
  "competition",
  "one_pager",
  "datasheet",
];

// CR-2: the nine material kinds roll up into four file-format buckets for
// filtering. "Others" catches everything that isn't a deck, a video, or a
// written document (pricing, battle cards, reference calls, unknown kinds).
type FormatBucket = "ppt" | "video" | "doc" | "other";
const FORMAT_BUCKETS: FormatBucket[] = ["ppt", "video", "doc", "other"];
const FORMAT_META: Record<FormatBucket, { label: string; color: string; icon: LucideIcon }> = {
  ppt: { label: "PPT", color: "#0071E3", icon: Presentation }, // blue
  video: { label: "Video", color: "#E11D48", icon: Video }, // rose
  doc: { label: "Document", color: "#7C3AED", icon: FileText }, // violet
  other: { label: "Others", color: "#4F46E5", icon: Shapes }, // indigo
};
function bucketOf(kind: MaterialKind): FormatBucket {
  if (kind === "presentation") return "ppt";
  if (kind === "video") return "video";
  if (
    kind === "whitepaper" ||
    kind === "case_study" ||
    kind === "one_pager" ||
    kind === "datasheet"
  )
    return "doc";
  return "other";
}

// A small colour + icon tag pill (never gray, never bare text). Missing tags
// render nothing at the call site — no broken pill for untagged materials.
function TagPill({
  label,
  color,
  icon: Icon,
}: {
  label: string;
  color: string;
  icon: LucideIcon;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold leading-none"
      style={{ background: `${color}14`, color }}
    >
      <Icon size={10} strokeWidth={2.2} />
      {label}
    </span>
  );
}

// The Sales materials list with the three multi-select filters (CR-2): file
// format, buyer's-journey stage, and access level. Within a filter the picks
// OR together; across filters they AND. No selection in a filter = show all.
export function MaterialsSection({
  materials,
  action,
}: {
  materials: OfferingMaterial[];
  /** Rendered at the right end of the filter row (the "+" add button). */
  action?: React.ReactNode;
}) {
  const [format, setFormat] = useState("");
  const [stage, setStage] = useState("");
  const [level, setLevel] = useState("");

  const anyFilter = format !== "" || stage !== "" || level !== "";
  const visible = materials.filter((m) => {
    if (format && bucketOf(m.kind) !== format) return false;
    if (stage && m.journeyStage !== stage) return false;
    if (level && m.accessLevel !== level) return false;
    return true;
  });

  const clear = () => {
    setFormat("");
    setStage("");
    setLevel("");
  };

  return (
    <div className="mt-5 ml-11">
      {/* One row of three compact dropdowns — the app-wide filter pattern.
          Twelve loose chips across two-and-a-half wrapping rows read as chaos,
          and "Access level" landed wherever the wrap dropped it (Anir, Jul 25:
          "so disorganized… why is access level on the same row as that?"). */}
      <div className="flex flex-wrap items-center gap-2">
        <ColorSelect
          value={format}
          onChange={setFormat}
          minWidth={150}
          ariaLabel="Filter by file format"
          options={[
            { value: "", label: "All formats" },
            ...FORMAT_BUCKETS.map((b) => ({
              value: b,
              label: FORMAT_META[b].label,
              color: FORMAT_META[b].color,
              icon: FORMAT_META[b].icon,
            })),
          ]}
        />
        <ColorSelect
          value={stage}
          onChange={setStage}
          minWidth={170}
          ariaLabel="Filter by buyer's journey stage"
          options={[
            { value: "", label: "All journey stages" },
            ...JOURNEY_STAGES.map((s) => ({
              value: s,
              label: JOURNEY_STAGE_META[s].label,
              color: JOURNEY_STAGE_META[s].color,
              icon: JOURNEY_STAGE_META[s].icon,
            })),
          ]}
        />
        <ColorSelect
          value={level}
          onChange={setLevel}
          minWidth={160}
          ariaLabel="Filter by access level"
          options={[
            { value: "", label: "All access levels" },
            ...ACCESS_LEVELS.map((l) => ({
              value: l,
              label: ACCESS_LEVEL_META[l].label,
              color: ACCESS_LEVEL_META[l].color,
              icon: ACCESS_LEVEL_META[l].icon,
            })),
          ]}
        />
        {/* Add lives on the same row as the filters (Anir: "put this filter
            inline with the add button"). */}
        {action && <div className="ml-auto">{action}</div>}
      </div>

      {/* Live count + one-click reset */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[12px] text-text-secondary" aria-live="polite">
          Showing {visible.length} of {materials.length}{" "}
          {materials.length === 1 ? "material" : "materials"}
        </p>
        {anyFilter && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
          >
            <FilterX size={12} strokeWidth={2.2} /> Clear filters
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="mt-3 border-y border-border-light py-5 text-[13px] text-text-tertiary">
          Nothing matches those filters — clear one to see the rest of the
          materials.
        </p>
      ) : (
        <div className="mt-3 border-y border-border-light divide-y divide-border-light">
          {KIND_ORDER.flatMap((kind) =>
            visible
              .filter((material) => material.kind === kind)
              .map((material) => {
                const Icon = MATERIAL_ICON[kind];
                const stage = material.journeyStage
                  ? JOURNEY_STAGE_META[material.journeyStage]
                  : null;
                const level = material.accessLevel
                  ? ACCESS_LEVEL_META[material.accessLevel]
                  : null;
                return (
                  <a
                    key={material.id}
                    href={material.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex min-h-[64px] items-center gap-3 px-1 py-3 hover:bg-blue-light/30 transition-colors"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                      <Icon size={16} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-text-primary group-hover:text-blue-primary">
                        {material.label}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-text-tertiary">
                          {MATERIAL_META[kind].label}
                        </span>
                        {stage && (
                          <TagPill
                            label={stage.label}
                            color={stage.color}
                            icon={stage.icon}
                          />
                        )}
                        {level && (
                          <TagPill
                            label={level.label}
                            color={level.color}
                            icon={level.icon}
                          />
                        )}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-[11px] font-medium text-text-tertiary lg:block">
                      Open asset
                    </span>
                    <ExternalLink
                      size={14}
                      strokeWidth={1.7}
                      className="shrink-0 text-text-tertiary group-hover:text-blue-primary"
                    />
                  </a>
                );
              })
          )}
        </div>
      )}
    </div>
  );
}

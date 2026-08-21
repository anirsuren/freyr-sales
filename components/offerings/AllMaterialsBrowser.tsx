"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownAZ,
  ArrowUpRight,
  Clock3,
  Download,
  ExternalLink,
  FolderOpen,
  Layers as SortLayers,
  X,
} from "lucide-react";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  downloadMaterialCopy,
  isUploadedMaterial,
  materialPreviewHref,
  openMaterial,
} from "@/components/offerings/materialActions";
import { MaterialPeek } from "@/components/offerings/MaterialPeek";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  MATERIAL_FORMATS,
  MATERIAL_FORMAT_META,
  canonicalMaterialFolder,
  materialFormat,
  materialJourneyStages,
  type AccessLevel,
  type JourneyStage,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";
import { OfferingsFilterMenu } from "@/components/offerings/OfferingsFilterMenu";
import { PrioritySearchInput, SearchPriority } from "@/components/ui/SearchPriority";
import { cn } from "@/lib/utils";

export type MaterialRow = {
  material: OfferingMaterial;
  offeringId: string;
  offeringName: string;
  offeringCategory: string;
  ownerNames: string[];
};

/**
 * ALL MATERIALS, ACROSS OFFERINGS — the thing an offering's own tab cannot do.
 *
 * The rep question this answers, from the feedback form: "what if we want to
 * see sales materials for three or four offerings at once?" So the offering is
 * a COLUMN here, and a filter, rather than the thing you had to pick first.
 *
 * Same filter grammar as the offerings list: one Filter button, layer by
 * layer, no icons — the pattern Saras asked for on the same call, so the two
 * pages inside Offerings behave the same way.
 */
export function AllMaterialsBrowser({
  rows,
  isAdmin = false,
}: {
  rows: MaterialRow[];
  isAdmin?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [offerings, setOfferings] = useState<string[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  /* "Show me every deck" is close to the exact cross-offering question this
     page was built for, and it was the one facet the offering's own tab had
     that this did not. */
  const [formats, setFormats] = useState<string[]>([]);
  const [sort, setSort] = useState("offering");

  const offeringOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) seen.set(row.offeringId, row.offeringName);
    return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [rows]);

  const folderOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of rows) {
      const folder = canonicalMaterialFolder(row.material);
      if (folder) seen.add(folder);
    }
    return Array.from(seen)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value }));
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (offerings.length && !offerings.includes(row.offeringId)) return false;
      if (folders.length && !folders.includes(canonicalMaterialFolder(row.material)))
        return false;
      if (stages.length) {
        const mine = materialJourneyStages(row.material) as string[];
        if (!mine.some((stage) => stages.includes(stage))) return false;
      }
      if (levels.length && !levels.includes(row.material.accessLevel || ""))
        return false;
      if (formats.length && !formats.includes(materialFormat(row.material.kind)))
        return false;
      if (!q) return true;
      return [
        row.material.label,
        row.material.description,
        row.offeringName,
        canonicalMaterialFolder(row.material),
        ...row.ownerNames,
      ]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(q));
    });
  }, [rows, query, offerings, folders, stages, levels, formats]);

  const ordered = useMemo(() => {
    const arr = [...visible];
    const at = (row: MaterialRow) =>
      Date.parse(row.material.addedAt || "") || 0;
    if (sort === "name")
      arr.sort((a, b) => a.material.label.localeCompare(b.material.label));
    else if (sort === "folder")
      arr.sort(
        (a, b) =>
          canonicalMaterialFolder(a.material).localeCompare(
            canonicalMaterialFolder(b.material)
          ) || a.material.label.localeCompare(b.material.label)
      );
    else if (sort === "recent") arr.sort((a, b) => at(b) - at(a));
    else
      /* "By offering" is the default: this page exists so a rep can see
         several offerings at once, and grouping by the one they are thinking
         about is how they read it. */
      arr.sort(
        (a, b) =>
          a.offeringName.localeCompare(b.offeringName) ||
          a.material.label.localeCompare(b.material.label)
      );
    return arr;
  }, [visible, sort]);

  const clearAll = () => {
    setQuery("");
    setOfferings([]);
    setFolders([]);
    setStages([]);
    setLevels([]);
    setFormats([]);
  };
  const anyFilter =
    !!query.trim() ||
    offerings.length > 0 ||
    folders.length > 0 ||
    stages.length > 0 ||
    levels.length > 0 ||
    formats.length > 0;

  return (
    <div className="mt-5">
      {/* THE SAME TOOLBAR AS OFFERINGS, to the pixel (Anir, Aug 21:
          "whatever you have here on the offerings page, I like that search
          bar — the size of it, the filter, the sort. Keep that on the sales
          materials page, exactly that"). Same wrapper, same search-priority
          behaviour, same Filter button, same divider before the display
          cluster on the right. */}
      <SearchPriority
        query={query}
        className="rise-in mb-4 flex flex-nowrap items-center gap-2.5 rounded-xl border border-border-light bg-[var(--surface)] p-2.5"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <PrioritySearchInput
            grow
            value={query}
            onChange={setQuery}
            placeholder="Search every material…"
            ariaLabel="Search sales materials"
            iconSize={16}
            className="min-w-[200px] flex-1"
            iconClassName="left-3"
            inputClassName="h-10 w-full rounded-lg border border-border-light bg-white pl-9 pr-3 text-[13px] text-text-primary transition-shadow focus:border-blue-subtle focus:shadow-input-focus focus:outline-none"
          />
          <OfferingsFilterMenu
            onClearAll={clearAll}
            groups={[
              {
                key: "offering",
                label: "Offering",
                values: offerings,
                onChange: setOfferings,
                options: offeringOptions,
              },
              {
                key: "folder",
                label: "Folder",
                values: folders,
                onChange: setFolders,
                options: folderOptions,
              },
              {
                key: "format",
                label: "Format",
                values: formats,
                onChange: setFormats,
                options: MATERIAL_FORMATS.map((format) => ({
                  value: format,
                  label: MATERIAL_FORMAT_META[format].label,
                  color: MATERIAL_FORMAT_META[format].color,
                })),
              },
              {
                key: "stage",
                label: "Buyer's journey stage",
                values: stages,
                onChange: setStages,
                options: JOURNEY_STAGES.map((stage) => ({
                  value: stage,
                  label: JOURNEY_STAGE_META[stage].label,
                  color: JOURNEY_STAGE_META[stage].color,
                })),
              },
              {
                key: "level",
                label: "Who can view it",
                values: levels,
                /* A reader who cannot open AI-training files cannot filter for
                   them either — the same rule the offering's own tab follows. */
                onChange: setLevels,
                options: ACCESS_LEVELS.filter(
                  (level) => isAdmin || level !== "agent_only"
                ).map((level) => ({
                  value: level,
                  label: ACCESS_LEVEL_META[level].label,
                  color: ACCESS_LEVEL_META[level].color,
                })),
              },
            ]}
          />
          {anyFilter && (
            <button
              type="button"
              onClick={clearAll}
              aria-label="Clear filters"
              className="inline-flex h-10 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-blue-light hover:text-blue-primary"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 border-l border-border-light pl-2.5">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.07em] text-text-tertiary">
            Sort
          </span>
          <ColorSelect
            value={sort}
            onChange={setSort}
            ariaLabel="Sort materials"
            minWidth={150}
            dense
            collapsible={false}
            className="w-[150px] shrink-0"
            options={[
              { value: "offering", label: "By offering", color: "#0071E3", icon: SortLayers },
              { value: "name", label: "Name (A, Z)", color: "#7C3AED", icon: ArrowDownAZ },
              { value: "folder", label: "By folder", color: "#0F6E56", icon: FolderOpen },
              { value: "recent", label: "Newest first", color: "#C2410C", icon: Clock3 },
            ]}
          />
        </div>
      </SearchPriority>

      <p className="mb-3 text-[13px] text-text-secondary">
        Showing <b className="text-text-primary tnum">{visible.length}</b> of{" "}
        <b className="text-text-primary tnum">{rows.length}</b> materials
        {anyFilter ? " · filters applied" : ""}
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border-light bg-white">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border-light text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:whitespace-nowrap">
              <th className="w-[28%] px-4 py-2.5">Material</th>
              <th className="w-[18%] px-4 py-2.5">Offering</th>
              <th className="w-[16%] px-4 py-2.5">Folder</th>
              <th className="w-[16%] px-4 py-2.5">Stage</th>
              <th className="w-[13%] px-4 py-2.5">Who can view</th>
              <th className="w-[9%] px-4 py-2.5 text-center">Open</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((row) => {
              const folder = canonicalMaterialFolder(row.material);
              const rowStages = materialJourneyStages(row.material);
              const level = row.material.accessLevel as AccessLevel | undefined;
              return (
                <tr
                  key={`${row.offeringId}:${row.material.id}`}
                  className="border-b border-border-light align-middle transition-colors last:border-0 hover:bg-[var(--surface)]"
                >
                  <td className="px-4 py-3">
                    {/* THE NAME OPENS THE FILE (Anir, Aug 21: "when I click on
                        it, it opens. Don't take me to the fucking offering,
                        that's pointless then"). An uploaded file opens in the
                        app's own viewer, which renders Word and PowerPoint as
                        HTML; a pasted link opens where it points. Getting to
                        the offering is a separate link, in its own column. */}
                    {/* HOVER THE NAME, SEE THE FILE (Anir, Aug 21: "there's
                        still no pop-up"). The offering's own materials tab has
                        rendered a live preview card on hover since Aug 8; this
                        page shipped without it, so a rep scanning 28 files
                        across offerings had to open every one to find out what
                        it was. Same MaterialPeek component, so the two pages
                        preview identically — and only the NAME triggers it,
                        the rule that card was given the day it was built. */}
                    <MaterialPeek
                      material={row.material}
                      previewUrl={
                        isUploadedMaterial(row.material)
                          ? `${materialPreviewHref(row.offeringId, row.material)}?embed=1`
                          : null
                      }
                    >
                      <button
                        type="button"
                        onClick={() => openMaterial(row.offeringId, row.material)}
                        title={
                          isUploadedMaterial(row.material)
                            ? `Open ${row.material.label}`
                            : `Open the link behind ${row.material.label}`
                        }
                        className="group/name inline-flex min-w-0 cursor-pointer items-center gap-1.5 text-left text-[13px] font-semibold text-text-primary transition-colors hover:text-blue-primary"
                      >
                        <span className="min-w-0 break-words">{row.material.label}</span>
                        <ExternalLink
                          size={12}
                          strokeWidth={2.2}
                          className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover/name:opacity-100"
                        />
                      </button>
                    </MaterialPeek>
                    {row.material.description && (
                      <p className="mt-0.5 text-[11.5px] leading-snug text-text-secondary">
                        {row.material.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/offerings/${row.offeringId}`}
                      className="group/off inline-flex min-w-0 items-center gap-1 text-[12.5px] text-text-primary transition-colors hover:text-blue-primary"
                    >
                      <span className="min-w-0 break-words">{row.offeringName}</span>
                      <ArrowUpRight
                        size={12}
                        strokeWidth={2.2}
                        className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover/off:opacity-100"
                      />
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {/* The folder is the one thing that SHOULD leave: it opens
                        that folder inside its offering, where the rest of what
                        is in it lives. */}
                    {folder ? (
                      <Link
                        href={`/offerings/${row.offeringId}?tab=materials&mf=${encodeURIComponent(folder)}`}
                        className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary transition-colors hover:text-blue-primary"
                      >
                        <FolderOpen
                          size={12}
                          strokeWidth={2}
                          className="shrink-0 text-text-tertiary"
                        />
                        {folder}
                      </Link>
                    ) : (
                      <span className="text-text-tertiary">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {rowStages.length ? (
                      <span className="text-[12px] text-text-primary">
                        {rowStages
                          .map((stage) => JOURNEY_STAGE_META[stage as JourneyStage].label)
                          .join(" · ")}
                      </span>
                    ) : (
                      <span className="text-text-tertiary">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {level ? (
                      /* The one place colour still earns its keep on this
                         page: who may open a file is a rule, not a label, and
                         it is the tag the glossary exists to explain. */
                      <span
                        className={cn(
                          "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        )}
                        style={{
                          color: ACCESS_LEVEL_META[level].color,
                          background: `${ACCESS_LEVEL_META[level].color}14`,
                        }}
                      >
                        {ACCESS_LEVEL_META[level].label}
                      </span>
                    ) : (
                      <span className="text-text-tertiary">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Tooltip
                        label={
                          isUploadedMaterial(row.material) ? "Open preview" : "Open link"
                        }
                        side="top"
                      >
                        <button
                          type="button"
                          aria-label={`Open ${row.material.label}`}
                          onClick={() => openMaterial(row.offeringId, row.material)}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                        >
                          <ExternalLink size={14} strokeWidth={1.9} />
                        </button>
                      </Tooltip>
                      <Tooltip
                        label={
                          isUploadedMaterial(row.material)
                            ? "Download original"
                            : "Download link shortcut"
                        }
                        side="top"
                      >
                        <button
                          type="button"
                          aria-label={`Download ${row.material.label}`}
                          onClick={() => downloadMaterialCopy(row.material)}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                        >
                          <Download size={14} strokeWidth={1.9} />
                        </button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-text-secondary">
            Nothing matches those filters.
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, FolderOpen, X } from "lucide-react";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  canonicalMaterialFolder,
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
  }, [rows, query, offerings, folders, stages, levels]);

  const clearAll = () => {
    setQuery("");
    setOfferings([]);
    setFolders([]);
    setStages([]);
    setLevels([]);
  };
  const anyFilter =
    !!query.trim() ||
    offerings.length > 0 ||
    folders.length > 0 ||
    stages.length > 0 ||
    levels.length > 0;

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border-light bg-white p-2.5">
        <SearchPriority query={query}>
          <PrioritySearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search every material…"
            ariaLabel="Search sales materials"
          />
        </SearchPriority>
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
            className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:text-blue-primary"
          >
            <X size={13} strokeWidth={2.4} />
            Clear
          </button>
        )}
        <span className="ml-auto shrink-0 pr-1 text-[12.5px] text-text-secondary tnum">
          {visible.length} of {rows.length}
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-border-light bg-white">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border-light text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:whitespace-nowrap">
              <th className="w-[30%] px-4 py-2.5">Material</th>
              <th className="w-[22%] px-4 py-2.5">Offering</th>
              <th className="w-[16%] px-4 py-2.5">Folder</th>
              <th className="w-[18%] px-4 py-2.5">Stage</th>
              <th className="w-[14%] px-4 py-2.5">Who can view</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const folder = canonicalMaterialFolder(row.material);
              const rowStages = materialJourneyStages(row.material);
              const level = row.material.accessLevel as AccessLevel | undefined;
              return (
                <tr
                  key={`${row.offeringId}:${row.material.id}`}
                  className="border-b border-border-light align-middle transition-colors last:border-0 hover:bg-[var(--surface)]"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/offerings/${row.offeringId}#materials`}
                      className="group/name inline-flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-text-primary transition-colors hover:text-blue-primary"
                    >
                      <span className="min-w-0 break-words">{row.material.label}</span>
                      <ExternalLink
                        size={12}
                        strokeWidth={2.2}
                        className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover/name:opacity-100"
                      />
                    </Link>
                    {row.material.description && (
                      <p className="mt-0.5 text-[11.5px] leading-snug text-text-secondary">
                        {row.material.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/offerings/${row.offeringId}`}
                      className="text-[12.5px] text-text-primary transition-colors hover:text-blue-primary"
                    >
                      {row.offeringName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {folder ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-text-secondary">
                        <FolderOpen
                          size={12}
                          strokeWidth={2}
                          className="shrink-0 text-text-tertiary"
                        />
                        {folder}
                      </span>
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

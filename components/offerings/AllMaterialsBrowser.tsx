"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownAZ,
  ArrowUpRight,
  ChevronDown,
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
import { PinnableTable } from "@/components/ui/PinnableTable";
import { Avatar } from "@/components/ui/Avatar";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  MATERIAL_FORMATS,
  MATERIAL_FORMAT_META,
  DIVISION_META,
  materialDivisions,
  canonicalMaterialFolder,
  materialFileTypeLabel,
  materialFormat,
  materialJourneyStages,
  materialLinkHost,
  type AccessLevel,
  type JourneyStage,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { PrioritySearchInput, SearchPriority } from "@/components/ui/SearchPriority";
import { cn, formatDate } from "@/lib/utils";

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
        /* Now that the row SAYS "Presentation · PPTX", searching either word
           has to find it — a fact printed on screen that the search box does
           not know is a small lie. */
        MATERIAL_FORMAT_META[materialFormat(row.material.kind)].label,
        materialFileTypeLabel(row.material),
        ...row.ownerNames,
      ]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(q));
    });
  }, [rows, query, offerings, folders, stages, levels, formats]);

  /* GROUPED BY OFFERING, FOLDED, BY DEFAULT (Anir, Aug 25: "can we have a
     default grouping of these materials... like how Windows already offers
     grouping — group by type and it automatically filters the list by
     collapsible groups. Actually, instead of categories, should we make the
     groups based on the offering itself? Let's do that, and that will be the
     default. Anybody who enters this page through the sidebar should see them
     automatically grouped").

     Every column stays exactly as it is; the grouping only inserts a header
     row per offering.

     ARRIVING SHOWS THE INDEX, NOT THE CONTENTS (Anir, Aug 26, watching a rep
     open this page: "when I try to access the sales material through the
     sidebar, this is how it opens — it's already expanded. Can we make it so
     the default view is basically collapsed for all of them?").

     So the Set now tracks what is OPEN rather than what is shut: nothing is
     open on arrival, and expanding is the deliberate act. Thirty-one files
     under six offerings meant a rep landed in the middle of a list instead of
     on a menu of it. */
  const [openOfferings, setOpenOfferings] = useState<Set<string>>(new Set());

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
    else if (sort === "oldest") arr.sort((a, b) => at(a) - at(b));
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

  /** The rows, in the order above, cut into one block per offering. Sorting
   *  still decides the order INSIDE each block and which block comes first. */
  const offeringGroups = useMemo(() => {
    const out: {
      id: string;
      name: string;
      category?: string;
      rows: typeof ordered;
    }[] = [];
    for (const row of ordered) {
      const last = out[out.length - 1];
      if (last && last.id === row.offeringId) last.rows.push(row);
      else
        out.push({
          id: row.offeringId,
          name: row.offeringName,
          category: row.offeringCategory,
          rows: [row],
        });
    }
    return out;
  }, [ordered]);

  /**
   * A SPREADSHEET, NOT A JIGSAW (Anir, Aug 27: "everything should be on one
   * line. simply scrollable. every row. something is inherently wrong with
   * this entire screen").
   *
   * What was inherently wrong: percentage columns squeezed by the viewport,
   * so every cell WRAPPED to fit — folder paths six lines tall, chips
   * stacking, names breaking mid-word — and each group card scrolled on its
   * own, so columns drifted between groups.
   *
   * Now the columns are fixed pixels that never squeeze, every cell is one
   * line with an ellipsis when it is genuinely longer, and ALL groups sit in
   * ONE horizontal scroller, so they move together and align by construction.
   */
const TABLE_CLASS =
    "w-full min-w-[1710px] table-fixed border-collapse text-[13px]";

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

  /** One material, one row — identical in the grouped cards and the flat
   *  pinned table, so the two views can never drift. */
  const materialRow = (row: (typeof ordered)[number]) => {
              const folder = canonicalMaterialFolder(row.material);
              const rowStages = materialJourneyStages(row.material);
              const level = row.material.accessLevel as AccessLevel | undefined;
              return (
                <tr
                  key={`${row.offeringId}:${row.material.id}`}
                  className="border-b border-border-light align-top transition-colors last:border-0 hover:bg-[var(--surface)]"
                >
                  <td className="whitespace-nowrap px-3 py-3 align-middle">
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
                        className="group/name flex w-full min-w-0 cursor-pointer items-center gap-1.5 text-left text-[13px] font-semibold text-text-primary transition-colors hover:text-blue-primary"
                      >
                        {/* THE FORMAT ICON, BACK ON THE LEFT (Anir, Aug 27:
                            "you remember that icon you had on the left side
                            (video, doc, etc.) — bring it back, but I don't
                            think it needs to take up as much space as it did
                            before").

                            Back as a 14px glyph on the name rather than the
                            column it used to own, which is the "less space"
                            part: it costs about twenty pixels inside a cell
                            that already exists instead of a slice of the
                            table. Blue, like every format icon in the app
                            (Jul 29: "all of the icons for the video, the
                            presentation, the document, etc. should just be
                            blue"). Centred on the row (Anir,
                            Aug 27: "you have to centre it, it looks weird"),
                            not pinned to the first line. */}
                        {(() => {
                          const Glyph =
                            MATERIAL_FORMAT_META[materialFormat(row.material.kind)].icon;
                          return (
                            <Glyph
                              size={14}
                              strokeWidth={2}
                              aria-hidden="true"
                              className="shrink-0 text-blue-primary"
                            />
                          );
                        })()}
                        <span className="min-w-0 truncate">{row.material.label}</span>
                        <ExternalLink
                          size={12}
                          strokeWidth={2.2}
                          className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover/name:opacity-100"
                        />
                      </button>
                    </MaterialPeek>
                    {row.material.description && (
                      <p
                        title={row.material.description}
                        className="mt-0.5 truncate text-[11.5px] leading-snug text-text-secondary"
                      >
                        {row.material.description}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-middle">
                    {/* Plain text, no pill, no icon, no extension — the same
                        cut the offering's own table took the same day (Anir,
                        Aug 24: "we don't need the MP4 part, knowing that it's
                        a video is enough"). */}
                    <span className="block text-[12.5px] text-text-primary">
                      {MATERIAL_FORMAT_META[materialFormat(row.material.kind)].label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-middle">
                    <Link
                      href={`/offerings/${row.offeringId}`}
                      className="group/off flex w-full min-w-0 items-center gap-1 text-[12.5px] text-text-primary transition-colors hover:text-blue-primary"
                    >
                      <span className="min-w-0 truncate">{row.offeringName}</span>
                      <ArrowUpRight
                        size={12}
                        strokeWidth={2.2}
                        className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover/off:opacity-100"
                      />
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-middle">
                    {/* The folder is the one thing that SHOULD leave: it opens
                        that folder inside its offering, where the rest of what
                        is in it lives. */}
                    {folder ? (
                      <Link
                        href={`/offerings/${row.offeringId}?tab=materials&mf=${encodeURIComponent(folder)}`}
                        title={folder.split("/").join(" · ")}
                        className="flex w-full min-w-0 items-center gap-1.5 text-[12px] text-text-secondary transition-colors hover:text-blue-primary"
                      >
                        <FolderOpen
                          size={12}
                          strokeWidth={2}
                          className="shrink-0 text-text-tertiary"
                        />
                        <span className="min-w-0 truncate">
                          {folder.split("/").join(" · ")}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-text-tertiary">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-middle">
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
                  <td className="whitespace-nowrap px-3 py-3 align-middle">
                    {rowStages.length ? (
                      <span
                        title={rowStages
                          .map((stage) => JOURNEY_STAGE_META[stage as JourneyStage].label)
                          .join(" · ")}
                        className="block truncate text-[12px] text-text-primary"
                      >
                        {rowStages
                          .map((stage) => JOURNEY_STAGE_META[stage as JourneyStage].label)
                          .join(" · ")}
                      </span>
                    ) : (
                      <span className="text-text-tertiary">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-middle">
                    {/* Division keeps its pills: it is a three-letter code, and
                        MPR / MDV / CON mean nothing at a glance without the
                        colour and icon that name them. */}
                    {/* One line, and the column is sized so all three chips
                        actually fit — the "orange N behind the photo" was the
                        CON chip overflowing a too-narrow column into the
                        neighbouring cell. */}
                    <div className="flex items-center gap-1 [&>span]:px-1.5">
                      {materialDivisions(row.material).length ? (
                        materialDivisions(row.material).map((d) => {
                          const meta = DIVISION_META[d];
                          return (
                            <span
                              key={d}
                              title={meta.label}
                              className="inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
                              style={{ color: meta.color, background: `${meta.color}14` }}
                            >
                              {meta.short}
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-text-tertiary">-</span>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-middle">
                    {row.material.addedBy ? (
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar
                          name={row.material.addedBy}
                          className="h-6 w-6 shrink-0 text-[8px]"
                        />
                        <span className="min-w-0 truncate text-[12px] text-text-primary">
                          {row.material.addedBy}
                        </span>
                      </span>
                    ) : (
                      <span className="text-text-tertiary">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-middle text-[12px] tnum text-text-secondary">
                    {row.material.addedAt ? (
                      formatDate(row.material.addedAt)
                    ) : (
                      <span className="text-text-tertiary">-</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 align-middle">
                    <div className="flex items-center gap-1">
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
  };

  /** The nine headings, in the order Anir set on Aug 25, shared by every
   *  table this page draws. */
  const columnHeads = (
          <thead>
            <tr className="border-b border-border-light text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary [&>th]:whitespace-nowrap">
              {/* THE SAME COLUMNS AS THE OFFERING'S OWN TAB, PLUS THE TWO
                  THIS PAGE ADDS (Saras, Aug 24: "we already have those columns
                  within the offering pages — it's only if you try to access
                  sales materials through the sidebar that those columns are
                  missing. Just add the owner column and the file format
                  column... file format, owner, and division").

                  Two doors onto the same files must not describe them
                  differently: a rep who learns the table on one page should
                  read the other without relearning it. Offering and Folder are
                  the two this page adds, because here a file has to say which
                  offering it belongs to. */}
              {/* THE ORDER ANIR ASKED FOR, Aug 25, reading it left to right:
                  "Materials, File format, Offering, Folder, Access level" —
                  and "'who can view this' has to be changed to Access level."
                  Stage, Division and Uploaded by follow.

                  THE HEADERS AND THE CELLS HAD DRIFTED APART. Division sat
                  under "Who can view", Uploaded by under "Division" and the
                  access-level pill under "Uploaded by" — I appended two
                  columns to the header and inserted their cells in a different
                  place ("the text is incorrect according to the column
                  headers. Do you see this?"). Header and body are written in
                  one order now, and the browser check counts them and reads
                  the first row cell by cell so it can never drift again. */}
              <th className="w-[300px] px-3 py-2.5">Material</th>
              <th className="w-[110px] px-3 py-2.5">File format</th>
              <th className="w-[190px] px-3 py-2.5">Offering</th>
              <th className="w-[210px] px-3 py-2.5">Folder</th>
              <th className="w-[125px] px-3 py-2.5">Access level</th>
              {/* "Buyer's journey stage", not "Stage" (Anir, Aug 26: "this is
                  just titled as Stage — if you can update this to say Buyers
                  Journey Stage"). A bare "Stage" reads as a deal stage, which
                  is a different thing entirely on the Opportunities page. */}
              <th className="w-[250px] px-3 py-2.5">Buyer&rsquo;s journey stage</th>
              <th className="w-[150px] px-3 py-2.5">Division</th>
              {/* 16%, not 13: "Priyanka Manchanda" was wrapping to four lines
                  of two letters ("Inay / at / Paw / ar"). */}
              <th className="w-[175px] px-3 py-2.5">Uploaded by</th>
              {/* WHEN, NOT ONLY WHO (Anir, Aug 26: "can you add a new column
                  which says Upload Date so that folks know when each of the
                  files was uploaded? Here only, specifically when we are
                  trying to access the sales material through the sidebar").
                  The offering's own tab is deliberately untouched. */}
              <th className="w-[105px] px-3 py-2.5">Upload date</th>
              {/* ACTIONS, AND LEFT (Anir, Aug 25: "the last column has to be
                  actions, and it has to be aligned left"). "Open" named one of
                  the two buttons under it and centred them, so the header sat
                  over the gap between them. */}
              <th className="w-[95px] px-3 py-2.5">Actions</th>
            </tr>
          </thead>
  );

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
          <FilterMenu
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
          {/* ONE BUTTON THAT KNOWS WHICH WAY IT GOES (Anir, Aug 19, on the
              pipeline: "it should just be one button, it'll know if I close
              all or open all" — and Aug 26, asking for the same control here).
              Any group open means the next press closes everything; all shut
              means it opens everything. Only shown while grouping by offering,
              because the flat sorts have no groups to fold. */}
          {sort === "offering" && offeringGroups.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setOpenOfferings(
                  openOfferings.size > 0
                    ? new Set()
                    : new Set(offeringGroups.map((g) => g.id))
                )
              }
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border-light bg-white px-3 py-1.5 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary"
            >
              <ChevronDown
                size={13}
                strokeWidth={2.3}
                className={cn(
                  "transition-transform",
                  openOfferings.size === 0 && "-rotate-90"
                )}
              />
              {openOfferings.size > 0 ? "Close all" : "Open all"}
            </button>
          )}
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
              /* Sorting by the column that was just added (Anir, Aug 26: "when
                 that is done, you can also add a sorting by that, so sort by
                 upload date"). Oldest-first is the useful half of the pair:
                 newest already exists above, and the question this page gets
                 asked is which material has gone stale. */
              { value: "oldest", label: "Oldest upload", color: "#B45309", icon: Clock3 },
            ]}
          />
        </div>
      </SearchPriority>

      <p className="mb-3 text-[13px] text-text-secondary">
        Showing <b className="text-text-primary tnum">{visible.length}</b> of{" "}
        <b className="text-text-primary tnum">{rows.length}</b> materials
        {anyFilter ? " · filters applied" : ""}
      </p>

      {sort === "offering" ? (
        /* SEPARATE CARDS, NOT ONE LONG TABLE (Anir, Aug 25: "separate it
           properly... look at the pages I mentioned"). The pages he means —
           the opportunities groups and the Goal Master — already learned this
           the same way (Aug 18: "Look at performance goal master and separate
           it like that"): a band row inside one table can never separate
           anything, because however loud the band, every group still shares
           every edge. Each offering is its own card with the blue folding
           header those pages wear, and what lies between the cards is the
           page itself. */
        /* ONE scrollbar for every group. Each card used to scroll on its
           own, which is how scrolling one card slid its columns out from
           under the group above it. Cards carry the table's own minimum
           width as a NUMBER — max-content sizing would let one long one-line
           description stretch the whole run off the screen. */
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="space-y-6 [&>div]:min-w-[1710px]">
          {offeringGroups.map((group) => {
            const shut = !openOfferings.has(group.id);
            return (
              <div
                key={group.id}
                className={cn(
                  "overflow-hidden rounded-xl border border-border-light bg-white shadow-card",
                  /* THE RAIL RUNS THE WHOLE OPEN GROUP, not just its header
                     (Anir, Aug 26: "if you're missing that anywhere else
                     please fix"). It sat on the header alone, so it stopped
                     dead where the materials began.

                     A real LEFT BORDER, not an inset shadow: this block holds
                     a table, and the rows' own white backgrounds paint over
                     anything drawn inside the section's box, which chopped the
                     rail into one segment per row. The 3px is reserved in both
                     states so opening a group never nudges its contents. */
                  "border-l-[3px]",
                  !shut ? "border-l-blue-primary" : "border-l-border-light"
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenOfferings((current) => {
                      const next = new Set(current);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })
                  }
                  aria-expanded={!shut}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 bg-blue-light/50 px-4 py-2.5 text-left shadow-[inset_3px_0_0_0_var(--blue-primary)] transition-colors hover:bg-blue-light/75",
                    /* Not border-b: a full-width rule paints across the rail
                       and breaks it. freyr-rule-inset starts 3px in. */
                    !shut && "freyr-rule-bottom-inset"
                  )}
                >
                  <ChevronDown
                    size={15}
                    strokeWidth={2.2}
                    className={cn(
                      "shrink-0 text-text-tertiary transition-transform duration-200",
                      shut && "-rotate-90"
                    )}
                  />
                  {/* No offering mark on the group header (Anir, Aug 26:
                      "remove these icons"). The name is the label and the
                      chevron is the control; a third glyph between them was
                      decoration. */}
                  <b className="text-[13px] text-text-primary">{group.name}</b>
                  {/* THE CATEGORY, QUIETLY (Anir, Aug 26: "beside the main name
                      of the offering, add the offering category in small font,
                      between the offering name and the number of materials.
                      These three small things don't need to be very
                      highlighted"). */}
                  {group.category && (
                    <span className="truncate text-[11px] text-text-tertiary">
                      {group.category}
                    </span>
                  )}
                  <span className="text-[11px] font-semibold text-text-tertiary tnum">
                    {group.rows.length}{" "}
                    {group.rows.length === 1 ? "material" : "materials"}
                  </span>
                </button>
                {!shut && (
                  <div className="tab-panel">
                    <table className={TABLE_CLASS}>
                      {columnHeads}
                      <tbody>{group.rows.map(materialRow)}</tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="rounded-xl border border-border-light bg-white px-4 py-8 text-center text-[13px] text-text-secondary">
              Nothing matches those filters.
            </p>
          )}
          </div>
        </div>
      ) : (
        /* The flat sorts stay one pinned table — sticky headers and the
           bottom-of-window scrollbar make sense when it IS one list. */
        <PinnableTable
          id="all-materials"
          className="mt-4 rounded-xl border border-border-light bg-white"
        >
          <table className={TABLE_CLASS}>
            {columnHeads}
            <tbody>{ordered.map(materialRow)}</tbody>
          </table>
          {visible.length === 0 && (
            <p className="px-4 py-8 text-center text-[13px] text-text-secondary">
              Nothing matches those filters.
            </p>
          )}
        </PinnableTable>
      )}
    </div>
  );
}

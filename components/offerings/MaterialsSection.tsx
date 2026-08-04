"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  Download,
  Folder,
  FolderOpen,
  X,
  ExternalLink,
  Files,
  FilterX,
  Route,
  ShieldCheck,
  Rows3,
  Columns2,
  Grid2X2,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { MultiColorSelect } from "@/components/ui/ColorSelect";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { EditMaterialButton } from "@/components/offerings/EditMaterialButton";
import { MaterialViewer } from "@/components/offerings/MaterialViewer";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDate } from "@/lib/utils";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  MATERIAL_COLOR,
  MATERIAL_FORMATS,
  MATERIAL_FORMAT_META,
  MATERIAL_ICON,
  allFolders,
  childFolders,
  countUnder,
  isSalesVisible,
  materialsInFolder,
  materialFolderLabel,
  normalizeFolderPath,
  legacyKindLabel,
  materialFormat,
  canonicalMaterialFolder,
  materialJourneyStages,
  type MaterialFormat,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";

// Rows run Video → Presentation → Document → Others, and within a format they
// keep the order the offering owner put them in. A sort (not a per-kind loop)
// is deliberate: the old version rendered one bucket per known kind, so a kind
// nobody had listed would have disappeared from the page entirely.
const FORMAT_RANK: Record<MaterialFormat, number> = {
  video: 0,
  presentation: 1,
  document: 2,
  other: 3,
};

/**
 * The app has two generations of uploaded materials. Current rows carry an
 * explicit `addedAt`; older Freya.Docs rows predate that field, but their
 * object path begins with the millisecond upload timestamp. Recovering that
 * timestamp lets the UI show the real upload date without inventing one or
 * mutating the stored record. Link-only catalogue assets correctly return
 * null because they were never uploaded through this app.
 */
function uploadedAt(material: OfferingMaterial): string | null {
  if (material.addedAt && !Number.isNaN(Date.parse(material.addedAt)))
    return material.addedAt;
  const match = material.docsPath?.match(/(?:^|\/)(\d{13})-/);
  if (!match) return null;
  const date = new Date(Number(match[1]));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// A colour + icon tag pill (standing rule: never flat gray, never bare text).
// `solid` is reserved for the one tag a seller must never misread.
function TagPill({
  label,
  color,
  icon: Icon,
  variant = "tint",
  title,
}: {
  label: string;
  color: string;
  icon: LucideIcon;
  variant?: "tint" | "outline" | "solid";
  title?: string;
}) {
  const style =
    variant === "solid"
      ? { background: color, color: "#FFFFFF" }
      : variant === "outline"
        ? { color, borderColor: `${color}66` }
        : { background: `${color}14`, color };
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold leading-none ${
        variant === "outline" ? "border bg-transparent" : ""
      } ${variant === "solid" ? "tracking-[0.04em] uppercase" : ""}`}
      style={style}
    >
      <Icon size={10} strokeWidth={variant === "solid" ? 2.6 : 2.2} />
      <span className="truncate">{label}</span>
    </span>
  );
}

type MaterialColumns = 1 | 2 | 4 | "table";

const MATERIAL_LAYOUTS: Array<{
  columns: MaterialColumns;
  label: string;
  icon: LucideIcon;
}> = [
  { columns: 1, label: "One column", icon: Rows3 },
  { columns: 2, label: "Two columns", icon: Columns2 },
  { columns: 4, label: "Four columns", icon: Grid2X2 },
  { columns: "table", label: "Details table", icon: Table2 },
];

function materialGridClass(columns: MaterialColumns) {
  if (columns === 2) return "grid grid-cols-1 gap-2.5 md:grid-cols-2";
  if (columns === 4)
    return "grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4";
  return "grid grid-cols-1 gap-2.5";
}

// The Sales materials list: every file's format, buyer's-journey stage and
// access level on the row (item 2), over three multi-select filters (item 3).
// Within a filter the picks OR together; across filters they AND. No selection
// in a filter = no restriction.
export function MaterialsSection({
  materials,
  action,
  offeringId,
  canEdit = false,
  materialFolders = [],
}: {
  materials: OfferingMaterial[];
  /** Folders an owner made that hold nothing yet; the rest are implied by the
   *  files. Passed in so an empty folder survives a reload. */
  materialFolders?: string[];
  /** Rendered at the right end of the filter row (the "+" add button). */
  action?: React.ReactNode;
  /** Needed to delete a row through the offering PATCH. */
  offeringId?: string;
  /** Owners add and remove. Seller-visible files are downloadable by the
   *  workspace; agent-only files reach this component only for an owner. */
  canEdit?: boolean;
}) {
  const [formats, setFormats] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  // Folder navigation is always a compact four-up grid; files default to the
  // roomier two-up view and can still be switched to one or four columns.
  const [columns, setColumns] = useState<MaterialColumns>(2);
  const [layoutPreferenceReady, setLayoutPreferenceReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("freyr.materials.layout.v1");
      if (saved === "1" || saved === "2" || saved === "4")
        setColumns(Number(saved) as MaterialColumns);
      else if (saved === "table") setColumns("table");
    } catch {}
    setLayoutPreferenceReady(true);
  }, []);
  useEffect(() => {
    if (!layoutPreferenceReady) return;
    try {
      localStorage.setItem("freyr.materials.layout.v1", String(columns));
    } catch {}
  }, [columns, layoutPreferenceReady]);

  const router = useRouter();
  const { toast } = useToast();
  const [removing, setRemoving] = useState<string | null>(null);
  /** The row awaiting confirmation, so the dialog can name it. */
  const [pendingRemoval, setPendingRemoval] = useState<OfferingMaterial | null>(
    null
  );

  /** Take a material off the offering. Owner-only: the button is not rendered
   *  for anyone else, and the PATCH refuses them regardless. */
  async function removeMaterial(target: OfferingMaterial) {
    if (!offeringId || removing) return;
    setRemoving(target.id);
    try {
      const next = materials
        .filter((m) => m.id !== target.id)
        .map((m) => ({
          id: m.id,
          kind: m.kind,
          label: m.label,
          url: m.url,
          docsPath: m.docsPath,
          description: m.description,
          folder: m.folder,
          journeyStage: m.journeyStage,
          journeyStages: materialJourneyStages(m),
          accessLevel: m.accessLevel,
          documentType: m.documentType,
        }));
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials: next }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Removed "${target.label}"`);
        router.refresh();
      } else {
        toast(data.error || "Could not remove that material.", "error");
      }
    } catch {
      toast("Could not remove that material.", "error");
    } finally {
      setRemoving(null);
      setPendingRemoval(null);
    }
  }

  /**
   * WHICH FOLDER YOU ARE LOOKING AT — kept in the URL, not in component state.
   *
   * Three things fall out of that: a rep can send a colleague a link straight to
   * "Proposals", back works, and the Add-material dialog (a sibling component
   * the page renders, which this one cannot hand a callback to — a server
   * component may not pass functions across) can read the same parameter and
   * upload INTO the folder that is open.
   */
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const folder = normalizeFolderPath(searchParams.get("mf") || "");
  const showAllFiles = searchParams.get("mv") === "files";

  // Remember the user's scope as well as their card/table layout. An explicit
  // folder or `mv` in a shared URL always wins; otherwise restore the last
  // scope used in this browser.
  useEffect(() => {
    if (searchParams.has("mv") || searchParams.has("mf")) return;
    try {
      if (localStorage.getItem("freyr.materials.scope.v1") !== "files") return;
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("mv", "files");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    } catch {}
  }, [pathname, router, searchParams]);

  const goToFolder = (next: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.delete("mv");
    if (next) params.set("mf", next);
    else params.delete("mf");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const setMaterialsView = (view: "folders" | "files") => {
    try {
      localStorage.setItem("freyr.materials.scope.v1", view);
    } catch {}
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (view === "files") {
      params.set("mv", "files");
      params.delete("mf");
    } else {
      params.delete("mv");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  /** The file being read in the viewer popup. */
  const [viewing, setViewing] = useState<OfferingMaterial | null>(null);
  const anyFilter = formats.length > 0 || stages.length > 0 || levels.length > 0;
  // Agent-training uploads never reach a rep's list. They are background
  // knowledge for the assistant, not collateral, so only an owner — who has
  // to be able to manage them — sees them here at all.
  const visibleToMember = canEdit ? materials : materials.filter(isSalesVisible);
  const mine = visibleToMember.map((material) => ({
    ...material,
    folder: canonicalMaterialFolder(material),
  }));
  // How many of the rows an OWNER is looking at are invisible to everyone
  // else. Counted from the rows themselves, not from what the filter removed:
  // for an owner nothing is removed, which is exactly when this line needs to
  // be said out loud.
  const hiddenTraining = canEdit
    ? materials.filter((m) => !isSalesVisible(m)).length
    : 0;
  const folders = useMemo(
    () => allFolders(mine, materialFolders),
    [mine, materialFolders]
  );
  const subFolders =
    anyFilter || showAllFiles ? [] : childFolders(folders, folder);
  /**
   * A FILTER SEARCHES THE WHOLE TREE. Narrowing to "Presentation" and being
   * shown only the presentations in the folder you happen to be standing in
   * would hide the very file you are hunting for, so any active filter flattens
   * the view and each row says which folder it came from.
   */
  const scoped =
    anyFilter || showAllFiles ? mine : materialsInFolder(mine, folder);
  const visible = scoped
    .filter((m) => {
      if (formats.length && !formats.includes(materialFormat(m.kind))) return false;
      // An untagged material matches only "no restriction" — it is never
      // counted into a stage or an access level nobody recorded for it.
      if (
        stages.length &&
        !materialJourneyStages(m).some((stage) => stages.includes(stage))
      )
        return false;
      if (levels.length && !levels.includes(m.accessLevel ?? "")) return false;
      return true;
    })
    .sort(
      (a, b) =>
        FORMAT_RANK[materialFormat(a.kind)] - FORMAT_RANK[materialFormat(b.kind)]
    );

  const clear = () => {
    setFormats([]);
    setStages([]);
    setLevels([]);
  };

  return (
    <div className="mt-5 ml-11">
      {viewing?.docsPath && offeringId && (
        <MaterialViewer
          offeringId={offeringId}
          path={viewing.docsPath}
          label={viewing.label}
          downloadUrl={viewing.url}
          onClose={() => setViewing(null)}
        />
      )}
      {/* One row of three compact dropdowns — the app-wide filter pattern.
          Twelve loose chips across two-and-a-half wrapping rows read as chaos,
          and "Access level" landed wherever the wrap dropped it (Anir, Jul 25:
          "so disorganized… why is access level on the same row as that?").
          All three are ALWAYS rendered, even when every material shares one
          value: a control that appears and disappears reads as broken. */}
      <div className="flex flex-wrap items-center gap-2">
        <MultiColorSelect
          values={formats}
          onChange={setFormats}
          minWidth={150}
          allLabel="All formats"
          allIcon={Files}
          allColor="#0071E3"
          ariaLabel="Filter by file format"
          options={MATERIAL_FORMATS.map((f) => ({
            value: f,
            label: MATERIAL_FORMAT_META[f].label,
            color: MATERIAL_FORMAT_META[f].color,
            icon: MATERIAL_FORMAT_META[f].icon,
          }))}
        />
        <MultiColorSelect
          values={stages}
          onChange={setStages}
          minWidth={170}
          allLabel="All journey stages"
          allIcon={Route}
          allColor="#7C3AED"
          ariaLabel="Filter by buyer's journey stage"
          options={JOURNEY_STAGES.map((s) => ({
            value: s,
            label: JOURNEY_STAGE_META[s].label,
            color: JOURNEY_STAGE_META[s].color,
            icon: JOURNEY_STAGE_META[s].icon,
          }))}
        />
        <MultiColorSelect
          values={levels}
          onChange={setLevels}
          minWidth={160}
          allLabel="All access levels"
          allIcon={ShieldCheck}
          allColor="#0F766E"
          ariaLabel="Filter by access level"
          options={ACCESS_LEVELS.map((l) => ({
            value: l,
            label: ACCESS_LEVEL_META[l].label,
            color: ACCESS_LEVEL_META[l].color,
            icon: ACCESS_LEVEL_META[l].icon,
          }))}
        />
        {/* Add lives on the same row as the filters (Anir: "put this filter
            inline with the add button"). */}
        <div className="ml-auto flex items-center gap-2">
          <div
            role="group"
            aria-label="Sales materials view"
            className="inline-flex items-center rounded-lg border border-border-light bg-surface p-1"
          >
            <button
              type="button"
              aria-pressed={!showAllFiles}
              onClick={() => setMaterialsView("folders")}
              className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
                !showAllFiles
                  ? "bg-white text-blue-primary shadow-card"
                  : "text-text-secondary hover:bg-white/70 hover:text-text-primary"
              }`}
            >
              <Folder size={14} strokeWidth={2} aria-hidden="true" />
              Folders
            </button>
            <button
              type="button"
              aria-pressed={showAllFiles}
              onClick={() => setMaterialsView("files")}
              className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
                showAllFiles
                  ? "bg-white text-blue-primary shadow-card"
                  : "text-text-secondary hover:bg-white/70 hover:text-text-primary"
              }`}
            >
              <Files size={14} strokeWidth={2} aria-hidden="true" />
              All files
            </button>
          </div>
          <div
            role="group"
            aria-label="Sales materials layout"
            className="inline-flex items-center rounded-lg border border-border-light bg-surface p-1"
          >
            {MATERIAL_LAYOUTS.map(({ columns: option, label, icon: Icon }) => {
              const selected = columns === option;
              return (
                <Tooltip key={option} label={label} side="bottom">
                  <button
                    type="button"
                    aria-label={label}
                    aria-pressed={selected}
                    title={label}
                    onClick={() => setColumns(option)}
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                      selected
                        ? "bg-white text-blue-primary shadow-card"
                        : "text-text-tertiary hover:bg-white/70 hover:text-text-primary"
                    }`}
                  >
                    <Icon size={15} strokeWidth={2} aria-hidden="true" />
                  </button>
                </Tooltip>
              );
            })}
          </div>
          {action}
        </div>
      </div>

      {/* WHERE YOU ARE. Only rendered once you are inside something, so an
          offering with everything at the top level gains no chrome it doesn't
          need. Filtering hides it too: the results span every folder then. */}
      {folder && !anyFilter && !showAllFiles && (
        <nav
          aria-label="Folder path"
          className="mt-3 flex flex-wrap items-center gap-1 text-[12.5px]"
        >
          <button
            type="button"
            onClick={() => goToFolder("")}
            className="cursor-pointer font-semibold text-blue-primary hover:underline"
          >
            All materials
          </button>
          {folder.split("/").map((part, i, parts) => {
            const upto = parts.slice(0, i + 1).join("/");
            const last = i === parts.length - 1;
            return (
              <span key={upto} className="flex items-center gap-1">
                <ChevronRight
                  size={13}
                  strokeWidth={2}
                  className="text-text-tertiary"
                />
                {last ? (
                  <span className="font-semibold text-text-primary">{part}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => goToFolder(upto)}
                    className="cursor-pointer font-semibold text-blue-primary hover:underline"
                  >
                    {part}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      )}

      {/* Live count + one-click reset */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[12px] text-text-secondary" aria-live="polite">
          {anyFilter || showAllFiles || folder ? (
            <>
              Showing <span className="tnum font-semibold">{visible.length}</span> of{" "}
              <span className="tnum font-semibold">{mine.length}</span>{" "}
              {mine.length === 1 ? "material" : "materials"}
              {showAllFiles && !anyFilter && " across all folders"}
            </>
          ) : (
            <>
              <span className="tnum font-semibold">{mine.length}</span>{" "}
              {mine.length === 1 ? "material" : "materials"} in{" "}
              <span className="tnum font-semibold">{subFolders.length}</span>{" "}
              {subFolders.length === 1 ? "folder" : "folders"}
              {visible.length > 0 && (
                <>
                  {" · "}
                  <span className="tnum font-semibold">{visible.length}</span> not
                  filed yet
                </>
              )}
            </>
          )}
          {hiddenTraining > 0 && (
            <span className="text-text-tertiary">
              {" "}
              · <span className="tnum">{hiddenTraining}</span> training{" "}
              {hiddenTraining === 1 ? "file" : "files"} hidden from sales
            </span>
          )}
        </p>
        {anyFilter && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-semibold text-blue-primary hover:underline"
          >
            <FilterX size={12} strokeWidth={2.2} /> Clear filters
          </button>
        )}
      </div>

      {/* FOLDERS FIRST, then the files that sit in this folder — the shape
          anyone already knows from a file browser. A folder shows how many
          files are under it INCLUDING its sub-folders, so a folder whose
          contents are all one level down never reads as empty. */}
      {subFolders.length > 0 && (
        <div
          key={`folders-${folder}-${showAllFiles ? "files" : "tree"}`}
          className="materials-view-enter mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4"
        >
          {subFolders.map((path) => {
            const name = materialFolderLabel(path).split(" · ").pop() as string;
            const count = countUnder(mine, path);
            const nested = childFolders(folders, path).length;
            return (
              <button
                key={path}
                type="button"
                onClick={() => goToFolder(path)}
                // Same card language as the files below them and the related
                // offerings further down the page — one radius, one shadow,
                // one lift. A folder that looked like a different species of
                // card was half of why the section read as busy.
                className="group flex min-h-[72px] cursor-pointer items-center gap-3 rounded-2xl border border-border-light bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)]"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                  style={{ background: "#2563EB14", color: "#2563EB" }}
                >
                  <Folder size={17} strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[13.5px] font-semibold text-text-primary group-hover:text-blue-primary">
                    {name}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-text-secondary">
                    <span className="tnum">{count}</span>{" "}
                    {count === 1 ? "file" : "files"}
                    {nested > 0 && (
                      <>
                        {" · "}
                        <span className="tnum">{nested}</span>{" "}
                        {nested === 1 ? "folder" : "folders"}
                      </>
                    )}
                  </span>
                </span>
                <ChevronRight
                  size={15}
                  strokeWidth={2}
                  className="shrink-0 text-text-tertiary group-hover:text-blue-primary"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* WHY THE FOLDERS LOOKED DEAD. Files with no folder rendered directly
          under the folder cards with nothing between them, so the whole thing
          read as one list and the cards looked like ornaments (Anir: "what the
          hell do these folders do? It just shows folders"). Naming the loose
          pile makes the tree obvious without moving anyone's files. */}
      {!folder &&
        !anyFilter &&
        !showAllFiles &&
        subFolders.length > 0 &&
        visible.length > 0 && (
        <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          <FolderOpen size={13} strokeWidth={2} />
          Not in a folder
          <span className="tnum font-semibold text-text-secondary">
            {visible.length}
          </span>
        </p>
      )}

      {visible.length === 0 ? (
        <p
          key={`empty-${folder}-${showAllFiles ? "files" : "tree"}`}
          className="materials-view-enter mt-3 rounded-2xl border border-dashed border-border-light bg-[var(--surface)] px-4 py-6 text-center text-[13px] text-text-tertiary"
        >
          {anyFilter
            ? `None of the ${mine.length} ${mine.length === 1 ? "material" : "materials"} on this offering match all three filters, clear one to see the rest.`
            : showAllFiles
              ? "No materials yet."
            : subFolders.length > 0
              ? "Everything here is inside a folder. Open one above."
              : folder
                ? "This folder is empty."
                : "No materials yet."}
        </p>
      ) : columns === "table" ? (
        <div className="materials-view-enter mt-3 overflow-x-auto rounded-2xl border border-border-light bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead className="bg-surface text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              <tr>
                <th className="px-4 py-3">File name</th>
                <th className="px-3 py-3">File format</th>
                <th className="px-3 py-3">Access level</th>
                <th className="px-3 py-3">Buyer&apos;s journey stage(s)</th>
                <th className="px-3 py-3">Upload date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {visible.map((material) => {
                const format = materialFormat(material.kind);
                const formatMeta = MATERIAL_FORMAT_META[format];
                const Icon = MATERIAL_ICON[material.kind] ?? formatMeta.icon;
                const level = material.accessLevel ? ACCESS_LEVEL_META[material.accessLevel] : null;
                const stagesForMaterial = materialJourneyStages(material);
                const uploaded = Boolean(material.docsPath);
                const uploadDate = uploadedAt(material);
                return (
                  <tr key={material.id} className="transition-colors hover:bg-blue-light/20">
                    <td className="max-w-[320px] px-4 py-3">
                      <button
                        type="button"
                        onClick={() => uploaded ? setViewing(material) : window.open(material.url, "_blank", "noopener,noreferrer")}
                        className="flex min-w-0 items-center gap-2.5 text-left"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-light text-blue-primary">
                          <Icon size={15} strokeWidth={1.9} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-text-primary hover:text-blue-primary" title={material.label}>{material.label}</span>
                          <span className="block truncate text-[10.5px] text-text-tertiary" title={material.folder}>{materialFolderLabel(material.folder || "Others")}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-3"><TagPill label={formatMeta.label} color={formatMeta.color} icon={formatMeta.icon} /></td>
                    <td className="px-3 py-3">
                      {level ? <TagPill label={level.label} color={level.color} icon={level.icon} variant={material.accessLevel === "internal_only" ? "solid" : "tint"} /> : <span className="text-[11px] text-text-tertiary">Not recorded</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {stagesForMaterial.length ? stagesForMaterial.map((stage) => {
                          const meta = JOURNEY_STAGE_META[stage];
                          return <TagPill key={stage} label={meta.short} color={meta.color} icon={meta.icon} />;
                        }) : <span className="text-[11px] text-text-tertiary">Not recorded</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[12px] text-text-secondary">
                      {uploadDate ? <time dateTime={uploadDate} title={new Date(uploadDate).toLocaleString()}>{formatDate(uploadDate)}</time> : "Not recorded"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip label={uploaded ? "Open preview" : "Open link"} side="top">
                          <button
                            type="button"
                            aria-label={`${uploaded ? "Open" : "Open link"} ${material.label}`}
                            onClick={() => uploaded ? setViewing(material) : window.open(material.url, "_blank", "noopener,noreferrer")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-blue-light hover:text-blue-primary"
                          ><ExternalLink size={14} strokeWidth={1.9} /></button>
                        </Tooltip>
                        {uploaded && (
                          <Tooltip label="Download original" side="top">
                            <button
                              type="button"
                              aria-label={`Download ${material.label}`}
                              onClick={() => { window.location.href = material.url; }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-blue-light hover:text-blue-primary"
                            ><Download size={14} strokeWidth={1.9} /></button>
                          </Tooltip>
                        )}
                        {canEdit && offeringId && <EditMaterialButton offeringId={offeringId} material={material} materials={materials} />}
                        {canEdit && offeringId && (
                          <Tooltip label="Remove material" side="top">
                            <button
                              type="button"
                              aria-label={`Remove ${material.label}`}
                              onClick={() => setPendingRemoval(material)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:#B02020] text-white hover:opacity-85"
                            ><X size={14} strokeWidth={2.2} /></button>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* FLOATING CARDS, NOT A RULED LIST. Hairline separators stacked twenty
           files deep read as a spreadsheet, and every row's five controls sat
           loose in the same gray as the text (Anir, Jul 30: "I don't like those
           separators... it should be kinda like the related offerings... more
           aesthetic and separated properly, like floating"). Same radius,
           shadow and hover lift as the related-offering pills below, one per
           row so the long file names still get the full width. */
        <div
          key={`materials-${folder}-${showAllFiles ? "files" : "tree"}`}
          className={`materials-view-enter mt-3 ${materialGridClass(columns)}`}
        >
          {visible.map((material) => {
            const format = materialFormat(material.kind);
            const formatMeta = MATERIAL_FORMAT_META[format];
            const Icon = MATERIAL_ICON[material.kind] ?? formatMeta.icon;
            // What this file was uploaded as, back when the picker offered
            // nine types. Shown only when it says more than the format does.
            const originalKind = legacyKindLabel(material.kind);
            const materialStages = materialJourneyStages(material);
            const level = material.accessLevel
              ? ACCESS_LEVEL_META[material.accessLevel]
              : null;
            const internal = material.accessLevel === "internal_only";
            // An UPLOADED file is fetched through our download route, which
            // mints a fresh signed URL per click; a pasted link is just a link.
            const uploaded = Boolean(material.docsPath);
            const uploadDate = uploadedAt(material);
            // CLICKING A FILE OPENS IT; SAVING IT IS A SEPARATE BUTTON.
            // An uploaded row used to carry `download`, so a rep who wanted to
            // glance at a deck got a file in their Downloads folder instead
            // (Saras, Jul 30, for the reps: "they need to be able to simply
            // view them if they wish, not only download them"). `?view=1` makes
            // the route serve the bytes inline; the Download control below is
            // how you still get a copy.
            const viewUrl = uploaded
              ? `${material.url}${material.url.includes("?") ? "&" : "?"}view=1`
              : material.url;
            return (
              <a
                key={material.id}
                href={viewUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  // AN UPLOADED FILE OPENS IN THE APP. Word, PowerPoint and
                  // Excel cannot render in a browser tab at all — it downloads
                  // them — so the row opens the viewer, which reads a
                  // server-converted version. Cmd/Ctrl-click still gets the
                  // raw file in a new tab for anyone who wants that.
                  if (!uploaded || e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  setViewing(material);
                }}
                className={`group flex cursor-pointer gap-3 rounded-2xl border border-border-light bg-white py-3 pr-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)] ${
                  columns === 4
                    ? "min-h-[210px] flex-col items-stretch"
                    : "min-h-[72px] items-center"
                }`}
                // An internal-only file keeps its rail down the left edge, so a
                // file that must never be forwarded is obvious before you read
                // a word — now as a thicker left border on the card itself.
                // The 2px it gains comes straight out of the padding (3+13 =
                // 1+15), so the icons still line up down the column and the
                // card never looks a nudge wider than its neighbours.
                style={
                  internal
                    ? {
                        borderLeftWidth: 3,
                        borderLeftColor: ACCESS_LEVEL_META.internal_only.color,
                        paddingLeft: 13,
                      }
                    : { paddingLeft: 15 }
                }
              >
                {/* Pinned to the top so it reads beside the file's NAME. A
                    card with a three-line description is 100px tall, and a
                    centred icon ended up level with the middle of the blurb,
                    pointing at nothing. */}
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-md"
                  style={{
                    background: `${formatMeta.color}14`,
                    color: formatMeta.color,
                  }}
                >
                  <Icon size={16} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  {/* File titles WRAP. A truncated name ("Post-approval change…")
                      is the one thing a seller can't guess from the rest of the
                      row, so it never gets an ellipsis. */}
                  <span className="block break-words text-[13.5px] font-semibold text-text-primary group-hover:text-blue-primary">
                    {material.label}
                  </span>
                  {/* The owner's one-line note (item 10). Rendered only when
                      there is one, no placeholder, no empty line. */}
                  {material.description && (
                    <span
                      className={`mt-0.5 block break-words text-[12px] leading-snug text-text-secondary ${
                        columns === 4 ? "line-clamp-3" : ""
                      }`}
                    >
                      {material.description}
                    </span>
                  )}
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {/* Filtering flattens the tree, so the row has to say where
                        the file actually lives or the result is unplaceable. */}
                  {(anyFilter || showAllFiles) && material.folder && (
                      <TagPill
                        label={material.folder}
                        color="#2563EB"
                        icon={Folder}
                        title={`In ${material.folder}`}
                      />
                    )}
                    <TagPill
                      label={formatMeta.label}
                      color={formatMeta.color}
                      icon={formatMeta.icon}
                    />
                    {originalKind && (
                      <TagPill
                        label={originalKind}
                        color={MATERIAL_COLOR[material.kind]}
                        icon={Icon}
                        variant="outline"
                      />
                    )}
                    {materialStages.map((stageName) => {
                      const stage = JOURNEY_STAGE_META[stageName];
                      return <TagPill key={stageName} label={stage.short} color={stage.color} icon={stage.icon} />;
                    })}
                    {level && (
                      <TagPill
                        label={level.label}
                        color={level.color}
                        icon={level.icon}
                        // Client-facing is a fact; internal-only is a warning.
                        // Solid burnt orange + a lock, against a page where
                        // every other chip is a light tint — it cannot be
                        // mistaken for "safe to send".
                        variant={internal ? "solid" : "tint"}
                        title={
                          internal
                            ? "Internal only: never send this file to a client"
                            : undefined
                        }
                      />
                    )}
                  </span>
                  {/* Who put this here (Suren: "I should say who added it,
                      with pfp"). Rendered ONLY for materials a real person
                      uploaded through the app, the seeded catalog assets
                      carry no uploader and must not be credited to anyone,
                      so their rows simply have no attribution line. */}
                  <span
                    className={`mt-1.5 flex items-center gap-1.5 text-[11px] text-text-tertiary ${
                      columns === 4 ? "flex-wrap" : ""
                    }`}
                  >
                    {material.addedBy ? (
                      <>
                        <Avatar
                          name={material.addedBy}
                          className="h-5 w-5 text-[8px]"
                        />
                        <span className="truncate">
                          Added by {material.addedBy}
                        </span>
                      </>
                    ) : (
                      <CalendarDays size={12} strokeWidth={1.9} />
                    )}
                    {uploadDate ? (
                      <time
                        dateTime={uploadDate}
                        title={new Date(uploadDate).toLocaleString()}
                        className="shrink-0 tnum"
                      >
                        {material.addedBy ? "· Uploaded " : "Uploaded "}
                        {formatDate(uploadDate)}
                      </time>
                    ) : (
                      <span className="shrink-0">Upload date not recorded</span>
                    )}
                  </span>
                </span>
                {/* ONE CLUSTER, NOT FIVE LOOSE CONTROLS. "Open", its arrow,
                    Download, Edit and Remove used to float across the right
                    half of the row in the same weight as the body text, which
                    is most of why the list read as busy. They now sit together
                    at the end of the card: the thing you actually came to do
                    wears a button, the rest are quiet square icon buttons that
                    only colour on hover. */}
                <span
                  className={`flex shrink-0 items-center gap-1 ${
                    columns === 4
                      ? "mt-auto w-full justify-end border-t border-border-light pt-2"
                      : ""
                  }`}
                >
                  <span
                    className={`items-center gap-1.5 rounded-lg border border-border-light px-2.5 py-1.5 text-[11.5px] font-semibold text-text-secondary transition-colors group-hover:border-blue-subtle group-hover:bg-blue-light group-hover:text-blue-primary ${
                      columns === 1 ? "hidden lg:inline-flex" : "hidden"
                    }`}
                  >
                    {uploaded ? "Open" : "Open link"}
                    <ExternalLink size={12} strokeWidth={1.9} />
                  </span>
                  {/* Narrow screens have no room for the label, but the row
                      must still say it opens somewhere. */}
                  <ExternalLink
                    size={14}
                    strokeWidth={1.7}
                    className={`mr-0.5 text-text-tertiary group-hover:text-blue-primary ${
                      columns === 1 ? "lg:hidden" : ""
                    }`}
                  />
                  {/* Save a copy. A nested <a> is invalid inside the row link,
                      so this runs the download imperatively. Uploaded files
                      receive their original bytes; pasted web assets receive
                      a portable HTML shortcut to their source. The control is
                      present on EVERY row and available to every seller. */}
                  {uploaded && <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Download ${material.label}`}
                    title={
                      "Download a copy"
                    }
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.location.href = material.url;
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      e.stopPropagation();
                      window.location.href = material.url;
                    }}
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                  >
                    <Download size={14} strokeWidth={1.8} />
                  </span>}
                  {canEdit && offeringId && (
                    <EditMaterialButton
                      offeringId={offeringId}
                      material={material}
                      materials={materials}
                    />
                  )}
                  {canEdit && offeringId && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Remove ${material.label}`}
                      title="Remove this material"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPendingRemoval(material);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setPendingRemoval(material);
                        }
                      }}
                      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-[color:#B02020]/10 hover:text-[color:#B02020]"
                    >
                      <X size={14} strokeWidth={2} />
                    </span>
                  )}
                </span>
              </a>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingRemoval)}
        onClose={() => setPendingRemoval(null)}
        onConfirm={() => pendingRemoval && void removeMaterial(pendingRemoval)}
        busy={Boolean(removing)}
        title="Remove this material?"
        body={
          <>
            <span className="font-semibold">{pendingRemoval?.label}</span> comes
            off this offering, and the sales team stops seeing it.
          </>
        }
        detail={
          pendingRemoval?.docsPath
            ? "The assistant also forgets what was inside it. The file stays in storage, but you would have to upload it again to bring it back."
            : undefined
        }
        confirmLabel="Remove material"
      />
    </div>
  );
}

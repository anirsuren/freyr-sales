"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PrioritySearchInput,
  SearchPriority,
} from "@/components/ui/SearchPriority";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  Download,
  Folder,
  FolderOpen,
  FileText,
  FileType,
  X,
  ExternalLink,
  Files,
  Pill,
  Crown,
  FilterX,
  Route,
  ShieldCheck,
  GripVertical,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { MultiColorSelect } from "@/components/ui/ColorSelect";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { downloadMaterialCopy } from "@/components/offerings/materialActions";
import { useToast } from "@/components/ui/Toast";
import { EditMaterialButton } from "@/components/offerings/EditMaterialButton";
import { MaterialViewer } from "@/components/offerings/MaterialViewer";
import { FolderPeek } from "@/components/offerings/FolderPeek";
import { MaterialPeek } from "@/components/offerings/MaterialPeek";
import { MaterialReadState } from "@/components/offerings/MaterialReadState";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDate } from "@/lib/utils";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  JOURNEY_STAGES,
  DIVISION_META,
  DIVISIONS,
  JOURNEY_STAGE_META,
  materialDivisions,
  MATERIAL_FORMATS,
  MATERIAL_FORMAT_META,
  MATERIAL_ICON,
  allFolders,
  childFolders,
  countUnder,
  isFixedMaterialFolder,
  isSalesVisible,
  materialsInFolder,
  materialFolderLabel,
  normalizeFolderPath,
  materialFormat,
  materialFileTypeLabel,
  materialLinkHost,
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
  variant?: "tint" | "outline";
  title?: string;
}) {
  // ONE PILL SHAPE FOR THE WHOLE ROW. "Internal only" used to be uppercase,
  // letter-spaced and bordered, which made it wider and louder than every
  // other tag beside it (Anir, Aug 8: "why is the internal only tag so big
  // compared to the other tags and so prominent"). It is still unmistakable —
  // it is the only warm-hued pill in a row of blues and greens, and it carries
  // a padlock — without shouting over the file it belongs to.
  const style =
    variant === "outline"
      ? { color, borderColor: `${color}66` }
      : { background: `${color}14`, color };
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold leading-none ${
        variant === "outline" ? "border bg-transparent" : ""
      }`}
      style={style}
    >
      <Icon size={10} strokeWidth={2.2} />
      <span className="truncate">{label}</span>
    </span>
  );
}

type MaterialColumns = 1 | 2 | 4 | "table";

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
  offeringName,
  canEdit = false,
  canRenameFolders = false,
  materialFolders = [],
  offeringType,
  preferenceOwnerId,
  ownerNames = [],
}: {
  materials: OfferingMaterial[];
  /** Folders an owner made that hold nothing yet; the rest are implied by the
   *  files. Passed in so an empty folder survives a reload. */
  materialFolders?: string[];
  /** Drives which folder shelf this offering gets: services drop Product
   *  Sheet, rename Product Brief to Service Brief and Product Demos to
   *  Videos (Anir, Aug 25). */
  offeringType?: string | null;
  /** Rendered at the right end of the filter row (the "+" add button). */
  action?: React.ReactNode;
  /** Needed to delete a row through the offering PATCH. */
  offeringId?: string;
  /** Lets Freyr AI identify the offering behind an open material. */
  offeringName?: string;
  /** Owners add and remove. Seller-visible files are downloadable by the
   *  workspace; agent-only files reach this component only for an owner. */
  canEdit?: boolean;
  /** Renaming a folder is admin-only (Saras, Aug 14, change log #38), a
   *  narrower gate than `canEdit`, which is the offering's owners. Freyr's 12
   *  standard folders stay fixed for everyone; only folders an owner created
   *  can be renamed. */
  canRenameFolders?: boolean;
  /** Keeps a shared browser from leaking one signed-in user's view preference
   *  into another user's session. */
  preferenceOwnerId?: string | null;
  /** Display names of this offering's OWNERS — an uploader on the list gets
   *  the crown beside their name, the same mark ownership wears everywhere. */
  ownerNames?: string[];
}) {
  const [query, setQuery] = useState("");
  const [formats, setFormats] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  /** DIVISION IS THE FOURTH FILTER (Saras, Aug 24: "let's add a new filter
   *  called Division here in Sales Materials, which will have three things —
   *  MPR, MDV, CON. Based on the Division column, we can have this fourth
   *  filter"). The column already exists on every row; the filter is what
   *  makes it usable on a 25-file offering. */
  const [divisions, setDivisions] = useState<string[]>([]);
  /** The literal extension — PDF, MP4, PPTX, CSV. Separate from `formats`,
   *  which is the four broad families. */
  // ONE view for files: the details table (Change Request point 25, Saras,
  // Aug 3 — "restrict the sales materials view option to only one 'List'
  // view"). The 1/2/4-column tile layouts and their saved preference are
  // deliberately gone; folder navigation keeps its compact grid.
  const columns: MaterialColumns = "table";
  const [savedScope, setSavedScope] = useState<"folders" | "files">("folders");
  const [scopePreferenceReady, setScopePreferenceReady] = useState(false);
  const preferenceSuffix = preferenceOwnerId?.trim() || "anonymous";
  const scopeStorageKey = `freyr.materials.scope.v2:${preferenceSuffix}`;

  useEffect(() => {
    try {
      const legacyKey = "freyr.materials.scope.v1";
      const scoped = localStorage.getItem(scopeStorageKey);
      const saved = scoped ?? localStorage.getItem(legacyKey);
      if (saved === "files") setSavedScope("files");
      else setSavedScope("folders");
      if (scoped === null && (saved === "files" || saved === "folders")) {
        localStorage.setItem(scopeStorageKey, saved);
        localStorage.removeItem(legacyKey);
      }
    } catch {}
    setScopePreferenceReady(true);
  }, [scopeStorageKey]);

  const router = useRouter();
  const { toast } = useToast();
  const [removing, setRemoving] = useState<string | null>(null);
  /** The row awaiting confirmation, so the dialog can name it. */
  const [pendingRemoval, setPendingRemoval] = useState<OfferingMaterial | null>(
    null
  );
  const [draggingMaterialId, setDraggingMaterialId] = useState<string | null>(
    null
  );
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [movingMaterialId, setMovingMaterialId] = useState<string | null>(null);
  const [folderOverrides, setFolderOverrides] = useState<
    Record<string, string>
  >({});
  const folderMoveHistory = useRef<
    Array<{
      materialId: string;
      label: string;
      from: string;
      to: string;
    }>
  >([]);

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
   * RENAMING A FOLDER (change log #38). Its own endpoint, not the generic
   * offering PATCH the drag-to-move above uses: moving one file is a change to
   * that file, while renaming a folder rewrites every path nested under it, and
   * that has to happen in one server-side write or a half-renamed tree is
   * possible.
   */
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  async function submitFolderRename() {
    if (!renamingFolder || !offeringId || !renameDraft.trim()) return;
    // The editor shows only the last segment, so a nested folder keeps its
    // parent: renaming "Roadmap/Technical" to "Engineering" must send
    // "Roadmap/Engineering", never a new top-level folder.
    const parts = renamingFolder.split("/");
    parts[parts.length - 1] = renameDraft.trim();
    const target = parts.join("/");
    if (target === renamingFolder) {
      setRenamingFolder(null);
      return;
    }
    setRenameBusy(true);
    try {
      const response = await fetch(
        `/api/offerings/${offeringId}/materials/folder`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: renamingFolder, to: target }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not rename that folder.");
      }
      toast(
        data.moved > 0
          ? `Renamed to "${renameDraft.trim()}". ${data.moved} file${data.moved === 1 ? "" : "s"} moved with it.`
          : `Renamed to "${renameDraft.trim()}".`
      );
      setRenamingFolder(null);
      router.refresh();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not rename that folder.",
        "error"
      );
    } finally {
      setRenameBusy(false);
    }
  }

  const moveMaterial = useCallback(
    async (
      target: OfferingMaterial,
      destination: string,
      { remember = true }: { remember?: boolean } = {}
    ): Promise<boolean> => {
      if (!canEdit || !offeringId || movingMaterialId) return false;
      const current =
        folderOverrides[target.id] || canonicalMaterialFolder(target);
      if (!destination || current === destination) return false;

      setFolderOverrides((previous) => ({
        ...previous,
        [target.id]: destination,
      }));
      setMovingMaterialId(target.id);
      try {
        const next = materials.map((material) =>
          material.id === target.id
            ? { ...material, folder: destination }
            : material
        );
        const response = await fetch(`/api/offerings/${offeringId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ materials: next }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Could not move that material.");
        }
        if (remember) {
          folderMoveHistory.current.push({
            materialId: target.id,
            label: target.label,
            from: current,
            to: destination,
          });
          folderMoveHistory.current = folderMoveHistory.current.slice(-20);
        }
        toast(
          remember
            ? `Moved "${target.label}" to ${materialFolderLabel(destination)}. Press Cmd/Ctrl+Z to undo.`
            : `Moved "${target.label}" back to ${materialFolderLabel(destination)}`
        );
        router.refresh();
        return true;
      } catch (error) {
        setFolderOverrides((previous) => {
          const next = { ...previous };
          delete next[target.id];
          return next;
        });
        toast(
          error instanceof Error
            ? error.message
            : "Could not move that material.",
          "error"
        );
        return false;
      } finally {
        setMovingMaterialId(null);
        setDraggingMaterialId(null);
        setDropTargetPath(null);
      }
    },
    [
      canEdit,
      folderOverrides,
      materials,
      movingMaterialId,
      offeringId,
      router,
      toast,
    ]
  );

  useEffect(() => {
    const undoLastFolderMove = async (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "z" ||
        (!event.metaKey && !event.ctrlKey) ||
        event.shiftKey ||
        movingMaterialId
      )
        return;

      const targetElement = event.target as HTMLElement | null;
      if (
        targetElement?.isContentEditable ||
        targetElement?.closest("input, textarea, select, [contenteditable='true']")
      )
        return;

      const previous = folderMoveHistory.current.at(-1);
      if (!previous) return;
      const material = materials.find(
        (item) => item.id === previous.materialId
      );
      if (!material) return;

      event.preventDefault();
      const restored = await moveMaterial(material, previous.from, {
        remember: false,
      });
      if (restored) folderMoveHistory.current.pop();
    };

    window.addEventListener("keydown", undoLastFolderMove);
    return () => window.removeEventListener("keydown", undoLastFolderMove);
  }, [materials, moveMaterial, movingMaterialId]);

  function startMaterialDrag(
    event: React.DragEvent,
    material: OfferingMaterial
  ) {
    if (!canEdit || movingMaterialId) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-freyr-material", material.id);
    event.dataTransfer.setData("text/plain", material.id);
    // The ghost under the cursor is the WHOLE ROW. With `draggable` on the
    // six-dot handle the browser snapshots just the handle — a few grey dots
    // — so nothing looked like it was moving (Anir, Aug 8: "it's not showing
    // me that I'm moving the row").
    const row = (event.target as HTMLElement).closest("tr, [data-material-card]");
    if (row instanceof HTMLElement) {
      const rect = row.getBoundingClientRect();
      event.dataTransfer.setDragImage(
        row,
        event.clientX - rect.left,
        event.clientY - rect.top
      );
    }
    setDraggingMaterialId(material.id);
  }

  function dropMaterial(event: React.DragEvent, destination: string) {
    event.preventDefault();
    const materialId =
      event.dataTransfer.getData("application/x-freyr-material") ||
      draggingMaterialId;
    const target = materials.find((material) => material.id === materialId);
    setDropTargetPath(null);
    if (target) void moveMaterial(target, destination);
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
  const hasExplicitScope = searchParams.has("mv") || searchParams.has("mf");
  const showAllFiles =
    searchParams.get("mv") === "files" ||
    (!hasExplicitScope && scopePreferenceReady && savedScope === "files");

  /** A shareable, app-owned preview URL. The new tab is a dedicated material
   *  page, not another copy of the offering with its viewer dialog reopened. */
  const materialPreviewUrl = useCallback(
    (material: OfferingMaterial) =>
      `${pathname}/materials/${encodeURIComponent(material.id)}`,
    [pathname]
  );

  // Remember the user's scope as well as their card/table layout. An explicit
  // folder or `mv` in a shared URL always wins; otherwise restore the last
  // scope used in this browser.
  useEffect(() => {
    if (!scopePreferenceReady || hasExplicitScope || savedScope !== "files")
      return;
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("mv", "files");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [hasExplicitScope, pathname, router, savedScope, scopePreferenceReady, searchParams]);

  const goToFolder = (next: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.delete("mv");
    if (next) params.set("mf", next);
    else params.delete("mf");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const setMaterialsView = (view: "folders" | "files") => {
    setSavedScope(view);
    try {
      localStorage.setItem(scopeStorageKey, view);
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

  useEffect(() => {
    const requestedId = searchParams.get("material");
    if (!requestedId) return;
    const requested = materials.find(
      (material) => material.id === requestedId && material.docsPath
    );
    if (requested) setViewing(requested);
  }, [materials, searchParams]);

  /**
   * OPENING A FILE PUTS IT IN THE URL, so the address bar is a shareable link
   * (Anir, Aug 25: "I should just be able to copy the URL, and then that URL
   * takes me directly to open the thing").
   *
   * `?material=<id>` has always OPENED the viewer — the effect above has read
   * it since it shipped — but clicking a file never wrote it, so the one thing
   * anybody would try (open a file, copy the address, send it to a colleague)
   * handed them the offering page instead of the file. replace(), not push():
   * opening a file is not a place you should have to press Back out of, and
   * closeViewer takes the param straight off again.
   */
  const openViewer = useCallback(
    (material: OfferingMaterial) => {
      setViewing(material);
      if (!material.id || searchParams.get("material") === material.id) return;
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("material", material.id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const closeViewer = useCallback(() => {
    setViewing(null);
    if (!searchParams.has("material")) return;
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.delete("material");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);
  const ownerNameSet = new Set(
    ownerNames.map((name) => name.trim().toLocaleLowerCase()).filter(Boolean)
  );
  const uploaderIsOwner = (name: string | undefined) =>
    Boolean(name && ownerNameSet.has(name.trim().toLocaleLowerCase()));

  const anyFilter =
    formats.length > 0 ||
    stages.length > 0 ||
    levels.length > 0 ||
    divisions.length > 0 ||
    query.trim().length > 0;
  // Agent-training uploads never reach a rep's list. They are background
  // knowledge for the assistant, not collateral, so only an owner — who has
  // to be able to manage them — sees them here at all.
  const visibleToMember = canEdit ? materials : materials.filter(isSalesVisible);
  const mine = visibleToMember.map((material) => {
    const overriddenFolder = folderOverrides[material.id];
    return {
      ...material,
      folder:
        overriddenFolder ||
        canonicalMaterialFolder(material),
    };
  });
  // How many of the rows an OWNER is looking at are invisible to everyone
  // else. Counted from the rows themselves, not from what the filter removed:
  // for an owner nothing is removed, which is exactly when this line needs to
  // be said out loud.
  const hiddenTraining = canEdit
    ? materials.filter((m) => !isSalesVisible(m)).length
    : 0;
  const folders = useMemo(
    () => allFolders(mine, materialFolders, offeringType),
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
      const q = query.trim().toLowerCase();
      /**
       * EVERYTHING ON THE ROW IS SEARCHABLE (Anir, Aug 13: "when I search up
       * the name of the person, why is it not doing that? All the data points
       * of the file should be searchable").
       *
       * It used to match four fields — name, description, folder and object
       * path — so typing a teammate's name found nothing even though their
       * name is right there in the Uploaded by column. Now every fact the
       * table shows is matchable: who uploaded it, the format, the file type,
       * the access level and the journey stages, in the same words the row
       * prints them in.
       */
      if (q) {
        const haystack = [
          m.label,
          m.description,
          m.folder,
          m.folder ? materialFolderLabel(m.folder) : "",
          m.docsPath,
          m.addedBy,
          materialFormat(m.kind),
          MATERIAL_FORMAT_META[materialFormat(m.kind)]?.label,
          materialFileTypeLabel(m),
          ...materialDivisions(m).map((d) => DIVISION_META[d].label),
          ...materialDivisions(m),
          m.accessLevel,
          m.accessLevel ? ACCESS_LEVEL_META[m.accessLevel]?.label : "",
          ...materialJourneyStages(m).flatMap((stage) => [
            stage,
            JOURNEY_STAGE_META[stage]?.label ?? "",
          ]),
        ];
        if (
          !haystack
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(q))
        )
          return false;
      }
      if (formats.length && !formats.includes(materialFormat(m.kind))) return false;
      // An untagged material matches only "no restriction" — it is never
      // counted into a stage or an access level nobody recorded for it.
      if (
        stages.length &&
        !materialJourneyStages(m).some((stage) => stages.includes(stage))
      )
        return false;
      if (levels.length && !levels.includes(m.accessLevel ?? "")) return false;
      if (
        divisions.length &&
        !materialDivisions(m).some((d) => divisions.includes(d))
      )
        return false;
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

  // localStorage cannot be read during the server render. Showing the default
  // folders/two-column UI first made every tab switch visibly jump to the
  // saved preference. Keep the footprint stable for that one hydration frame,
  // then paint the user's actual preference as the first interactive view.
  if (!scopePreferenceReady) {
    return (
      <div
        className="mt-5 ml-11"
        aria-busy="true"
        aria-label="Loading your sales materials view"
      >
        <div className="flex animate-pulse items-center gap-2">
          <span className="h-10 w-[150px] rounded-lg bg-surface" />
          <span className="h-10 w-[170px] rounded-lg bg-surface" />
          <span className="h-10 w-[160px] rounded-lg bg-surface" />
          <span className="ml-auto h-10 w-[280px] rounded-lg bg-surface" />
        </div>
        <div className="mt-3 h-20 animate-pulse rounded-2xl bg-surface" />
      </div>
    );
  }

  return (
    <div className="mt-5 ml-11">
      {viewing?.docsPath && offeringId && (
        <MaterialViewer
          offeringId={offeringId}
          offeringName={offeringName || "This offering"}
          material={viewing}
          path={viewing.docsPath}
          label={viewing.label}
          downloadUrl={viewing.url}
          openInNewTabUrl={materialPreviewUrl(viewing)}
          onClose={closeViewer}
        />
      )}
      {/* WHERE YOU ARE — ABOVE the filters, because it is the root of the
          page you are on, not a footnote under the controls (Anir, Aug 7:
          "make this a bit bigger in font, and shift this above the
          filters"). Only rendered once you are inside something, so an
          offering with everything at the top level gains no chrome it doesn't
          need. Filtering hides it too: the results span every folder then. */}
      {folder && !anyFilter && !showAllFiles && (
        <nav
          aria-label="Folder path"
          className="mb-3 flex flex-wrap items-center gap-1.5 text-[15px]"
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

      {/* One row of three compact dropdowns — the app-wide filter pattern.
          Twelve loose chips across two-and-a-half wrapping rows read as chaos,
          and "Access level" landed wherever the wrap dropped it (Anir, Jul 25:
          "so disorganized… why is access level on the same row as that?").
          All three are ALWAYS rendered, even when every material shares one
          value: a control that appears and disappears reads as broken. */}
      {/* Search first, on the left, filling the row up to the filters — the
          app-wide toolbar standard (Anir, Aug 12: "make sure we have a search
          bar here"). A query searches the WHOLE tree, like the filters. */}
      <SearchPriority
        query={query}
        className="flex flex-nowrap items-center gap-2"
      >
        {/* The resting minimum has to leave the row able to FIT. At 150px the
            search + four filters + the view toggle + "+" came to 1184px in a
            1164px row: the overflow hung the "+" 20px past the right edge,
            which is why it looked "way too right" and then snapped back into
            place the moment focus collapsed the filters and the row fit again
            (Anir, Aug 13). Now it fits in both states, so nothing moves. */}
        {/* THE SAME SEARCH BAR AS EVERY OTHER PAGE (Anir, Aug 24: "keep the
            search bar consistent everywhere — whatever you have in FDL
            Components is good, put that on Offerings and everywhere else where
            that search bar with the filter is there"). This one was left to
            size itself from PrioritySearchInput's own defaults, so it sat a few
            pixels shorter than the toolbar it lives in; now it carries
            PageToolbar's exact class string. */}
        <PrioritySearchInput
          grow
          className="min-w-[200px] flex-1"
          value={query}
          onChange={setQuery}
          placeholder="Search materials…"
          ariaLabel="Search sales materials"
          iconSize={16}
          iconClassName="left-3"
          inputClassName="h-10 w-full rounded-lg border border-border-light bg-white pl-9 pr-3 text-[13px] text-text-primary transition-shadow focus:border-blue-subtle focus:shadow-input-focus focus:outline-none"
        />
        {/* ONE FILTER BUTTON, LIKE EVERY OTHER LIST PAGE (Anir, Aug 25: "in
            one single dropdown menu for the filters? Yeah, we can do that,
            just like the other pages"). Four permanently-open dropdowns filled
            the row and pushed the view toggle and the "+" around; the two-layer
            menu is the shape Offerings, Targets and Solutioning already use. */}
        <FilterMenu
          onClearAll={() => {
            setFormats([]);
            setStages([]);
            setLevels([]);
            setDivisions([]);
          }}
          groups={[
            {
              key: "format",
              label: "Format",
              values: formats,
              onChange: setFormats,
              options: MATERIAL_FORMATS.map((f) => ({
                value: f,
                label: MATERIAL_FORMAT_META[f].label,
                color: MATERIAL_FORMAT_META[f].color,
              })),
            },
            {
              key: "stage",
              label: "Buyer's journey",
              values: stages,
              onChange: setStages,
              options: JOURNEY_STAGES.map((j) => ({
                value: j,
                label: JOURNEY_STAGE_META[j].label,
                color: JOURNEY_STAGE_META[j].color,
              })),
            },
            {
              key: "access",
              label: "Access level",
              values: levels,
              onChange: setLevels,
              /* A REP CANNOT FILTER FOR WHAT A REP CANNOT SEE (Saras, Aug 21):
                 AI-only is owners and admins, so offering it to everyone else
                 invited the question the glossary exists to avoid. */
              options: ACCESS_LEVELS.filter(
                (l) => canEdit || l !== "agent_only"
              ).map((l) => ({
                value: l,
                label: ACCESS_LEVEL_META[l].label,
                color: ACCESS_LEVEL_META[l].color,
              })),
            },
            {
              key: "division",
              label: "Division",
              values: divisions,
              onChange: setDivisions,
              options: DIVISIONS.map((d) => ({
                value: d,
                label: `${d} · ${DIVISION_META[d].label}`,
                color: DIVISION_META[d].color,
              })),
            },
          ]}
        />
        {/* Add lives on the same row as the filters (Anir: "put this filter
            inline with the add button"). */}
        {/* PINNED RIGHT, IN BOTH STATES (Anir, Aug 13: "the plus one
            shouldn't even move when i click search bar"). The auto margin
            takes the row's slack before flex-grow does, which parks this
            cluster on the right edge whatever the filters are doing — so
            collapsing them to icons cannot drag the "+" sideways. */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div
            role="group"
            aria-label="Sales materials view"
            className="inline-flex items-center rounded-lg border border-border-light bg-surface p-1"
          >
            <button
              type="button"
              aria-pressed={!showAllFiles}
              onClick={() => setMaterialsView("folders")}
              className={`inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
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
              className={`inline-flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[12px] font-semibold transition-colors ${
                showAllFiles
                  ? "bg-white text-blue-primary shadow-card"
                  : "text-text-secondary hover:bg-white/70 hover:text-text-primary"
              }`}
            >
              <Files size={14} strokeWidth={2} aria-hidden="true" />
              All files
            </button>
          </div>
          {action}
        </div>
      </SearchPriority>

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

      {canEdit && subFolders.length > 0 && visible.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-medium text-text-tertiary">
          <GripVertical size={13} strokeWidth={2} aria-hidden="true" />
          Drag a material onto a folder to move it.
        </p>
      )}

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
            // Only folders someone here created. Freyr's 12 standard folders
            // are fixed for every offering, so offering a pencil on them would
            // promise something the server refuses (change log #38).
            const renameable = canRenameFolders && !isFixedMaterialFolder(path);
            return (
              /* HOVER TO LOOK INSIDE. The card still opens the folder on click;
                 the peek is for the twelve-folder scan where clicking into each
                 one and back out is the whole cost. */
              <FolderPeek
                key={path}
                path={path}
                materials={mine}
                folderPaths={folders}
                onOpenFolder={goToFolder}
                onOpenMaterial={(material) =>
                  material.docsPath
                    ? openViewer(material)
                    : window.open(material.url, "_blank", "noopener,noreferrer")
                }
              >
              <span className="relative block h-full">
              <button
                type="button"
                onClick={() => goToFolder(path)}
                onDragOver={(event) => {
                  if (!canEdit || !draggingMaterialId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropTargetPath(path);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node))
                    return;
                  setDropTargetPath((current) =>
                    current === path ? null : current
                  );
                }}
                onDrop={(event) => dropMaterial(event, path)}
                // Same card language as the files below them and the related
                // offerings further down the page — one radius, one shadow,
                // one lift. A folder that looked like a different species of
                // card was half of why the section read as busy.
                className={`group flex h-full w-full min-h-[72px] cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)] ${
                  dropTargetPath === path
                    ? "scale-[1.02] border-blue-primary bg-blue-light ring-2 ring-blue-primary/25"
                    : "border-border-light"
                }`}
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
                  {/* GREEN WHEN THERE IS SOMETHING IN IT (Anir, Aug 25: "I can
                      see from the very beginning that two materials have been
                      uploaded, but I have to open each of these to see which
                      folder they are in. Can we make that text green whenever a
                      file is uploaded inside a folder... just so it's visually
                      very easy to know which folder the files are in").
                      Twelve folders reading "0 files" in the same grey as the
                      one holding the file made finding it a hunt. Green is a
                      status colour used AS a status here — there is something
                      here — which is exactly what the reservation allows. */}
                  <span
                    className={cn(
                      "mt-0.5 block text-[11.5px]",
                      /* A LIGHTER GREEN (Anir, Aug 26: "you made this green
                         font — can you make the font slightly lighter green?
                         Whichever folder has a number of files, just make that
                         slightly lighter"). #1A7A35 is the deep verified green
                         this app uses for a signed-off number, and a file
                         count is not that; #16A34A is the same hue a step up
                         in lightness, so it still reads as "there is something
                         here" without carrying the weight of a verdict. */
                      count > 0
                        ? "font-semibold text-[color:#16A34A]"
                        : "text-text-secondary"
                    )}
                  >
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
              {renameable && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setRenamingFolder(path);
                    setRenameDraft(name);
                  }}
                  aria-label={`Rename ${name}`}
                  title="Rename this folder"
                  className="absolute right-9 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text-tertiary opacity-0 transition-all hover:bg-blue-light hover:text-blue-primary focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Pencil size={13} strokeWidth={2} />
                </button>
              )}
              </span>
              </FolderPeek>
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
                ? /* A FOLDER FROM A LINK MIGHT NOT EXIST (found Aug 16, deep
                     linking ?mf=). A shared or mistyped ?mf= drew the name as
                     an active filter chip and said "This folder is empty",
                     which reads as a real folder somebody cleared out rather
                     than a folder that was never here. `folders` is the
                     complete set — the fixed folders plus every stored and
                     material-carried path, ancestors included — so anything
                     outside it genuinely does not exist on this offering. */
                  folders.includes(folder)
                  ? "This folder is empty."
                  : `There is no folder called “${materialFolderLabel(folder)}” on this offering. Check the link, or pick a folder above.`
                : "No materials yet."}
        </p>
      ) : columns === "table" ? (
        <div className="materials-view-enter mt-3 overflow-x-auto rounded-2xl border border-border-light bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead className="bg-surface text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              {/* "Uploaded by" — the person is the headline and the date sits
                  under their name anyway, so the old "Upload date" labelled the
                  smaller of the two facts in the column (Anir, Aug 8). */}
              <tr>
                {/* LEFT-ALIGNED. Centring every column was tried on Aug 8 and
                    pulled back the same day — a table of tags and names reads
                    as a ragged cloud when nothing shares an edge. Only ACTIONS
                    centres, because it is a fixed row of icons. */}
                {/* WIDER, with the icon gone (Anir, Aug 26: "make only this
                    column a bit wider so that it's not so clustered within
                    less space — just the file name column"). Titles were
                    wrapping to four lines beside a 32px tile. */}
                <th className="w-[26%] px-4 py-3 align-middle">File name</th>
                <th className="px-3 py-3 align-middle">File format</th>
                {/* FOLDER IS A COLUMN NOW (Anir, Aug 25: "in the file view,
                    when we're just looking at the list of files, can you add a
                    column called Folder? Currently the folder name is visible
                    below the title of the file — instead of it being visible
                    there, let's put this in a separate column"). Under the
                    name it read as part of the description; in its own column
                    it sorts, scans and lines up with everything else. */}
                <th className="px-3 py-3 align-middle">Folder</th>
                <th className="px-3 py-3 align-middle">Access level</th>
                <th className="px-3 py-3 align-middle">Buyer&apos;s journey stage(s)</th>
                <th className="px-3 py-3 align-middle">Division</th>
                <th className="px-3 py-3 align-middle">Uploaded by</th>
                {/* LEFT, like every other column and like the same table on the
                    Sales Materials page (Anir, Aug 26: "align this column
                    properly on the sales materials part of the offerings, it
                    should be left-aligned"). */}
                <th className="px-4 py-3 align-middle">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {visible.map((material) => {
                const format = materialFormat(material.kind);
                const formatMeta = MATERIAL_FORMAT_META[format];
                const Icon = MATERIAL_ICON[material.kind] ?? formatMeta.icon;
                const level = material.accessLevel ? ACCESS_LEVEL_META[material.accessLevel] : null;
                const stagesForMaterial = materialJourneyStages(material);
                const fileType = materialFileTypeLabel(material);
                const uploaded = Boolean(material.docsPath);
                const uploadDate = uploadedAt(material);
                return (
                  // THE ROW IS NOT THE DRAG HANDLE. Making the whole row
                  // draggable meant a click that moved a pixel anywhere —
                  // over the name, over a tag — started a drag, and the row
                  // wore a grab cursor everywhere (Anir, Aug 8: "I shouldn't
                  // be able to shuffle it just anywhere. I have to hover my
                  // mouse over the six dots"). The handle below owns it.
                  <tr
                    key={material.id}
                    onClick={(event) => {
                      // Anywhere on the row opens the file (Anir, Aug 8: "I
                      // shouldn't have to click on the name") — but never a
                      // click that was already FOR something: a button, a
                      // link, or the drag handle.
                      const target = event.target as HTMLElement;
                      if (target.closest("button, a, [draggable]")) return;
                      if (uploaded) openViewer(material);
                      else window.open(material.url, "_blank", "noopener,noreferrer");
                    }}
                    className={`cursor-pointer transition-colors hover:bg-blue-light/20 ${
                      draggingMaterialId === material.id ||
                      movingMaterialId === material.id
                        ? "opacity-45"
                        : ""
                    }`}
                  >
                    <td className="max-w-[320px] px-4 py-3 align-middle">
                      <div className="flex min-w-0 items-center gap-2.5">
                        {canEdit && !showAllFiles && !anyFilter && (
                          // The six dots ARE the handle: they carry draggable,
                          // the grab cursor and the only "drag to move" hint.
                          // Hidden when NO folder cards are on screen (All
                          // files, or any filter) — the handle exists to drag
                          // a file ONTO a folder, and with no target it reads
                          // as a broken reorder control (Anir, Aug 8: "the
                          // order doesn't matter here... fucking remove it").
                          <span
                            draggable={!movingMaterialId}
                            onDragStart={(event) => startMaterialDrag(event, material)}
                            onDragEnd={() => {
                              setDraggingMaterialId(null);
                              setDropTargetPath(null);
                            }}
                            title="Drag onto a folder to move"
                            aria-label="Drag to move this file"
                            className="shrink-0 cursor-grab text-text-tertiary transition-colors hover:text-blue-primary active:cursor-grabbing"
                          >
                            <GripVertical size={15} strokeWidth={2} aria-hidden="true" />
                          </span>
                        )}
                      <button
                        type="button"
                        onClick={() => uploaded ? openViewer(material) : window.open(material.url, "_blank", "noopener,noreferrer")}
                        className="flex min-w-0 items-center gap-2.5 text-left"
                      >
                        {/* NO FILE-TYPE TILE AT THE ROW HEAD (Anir, Aug 26:
                            "can you remove these icons from the very left?").
                            The File format column two along already names the
                            type in words, so the tile repeated it as a glyph
                            and ate the width the file name needed. */}
                        <span className="hidden">
                          <Icon size={15} strokeWidth={1.9} />
                        </span>
                        <span className="min-w-0">
                          {/* Only the NAME previews. Wrapping the whole row
                              button meant the card appeared over the icon, the
                              folder line and the description too (Anir, Aug 8:
                              "the pop-up should only show up when I'm on top
                              of the name"). */}
                          <MaterialPeek
                            material={material}
                            previewUrl={uploaded ? `${materialPreviewUrl(material)}?embed=1` : null}
                          >
                            <span className="block break-words text-[13px] font-semibold text-text-primary hover:text-blue-primary">{material.label}</span>
                          </MaterialPeek>
                          {/* BLACK, NOT GREY (Anir, Aug 25: "can we keep the
                              descriptions in black font only? They need to be
                              visible and emphasized"). A description is the one
                              line that says what the file actually is; grey
                              filed it with the metadata. */}
                          {material.description && (
                            <span className="mt-1 block break-words text-[11px] leading-snug text-text-primary">
                              {material.description}
                            </span>
                          )}
                          {/* Whether Freyr AI has read this file, reported on
                              the file's own row rather than in the upload
                              dialog (Anir, Aug 13: "it shouldn't be a pop-up.
                              It should be somewhere here, underneath where I
                              just uploaded it"). */}
                          {uploaded && material.docsPath && offeringId && (
                            <MaterialReadState
                              offeringId={offeringId}
                              docsPath={material.docsPath}
                            />
                          )}
                        </span>
                      </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      {/* FILE FORMAT means the format. Nothing else. The
                          document-kind tag ("Sales deck", "Training material",
                          "Success story / case study") repeated the folder the
                          row already names underneath its title (Anir, Aug 7:
                          "only the file format tags should show up… you have
                          to remove this"). */}
                      {/* PLAIN TEXT, NO PILL, NO ICON, NO EXTENSION (Anir,
                          Aug 24, three cuts to the same cell):

                          1. "These duplicate file format tags — we don't need
                             the MP4 part, because knowing that it's a video is
                             enough for a sales rep or for anybody. It says
                             'presentation' but then it also says 'PPTX'. Same
                             across this whole column." The extension line was
                             the word again in shorthand.
                          2. "Remove the font colours and background colours
                             from these two columns, the file format column and
                             the buyer's journey stage column — just black font
                             with no background."
                          3. "You can also remove the icons here, because the
                             icon of what type of file is already here" — the
                             row already opens with a format icon beside the
                             file name, so the pill's icon was the third time
                             the same fact was stated in one row.

                          Access level keeps its pill: "access level column is
                          fine as it is, no need to make any change there." */}
                      <span className="block text-[12.5px] text-text-primary">
                        {formatMeta.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <span className="block break-words text-[12.5px] text-text-secondary">
                        {materialFolderLabel(material.folder || "Others")}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      {level ? <TagPill label={level.label} color={level.color} icon={level.icon} /> : <span className="text-[11px] text-text-tertiary">Not recorded</span>}
                    </td>
                    <td className="px-3 py-3 align-middle">
                      {/* Stacked. Side by side, two stages ran wider than the
                          column and pushed the row's other facts around. */}
                      <div className="flex flex-col items-start gap-1">
                        {stagesForMaterial.length ? stagesForMaterial.map((stage) => {
                          const meta = JOURNEY_STAGE_META[stage];
                          return (
                            <span
                              key={stage}
                              className="block text-[12.5px] text-text-primary"
                            >
                              {meta.short}
                            </span>
                          );
                        }) : <span className="text-[11px] text-text-tertiary">Not recorded</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      {/* Same pill language as the stages beside it, so the row
                          reads as one vocabulary rather than two. */}
                      <div className="flex flex-wrap items-center gap-1">
                        {materialDivisions(material).length ? (
                          materialDivisions(material).map((d) => {
                            const meta = DIVISION_META[d];
                            return (
                              <Tooltip key={d} label={meta.label} side="top">
                                <TagPill label={meta.short} color={meta.color} icon={meta.icon} />
                              </Tooltip>
                            );
                          })
                        ) : (
                          <span className="text-[11px] text-text-tertiary">Not recorded</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-middle">
                      <div className="flex min-w-[145px] items-center gap-2">
                        {material.addedBy ? (
                          <Avatar
                            name={material.addedBy}
                            className="h-7 w-7 shrink-0 text-[9px]"
                          />
                        ) : (
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-light text-blue-primary">
                            <FileText size={13} strokeWidth={1.9} />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="flex items-center gap-1 break-words text-[11.5px] font-semibold text-text-primary">
                            {material.addedBy || "Not recorded"}
                            {uploaderIsOwner(material.addedBy) && (
                              <span title="Offering owner" className="shrink-0 leading-none">
                                <Crown
                                  size={11}
                                  strokeWidth={2.6}
                                  aria-label="Offering owner"
                                  className="text-[color:#7C3AED]"
                                />
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[10.5px] text-text-tertiary">
                            {uploadDate ? (
                              <time
                                dateTime={uploadDate}
                                title={new Date(uploadDate).toLocaleString()}
                              >
                                {formatDate(uploadDate)}
                              </time>
                            ) : (
                              "Date not recorded"
                            )}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-1">
                        <Tooltip label={uploaded ? "Open preview" : "Open link"} side="top">
                          <button
                            type="button"
                            aria-label={`${uploaded ? "Open" : "Open link"} ${material.label}`}
                            onClick={() => uploaded
                              ? window.open(materialPreviewUrl(material), "_blank", "noopener,noreferrer")
                              : window.open(material.url, "_blank", "noopener,noreferrer")}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-blue-light hover:text-blue-primary"
                          ><ExternalLink size={14} strokeWidth={1.9} /></button>
                        </Tooltip>
                        <Tooltip
                          label={uploaded ? "Download original" : "Download link shortcut"}
                          side="top"
                        >
                            <button
                              type="button"
                              aria-label={`Download ${material.label}`}
                              onClick={() => downloadMaterialCopy(material)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-blue-light hover:text-blue-primary"
                            ><Download size={14} strokeWidth={1.9} /></button>
                        </Tooltip>
                        {canEdit && offeringId && <EditMaterialButton offeringId={offeringId} material={material} materials={materials} materialFolders={materialFolders} />}
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
            // view them if they wish, not only download them"). The app-owned
            // preview URL opens the renderer on our domain; the Download
            // control below is how you still get a copy.
            const viewUrl = uploaded
              ? materialPreviewUrl(material)
              : material.url;
            return (
              <a
                key={material.id}
                href={viewUrl}
                draggable={canEdit && !movingMaterialId && !showAllFiles && !anyFilter}
                onDragStart={(event) => startMaterialDrag(event, material)}
                onDragEnd={() => {
                  setDraggingMaterialId(null);
                  setDropTargetPath(null);
                }}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  // AN UPLOADED FILE OPENS IN THE APP. Word, PowerPoint and
                  // Excel cannot render in a browser tab at all — it downloads
                  // them — so the row opens the viewer, which reads a
                  // server-converted version. Cmd/Ctrl-click follows the
                  // app-owned preview URL into a new tab, never the raw bytes.
                  if (!uploaded || e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  openViewer(material);
                }}
                className={`group flex cursor-pointer gap-3 rounded-2xl border border-border-light bg-white py-3 pr-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)] ${
                  columns === 4
                    ? "min-h-[210px] flex-col items-stretch"
                    : "min-h-[72px] items-center"
                } ${canEdit ? "cursor-grab active:cursor-grabbing" : ""} ${
                  draggingMaterialId === material.id ||
                  movingMaterialId === material.id
                    ? "opacity-45"
                    : ""
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
                {canEdit && !showAllFiles && !anyFilter && (
                  <GripVertical
                    size={15}
                    strokeWidth={2}
                    className="mt-2 shrink-0 text-text-tertiary"
                    aria-hidden="true"
                  />
                )}
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
                        <span className="flex items-center gap-1 truncate">
                          Added by {material.addedBy}
                          {uploaderIsOwner(material.addedBy) && (
                            <span title="Offering owner" className="inline-flex shrink-0">
                              <Crown size={10} strokeWidth={2.6} aria-label="Offering owner" className="text-[color:#7C3AED]" />
                            </span>
                          )}
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
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Download ${material.label}`}
                    title={uploaded ? "Download original" : "Download link shortcut"}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      downloadMaterialCopy(material);
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== " ") return;
                      e.preventDefault();
                      e.stopPropagation();
                      downloadMaterialCopy(material);
                    }}
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                  >
                    <Download size={14} strokeWidth={1.8} />
                  </span>
                  {canEdit && offeringId && (
                    <EditMaterialButton
                      offeringId={offeringId}
                      material={material}
                      materials={materials}
                      materialFolders={materialFolders}
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

      {/* RENAME A FOLDER (change log #38). Only the last segment is editable:
          a nested folder keeps its parent, so this can never turn a subfolder
          into a new top-level one by accident. */}
      <Modal
        open={Boolean(renamingFolder)}
        onClose={() => setRenamingFolder(null)}
        title="Rename this folder"
      >
        <div className="space-y-4 p-1">
          {renamingFolder && renamingFolder.includes("/") && (
            <p className="text-[12.5px] text-text-secondary">
              Inside{" "}
              <span className="font-semibold text-text-primary">
                {materialFolderLabel(
                  renamingFolder.split("/").slice(0, -1).join("/")
                )}
              </span>
            </p>
          )}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
              Folder name
            </label>
            <input
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-text-primary focus:shadow-input-focus focus:outline-none"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) =>
                event.key === "Enter" && void submitFolderRename()
              }
              placeholder="e.g. Regional Case Studies"
              autoFocus
            />
            <p className="mt-1.5 text-[12px] text-text-tertiary">
              Everything inside it, including any folders within it, keeps its
              place.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setRenamingFolder(null)}
              className="rounded-md border border-border px-3.5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitFolderRename()}
              disabled={renameBusy || !renameDraft.trim()}
              className="rounded-md bg-blue-primary px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-primary/90 disabled:opacity-60"
            >
              {renameBusy ? "Saving…" : "Save name"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

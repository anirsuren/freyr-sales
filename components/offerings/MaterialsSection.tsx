"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  BotOff,
  ChevronRight,
  Download,
  Folder,
  FolderOpen,
  FolderPlus,
  X,
  ExternalLink,
  Files,
  FilterX,
  Route,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { MultiColorSelect } from "@/components/ui/ColorSelect";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { EditMaterialButton } from "@/components/offerings/EditMaterialButton";
import { MaterialViewer } from "@/components/offerings/MaterialViewer";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TimeAgo } from "@/components/ui/TimeAgo";
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
  cleanFolderName,
  countUnder,
  isReadByAgent,
  isSalesVisible,
  materialsInFolder,
  normalizeFolderPath,
  legacyKindLabel,
  materialFormat,
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
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold leading-none ${
        variant === "outline" ? "border bg-transparent" : ""
      } ${variant === "solid" ? "tracking-[0.04em] uppercase" : ""}`}
      style={style}
    >
      <Icon size={10} strokeWidth={variant === "solid" ? 2.6 : 2.2} />
      {label}
    </span>
  );
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
  canCreateFolders = false,
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
  /** Owners add and remove. EVERYONE downloads: sales materials exist to be
   *  handed to customers (Anir, Jul 29: "people who are not the owner, just
   *  normal sales, they can download all this stuff"). */
  canEdit?: boolean;
  /**
   * MAKING A FOLDER IS AN ADMIN ACT, not an owner one.
   *
   * Suren, Jul 30: "system should restrict… every guy is going to create a
   * folder of his own. You will never be able to control this." Wajeed's
   * interim call was to switch folder creation off; Anir's is narrower and
   * better — leave it on, for admins only, until the system-defined folder
   * type list exists. Owners keep filing files into the folders that are
   * already there.
   */
  canCreateFolders?: boolean;
}) {
  const [formats, setFormats] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);

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
          journeyStage: m.journeyStage,
          accessLevel: m.accessLevel,
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
  const goToFolder = (next: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (next) params.set("mf", next);
    else params.delete("mf");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  /** The file being read in the viewer popup. */
  const [viewing, setViewing] = useState<OfferingMaterial | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);

  /** Create an empty folder under whatever is open, and step into it. */
  async function createFolder() {
    const name = cleanFolderName(newFolderName);
    if (!name || !offeringId || savingFolder) return;
    const path = folder ? `${folder}/${name}` : name;
    setSavingFolder(true);
    try {
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialFolders: Array.from(new Set([...materialFolders, path])),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast(body.error || "Could not create that folder", "error");
        return;
      }
      setNewFolderOpen(false);
      setNewFolderName("");
      router.refresh();
      goToFolder(path);
    } catch {
      toast("Could not create that folder", "error");
    } finally {
      setSavingFolder(false);
    }
  }

  const anyFilter = formats.length > 0 || stages.length > 0 || levels.length > 0;
  // Agent-training uploads never reach a rep's list. They are background
  // knowledge for the assistant, not collateral, so only an owner — who has
  // to be able to manage them — sees them here at all.
  const mine = canEdit ? materials : materials.filter(isSalesVisible);
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
  const subFolders = anyFilter ? [] : childFolders(folders, folder);
  /**
   * A FILTER SEARCHES THE WHOLE TREE. Narrowing to "Presentation" and being
   * shown only the presentations in the folder you happen to be standing in
   * would hide the very file you are hunting for, so any active filter flattens
   * the view and each row says which folder it came from.
   */
  const scoped = anyFilter ? mine : materialsInFolder(mine, folder);
  const visible = scoped
    .filter((m) => {
      if (formats.length && !formats.includes(materialFormat(m.kind))) return false;
      // An untagged material matches only "no restriction" — it is never
      // counted into a stage or an access level nobody recorded for it.
      if (stages.length && !stages.includes(m.journeyStage ?? "")) return false;
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
          {canCreateFolders && offeringId && (
            <button
              type="button"
              onClick={() => setNewFolderOpen((v) => !v)}
              title={
                folder ? `New folder inside ${folder}` : "New top-level folder"
              }
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border-light bg-white px-2.5 py-2 text-[12.5px] font-semibold text-text-secondary transition-colors hover:border-blue-primary/40 hover:text-blue-primary"
            >
              <FolderPlus size={14} strokeWidth={2} />
              New folder
            </button>
          )}
          {action}
        </div>
      </div>

      {/* ANYTHING NEW OPENS IN A POPUP — his standing rule, and I broke it
          with an inline bar that pushed the whole list down the page. */}
      <Modal
        open={newFolderOpen && canCreateFolders}
        onClose={() => setNewFolderOpen(false)}
        title={folder ? `New folder inside ${folder}` : "New folder"}
      >
        <div className="space-y-4">
          <p className="text-[12.5px] leading-relaxed text-text-secondary">
            {folder
              ? `It will sit inside ${folder}, and you will land in it.`
              : "It will sit alongside Proposals, Product Demos and Thought Leadership."}
          </p>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Folder name
            </span>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createFolder();
              }}
              maxLength={60}
              placeholder="e.g. Case studies"
              className="w-full rounded-lg border border-border-light bg-white px-3 py-2 text-[13.5px] text-text-primary placeholder:text-text-tertiary focus:border-blue-primary focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setNewFolderOpen(false)}
              className="ml-auto text-[13.5px] font-semibold text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
            <Button
              onClick={() => void createFolder()}
              disabled={!cleanFolderName(newFolderName) || savingFolder}
            >
              {savingFolder ? "Creating…" : "Create folder"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* WHERE YOU ARE. Only rendered once you are inside something, so an
          offering with everything at the top level gains no chrome it doesn't
          need. Filtering hides it too: the results span every folder then. */}
      {folder && !anyFilter && (
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
          {anyFilter || folder ? (
            <>
              Showing <span className="tnum font-semibold">{visible.length}</span> of{" "}
              <span className="tnum font-semibold">{mine.length}</span>{" "}
              {mine.length === 1 ? "material" : "materials"}
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
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {subFolders.map((path) => {
            const name = path.split("/").pop() as string;
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
      {!folder && !anyFilter && subFolders.length > 0 && visible.length > 0 && (
        <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
          <FolderOpen size={13} strokeWidth={2} />
          Not in a folder
          <span className="tnum font-semibold text-text-secondary">
            {visible.length}
          </span>
        </p>
      )}

      {visible.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-border-light bg-[var(--surface)] px-4 py-6 text-center text-[13px] text-text-tertiary">
          {anyFilter
            ? `None of the ${mine.length} ${mine.length === 1 ? "material" : "materials"} on this offering match all three filters, clear one to see the rest.`
            : subFolders.length > 0
              ? "Everything here is inside a folder. Open one above."
              : folder
                ? "This folder is empty."
                : "No materials yet."}
        </p>
      ) : (
        /* FLOATING CARDS, NOT A RULED LIST. Hairline separators stacked twenty
           files deep read as a spreadsheet, and every row's five controls sat
           loose in the same gray as the text (Anir, Jul 30: "I don't like those
           separators... it should be kinda like the related offerings... more
           aesthetic and separated properly, like floating"). Same radius,
           shadow and hover lift as the related-offering pills below, one per
           row so the long file names still get the full width. */
        <div className="mt-3 flex flex-col gap-2.5">
          {visible.map((material) => {
            const format = materialFormat(material.kind);
            const formatMeta = MATERIAL_FORMAT_META[format];
            const Icon = MATERIAL_ICON[material.kind] ?? formatMeta.icon;
            // What this file was uploaded as, back when the picker offered
            // nine types. Shown only when it says more than the format does.
            const originalKind = legacyKindLabel(material.kind);
            const stage = material.journeyStage
              ? JOURNEY_STAGE_META[material.journeyStage]
              : null;
            const level = material.accessLevel
              ? ACCESS_LEVEL_META[material.accessLevel]
              : null;
            const internal = material.accessLevel === "internal_only";
            // An UPLOADED file is fetched through our download route, which
            // mints a fresh signed URL per click; a pasted link is just a link.
            const uploaded = Boolean(material.docsPath);
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
                className="group flex min-h-[72px] cursor-pointer items-center gap-3 rounded-2xl border border-border-light bg-white py-3 pr-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)]"
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
                    <span className="mt-0.5 block break-words text-[12px] leading-snug text-text-secondary">
                      {material.description}
                    </span>
                  )}
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {/* Filtering flattens the tree, so the row has to say where
                        the file actually lives or the result is unplaceable. */}
                    {anyFilter && material.folder && (
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
                    {stage && (
                      <TagPill
                        label={stage.short}
                        color={stage.color}
                        icon={stage.icon}
                      />
                    )}
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
                    {/* An owner must be able to SEE which files the assistant
                        is blind to, or the switch is a setting nobody can
                        audit. It sits with the other chips because that is
                        what it is — a fact about the file, not a control. It
                        used to sit in the button cluster on the right, where a
                        chip among four icon buttons read as a broken button. */}
                    {canEdit && !isReadByAgent(material) && (
                      <TagPill
                        label="Not used by AI"
                        color="#475569"
                        icon={BotOff}
                        variant="outline"
                        title="The assistant never reads this file"
                      />
                    )}
                  </span>
                  {/* Who put this here (Suren: "I should say who added it,
                      with pfp"). Rendered ONLY for materials a real person
                      uploaded through the app, the seeded catalog assets
                      carry no uploader and must not be credited to anyone,
                      so their rows simply have no attribution line. */}
                  {material.addedBy && (
                    <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-tertiary">
                      <Avatar
                        name={material.addedBy}
                        className="h-5 w-5 text-[8px]"
                      />
                      <span className="truncate">
                        Added by {material.addedBy}
                      </span>
                      {material.addedAt && (
                        <TimeAgo
                          value={material.addedAt}
                          prefix="· "
                          className="shrink-0 tnum"
                        />
                      )}
                    </span>
                  )}
                </span>
                {/* ONE CLUSTER, NOT FIVE LOOSE CONTROLS. "Open", its arrow,
                    Download, Edit and Remove used to float across the right
                    half of the row in the same weight as the body text, which
                    is most of why the list read as busy. They now sit together
                    at the end of the card: the thing you actually came to do
                    wears a button, the rest are quiet square icon buttons that
                    only colour on hover. */}
                <span className="flex shrink-0 items-center gap-1">
                  <span className="hidden items-center gap-1.5 rounded-lg border border-border-light px-2.5 py-1.5 text-[11.5px] font-semibold text-text-secondary transition-colors group-hover:border-blue-subtle group-hover:bg-blue-light group-hover:text-blue-primary lg:inline-flex">
                    {uploaded ? "Open" : "Open asset"}
                    <ExternalLink size={12} strokeWidth={1.9} />
                  </span>
                  {/* Narrow screens have no room for the label, but the row
                      must still say it opens somewhere. */}
                  <ExternalLink
                    size={14}
                    strokeWidth={1.7}
                    className="mr-0.5 text-text-tertiary group-hover:text-blue-primary lg:hidden"
                  />
                  {/* Save a copy. A nested <a> is invalid inside the row link,
                      so this navigates imperatively — the response is an
                      attachment, so the browser downloads it without leaving
                      the page. Open to EVERYONE, not just owners: handing files
                      to customers is the whole point of this list. */}
                  {uploaded && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`Download ${material.label}`}
                      title="Download a copy"
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
                    </span>
                  )}
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

"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  BotOff,
  ChevronRight,
  Download,
  Folder,
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
import { timeAgo } from "@/lib/utils";
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
          {canEdit && offeringId && (
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

      {/* Name it, and you land inside it. */}
      {newFolderOpen && canEdit && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-border-light bg-[var(--surface)] p-2.5">
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createFolder();
              if (e.key === "Escape") setNewFolderOpen(false);
            }}
            maxLength={60}
            placeholder={
              folder ? `New folder inside ${folder}` : "Folder name, e.g. Case studies"
            }
            aria-label="New folder name"
            className="min-w-[220px] flex-1 rounded-lg border border-border-light bg-white px-3 py-2 text-[13.5px] text-text-primary placeholder:text-text-tertiary focus:border-blue-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void createFolder()}
            disabled={!cleanFolderName(newFolderName) || savingFolder}
            className="rounded-lg bg-blue-primary px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-hover disabled:opacity-50"
          >
            {savingFolder ? "Creating…" : "Create folder"}
          </button>
          <button
            type="button"
            onClick={() => setNewFolderOpen(false)}
            className="px-1 text-[13px] font-semibold text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      )}

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
          Showing <span className="tnum font-semibold">{visible.length}</span> of{" "}
          <span className="tnum font-semibold">{mine.length}</span>{" "}
          {mine.length === 1 ? "material" : "materials"}
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
                className="group flex cursor-pointer items-center gap-3 rounded-xl border border-border-light bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-[1px] hover:border-blue-primary/40 hover:shadow-card"
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

      {visible.length === 0 ? (
        <p className="mt-3 border-y border-border-light py-5 text-[13px] text-text-tertiary">
          {anyFilter
            ? `None of the ${mine.length} ${mine.length === 1 ? "material" : "materials"} on this offering match all three filters, clear one to see the rest.`
            : subFolders.length > 0
              ? "Everything here is inside a folder. Open one above."
              : folder
                ? "This folder is empty."
                : "No materials yet."}
        </p>
      ) : (
        <div className="mt-3 border-y border-border-light divide-y divide-border-light">
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
                className="group flex min-h-[64px] cursor-pointer items-center gap-3 border-l-2 px-1 py-3 pl-2.5 transition-colors hover:bg-[var(--surface)]"
                // An internal-only file gets its own rail down the left edge,
                // so a row that must never be forwarded is obvious before you
                // read a word. Every other row carries the same transparent
                // border, so nothing shifts and the list stays aligned.
                style={{
                  borderLeftColor: internal
                    ? ACCESS_LEVEL_META.internal_only.color
                    : "transparent",
                }}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
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
                        <span className="shrink-0 tnum">
                          · {timeAgo(material.addedAt)}
                        </span>
                      )}
                    </span>
                  )}
                </span>
                <span className="hidden shrink-0 text-[11px] font-medium text-text-tertiary lg:block">
                  {uploaded ? "Open" : "Open asset"}
                </span>
                <ExternalLink
                  size={14}
                  strokeWidth={1.7}
                  className="shrink-0 text-text-tertiary group-hover:text-blue-primary"
                />
                {/* Save a copy. A nested <a> is invalid inside the row link, so
                    this navigates imperatively — the response is an attachment,
                    so the browser downloads it without leaving the page. Open
                    to EVERYONE, not just owners: handing files to customers is
                    the whole point of this list. */}
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
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                  >
                    <Download size={14} strokeWidth={1.8} />
                  </span>
                )}
                {/* An owner must be able to SEE which files the assistant is
                    blind to, or the switch is a setting nobody can audit. */}
                {canEdit && !isReadByAgent(material) && (
                  <TagPill
                    label="Not used by AI"
                    color="#475569"
                    icon={BotOff}
                    variant="outline"
                    title="The assistant never reads this file"
                  />
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
                    className="shrink-0 cursor-pointer rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-[color:#B02020]/10 hover:text-[color:#B02020]"
                  >
                    <X size={14} strokeWidth={2} />
                  </span>
                )}
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

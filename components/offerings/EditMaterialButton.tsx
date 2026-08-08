"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Folder, Route } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ColorSelect, MultiColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  ACCESS_LEVEL_VISIBILITY_COPY,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  allFolders,
  canonicalMaterialFolder,
  materialFolderLabel,
  materialJourneyStages,
  type AccessLevel,
  type JourneyStage,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";

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

/**
 * CHANGE A SALES MATERIAL AFTER IT IS UPLOADED.
 *
 * The flow Freyr asked for is upload / EDIT / delete, and the middle one was
 * missing: a file uploaded with a rushed title, the wrong buyer's-journey
 * stage, or — the one that matters — the wrong access level could only be
 * deleted and sent again. Re-uploading a 900MB demo to fix a typo is not a
 * flow, and for an Agent-training file it means the assistant briefly forgets
 * what it had learned.
 *
 * The FILE itself is not editable here. Replacing the bytes behind a material
 * is a different act with different consequences (the assistant has to re-read
 * it), so that stays delete-and-upload, and the dialog says so rather than
 * offering a control that silently does nothing.
 */
export function EditMaterialButton({
  offeringId,
  material,
  materials,
  materialFolders = [],
}: {
  offeringId: string;
  material: OfferingMaterial;
  /** The whole list, because saving one row PATCHes all of them. */
  materials: OfferingMaterial[];
  materialFolders?: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(material.label);
  const [description, setDescription] = useState(material.description || "");
  const initialStages = materialJourneyStages(material);
  const [journeyStages, setJourneyStages] = useState<JourneyStage[]>(
    initialStages.length ? initialStages : ["awareness"]
  );
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(
    material.accessLevel || "client_facing"
  );
  /** MOVE A FILE. The folder is a plain path, so moving is a re-save. */
  const initialFolder = canonicalMaterialFolder(material);
  const [folder, setFolder] = useState(initialFolder);
  const folderOptions = allFolders(materials, materialFolders);
  const hasChanges =
    label !== material.label ||
    description !== (material.description || "") ||
    folder !== initialFolder ||
    JSON.stringify(journeyStages) !== JSON.stringify(initialStages.length ? initialStages : ["awareness"]) ||
    accessLevel !== (material.accessLevel || "client_facing");

  function reset() {
    setLabel(material.label);
    setDescription(material.description || "");
    setFolder(initialFolder);
    setJourneyStages(initialStages.length ? initialStages : ["awareness"]);
    setAccessLevel(material.accessLevel || "client_facing");
  }

  async function save() {
    if (!label.trim()) {
      toast("Give it a name", "error");
      return;
    }
    if (!folder || !journeyStages.length) {
      toast("Choose a folder and at least one buyer journey stage", "error");
      return;
    }
    setBusy(true);
    try {
      // Every sibling row travels back verbatim — including its docsPath, so
      // renaming one file can never orphan another's stored bytes.
      const next = materials.map((m) =>
        m.id === material.id
          ? {
              id: m.id,
              kind: m.kind,
              label: label.trim(),
              url: m.url,
              docsPath: m.docsPath,
              description: description.trim(),
              // Always sent, empty string included: that is how "move it back
              // to the top level" reaches the server.
              folder,
              journeyStage: journeyStages[0],
              journeyStages,
              accessLevel,
              documentType: m.documentType,
            }
          : {
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
            }
      );
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials: next }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("Material updated");
        setOpen(false);
        router.refresh();
      } else {
        toast(data.error || "Couldn't save that", "error");
      }
    } catch {
      toast("Couldn't save that", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={`Edit ${material.label}`}
        title="Edit this material"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          reset();
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            reset();
            setOpen(true);
          }
        }}
        // Same 32px square as Download and Remove beside it — the three icon
        // buttons on a material card are one set and have to sit on one grid.
        className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
      >
        <Pencil size={14} strokeWidth={1.9} />
      </span>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit material"
      >
        <div className="space-y-4">
          <p className="text-[12.5px] leading-relaxed text-text-secondary">
            Rename it, describe it, move it, or change who may see it.
          </p>
          {/* Owners can move a material into a system or owner-created folder. */}
          <div>
            <label
              htmlFor={`folder-${material.id}`}
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary"
            >
              Folder
            </label>
            {/* Folder as the house picker, not a grey <select> — same folder
                glyph the material cards use (Anir, Jul 30 dropdown sweep). */}
            <ColorSelect
                  ariaLabel="Folder"
                  value={folder}
                  onChange={setFolder}
                  className="w-full"
                  collapsible={false}
                  options={folderOptions.map((f) => ({
                    value: f,
                    label: materialFolderLabel(f),
                    icon: Folder,
                    color: "#0071E3",
                  }))}
                />
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Choose from the system folders or folders created for this offering.
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                Buyer&apos;s journey stage
              </label>
              <MultiColorSelect
                values={journeyStages}
                onChange={(values) => setJourneyStages(values as JourneyStage[])}
                options={STAGE_OPTIONS}
                allLabel="Choose one or more stages"
                allIcon={Route}
                allColor="#7C3AED"
                ariaLabel="Buyer's journey stage"
                minWidth={0}
                collapsible={false}
                fluid
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                Who can view this file?
              </label>
              <ColorSelect
                value={accessLevel}
                onChange={(v) => setAccessLevel(v as AccessLevel)}
                options={ACCESS_OPTIONS}
                ariaLabel="Who can view this file?"
                minWidth={0}
                collapsible={false}
                compactTrigger
                className="w-full"
              />
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-text-tertiary">
                <span className="font-semibold text-text-secondary">
                  Freyr AI uses every uploaded file.
                </span>{" "}
                This choice only controls who can open it.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Name
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-border-light px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-blue-subtle"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
              Material description{" "}
              <span className="font-medium normal-case tracking-normal text-text-tertiary">
                Optional
              </span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="One sentence on what this file is for: skip it if the title says enough."
              className="w-full resize-y rounded-lg border border-border-light px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-blue-subtle"
            />
          </div>

          {/* Say what this dialog does NOT do, so nobody hunts for it. */}
          <p className="text-[11.5px] leading-relaxed text-text-tertiary">
            To swap the file itself, remove this material and upload the new
            version — the assistant re-reads it on the way in.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {hasChanges && (
              <Button onClick={save} disabled={busy || !folder || !journeyStages.length}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

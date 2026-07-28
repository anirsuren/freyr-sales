"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ColorSelect, type ColorOption } from "@/components/ui/ColorSelect";
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_META,
  JOURNEY_STAGES,
  JOURNEY_STAGE_META,
  MATERIAL_FORMATS,
  MATERIAL_FORMAT_META,
  MATERIAL_META,
  type AccessLevel,
  type JourneyStage,
  type MaterialFormat,
  type OfferingMaterial,
} from "@/lib/offeringMaterials";

// The two CR-3 tag dropdowns — colour-coded options, never a gray <select>.
const STAGE_OPTIONS: ColorOption[] = JOURNEY_STAGES.map((s) => ({
  value: s,
  label: JOURNEY_STAGE_META[s].label,
  color: JOURNEY_STAGE_META[s].color,
  icon: JOURNEY_STAGE_META[s].icon,
}));
const ACCESS_OPTIONS: ColorOption[] = ACCESS_LEVELS.map((l) => ({
  value: l,
  label: ACCESS_LEVEL_META[l].label,
  color: ACCESS_LEVEL_META[l].color,
  icon: ACCESS_LEVEL_META[l].icon,
}));

// Item 9 (Saras / Anant): the picker offers FOUR formats, not nine types. The
// nine asked the owner to categorise the same file twice — the title they type
// ("Cutting registration cycle time") already says it's a case study, so the
// only thing the upload still has to state is what kind of file it is. Four
// equal tiles across one row: symmetric, and the whole choice is one glance.
const FORMATS = MATERIAL_FORMATS;

// Add a sales material to an offering from a POP-UP, right on the offering page
// (Suren: "this should be a pop-up, not take me to some weird edit page"). Saves
// via the offering PATCH and refreshes so it shows immediately.
export function AddMaterialButton({
  offeringId,
  materials,
  variant = "link",
  compact = false,
}: {
  offeringId: string;
  materials: OfferingMaterial[];
  variant?: "link" | "button";
  /** Icon-only "+" trigger for tight toolbars. */
  compact?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MaterialFormat>("video");
  const [journeyStage, setJourneyStage] = useState<JourneyStage>("awareness");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>("client_facing");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setKind("video");
    setJourneyStage("awareness");
    setAccessLevel("client_facing");
    setLabel("");
    setDescription("");
    setUrl("");
  }

  async function save() {
    if (!url.trim() && !label.trim()) {
      toast("Add a link or a name first", "error");
      return;
    }
    setBusy(true);
    try {
      // Note: "added by" is NOT sent from here. The PATCH route stamps the
      // uploader from the server session and restores every existing row's
      // attribution from the store, so a client can neither credit itself for
      // someone else's upload nor wipe an existing one.
      const next: OfferingMaterial[] = [
        // Preserve the existing materials verbatim — their original nine-type
        // kind, their tags and their notes all travel back unchanged, so
        // adding one file never re-types, re-tags or un-describes the others.
        ...materials.map((m) => ({
          id: m.id,
          kind: m.kind,
          label: m.label,
          url: m.url,
          description: m.description,
          journeyStage: m.journeyStage,
          accessLevel: m.accessLevel,
        })),
        {
          id: "",
          kind,
          label: label.trim() || MATERIAL_META[kind].label,
          url: url.trim(),
          // Optional, and left off entirely when it's blank — an empty note is
          // no note, not an empty line under the title.
          ...(description.trim() ? { description: description.trim() } : {}),
          journeyStage,
          accessLevel,
        },
      ];
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials: next }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("Material added");
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast(data.error || "Couldn't add that", "error");
      }
    } catch {
      toast("Couldn't add that", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {compact ? (
        // Icon-only "+" — sellers know what it means next to the filter row
        // (Anir: "you don't have to say Add material, just have a plus").
        <button
          onClick={() => setOpen(true)}
          aria-label="Add material"
          title="Add material"
          className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-blue-primary text-white hover:bg-blue-hover transition-colors"
        >
          <Plus size={16} strokeWidth={2.2} />
        </button>
      ) : variant === "button" ? (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-blue-primary text-white hover:bg-blue-hover transition-colors"
        >
          <Plus size={14} strokeWidth={2.2} /> Add material
        </button>
      ) : (
        // A short, calm trigger. The old link spelled out four formats in a
        // sentence ("Add videos, presentations, white papers or pricing") and
        // read as clutter — the popup's type grid already answers "what kind?"
        // one click later (Anir, Jul 25: "I should be able to press Add, and
        // then choose what type in a pop-up").
        <button
          onClick={() => setOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold px-3 py-1.5 rounded-lg border border-border-light text-blue-primary hover:bg-blue-light/50 hover:border-blue-subtle transition-colors"
        >
          <Plus size={14} strokeWidth={2.2} /> Add material
        </button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add a sales material">
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2">
              File format
            </label>
            {/* Four equal, colour-coded tiles on one row (item 9). */}
            <div className="grid grid-cols-4 gap-2">
              {FORMATS.map((k) => {
                const { icon: Icon, color, label: short } = MATERIAL_FORMAT_META[k];
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 h-[78px] rounded-xl border text-center px-1.5 transition-all ${
                      active ? "" : "border-border-light hover:border-blue-subtle hover:-translate-y-0.5"
                    }`}
                    style={
                      active
                        ? { borderColor: color, background: `${color}12`, boxShadow: `inset 0 0 0 1px ${color}` }
                        : undefined
                    }
                  >
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${color}1A`, color }}
                    >
                      <Icon size={16} strokeWidth={1.9} />
                    </span>
                    <span className="text-[11px] font-medium text-text-primary leading-tight">
                      {short}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CR-3: every material carries its buyer's-journey stage + who may
              see it. Two colour-coded dropdowns, defaulting to the most common
              pairing (awareness + client facing). */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
                Buyer&apos;s journey stage
              </label>
              <ColorSelect
                value={journeyStage}
                options={STAGE_OPTIONS}
                onChange={(v) => setJourneyStage(v as JourneyStage)}
                ariaLabel="Buyer's journey stage"
                minWidth={0}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
                Access level
              </label>
              <ColorSelect
                value={accessLevel}
                options={ACCESS_OPTIONS}
                onChange={(v) => setAccessLevel(v as AccessLevel)}
                ariaLabel="Access level"
                minWidth={0}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
              Name
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`e.g. ${MATERIAL_META[kind].label}. Q3 deck`}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:border-blue-subtle focus:shadow-input-focus"
            />
          </div>

          {/* Item 10: one line about the file, in the owner's own words. It is
              optional in every sense, nothing checks it, nothing blocks the
              save, and a material saved without one shows no note at all. */}
          <div>
            <label
              htmlFor="material-description"
              className="mb-1.5 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary"
            >
              Material Description
              <span className="text-[10px] font-medium normal-case tracking-normal text-text-tertiary">
                Optional
              </span>
            </label>
            <textarea
              id="material-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="One sentence on what this file is for: skip it if the title says enough."
              className="w-full resize-y rounded-lg border border-border bg-white px-3 py-2 text-[14px] leading-snug text-text-primary focus:outline-none focus:border-blue-subtle focus:shadow-input-focus"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
              Link
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:border-blue-subtle focus:shadow-input-focus"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setOpen(false)}
              className="cursor-pointer text-[13px] font-medium px-3.5 py-2 rounded-md border border-border text-text-secondary hover:bg-surface transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-60"
            >
              <Plus size={14} strokeWidth={2.2} />
              {busy ? "Adding…" : "Add material"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

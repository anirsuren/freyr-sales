"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X, Pencil, Package } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import type { OfferingType } from "@/lib/offerings";
import { listAccent } from "./filterPalette";

const FIELD =
  "w-full rounded-lg border border-border-light bg-white px-3 py-2.5 text-[13.5px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary";
const LABEL =
  "block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5";

/**
 * Same treatment as the offering categories next door (Anir, Aug 15:
 * "Offering Type: same thing, you have to fix it... everything should be up to
 * date with our standards"): Edit opens the same popup as Add instead of
 * unfolding a form inside the row and shoving the list down, and removing a
 * type asks in the app's confirm dialog rather than sprouting a bare red
 * "Remove" word beside it.
 *
 * No owner here on purpose — an offering TYPE has no owner in the data model;
 * ownership is a property of the category (Suren, Jun 27: "for every offering
 * category there's going to be an offering owner"). Inventing one would be a
 * field with nothing behind it.
 */
export function OfferingTypesManager({
  offeringTypes,
  offeringCounts = {},
  canEdit = true,
}: {
  offeringTypes: OfferingType[];
  offeringCounts?: Record<string, number>;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<OfferingType | null>(null);

  /** The one editor. `editing` null means it is creating. */
  const [editor, setEditor] = useState<{ editing: OfferingType | null } | null>(
    null
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const editing = editor?.editing ?? null;

  function openCreate() {
    setName("");
    setDescription("");
    setEditor({ editing: null });
  }

  function openEdit(t: OfferingType) {
    setName(t.name);
    setDescription(t.description);
    setEditor({ editing: t });
  }

  async function save() {
    if (!name.trim() || !editor) return;
    const t = editor.editing;
    setBusy(true);
    try {
      const res = await fetch(
        t ? `/api/offering-types/${t.id}` : "/api/offering-types",
        {
          method: t ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        toast(
          t ? `Updated ${data.offeringType.name}.` : `Added ${data.offeringType.name}.`
        );
        setEditor(null);
        router.refresh();
      } else {
        toast(data.error || "Couldn't save the offering type.", "error");
      }
    } catch {
      toast("Couldn't save the offering type.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeType(t: OfferingType) {
    setBusy(true);
    setConfirmRemove(null);
    try {
      const res = await fetch(`/api/offering-types/${t.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Removed ${t.name}.`);
        router.refresh();
      } else {
        toast(data.error || "Couldn't remove the offering type.", "error");
      }
    } catch {
      toast("Couldn't remove the offering type.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* THE PAGE HEADER ALREADY SAID ALL OF THIS (Anir, Aug 13: "you're
          literally repeating the same thing again and again. You don't have to
          say 'offering categories' again. You can remove that pill right above
          the entire list").

          The card that used to sit here restated the page title, added a count
          the list itself makes obvious, and printed a second, near-identical
          copy of the subtitle — so the first thing on the page was a paragraph
          you had just finished reading. Only the action survives, directly
          above the list it adds to. */}
      <PageHeader
        title="Offering types"
        subtitle="The master list of offering types: what Freyr sells, each with a plain-English description. Offerings are grouped and filtered by these."
        action={
          canEdit ? (
            <Button onClick={openCreate}>
              <Plus size={14} strokeWidth={2.2} /> Add offering type
            </Button>
          ) : undefined
        }
      />

      {/* ONE popup for create AND edit — every create flow in the app opens a
          modal (Anir, Jul 25: "whenever there's an add button… it should
          always be a pop-up"), and Aug 15: editing must too. */}
      <Modal
        open={canEdit && editor !== null}
        onClose={() => setEditor(null)}
        title={editing ? `Edit ${editing.name}` : "Add an offering type"}
        size="wide"
      >
        <div className="space-y-4">
          <div>
            <label className={LABEL}>Offering type</label>
            <input
              className={FIELD}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Freya - Module + Agent"
              autoFocus
            />
          </div>
          <div>
            <label className={LABEL}>Description</label>
            <textarea
              className={`${FIELD} min-h-[88px] resize-y`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this offering type is: in plain English"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy} disabled={!name.trim()}>
              {editing ? "Save changes" : "Add offering type"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* The list */}
      <Card className="p-0 overflow-hidden">
        <div className="divide-y divide-border-light">
          {offeringTypes.map((t, i) => {
            const count = offeringCounts[t.id] || 0;
            const accent = listAccent(i);
            return (
              <div
                key={t.id}
                className="flex items-start justify-between gap-3 px-4 py-3.5"
              >
                <div className="flex items-start gap-3 min-w-0">
                  {/* Colour + icon chip — same palette order as the offerings
                      filter dropdown, so a type reads the same colour everywhere */}
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${accent}14`, color: accent }}
                  >
                    <Package size={15} strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-text-primary">
                    {t.name}
                  </p>
                  {t.description ? (
                    <p className="text-[12.5px] text-text-secondary mt-0.5 leading-relaxed max-w-[640px]">
                      {t.description}
                    </p>
                  ) : canEdit ? (
                    <button
                      onClick={() => openEdit(t)}
                      className="mt-0.5 cursor-pointer text-[12.5px] text-text-tertiary hover:text-blue-primary"
                    >
                      Add a description →
                    </button>
                  ) : (
                    <p className="text-[12.5px] text-text-tertiary mt-0.5">
                      No description yet
                    </p>
                  )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={`/offerings?otype=${t.id}`}
                    className="group inline-flex items-center gap-1 whitespace-nowrap rounded-full text-[11px] font-semibold px-2.5 py-1 transition-colors"
                    style={{ color: accent, background: `${accent}14` }}
                  >
                    {count} offering{count === 1 ? "" : "s"}
                  </Link>
                  {canEdit && (
                    <button
                      onClick={() => openEdit(t)}
                      aria-label={`Edit ${t.name}`}
                      title={`Edit ${t.name}`}
                      className="cursor-pointer rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                    >
                      <Pencil size={13} strokeWidth={1.8} />
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => setConfirmRemove(t)}
                      disabled={busy}
                      aria-label={`Remove ${t.name}`}
                      title={`Remove ${t.name}`}
                      className="cursor-pointer rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                    >
                      <X size={14} strokeWidth={2.2} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <ConfirmDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        busy={busy}
        onConfirm={() => {
          if (confirmRemove) void removeType(confirmRemove);
        }}
        title="Remove this offering type?"
        body={
          confirmRemove
            ? `${confirmRemove.name} disappears from the type list and from the filters.`
            : ""
        }
        detail={
          confirmRemove && (offeringCounts[confirmRemove.id] || 0) > 0
            ? `${offeringCounts[confirmRemove.id]} offering${
                offeringCounts[confirmRemove.id] === 1 ? "" : "s"
              } currently use it. They are not deleted, but they lose this type.`
            : undefined
        }
        confirmLabel="Remove type"
      />
    </div>
  );
}

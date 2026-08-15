"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X, Pencil, UserRound, Layers } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { NamePill } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { PersonSelect } from "@/components/performance/bits";
import { useToast } from "@/components/ui/Toast";
import type { OfferingCategory } from "@/lib/offerings";
import { useCurrentUser } from "@/components/auth/CurrentUserProvider";
import { listAccent } from "./filterPalette";

const FIELD =
  "w-full rounded-lg border border-border-light bg-white px-3 py-2.5 text-[13.5px] text-text-primary outline-none transition-colors placeholder:text-text-tertiary focus:border-blue-primary";
const LABEL =
  "block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5";

/**
 * THE OFFERING CATEGORY MASTER, BROUGHT UP TO THE HOUSE STANDARD.
 *
 * Anir, Aug 15, on this exact page: "under the Offering category you have to
 * add the owner dropdown, please, like you do normally... when I press Edit it
 * doesn't bring up a pop-up, it should bring up a pop-up... the Assign an
 * owner button does not seem to be working as needed. Everything should be up
 * to date with our standards."
 *
 * Three things were off it:
 *  - the owner was a free-text box, so "Priyanka" and "Priyanka Manchanda"
 *    were two different owners and neither tied back to an account. It is the
 *    same searchable PersonSelect used everywhere else a colleague is picked.
 *  - Edit unfolded an inline form INSIDE the row, pushing the rest of the list
 *    down the page. Add and Edit are now one popup, which is what every other
 *    create/edit flow in this app does.
 *  - "Assign an owner" opened that same inline form with three fields in it,
 *    so the one thing it named was the one thing it did not focus on. It opens
 *    the popup on the owner.
 *
 * Deleting also uses the app's ConfirmDialog instead of a bare red "Remove"
 * word appearing beside the row.
 */
export function OfferingCategoriesManager({
  offeringCategories,
  offeringCounts = {},
  canEdit = true,
  people = [],
  peopleRoles = {},
}: {
  offeringCategories: OfferingCategory[];
  offeringCounts?: Record<string, number>;
  canEdit?: boolean;
  /** Colleagues who can own a category. Empty falls back to free text. */
  people?: string[];
  peopleRoles?: Record<string, string>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const currentUser = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<OfferingCategory | null>(
    null
  );

  /** The one editor. `editing` null means it is creating. */
  const [editor, setEditor] = useState<{
    editing: OfferingCategory | null;
    /** Put the cursor on the owner when that is the reason it opened. */
    focusOwner?: boolean;
  } | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");

  function openCreate() {
    setName("");
    setDescription("");
    setOwner("");
    setEditor({ editing: null });
  }

  function openEdit(c: OfferingCategory, focusOwner = false) {
    setName(c.name);
    setDescription(c.description);
    setOwner(c.owner);
    setEditor({ editing: c, focusOwner });
  }

  /** Owner is a colleague, so it carries their account id when we know it. */
  function ownerAccount(value: string) {
    return value.trim() === currentUser.name
      ? currentUser.memberId || undefined
      : undefined;
  }

  async function save() {
    if (!name.trim() || !editor) return;
    const editing = editor.editing;
    setBusy(true);
    try {
      const res = await fetch(
        editing ? `/api/offering-categories/${editing.id}` : "/api/offering-categories",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            owner,
            owner_user_id: ownerAccount(owner),
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        toast(
          editing
            ? `Updated ${data.offeringCategory.name}.`
            : `Added ${data.offeringCategory.name}.`
        );
        setEditor(null);
        router.refresh();
      } else {
        toast(data.error || "Couldn't save the offering category.", "error");
      }
    } catch {
      toast("Couldn't save the offering category.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeCategory(c: OfferingCategory) {
    setBusy(true);
    setConfirmRemove(null);
    try {
      const res = await fetch(`/api/offering-categories/${c.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Removed ${c.name}.`);
        router.refresh();
      } else {
        toast(data.error || "Couldn't remove the offering category.", "error");
      }
    } catch {
      toast("Couldn't remove the offering category.", "error");
    } finally {
      setBusy(false);
    }
  }

  const editing = editor?.editing ?? null;

  return (
    <div className="space-y-6">
      {/* THE PAGE HEADER ALREADY SAID ALL OF THIS (Anir, Aug 13: "you're
          literally repeating the same thing again and again. You don't have to
          say 'offering categories' again"). Only the action survives, directly
          above the list it adds to. */}
      <PageHeader
        title="Offering categories"
        subtitle="The master list of offering categories: each groups related offerings and has an owner. Offerings are grouped and filtered by these."
        action={
          canEdit ? (
            <Button onClick={openCreate}>
              <Plus size={14} strokeWidth={2.2} /> Add offering category
            </Button>
          ) : undefined
        }
      />

      {/* ONE popup for both create and edit, so the two can never drift. */}
      <Modal
        open={canEdit && editor !== null}
        onClose={() => setEditor(null)}
        title={editing ? `Edit ${editing.name}` : "Add an offering category"}
        size="wide"
      >
        <div className="space-y-4">
          <div>
            <label className={LABEL}>Offering category</label>
            <input
              className={FIELD}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Global Regulatory Intelligence"
              autoFocus={!editor?.focusOwner}
            />
          </div>
          <div>
            <label className={LABEL}>Description</label>
            <textarea
              className={`${FIELD} min-h-[88px] resize-y`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this category groups: in plain English"
            />
          </div>
          <div>
            <label className={LABEL}>Offering owner</label>
            {/* A colleague, not a typed string: the same picker used to assign
                a goal or crown a group head, so the name always matches an
                account and never arrives spelled three ways. */}
            <PersonSelect
              value={owner}
              onChange={setOwner}
              people={people}
              roles={peopleRoles}
              placeholder="Who owns this category of offerings"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy} disabled={!name.trim()}>
              {editing ? "Save changes" : "Add offering category"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* The list */}
      <Card className="overflow-hidden p-0">
        <div className="divide-y divide-border-light">
          {offeringCategories.map((c, i) => {
            const count = offeringCounts[c.id] || 0;
            // Same position-indexed palette as the offerings page, so each
            // category is the same colour here and on its cards/filter chip.
            const accent = listAccent(i);
            return (
              <div
                key={c.id}
                className="flex items-start justify-between gap-3 px-4 py-3.5"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `${accent}14`, color: accent }}
                  >
                    <Layers size={15} strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-text-primary">
                      {c.name}
                    </p>
                    {c.description ? (
                      <p className="mt-0.5 max-w-[640px] text-[12.5px] leading-relaxed text-text-secondary">
                        {c.description}
                      </p>
                    ) : canEdit ? (
                      <button
                        onClick={() => openEdit(c)}
                        className="mt-0.5 cursor-pointer text-[12.5px] text-text-tertiary hover:text-blue-primary"
                      >
                        Add a description →
                      </button>
                    ) : (
                      <p className="mt-0.5 text-[12.5px] text-text-tertiary">
                        No description yet
                      </p>
                    )}
                    {/* Offering owner — the role Suren wants per category */}
                    {c.owner ? (
                      <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-text-secondary">
                        <Avatar name={c.owner} className="h-6 w-6 text-[8px]" />
                        Owner:{" "}
                        <b className="font-semibold text-text-primary">
                          {c.owner}
                        </b>
                      </p>
                    ) : canEdit ? (
                      <button
                        onClick={() => openEdit(c, true)}
                        className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-blue-subtle px-2.5 py-1 text-[12px] font-semibold text-blue-primary transition-colors hover:bg-blue-light/50"
                      >
                        <UserRound size={12} strokeWidth={2} /> Assign an owner
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/offerings?cat=${c.id}`}
                    className="group inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors"
                    style={{ color: accent, background: `${accent}14` }}
                  >
                    {count} offering{count === 1 ? "" : "s"}
                  </Link>
                  {canEdit && (
                    <button
                      onClick={() => openEdit(c)}
                      aria-label={`Edit ${c.name}`}
                      title={`Edit ${c.name}`}
                      className="cursor-pointer rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
                    >
                      <Pencil size={13} strokeWidth={1.8} />
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => setConfirmRemove(c)}
                      disabled={busy}
                      aria-label={`Remove ${c.name}`}
                      title={`Remove ${c.name}`}
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
          if (confirmRemove) void removeCategory(confirmRemove);
        }}
        title="Remove this offering category?"
        body={
          confirmRemove ? (
            <>
              <NamePill>{confirmRemove.name}</NamePill> disappears from the
              category list and from the filters.
            </>
          ) : (
            ""
          )
        }
        detail={
          confirmRemove && (offeringCounts[confirmRemove.id] || 0) > 0
            ? `${offeringCounts[confirmRemove.id]} offering${
                offeringCounts[confirmRemove.id] === 1 ? "" : "s"
              } currently sit in it. They are not deleted, but they lose this grouping.`
            : undefined
        }
        confirmLabel="Remove category"
      />
    </div>
  );
}

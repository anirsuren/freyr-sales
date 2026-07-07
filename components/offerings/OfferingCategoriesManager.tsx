"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ArrowRight, X, Pencil, UserRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { OfferingCategory } from "@/lib/offerings";

const FIELD =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:shadow-input-focus";
const LABEL =
  "block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1";

export function OfferingCategoriesManager({
  offeringCategories,
  offeringCounts = {},
  canEdit = true,
}: {
  offeringCategories: OfferingCategory[];
  offeringCounts?: Record<string, number>;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editOwner, setEditOwner] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  async function addCategory() {
    if (!name.trim()) return;
    setBusy(true);
    const exists = offeringCategories.some(
      (c) => c.name.toLowerCase() === name.trim().toLowerCase()
    );
    try {
      const res = await fetch("/api/offering-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, owner }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`${exists ? "Updated" : "Added"} ${data.offeringCategory.name}.`);
        setName("");
        setDescription("");
        setOwner("");
        setAdding(false);
        router.refresh();
      } else {
        toast(data.error || "Couldn't add the offering category.", "error");
      }
    } catch {
      toast("Couldn't add the offering category.", "error");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(c: OfferingCategory) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditDesc(c.description);
    setEditOwner(c.owner);
    setConfirmRemove(null);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/offering-categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDesc,
          owner: editOwner,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Updated ${data.offeringCategory.name}.`);
        setEditingId(null);
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

  return (
    <div className="space-y-6">
      {/* Add-category panel */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border-light">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Offering categories ({offeringCategories.length})
          </h2>
          {canEdit && (
            <button
              onClick={() => setAdding((a) => !a)}
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-primary hover:bg-blue-light rounded-md px-2.5 py-1.5"
            >
              <Plus size={14} strokeWidth={2} /> Add offering category
            </button>
          )}
        </div>

        {canEdit && adding && (
          <div className="p-4 bg-surface/60 border-b border-border-light space-y-3">
            <div>
              <label className={LABEL}>Offering category</label>
              <input
                className={FIELD}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Global Regulatory Intelligence"
                autoFocus
              />
            </div>
            <div>
              <label className={LABEL}>Description</label>
              <textarea
                className={`${FIELD} min-h-[72px] resize-y`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this category groups — in plain English"
              />
            </div>
            <div>
              <label className={LABEL}>Offering owner</label>
              <input
                className={FIELD}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Who owns this category of offerings"
              />
            </div>
            <Button onClick={addCategory} loading={busy}>
              Add offering category
            </Button>
          </div>
        )}

        {adding ? null : (
          <p className="px-4 py-2.5 text-[12px] text-text-tertiary">
            The master list of offering categories. Each groups related offerings
            and has an owner — offerings are grouped and filtered by these.
          </p>
        )}
      </Card>

      {/* The list */}
      <Card className="p-0 overflow-hidden">
        <div className="divide-y divide-border-light">
          {offeringCategories.map((c) => {
            const count = offeringCounts[c.id] || 0;
            if (editingId === c.id) {
              return (
                <div key={c.id} className="p-4 bg-surface/60 space-y-3">
                  <div>
                    <label className={LABEL}>Offering category</label>
                    <input
                      className={FIELD}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Description</label>
                    <textarea
                      className={`${FIELD} min-h-[72px] resize-y`}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="What this category groups — in plain English"
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Offering owner</label>
                    <input
                      className={FIELD}
                      value={editOwner}
                      onChange={(e) => setEditOwner(e.target.value)}
                      placeholder="Who owns this category of offerings"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => saveEdit(c.id)} loading={busy}>
                      Save
                    </Button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-[13px] font-semibold text-text-secondary hover:text-text-primary px-3 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div
                key={c.id}
                className="flex items-start justify-between gap-3 px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-text-primary">
                    {c.name}
                  </p>
                  {c.description ? (
                    <p className="text-[12.5px] text-text-secondary mt-0.5 leading-relaxed max-w-[640px]">
                      {c.description}
                    </p>
                  ) : canEdit ? (
                    <button
                      onClick={() => startEdit(c)}
                      className="text-[12.5px] text-text-tertiary hover:text-blue-primary mt-0.5"
                    >
                      Add a description →
                    </button>
                  ) : (
                    <p className="text-[12.5px] text-text-tertiary mt-0.5">
                      No description yet
                    </p>
                  )}
                  {/* Offering owner — the role Suren wants per category */}
                  {c.owner ? (
                    <p className="inline-flex items-center gap-1 text-[12px] text-text-secondary mt-1.5">
                      <UserRound size={12} strokeWidth={1.8} className="text-text-tertiary" />
                      Owner: {c.owner}
                    </p>
                  ) : canEdit ? (
                    <button
                      onClick={() => startEdit(c)}
                      className="inline-flex items-center gap-1 text-[12px] text-text-tertiary hover:text-blue-primary mt-1.5"
                    >
                      <UserRound size={12} strokeWidth={1.8} /> Assign an owner →
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={`/offerings?cat=${c.id}`}
                    className="group inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-text-tertiary hover:text-blue-primary px-2 py-1"
                  >
                    {count} offering{count === 1 ? "" : "s"}
                    <ArrowRight
                      size={12}
                      strokeWidth={2}
                      className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
                    />
                  </Link>
                  {canEdit && (
                    <button
                      onClick={() => startEdit(c)}
                      aria-label={`Edit ${c.name}`}
                      className="text-text-tertiary hover:text-blue-primary p-1.5"
                    >
                      <Pencil size={13} strokeWidth={1.8} />
                    </button>
                  )}
                  {!canEdit ? null : confirmRemove === c.id ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px]">
                      <button
                        onClick={() => removeCategory(c)}
                        disabled={busy}
                        className="font-semibold text-error hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => setConfirmRemove(null)}
                        className="font-semibold text-text-secondary hover:text-text-primary"
                      >
                        Keep
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmRemove(c.id)}
                      disabled={busy}
                      aria-label={`Remove ${c.name}`}
                      className="text-text-tertiary hover:text-error p-1.5 disabled:opacity-50"
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
    </div>
  );
}

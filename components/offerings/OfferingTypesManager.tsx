"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ArrowRight, X, Pencil } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { OfferingType } from "@/lib/offerings";

const FIELD =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[13px] text-text-primary focus:outline-none focus:shadow-input-focus";
const LABEL =
  "block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1";

export function OfferingTypesManager({
  offeringTypes,
  offeringCounts = {},
}: {
  offeringTypes: OfferingType[];
  offeringCounts?: Record<string, number>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Inline edit (one row at a time) and a confirm step before removing a type
  // that offerings still use.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  async function addType() {
    if (!name.trim()) return;
    setBusy(true);
    const exists = offeringTypes.some(
      (t) => t.name.toLowerCase() === name.trim().toLowerCase()
    );
    try {
      const res = await fetch("/api/offering-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`${exists ? "Updated" : "Added"} ${data.offeringType.name}.`);
        setName("");
        setDescription("");
        setAdding(false);
        router.refresh();
      } else {
        toast(data.error || "Couldn't add the offering type.", "error");
      }
    } catch {
      toast("Couldn't add the offering type.", "error");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(t: OfferingType) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditDesc(t.description);
    setConfirmRemove(null);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/offering-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, description: editDesc }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Updated ${data.offeringType.name}.`);
        setEditingId(null);
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
      {/* Add-type panel */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border-light">
          <h2 className="text-[15px] font-semibold text-text-primary">
            Offering types ({offeringTypes.length})
          </h2>
          <button
            onClick={() => setAdding((a) => !a)}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-primary hover:bg-blue-light rounded-md px-2.5 py-1.5"
          >
            <Plus size={14} strokeWidth={2} /> Add offering type
          </button>
        </div>

        {adding && (
          <div className="p-4 bg-surface/60 border-b border-border-light space-y-3">
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
                className={`${FIELD} min-h-[72px] resize-y`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this offering type is — in plain English"
              />
            </div>
            <Button onClick={addType} loading={busy}>
              Add offering type
            </Button>
          </div>
        )}

        {adding ? null : (
          <p className="px-4 py-2.5 text-[12px] text-text-tertiary">
            The master list of offering types. Give each one a plain-English
            description — offerings are grouped and filtered by these.
          </p>
        )}
      </Card>

      {/* The list */}
      <Card className="p-0 overflow-hidden">
        <div className="divide-y divide-border-light">
          {offeringTypes.map((t) => {
            const count = offeringCounts[t.id] || 0;
            if (editingId === t.id) {
              return (
                <div key={t.id} className="p-4 bg-surface/60 space-y-3">
                  <div>
                    <label className={LABEL}>Offering type</label>
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
                      placeholder="What this offering type is — in plain English"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={() => saveEdit(t.id)} loading={busy}>
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
                key={t.id}
                className="flex items-start justify-between gap-3 px-4 py-3.5"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-text-primary">
                    {t.name}
                  </p>
                  {t.description ? (
                    <p className="text-[12.5px] text-text-secondary mt-0.5 leading-relaxed max-w-[640px]">
                      {t.description}
                    </p>
                  ) : (
                    <button
                      onClick={() => startEdit(t)}
                      className="text-[12.5px] text-text-tertiary hover:text-blue-primary mt-0.5"
                    >
                      Add a description →
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={`/offerings?otype=${t.id}`}
                    className="group inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-text-tertiary hover:text-blue-primary px-2 py-1"
                  >
                    {count} offering{count === 1 ? "" : "s"}
                    <ArrowRight
                      size={12}
                      strokeWidth={2}
                      className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
                    />
                  </Link>
                  <button
                    onClick={() => startEdit(t)}
                    aria-label={`Edit ${t.name}`}
                    className="text-text-tertiary hover:text-blue-primary p-1.5"
                  >
                    <Pencil size={13} strokeWidth={1.8} />
                  </button>
                  {confirmRemove === t.id ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px]">
                      <button
                        onClick={() => removeType(t)}
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
                      onClick={() => setConfirmRemove(t.id)}
                      disabled={busy}
                      aria-label={`Remove ${t.name}`}
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

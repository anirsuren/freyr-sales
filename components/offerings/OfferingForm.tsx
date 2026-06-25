"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  MATERIAL_META,
  type CustomerType,
  type Market,
  type MaterialKind,
} from "@/lib/offerings";

interface MaterialRow {
  kind: MaterialKind;
  label: string;
  url: string;
}

// A material link a rep pastes as a bare domain ("example.com/deck.pdf") would
// render as a relative href and 404 on click. Give it a scheme; leave full URLs
// and root-relative paths (/internal/...) alone.
function normalizeUrl(u: string) {
  const t = u.trim();
  if (!t || /^https?:\/\//i.test(t) || t.startsWith("/")) return t;
  return `https://${t}`;
}

const FIELD =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:shadow-input-focus";
const LABEL =
  "block text-[12px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5";

export function OfferingForm({
  customerTypes,
  markets,
  existingTypes = [],
  offeringId,
  initial,
}: {
  customerTypes: CustomerType[];
  markets: Market[];
  existingTypes?: string[];
  offeringId?: string;
  initial?: {
    offering_type?: string;
    offering_name?: string;
    offering_description?: string;
    current_availability?: string;
    future_availability?: string;
    customer_type_ids?: string[];
    market_ids?: string[];
    materials?: MaterialRow[];
  };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = !!offeringId;
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.ok) {
        toast("Offering deleted.");
        router.push("/offerings");
        router.refresh();
      } else {
        toast(data.error || "Couldn't delete the offering.", "error");
        setDeleting(false);
      }
    } catch {
      toast("Couldn't delete the offering.", "error");
      setDeleting(false);
    }
  }

  const nameRef = useRef<HTMLInputElement>(null);
  const params = useSearchParams();
  // Arriving from Duplicate (?focus=name) → land the cursor in the name, text
  // selected, so renaming the copy is a single keystroke away.
  useEffect(() => {
    if (params.get("focus") === "name") {
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [params]);
  const [offeringType, setOfferingType] = useState(initial?.offering_type ?? "");
  const [offeringName, setOfferingName] = useState(initial?.offering_name ?? "");
  const [description, setDescription] = useState(initial?.offering_description ?? "");
  const [current, setCurrent] = useState(initial?.current_availability ?? "");
  const [future, setFuture] = useState(initial?.future_availability ?? "");
  const [ctIds, setCtIds] = useState<string[]>(initial?.customer_type_ids ?? []);
  const [mktIds, setMktIds] = useState<string[]>(initial?.market_ids ?? []);
  const [materials, setMaterials] = useState<MaterialRow[]>(
    initial?.materials ?? []
  );

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  // Group the customer-type chips by family for scannable selection.
  const CT_FAMILY_ORDER = ["Pharmaceutical", "Biologics", "Bio Pharmaceutical"];
  const ctGroups = CT_FAMILY_ORDER.map((fam) => ({
    fam,
    types: customerTypes.filter((c) => c.family === fam),
  })).filter((g) => g.types.length > 0);
  const ctOther = customerTypes.filter(
    (c) => !CT_FAMILY_ORDER.includes(c.family)
  );
  const chipCls = (on: boolean) =>
    `text-[12.5px] font-medium rounded-md px-2.5 py-1.5 border transition-colors ${
      on
        ? "border-blue-primary bg-blue-light text-blue-primary"
        : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
    }`;

  async function submit() {
    if (!offeringName.trim()) {
      toast("Give the offering a name first.", "error");
      nameRef.current?.focus();
      nameRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    // A material row with only a name or only a link is a half-filled mistake —
    // it would be silently dropped on save. Flag it so the user doesn't lose it.
    const partial = materials.find(
      (m) =>
        (m.label.trim() && !m.url.trim()) || (!m.label.trim() && m.url.trim())
    );
    if (partial) {
      toast(
        partial.label.trim()
          ? `Add a link for “${partial.label.trim()}” — or remove that material.`
          : "Add a name for that material — or remove the empty link.",
        "error"
      );
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        isEdit ? `/api/offerings/${offeringId}` : "/api/offerings",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offering_type: offeringType,
            offering_name: offeringName,
            offering_description: description,
            current_availability: current,
            future_availability: future,
            customer_type_ids: ctIds,
            market_ids: mktIds,
            materials: materials
              .filter((m) => m.label.trim() && m.url.trim())
              .map((m) => ({ ...m, url: normalizeUrl(m.url) })),
          }),
        }
      );
      const data = await res.json();
      if (data.ok) {
        toast(isEdit ? "Offering updated." : "Offering saved.");
        router.push(`/offerings/${isEdit ? offeringId : data.offering.id}`);
        router.refresh();
      } else {
        toast(data.error || "Couldn't save the offering.", "error");
      }
    } catch {
      toast("Couldn't save the offering.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-[840px] space-y-4">
      <Card className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Offering type</label>
            <input
              className={FIELD}
              value={offeringType}
              onChange={(e) => setOfferingType(e.target.value)}
              placeholder="e.g. Freya Module, Freya Platform"
              list="offering-types"
              autoComplete="off"
            />
            {existingTypes.length > 0 && (
              <datalist id="offering-types">
                {existingTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            )}
          </div>
          <div>
            <label className={LABEL}>
              Offering name <span className="text-error">*</span>
            </label>
            <input
              ref={nameRef}
              className={FIELD}
              value={offeringName}
              onChange={(e) => setOfferingName(e.target.value)}
              placeholder="e.g. Freya Register"
            />
          </div>
        </div>
        <div>
          <label className={LABEL}>Offering description</label>
          <textarea
            className={`${FIELD} min-h-[80px] resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What the offering does…"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Current availability</label>
            <input
              className={FIELD}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="e.g. V1 is available now"
            />
          </div>
          <div>
            <label className={LABEL}>Future availability</label>
            <input
              className={FIELD}
              value={future}
              onChange={(e) => setFuture(e.target.value)}
              placeholder="e.g. V3 is available in July 2026"
            />
          </div>
        </div>
      </Card>

      {/* Customer types */}
      <Card>
        <label className={LABEL}>Applicable customer types</label>
        <div className="space-y-3 mt-0.5">
          {ctGroups.map(({ fam, types }) => {
            const ids = types.map((t) => t.id);
            const allOn = ids.every((id) => ctIds.includes(id));
            return (
              <div key={fam}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                    {fam}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCtIds((l) =>
                        allOn
                          ? l.filter((id) => !ids.includes(id))
                          : Array.from(new Set([...l, ...ids]))
                      )
                    }
                    className="text-[11px] font-semibold text-blue-primary hover:underline"
                  >
                    {allOn ? "Clear" : "All"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {types.map((c) => {
                    const on = ctIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCtIds((l) => toggle(l, c.id))}
                        aria-pressed={on}
                        aria-label={c.name}
                        title={c.name}
                        className={chipCls(on)}
                      >
                        {c.size}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {ctOther.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ctOther.map((c) => {
                const on = ctIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCtIds((l) => toggle(l, c.id))}
                    aria-pressed={on}
                    className={chipCls(on)}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Markets */}
      <Card>
        <label className={LABEL}>Applicable markets</label>
        <div className="flex flex-wrap gap-2">
          {markets.map((m) => {
            const on = mktIds.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMktIds((l) => toggle(l, m.id))}
                aria-pressed={on}
                className={`text-[12.5px] font-medium rounded-md px-2.5 py-1.5 border transition-colors ${
                  on
                    ? "border-blue-primary bg-blue-light text-blue-primary"
                    : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                }`}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Sales materials */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <label className={`${LABEL} mb-0`}>Sales materials</label>
          <button
            type="button"
            onClick={() =>
              setMaterials((l) => [...l, { kind: "video", label: "", url: "" }])
            }
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-primary hover:bg-blue-light rounded-md px-2 py-1"
          >
            <Plus size={14} strokeWidth={2} /> Add material
          </button>
        </div>
        {materials.length === 0 && (
          <p className="text-[13px] text-text-tertiary">
            Add video / YouTube links, sales presentations, white papers, and
            pricing documents.
          </p>
        )}
        {materials.map((m, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={m.kind}
              onChange={(e) =>
                setMaterials((l) =>
                  l.map((x, j) =>
                    j === i ? { ...x, kind: e.target.value as MaterialKind } : x
                  )
                )
              }
              aria-label="Material type"
              className="h-9 rounded-md border border-border bg-white px-2 text-[13px]"
            >
              {(Object.keys(MATERIAL_META) as MaterialKind[]).map((k) => (
                <option key={k} value={k}>
                  {MATERIAL_META[k].label}
                </option>
              ))}
            </select>
            <input
              value={m.label}
              onChange={(e) =>
                setMaterials((l) =>
                  l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x))
                )
              }
              placeholder="Label"
              className="flex-1 min-w-[140px] h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:shadow-input-focus"
            />
            <input
              value={m.url}
              onChange={(e) =>
                setMaterials((l) =>
                  l.map((x, j) => (j === i ? { ...x, url: e.target.value } : x))
                )
              }
              placeholder="https://…"
              className="flex-1 min-w-[180px] h-9 rounded-md border border-border px-3 text-[13px] focus:outline-none focus:shadow-input-focus"
            />
            <button
              type="button"
              onClick={() => setMaterials((l) => l.filter((_, j) => j !== i))}
              aria-label="Remove material"
              className="text-text-tertiary hover:text-error p-1.5"
            >
              <Trash2 size={15} strokeWidth={1.7} />
            </button>
          </div>
        ))}
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={submit} loading={saving}>
          {isEdit ? "Save changes" : "Save offering"}
        </Button>
        <button
          type="button"
          onClick={() =>
            router.push(isEdit ? `/offerings/${offeringId}` : "/offerings")
          }
          className="text-[14px] font-semibold text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>

      {isEdit && (
        <div className="pt-4 mt-2 border-t border-border-light">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-error hover:underline"
            >
              <Trash2 size={14} strokeWidth={1.8} /> Delete offering
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-text-secondary">
                Delete this offering? This can&apos;t be undone.
              </span>
              <Button variant="destructive" onClick={remove} loading={deleting}>
                Delete
              </Button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-[13px] font-semibold text-text-secondary hover:text-text-primary"
              >
                Keep
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

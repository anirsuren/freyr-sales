"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

const FIELD =
  "w-full rounded-md border border-border bg-white px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:shadow-input-focus";
const LABEL =
  "block text-[12px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1.5";

export function OfferingForm({
  customerTypes,
  markets,
}: {
  customerTypes: CustomerType[];
  markets: Market[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [offeringType, setOfferingType] = useState("");
  const [offeringName, setOfferingName] = useState("");
  const [description, setDescription] = useState("");
  const [current, setCurrent] = useState("");
  const [future, setFuture] = useState("");
  const [ctIds, setCtIds] = useState<string[]>([]);
  const [mktIds, setMktIds] = useState<string[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  async function submit() {
    if (!offeringName.trim()) {
      toast("Give the offering a name first.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/offerings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offering_type: offeringType,
          offering_name: offeringName,
          offering_description: description,
          current_availability: current,
          future_availability: future,
          customer_type_ids: ctIds,
          market_ids: mktIds,
          materials: materials.filter((m) => m.label.trim() && m.url.trim()),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("Offering saved.");
        router.push(`/offerings/${data.offering.id}`);
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
              placeholder="e.g. Freyr Module, Freyr Platform"
            />
          </div>
          <div>
            <label className={LABEL}>
              Offering name <span className="text-error">*</span>
            </label>
            <input
              className={FIELD}
              value={offeringName}
              onChange={(e) => setOfferingName(e.target.value)}
              placeholder="e.g. Freyr Register"
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
        <div className="flex flex-wrap gap-2">
          {customerTypes.map((c) => {
            const on = ctIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCtIds((l) => toggle(l, c.id))}
                aria-pressed={on}
                className={`text-[12.5px] font-medium rounded-md px-2.5 py-1.5 border transition-colors ${
                  on
                    ? "border-blue-primary bg-blue-light text-blue-primary"
                    : "border-border-light bg-white text-text-secondary hover:border-blue-subtle"
                }`}
              >
                {c.name}
              </button>
            );
          })}
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
          Save offering
        </Button>
        <button
          type="button"
          onClick={() => router.push("/offerings")}
          className="text-[14px] font-semibold text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

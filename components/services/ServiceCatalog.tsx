"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Search, Plus, Pencil, Trash2, X, Check, Users, Building2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmModal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface Service {
  name: string;
  description: string;
  target_roles?: string[];
  target_industries?: string[];
  target_company_types?: string[];
  pain_points?: string[];
}

function Chips({ items, icon: Icon }: { items: string[]; icon: any }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Icon size={13} strokeWidth={1.5} className="text-text-tertiary" />
      {items.map((t, i) => (
        <span
          key={i}
          className="text-[11px] px-2 py-0.5 rounded-md bg-surface text-text-secondary border border-border-light"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function ServiceCatalog({ services }: { services: Service[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", target_roles: "", target_industries: "" });

  const indexed = useMemo(
    () => services.map((svc, idx) => ({ svc, idx })),
    [services]
  );
  const view = indexed.filter(
    ({ svc }) =>
      !q ||
      svc.name.toLowerCase().includes(q.toLowerCase()) ||
      (svc.description || "").toLowerCase().includes(q.toLowerCase())
  );

  async function add() {
    setBusy(true);
    try {
      const res = await fetch("/api/kb/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (d.ok) {
        toast("Service added");
        setAdding(false);
        setForm({ name: "", description: "", target_roles: "", target_industries: "" });
        router.refresh();
      } else toast("Couldn't add", "error");
    } finally {
      setBusy(false);
    }
  }

  async function del(idx: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/kb/services?index=${idx}`, {
        method: "DELETE",
      });
      const d = await res.json();
      if (d.ok) {
        toast("Service removed");
        setConfirmIdx(null);
        router.refresh();
      } else toast("Couldn't remove", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(idx: number, name: string, description: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/kb/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: idx, name, description }),
      });
      const d = await res.json();
      if (d.ok) {
        toast("Service updated");
        setEditIdx(null);
        router.refresh();
      } else toast("Couldn't update", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="relative sm:max-w-[340px] w-full">
          <Search size={16} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services…" className="pl-9" />
        </div>
        <Button onClick={() => setAdding((a) => !a)} className="sm:ml-auto gap-1.5">
          <Plus size={16} strokeWidth={2} />
          Add service
        </Button>
      </div>

      {adding && (
        <Card className="mb-5">
          <h3 className="text-[15px] font-semibold text-text-primary mb-3">New service</h3>
          <div className="space-y-3">
            <Input placeholder="Service name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Textarea placeholder="Description" className="min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input placeholder="Target roles (comma-separated)" value={form.target_roles} onChange={(e) => setForm({ ...form, target_roles: e.target.value })} />
              <Input placeholder="Target industries (comma-separated)" value={form.target_industries} onChange={(e) => setForm({ ...form, target_industries: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button onClick={add} loading={busy} disabled={!form.name}>Save service</Button>
              <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        </Card>
      )}

      {view.length === 0 ? (
        <Card className="p-0">
          <EmptyState icon={Package} title="No services match" description="Try a different search, or add a service." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {view.map(({ svc, idx }) => (
            <Card key={idx}>
              {editIdx === idx ? (
                <EditForm
                  initialName={svc.name}
                  initialDesc={svc.description}
                  busy={busy}
                  onCancel={() => setEditIdx(null)}
                  onSave={(n, d) => saveEdit(idx, n, d)}
                />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="w-9 h-9 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                        <Package size={18} strokeWidth={1.5} />
                      </span>
                      <div>
                        <p className="text-[15px] font-semibold text-text-primary">{svc.name}</p>
                        <p className="text-[13px] text-text-secondary leading-relaxed mt-1">{svc.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditIdx(idx)}
                        aria-label="Edit service"
                        className="p-1.5 rounded-md text-text-tertiary hover:text-blue-primary hover:bg-surface transition-colors"
                      >
                        <Pencil size={16} strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={() => setConfirmIdx(idx)}
                        aria-label="Delete service"
                        className="p-1.5 rounded-md text-text-tertiary hover:text-error hover:bg-surface transition-colors"
                      >
                        <Trash2 size={16} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <Chips items={svc.target_roles || []} icon={Users} />
                    <Chips items={svc.target_industries || svc.target_company_types || []} icon={Building2} />
                  </div>
                  {svc.pain_points && svc.pain_points.length > 0 && (
                    <p className="text-[12px] text-text-tertiary mt-3">
                      Solves: {svc.pain_points.join(" · ")}
                    </p>
                  )}
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      <ConfirmModal
        open={confirmIdx !== null}
        onClose={() => setConfirmIdx(null)}
        onConfirm={() => confirmIdx !== null && del(confirmIdx)}
        loading={busy}
        title="Remove service?"
        message={
          confirmIdx !== null
            ? `"${services[confirmIdx]?.name}" will be removed from the knowledge base. This can't be undone.`
            : ""
        }
        confirmLabel="Remove service"
      />
    </div>
  );
}

function EditForm({
  initialName,
  initialDesc,
  busy,
  onSave,
  onCancel,
}: {
  initialName: string;
  initialDesc: string;
  busy: boolean;
  onSave: (name: string, desc: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [desc, setDesc] = useState(initialDesc);
  return (
    <div className="space-y-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} />
      <Textarea className="min-h-[80px]" value={desc} onChange={(e) => setDesc(e.target.value)} />
      <div className="flex gap-2">
        <Button onClick={() => onSave(name, desc)} loading={busy} className="gap-1.5">
          <Check size={16} strokeWidth={2} /> Save
        </Button>
        <Button variant="secondary" onClick={onCancel} className="gap-1.5">
          <X size={16} strokeWidth={2} /> Cancel
        </Button>
      </div>
    </div>
  );
}

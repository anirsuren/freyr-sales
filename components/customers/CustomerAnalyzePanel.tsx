"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Building2,
  Landmark,
  DollarSign,
  Layers,
  ChevronRight,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

interface Analysis {
  customer_type: string;
  ownership: "Public" | "Private";
  revenue: string;
  rationale: string;
  confidence?: "high" | "medium" | "low";
  sources?: string[];
  source?: "mock" | "web";
}

// "Analyze the customer" (Suren's Jun 27 ask): qualifies the account against the
// offerings customer-type definitions and proposes customer type / ownership /
// revenue from the web. The user reviews + approves before it's saved, and once
// saved the applicable offerings show automatically.
//
// Two renders (Anir, Jul 3: no more announcement header pinned to the top):
//  - "card"   → the Company profile card that lives in the Overview tab
//               (analyzed: the full profile; not yet: a normal card with the
//               Analyze button — content in the flow, not a banner)
//  - "action" → just the button + review modal, for the agent drawer
export function CustomerAnalyzePanel({
  customerId,
  customerType,
  ownership,
  revenue,
  analyzed,
  typeOptions,
  applicableOfferings,
  canEdit = true,
  variant = "card",
}: {
  customerId: string;
  customerType: string | null;
  ownership: string | null;
  revenue: string | null;
  analyzed: boolean;
  typeOptions: string[];
  applicableOfferings: { id: string; name: string; type: string }[];
  canEdit?: boolean;
  variant?: "card" | "action";
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  // Editable proposed values (Suren approves or tweaks before save).
  const [pType, setPType] = useState("");
  const [pOwnership, setPOwnership] = useState<"Public" | "Private">("Public");
  const [pRevenue, setPRevenue] = useState("");
  const [rationale, setRationale] = useState("");
  const [meta, setMeta] = useState<{
    source?: "mock" | "web";
    confidence?: string;
    sources?: string[];
  }>({});

  async function runAnalysis() {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/analyze`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        const a: Analysis = data.analysis;
        setPType(a.customer_type);
        setPOwnership(a.ownership);
        setPRevenue(a.revenue);
        setRationale(a.rationale);
        setMeta({ source: a.source, confidence: a.confidence, sources: a.sources });
        setOpen(true);
      } else {
        toast(data.error || "Couldn't analyze this customer.", "error");
      }
    } catch {
      toast("Couldn't analyze this customer.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function approve() {
    setSaving(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_type: pType,
          ownership: pOwnership,
          revenue: pRevenue,
          analyzed_at: true,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast("Saved — customer profile updated.");
        setOpen(false);
        router.refresh();
      } else {
        toast(data.error || "Couldn't save.", "error");
      }
    } catch {
      toast("Couldn't save.", "error");
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full rounded-md border border-border bg-white px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:shadow-input-focus";
  const labelCls =
    "block text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary mb-1";

  const Stat = ({
    icon: Icon,
    label,
    value,
  }: {
    icon: typeof Building2;
    label: string;
    value: string | null;
  }) => (
    <div className="flex items-start gap-2.5">
      <span className="w-8 h-8 rounded-md bg-surface text-text-tertiary flex items-center justify-center shrink-0">
        <Icon size={15} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
          {label}
        </p>
        <p className="text-[14px] font-medium text-text-primary truncate">
          {value || <span className="text-text-tertiary">Not analyzed yet</span>}
        </p>
      </div>
    </div>
  );

  // Once qualified, show the full profile + applicable offerings. Before that,
  // a normal profile card with the Analyze action — content in the page flow,
  // never an announcement banner pinned above everything (Anir, Jul 3).
  const showFull = analyzed || !!customerType;

  // Review + approve the proposed analysis — shared by both variants.
  const reviewModal = (
    <Modal open={open} onClose={() => setOpen(false)} title="Review the analysis">
      <div className="flex items-center gap-2 text-[13px] text-blue-primary mb-3">
        <Sparkles size={15} strokeWidth={1.8} />
        {meta.source === "web"
          ? "Researched from the web — edit anything, then approve to save."
          : "Proposed — edit anything, then approve to save."}
        {meta.confidence && (
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            {meta.confidence} confidence
          </span>
        )}
      </div>
      {rationale && (
        <p className="text-[13px] text-text-secondary bg-surface rounded-md px-3 py-2 mb-2 leading-relaxed">
          {rationale}
        </p>
      )}
      {meta.sources && meta.sources.length > 0 && (
        <p className="text-[11.5px] text-text-tertiary mb-4 truncate">
          Sources:{" "}
          {meta.sources.map((s, i) => (
            <span key={s}>
              {i > 0 && ", "}
              <a
                href={s}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-primary hover:underline"
              >
                {(() => {
                  try {
                    return new URL(s).hostname.replace(/^www\./, "");
                  } catch {
                    return s;
                  }
                })()}
              </a>
            </span>
          ))}
        </p>
      )}
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Customer type</label>
          <select
            className={field}
            value={pType}
            aria-label="Customer type"
            onChange={(e) => setPType(e.target.value)}
          >
            {!typeOptions.includes(pType) && pType && (
              <option value={pType}>{pType}</option>
            )}
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Ownership</label>
            <select
              className={field}
              value={pOwnership}
              aria-label="Ownership"
              onChange={(e) =>
                setPOwnership(e.target.value as "Public" | "Private")
              }
            >
              <option value="Public">Public</option>
              <option value="Private">Private</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Revenue</label>
            <input
              className={field}
              value={pRevenue}
              aria-label="Revenue"
              onChange={(e) => setPRevenue(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <button
          onClick={() => setOpen(false)}
          className="text-[13px] font-semibold text-text-secondary hover:text-text-primary px-3 py-2"
        >
          Cancel
        </button>
        <Button onClick={approve} loading={saving}>
          <Check size={15} strokeWidth={2} className="mr-1.5" />
          Approve &amp; save
        </Button>
      </div>
    </Modal>
  );

  // Drawer / toolbar variant: just the action + the review modal.
  if (variant === "action") {
    return (
      <>
        {canEdit && (
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md border border-blue-subtle text-blue-primary bg-blue-light/40 hover:bg-blue-light transition-colors disabled:opacity-60"
          >
            <Sparkles size={13} strokeWidth={1.9} />
            {loading
              ? "Analyzing…"
              : showFull
              ? "Re-analyze the customer"
              : "Analyze the customer"}
          </button>
        )}
        {reviewModal}
      </>
    );
  }

  return (
    <>
      {!showFull ? (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <span className="w-9 h-9 rounded-lg bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                <Sparkles size={17} strokeWidth={1.8} />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold text-text-primary">
                  Company profile
                </h2>
                <p className="text-[13px] text-text-secondary leading-relaxed mt-0.5">
                  Analyze this customer to qualify its type, ownership &amp;
                  revenue from the web — the offerings that fit show up the
                  moment it&apos;s classified.
                </p>
              </div>
            </div>
            {canEdit && (
              <Button
                variant="secondary"
                onClick={runAnalysis}
                loading={loading}
                className="shrink-0"
              >
                Analyze the customer
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-[15px] font-semibold text-text-primary">
                Company profile
              </h2>
              <p className="text-[12.5px] text-text-secondary mt-0.5">
                Qualified against your customer-type definitions — researched
                from the web, approved by you.
              </p>
            </div>
            {canEdit && (
              <Button variant="secondary" onClick={runAnalysis} loading={loading}>
                <Sparkles size={15} strokeWidth={1.8} className="mr-1.5" />
                Re-analyze
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat icon={Layers} label="Customer type" value={customerType} />
        <Stat icon={Landmark} label="Ownership" value={ownership} />
        <Stat icon={DollarSign} label="Revenue" value={revenue} />
      </div>

      {/* Applicable offerings — once qualified, everything that fits this
          customer type shows automatically (Suren's ask). */}
      <div className="mt-5 pt-4 border-t border-border-light">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
          <Building2 size={13} strokeWidth={2} className="text-text-tertiary" />
          Applicable offerings ({applicableOfferings.length})
        </h3>
        {!customerType ? (
          <p className="text-[13px] text-text-tertiary">
            Analyze the customer to qualify its type — the offerings that apply
            will show here automatically.
          </p>
        ) : applicableOfferings.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">
            No offerings are mapped to {customerType} yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {applicableOfferings.map((o) => (
              <Link
                key={o.id}
                href={`/offerings/${o.id}`}
                className="group flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border-light hover:border-blue-subtle hover:bg-blue-light/40 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-text-primary truncate group-hover:text-blue-primary">
                    {o.name}
                  </span>
                  <span className="block text-[11px] text-text-tertiary truncate">
                    {o.type}
                  </span>
                </span>
                <ChevronRight
                  size={15}
                  strokeWidth={1.6}
                  className="text-text-tertiary group-hover:text-blue-primary shrink-0"
                />
              </Link>
            ))}
          </div>
        )}
          </div>
        </Card>
      )}

      {reviewModal}
    </>
  );
}

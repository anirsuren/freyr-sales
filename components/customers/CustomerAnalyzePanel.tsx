"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Building2,
  Landmark,
  Lock,
  DollarSign,
  Layers,
  ChevronRight,
  Check,
  Info,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { OfferingIcon } from "@/components/ui/OfferingIcon";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { HoverCard } from "@/components/ui/HoverCard";
import { useToast } from "@/components/ui/Toast";
import { segmentColor } from "@/components/customers/CustomerOfferingsTab";

// Ownership is a category, so Public and Private each get their own colour AND
// their own icon — never the same gray tile with different words in it (Suren,
// Jul 27: "where are the tags? Where are the colors? Where are the icons?").
// Teal for Public: listed, open to the market. Violet for Private: closely
// held. Both are clear of the segment blue the customer-type chip wears, and
// clear of the banned yellow band.
const OWNERSHIP_META: Record<string, { color: string; icon: LucideIcon }> = {
  Public: { color: "#0F9E8E", icon: Landmark },
  Private: { color: "#7C3AED", icon: Lock },
};

// The house chip: colour + icon on a 10%-alpha tint of itself, same shape as
// AttributeTag / IndustryTag / SizeBadge. Wraps rather than truncating — no
// value on this page is ever cut off with "…".
function FactChip({
  value,
  icon: Icon,
  label,
  color,
}: {
  value: string;
  icon: LucideIcon;
  label: string;
  color: string;
}) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold whitespace-normal break-words text-left"
      // Inline because the colour is a runtime value, not a Tailwind class.
      style={{ color, background: `${color}1A` }}
      title={`${label}: ${value}`}
    >
      <span className="sr-only">{label}: </span>
      <Icon size={13} strokeWidth={2} className="shrink-0" aria-hidden="true" />
      {value}
    </span>
  );
}

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
        toast("Saved: customer profile updated.");
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

  // One profile fact: a coloured icon tile, its label, and its value. The tile
  // used to be a gray square for all three, which is exactly the gray-on-gray
  // the chip rule bans — each fact now carries its own colour through both the
  // tile and the chip beside it.
  const Fact = ({
    icon: Icon,
    label,
    color,
    children,
  }: {
    icon: LucideIcon;
    label: string;
    color: string;
    children: React.ReactNode;
  }) => (
    <div className="flex items-start gap-2.5">
      <span
        className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
        style={{ color, background: `${color}14` }}
      >
        <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
          {label}
        </p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );

  const notSet = <span className="text-[14px] text-text-tertiary">-</span>;
  const ownershipMeta = ownership ? OWNERSHIP_META[ownership] : null;

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
          ? "Researched from the web: edit anything, then approve to save."
          : "Proposed: edit anything, then approve to save."}
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
        <p className="text-[11.5px] text-text-tertiary mb-4 break-words">
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
              placeholder="e.g. $250M"
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

  // The "what analysis does" popover — shown on the (i) next to the button, so
  // the prompt is a button + info, not a banner taking a whole card (Suren).
  const analyzeInfo = (
    <HoverCard
      side="bottom"
      width={340}
      content={
        <div>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary mb-1.5">
            <Sparkles size={14} strokeWidth={1.9} className="text-blue-primary" />
            You haven&apos;t analyzed this customer yet
          </p>
          <p className="text-[12.5px] text-text-secondary leading-relaxed">
            Press Analyze and Freyr AI looks this company up on the open web. It fills in their customer type, ownership, revenue, and the offerings that fit. You review and approve everything before it saves.
          </p>
        </div>
      }
    >
      <span className="w-6 h-6 rounded-full flex items-center justify-center text-text-tertiary hover:text-blue-primary hover:bg-blue-light/50 transition-colors cursor-pointer">
        <Info size={15} strokeWidth={1.9} />
      </span>
    </HoverCard>
  );

  return (
    <>
      {!showFull ? (
        // Un-analyzed: the same "Company profile" card as the analyzed state,
        // just with the Analyze action where Re-analyze would be — so it reads
        // as content in the flow, not a stray floating button (Suren).
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-text-primary">
                Company profile
                {canEdit && analyzeInfo}
              </h2>
              <p className="text-[12.5px] text-text-secondary mt-0.5 leading-relaxed">
                Nothing has been looked up for this company yet. An analysis
                fills in its type, ownership and revenue from the web, and the
                offerings that fit then show up on their own.
              </p>
            </div>
            {canEdit ? (
              <button
                onClick={runAnalysis}
                disabled={loading}
                className="shrink-0 inline-flex items-center gap-2 text-[13px] font-semibold px-3.5 py-2 rounded-lg bg-blue-primary text-white hover:bg-blue-hover transition-colors disabled:opacity-60 shadow-[0_1px_2px_rgba(0,113,227,0.22)] active:scale-[0.98]"
              >
                <Sparkles size={15} strokeWidth={1.9} />
                {loading ? "Analyzing…" : "Analyze the customer"}
              </button>
            ) : (
              <span className="shrink-0 text-[13px] text-text-tertiary">
                Not analyzed yet
              </span>
            )}
          </div>
        </Card>
      ) : (
        <Card>
          {/* No Re-analyze button and no "researched from the web, approved by
              you" line: this is a plain record of what this company is, not an
              AI surface (Suren, Jul 27: "Why is there a 'Re-analyze' button? I
              told you no AI stuff at all, please"). The facts themselves stay. */}
          <div className="mb-4">
            <h2 className="text-[15px] font-semibold text-text-primary">
              Company profile
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Fact
              icon={Layers}
              label="Customer type"
              color={customerType ? segmentColor(customerType) : "#0071E3"}
            >
              {customerType ? (
                <FactChip
                  value={customerType}
                  icon={Layers}
                  label="Customer type"
                  color={segmentColor(customerType)}
                />
              ) : (
                notSet
              )}
            </Fact>
            <Fact
              icon={ownershipMeta?.icon || Landmark}
              label="Ownership"
              color={ownershipMeta?.color || "#0F9E8E"}
            >
              {ownership && ownershipMeta ? (
                <FactChip
                  value={ownership}
                  icon={ownershipMeta.icon}
                  label="Ownership"
                  color={ownershipMeta.color}
                />
              ) : (
                notSet
              )}
            </Fact>
            {/* Revenue is a figure, not a category — it stays a number (tnum so
                the digits line up), with a tile that matches the chips beside
                it rather than the old gray square. */}
            <Fact icon={DollarSign} label="Revenue" color="#1A7A35">
              {revenue ? (
                <p className="text-[15px] font-semibold text-text-primary tnum break-words">
                  {revenue}
                </p>
              ) : (
                notSet
              )}
            </Fact>
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
            Pick this account&apos;s customer type on the Offerings tab and
            everything that applies to it shows here automatically.
          </p>
        ) : applicableOfferings.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">
            Nothing in the catalogue is for {customerType} yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {applicableOfferings.map((o) => (
              <Link
                key={o.id}
                href={`/offerings/${o.id}`}
                className="group flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border-light hover:border-blue-subtle hover:bg-blue-light/40 transition-colors"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <OfferingIcon name={o.name} className="w-8 h-8 shrink-0" />
                  {/* Offering names are long — "Freya.GRR-PAC (Global Regulatory
                      Requirements for Product Approval Change)", and used to be
                      cut off mid-word with "…", which is banned app-wide (Suren,
                      Jul 27). They wrap onto a second line instead. */}
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-text-primary leading-snug break-words group-hover:text-blue-primary">
                      {o.name}
                    </span>
                    <span className="block text-[11px] text-text-tertiary break-words">
                      {o.type}
                    </span>
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

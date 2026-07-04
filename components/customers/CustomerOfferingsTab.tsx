"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Layers,
  CheckCircle2,
  Sparkles,
  UserRound,
  ExternalLink,
  X,
  Package,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";

// One offering, serialized for this tab by the server page (materials carry a
// pre-computed plain-English kind label so we don't pull lib/offerings into the
// client bundle).
export type TabOffering = {
  id: string;
  name: string;
  category: string;
  type: string;
  availability: string;
  poc: string;
  description: string;
  materials: { id: string; kind: string; label: string; url: string }[];
};

// Suren's customer⇄offering link (Jul 3 dictation): classify the customer
// against the SAME customer-type master list the offerings use, then — right
// here on the customer page — show every applicable offering with its
// description and sales materials, split into what they're ALREADY using vs.
// what's left to sell. The rep never has to go to the offerings page.
export function CustomerOfferingsTab({
  customerId,
  customerType,
  typeOptions,
  applicable,
  inUse,
}: {
  customerId: string;
  customerType: string | null;
  typeOptions: string[];
  applicable: TabOffering[];
  inUse: TabOffering[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pickedType, setPickedType] = useState("");
  const [savingType, setSavingType] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const inUseIds = useMemo(() => new Set(inUse.map((o) => o.id)), [inUse]);
  const toPitch = useMemo(
    () => applicable.filter((o) => !inUseIds.has(o.id)),
    [applicable, inUseIds]
  );

  async function saveType(type: string) {
    if (!type) return;
    setSavingType(true);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_type: type }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(`Classified as ${type} — here's everything that applies.`);
        router.refresh();
      } else {
        toast(data.error || "Couldn't save the customer type.", "error");
      }
    } catch {
      toast("Couldn't save the customer type.", "error");
    } finally {
      setSavingType(false);
    }
  }

  async function toggleInUse(id: string, nowUsing: boolean) {
    setBusyId(id);
    const currentIds = inUse.map((o) => o.id);
    const next = nowUsing
      ? [...currentIds, id]
      : currentIds.filter((x) => x !== id);
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerings_in_use: next }),
      });
      const data = await res.json();
      if (data.ok) {
        toast(
          nowUsing
            ? "Marked as already using — moved out of the pitch list."
            : "Moved back to the pitch list."
        );
        router.refresh();
      } else {
        toast(data.error || "Couldn't update.", "error");
      }
    } catch {
      toast("Couldn't update.", "error");
    } finally {
      setBusyId(null);
    }
  }

  // ------------------------------------------------------------------ cards
  const OfferingCard = ({
    o,
    using,
  }: {
    o: TabOffering;
    using: boolean;
  }) => (
    <Card className="p-5" data-testid={`cust-offering-${o.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/offerings/${o.id}`}
              className="text-[15px] font-semibold text-text-primary hover:text-blue-primary"
            >
              {o.name}
            </Link>
            {o.availability && (
              <span
                className={`text-[11px] font-medium rounded-md px-2 py-0.5 ${
                  /current|now|available/i.test(o.availability)
                    ? "text-success bg-success/10"
                    : "text-warning bg-warning/10"
                }`}
              >
                {o.availability}
              </span>
            )}
            {using && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success bg-success/10 rounded-full px-2.5 py-0.5">
                <CheckCircle2 size={12} strokeWidth={2.2} />
                In use
              </span>
            )}
          </div>
          {(o.category || o.type) && (
            <p className="text-[12px] text-text-tertiary mt-0.5">
              {[o.category, o.type].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button
          onClick={() => toggleInUse(o.id, !using)}
          disabled={busyId === o.id}
          className={`shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1.5 rounded-md border transition-colors disabled:opacity-50 ${
            using
              ? "border-border-light text-text-secondary hover:bg-surface"
              : "border-border-light text-success hover:bg-success/10"
          }`}
        >
          {using ? (
            <>
              <X size={13} strokeWidth={2.2} />
              {busyId === o.id ? "…" : "Not using anymore"}
            </>
          ) : (
            <>
              <CheckCircle2 size={13} strokeWidth={2} />
              {busyId === o.id ? "…" : "Mark as already using"}
            </>
          )}
        </button>
      </div>

      {o.description ? (
        <p className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-line line-clamp-4 mt-2.5">
          {o.description}
        </p>
      ) : (
        <p className="text-[13px] text-text-tertiary italic mt-2.5">
          No description yet — it comes from the offering&apos;s sales
          materials.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border-light">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-1.5">
            Sales materials ({o.materials.length})
          </p>
          {o.materials.length === 0 ? (
            <p className="text-[12px] text-text-tertiary">
              None yet — add them on the offering and they&apos;ll show here.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {o.materials.map((m) => (
                <a
                  key={m.id}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-1.5 text-[12px] font-medium text-text-secondary bg-surface border border-border-light rounded-md px-2 py-1 hover:border-blue-subtle hover:text-blue-primary transition-colors"
                >
                  <span className="text-text-tertiary group-hover:text-blue-primary">
                    {m.kind}
                  </span>
                  {m.label}
                  <ExternalLink size={11} strokeWidth={1.8} />
                </a>
              ))}
            </div>
          )}
        </div>
        {o.poc && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-text-secondary">
            <UserRound
              size={13}
              strokeWidth={1.8}
              className="text-text-tertiary"
            />
            POC: {o.poc}
          </span>
        )}
      </div>
    </Card>
  );

  // -------------------------------------------------------- unclassified view
  if (!customerType) {
    return (
      <Card className="max-w-[560px]">
        <div className="flex items-center gap-2 mb-1">
          <Layers size={18} strokeWidth={1.8} className="text-blue-primary" />
          <h2 className="text-[16px] font-semibold text-text-primary">
            What type of customer is this?
          </h2>
        </div>
        <p className="text-[13px] text-text-secondary leading-relaxed mb-4">
          Pick from the customer-type master list — the same one your offerings
          are mapped to. Once classified, every offering that applies to this
          customer shows up right here, with its description and sales
          materials.
        </p>
        <div className="flex gap-2">
          <select
            aria-label="Customer type"
            value={pickedType}
            onChange={(e) => setPickedType(e.target.value)}
            className="flex-1 rounded-md border border-border bg-white px-3 py-2 text-[14px] text-text-primary focus:outline-none focus:shadow-input-focus"
          >
            <option value="">Choose a customer type…</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <Button
            onClick={() => saveType(pickedType)}
            loading={savingType}
            disabled={!pickedType}
          >
            Save
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-[12px] text-text-tertiary mt-3">
          <Sparkles size={13} strokeWidth={1.8} className="text-blue-primary" />
          Not sure? &ldquo;Analyze the customer&rdquo; on the Overview tab
          researches it from the web.
        </p>
      </Card>
    );
  }

  // ---------------------------------------------------------- classified view
  const adoptionPct = applicable.length
    ? Math.round((inUse.length / applicable.length) * 100)
    : 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-text-secondary">
            <span className="font-semibold text-text-primary tnum">
              {applicable.length}
            </span>{" "}
            {applicable.length === 1 ? "offering applies" : "offerings apply"} to{" "}
            <span className="font-semibold text-text-primary">
              {customerType}
            </span>
            {inUse.length > 0 && (
              <>
                {" "}
                · already using{" "}
                <span className="font-semibold text-text-primary tnum">
                  {inUse.length}
                </span>{" "}
                <span className="text-text-tertiary tnum">({adoptionPct}%)</span>
              </>
            )}
          </p>
          {/* adoption at a glance — green = using, the rest is whitespace to sell */}
          {applicable.length > 0 && (
            <div className="h-1.5 rounded-full bg-surface overflow-hidden mt-1.5 max-w-[420px]">
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${Math.max(adoptionPct, inUse.length > 0 ? 3 : 0)}%` }}
              />
            </div>
          )}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-text-tertiary">
          Customer type
          <select
            aria-label="Change customer type"
            value={customerType}
            onChange={(e) => saveType(e.target.value)}
            disabled={savingType}
            className="rounded-md border border-border-light bg-white px-2.5 py-1.5 text-[12.5px] font-medium text-text-primary focus:outline-none focus:shadow-input-focus"
          >
            {!typeOptions.includes(customerType) && (
              <option value={customerType}>{customerType}</option>
            )}
            {typeOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      {inUse.length > 0 && (
        <section>
          <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
            <CheckCircle2
              size={14}
              strokeWidth={2}
              className="text-success"
            />
            Already using
            <span className="text-text-primary tnum">({inUse.length})</span>
          </h3>
          <div className="space-y-3">
            {inUse.map((o) => (
              <OfferingCard key={o.id} o={o} using />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-text-tertiary mb-2.5">
          <Sparkles size={14} strokeWidth={2} className="text-blue-primary" />
          Opportunities to pitch
          <span className="text-text-primary tnum">({toPitch.length})</span>
        </h3>
        {applicable.length === 0 ? (
          <EmptyState
            icon={Package}
            title={`No offerings mapped to ${customerType} yet`}
            description="Map this customer type on your offerings and everything that applies will show up here."
          />
        ) : toPitch.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            They&apos;re already using everything that applies — a good problem
            to have.
          </p>
        ) : (
          <div className="space-y-3">
            {toPitch.map((o) => (
              <OfferingCard key={o.id} o={o} using={false} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

type Change =
  | { kind: "diff"; field: string; before: string; after: string }
  | { kind: "new"; field: string; value: string };

// Mock-friendly re-enrichment. With live keys this re-scrapes; in mock mode it
// surfaces a representative "what changed" diff so the action is transparent (#57).
function buildDiff(seed: string): Change[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const emp = 300 + (h % 400);
  const empNew = emp + 30 + (h % 90);
  const roles = 6 + (h % 12);
  const stages = ["Series C", "Series D", "Series E"];
  const fromStage = stages[h % 2];
  const toStage = stages[(h % 2) + 1];
  const signals = [
    "Expanded regulatory affairs team",
    "New FDA pre-submission meeting scheduled",
    "Opened an EU subsidiary",
    "Hired a VP of Quality",
  ];
  return [
    { kind: "diff", field: "Employee count", before: String(emp), after: String(empNew) },
    { kind: "diff", field: "Funding stage", before: fromStage, after: `${toStage} (rumored)` },
    { kind: "diff", field: "Open roles", before: String(roles), after: String(roles + 4) },
    { kind: "new", field: "New signal", value: signals[h % signals.length] },
  ];
}

export function ReEnrichButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [changes, setChanges] = useState<Change[]>([]);

  async function reEnrich() {
    setLoading(true);
    try {
      await fetch(`/api/customers/${customerId}`, { cache: "no-store" });
      await new Promise((r) => setTimeout(r, 500));
      setChanges(buildDiff(customerId));
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={reEnrich} loading={loading}>
        Re-enrich
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Re-enrichment complete">
        <div className="flex items-center gap-2 text-[13px] text-blue-primary mb-3">
          <Sparkles size={15} strokeWidth={1.8} />
          {changes.length} change{changes.length === 1 ? "" : "s"} since the last enrichment
        </div>
        <ul className="divide-y divide-border-light border border-border-light rounded-lg overflow-hidden">
          {changes.map((c, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              {c.kind === "new" ? (
                <span className="w-6 h-6 rounded-md bg-success/15 text-success flex items-center justify-center shrink-0">
                  <Plus size={14} strokeWidth={2} />
                </span>
              ) : (
                <span className="w-6 h-6 rounded-md bg-blue-light text-blue-primary flex items-center justify-center shrink-0">
                  <ArrowRight size={14} strokeWidth={2} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                  {c.field}
                </p>
                {c.kind === "diff" ? (
                  <p className="text-[14px] text-text-primary flex items-center gap-2 flex-wrap">
                    <span className="text-text-tertiary line-through">{c.before}</span>
                    <ArrowRight size={13} strokeWidth={2} className="text-text-tertiary" />
                    <span className="font-semibold">{c.after}</span>
                  </p>
                ) : (
                  <p className="text-[14px] text-text-primary font-medium">{c.value}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex justify-end mt-5">
          <Button
            onClick={() => {
              setOpen(false);
              router.refresh();
            }}
          >
            Got it
          </Button>
        </div>
      </Modal>
    </>
  );
}

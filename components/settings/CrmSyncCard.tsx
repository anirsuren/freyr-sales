"use client";

import { useState } from "react";
import { RefreshCw, Check, Database } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

// CRM two-way sync surface (V2 #5). Mock-mode mirrors the app's OWN book of
// business (real counts, no invented numbers); live two-way sync activates with
// CRM credentials.
export function CrmSyncCard({
  counts,
}: {
  counts: { companies: number; contacts: number; deals: number };
}) {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState("just now");

  const synced = [
    { label: "Companies", count: counts.companies.toLocaleString() },
    { label: "Contacts", count: counts.contacts.toLocaleString() },
    { label: "Deals", count: counts.deals.toLocaleString() },
  ];
  const total = counts.companies + counts.contacts + counts.deals;

  async function syncNow() {
    setSyncing(true);
    await new Promise((r) => setTimeout(r, 600));
    setSyncing(false);
    setLastSynced("just now");
    toast(`CRM synced — ${total.toLocaleString()} records up to date`);
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Database size={18} strokeWidth={1.75} className="text-blue-primary" />
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">
              CRM sync — HubSpot
            </h2>
            <p className="text-[12px] text-text-tertiary">
              Two-way mirror · last synced {lastSynced}
            </p>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1.5 text-[13px] font-medium shrink-0"
          style={{ color: "#1A7A35" }}
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#34C759" }} />
          <Check size={14} strokeWidth={2} /> Connected
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {synced.map((s) => (
          <div key={s.label} className="bg-surface rounded-lg p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
              {s.label}
            </p>
            <p className="text-[18px] font-bold text-text-primary tnum mt-0.5">
              {s.count}
            </p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] text-text-tertiary leading-relaxed">
          Live two-way sync activates when CRM credentials are added; mock mode
          mirrors a representative book of business.
        </p>
        <Button
          variant="secondary"
          onClick={syncNow}
          loading={syncing}
          className="px-3 py-2 text-[13px] shrink-0"
        >
          <RefreshCw size={15} strokeWidth={1.7} className={syncing ? "animate-spin" : ""} />
          Sync now
        </Button>
      </div>
    </Card>
  );
}

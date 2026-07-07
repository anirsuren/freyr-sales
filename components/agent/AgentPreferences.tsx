"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/pipeline";
import type { AgentPrefs } from "@/lib/types";

const INDUSTRIES = [
  "Biotechnology",
  "Pharmaceutical",
  "Medical Device",
  "Consumer Health",
];

// One-tap lens presets — common focus combos the rep can flip between.
const PRESETS: {
  label: string;
  focus_industry: string | null;
  only_mine: boolean;
}[] = [
  { label: "Whole book", focus_industry: null, only_mine: false },
  { label: "My accounts", focus_industry: null, only_mine: true },
  { label: "Pharma", focus_industry: "Pharmaceutical", only_mine: false },
  { label: "My pharma", focus_industry: "Pharmaceutical", only_mine: true },
  { label: "My biotech", focus_industry: "Biotechnology", only_mine: true },
];

function Toggle({
  on,
  onChange,
  label,
  hint,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-text-primary">{label}</p>
        <p className="text-[12px] text-text-secondary leading-snug">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={cn(
          "relative w-10 h-6 rounded-full transition-colors shrink-0",
          on ? "bg-blue-primary" : "bg-border"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-card transition-transform",
            on && "translate-x-4"
          )}
        />
      </button>
    </div>
  );
}

export function AgentPreferences() {
  const { toast } = useToast();
  const router = useRouter();
  const [prefs, setPrefs] = useState<AgentPrefs | null>(null);

  useEffect(() => {
    fetch("/api/agent/prefs")
      .then((r) => r.json())
      .then((d) => setPrefs(d.prefs))
      .catch(() => {});
  }, []);

  async function save(patch: Partial<AgentPrefs>) {
    // optimistic
    setPrefs((p) => (p ? { ...p, ...patch } : p));
    try {
      const res = await fetch("/api/agent/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.ok) {
        setPrefs(data.prefs);
        toast("Agent preferences saved — autopilot will respect them");
        router.refresh(); // re-filter the queue/digest to the new lens live
      } else {
        toast("Couldn't save preferences", "error");
      }
    } catch {
      toast("Couldn't save preferences", "error");
    }
  }

  if (!prefs) return null;

  return (
    <Card>
      <h2 className="text-[15px] font-semibold text-text-primary flex items-center gap-2 mb-1">
        <BrainCircuit size={17} strokeWidth={1.8} className="text-blue-primary" />
        Agent preferences
      </h2>
      <p className="text-[12px] text-text-secondary mb-3">
        Standing instructions the agent&apos;s autopilot respects on every run.
      </p>

      {/* One-tap lens presets (V9 #28) */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PRESETS.map((p) => {
          const active =
            (prefs.focus_industry || null) === p.focus_industry &&
            prefs.only_mine === p.only_mine;
          return (
            <button
              key={p.label}
              onClick={() =>
                save({
                  focus_industry: p.focus_industry,
                  only_mine: p.only_mine,
                })
              }
              className={cn(
                "text-[12px] font-semibold rounded-full px-3 py-1 border transition-colors",
                active
                  ? "border-blue-primary bg-blue-primary text-white"
                  : "border-border-light text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="border-b border-border-light">
        <Toggle
          on={prefs.only_mine}
          onChange={(v) => save({ only_mine: v })}
          label="Only act on my accounts"
          hint="When on, the agent focuses on accounts you own; the rest of the book is hidden."
        />
      </div>

      <div className="mb-1 mt-3">
        <label className="block text-[12px] font-semibold text-text-secondary mb-1.5">
          Focus industry
        </label>
        <select
          aria-label="Focus industry"
          value={prefs.focus_industry || ""}
          onChange={(e) => save({ focus_industry: e.target.value || null })}
          className="w-full sm:w-[260px] bg-surface border border-border rounded-lg px-3 py-2 text-[13px] text-text-primary outline-none focus:border-blue-primary transition-colors"
        >
          <option value="">All industries</option>
          {INDUSTRIES.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
        <p className="text-[12px] text-text-tertiary mt-1.5">
          {prefs.focus_industry
            ? `Autopilot only acts on ${prefs.focus_industry} accounts; others are left for you.`
            : "Autopilot considers every account."}
        </p>
      </div>

      <div className="mb-3 mt-3">
        <label className="block text-[12px] font-semibold text-text-secondary mb-1.5">
          Default draft tone
        </label>
        <div className="flex items-center gap-1.5">
          {(["warm", "formal", "brief"] as const).map((tn) => (
            <button
              key={tn}
              onClick={() => save({ draft_tone: tn })}
              className={cn(
                "text-[12px] font-semibold rounded-full px-3 py-1 border capitalize transition-colors",
                prefs.draft_tone === tn
                  ? "border-blue-primary bg-blue-primary text-white"
                  : "border-border-light text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
              )}
            >
              {tn}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-text-tertiary mt-1.5">
          The voice the agent drafts outreach in — you can still switch per email.
        </p>
      </div>

      <div className="mt-3 divide-y divide-border-light border-t border-border-light">
        <Toggle
          on={prefs.autopilot_reengage}
          onChange={(v) => save({ autopilot_reengage: v })}
          label="Autopilot may re-engage cooling deals"
          hint="When off, cooling deals are left for you to handle instead of auto-drafted."
        />
        <Toggle
          on={prefs.autopilot_stabilize}
          onChange={(v) => save({ autopilot_stabilize: v })}
          label="Autopilot may stabilize at-risk accounts"
          hint="When off, at-risk accounts are left for you to approve."
        />
      </div>

      <div className="mt-4">
        <label className="block text-[12px] font-semibold text-text-secondary mb-1.5">
          Always ask above
        </label>
        <select
          aria-label="High-value guardrail"
          value={prefs.autopilot_max_value ?? ""}
          onChange={(e) =>
            save({
              autopilot_max_value: e.target.value
                ? Number(e.target.value)
                : null,
            })
          }
          className="w-full bg-surface border border-border rounded-md px-2.5 py-1.5 text-[13px] text-text-primary outline-none focus:border-blue-primary transition-colors"
        >
          <option value="">No limit — autopilot may handle any deal</option>
          <option value="100000">$100K open pipeline</option>
          <option value="250000">$250K open pipeline</option>
          <option value="500000">$500K open pipeline</option>
          <option value="1000000">$1M open pipeline</option>
        </select>
        <p className="text-[12px] text-text-tertiary mt-1.5">
          {prefs.autopilot_max_value
            ? `Accounts with more than ${formatMoney(
                prefs.autopilot_max_value
              )} in open pipeline are always kept for your sign-off.`
            : "Autopilot can auto-handle accounts of any size. Set a ceiling to keep big deals on your desk."}
        </p>
      </div>

      <div className="mt-4">
        <label className="block text-[12px] font-semibold text-text-secondary mb-1.5">
          Autopilot schedule
        </label>
        <div className="flex items-center gap-1.5">
          {(["off", "daily", "weekly"] as const).map((c) => (
            <button
              key={c}
              aria-label={`Autopilot schedule ${c}`}
              onClick={() => save({ autopilot_cadence: c })}
              className={cn(
                "text-[12px] font-semibold rounded-full px-3 py-1 border capitalize transition-colors",
                prefs.autopilot_cadence === c
                  ? "border-blue-primary bg-blue-primary text-white"
                  : "border-border-light text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-text-tertiary mt-1.5">
          {prefs.autopilot_cadence === "off"
            ? "No scheduled runs — run autopilot manually."
            : `Flagged as due on your next visit; a deployment cron fires it on time.${
                prefs.autopilot_last_run
                  ? ` Last run ${new Date(prefs.autopilot_last_run).toLocaleDateString()}.`
                  : ""
              }`}
        </p>
      </div>

      <div className="mt-4">
        <label className="block text-[12px] font-semibold text-text-secondary mb-1.5">
          Digest schedule
        </label>
        <div className="flex items-center gap-1.5">
          {(["off", "daily", "weekly"] as const).map((c) => (
            <button
              key={c}
              aria-label={`Digest schedule ${c}`}
              onClick={() => save({ digest_cadence: c })}
              className={cn(
                "text-[12px] font-semibold rounded-full px-3 py-1 border capitalize transition-colors",
                prefs.digest_cadence === c
                  ? "border-blue-primary bg-blue-primary text-white"
                  : "border-border-light text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="text-[12px] text-text-tertiary mt-1.5">
          {prefs.digest_cadence === "off"
            ? "No scheduled briefing — open the digest anytime."
            : `The agent's briefing is flagged ready on your next visit.${
                prefs.digest_last_sent
                  ? ` Last sent ${new Date(prefs.digest_last_sent).toLocaleDateString()}.`
                  : ""
              }`}
        </p>
      </div>
    </Card>
  );
}

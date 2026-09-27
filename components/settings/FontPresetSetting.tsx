"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { DEFAULT_FONT_PRESET, FONT_PRESETS, type FontPreset } from "@/lib/fontPresets";

/**
 * PICK A FONT COMBINATION (Anir, Sep 26). Every card is drawn in its own
 * faces, so the choice is made by looking, not by name. Clicking stamps the
 * preset on <html> at once and saves it to the account; the Offerings pages
 * follow it, everything else waits for the verdict.
 */
export function FontPresetSetting() {
  const { toast } = useToast();
  const [current, setCurrent] = useState(DEFAULT_FONT_PRESET);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(document.documentElement.dataset.font || DEFAULT_FONT_PRESET);
  }, []);

  async function choose(preset: FontPreset) {
    if (preset.key === current || busy) return;
    const previous = current;
    setCurrent(preset.key);
    setBusy(preset.key);
    document.documentElement.dataset.font = preset.key;
    try {
      const response = await fetch("/api/profile/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fontPreset: preset.key }),
      });
      if (!response.ok) throw new Error("not saved");
      toast(`Fonts set to ${preset.label}.`);
    } catch {
      setCurrent(previous);
      document.documentElement.dataset.font = previous;
      toast("That did not save. Try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <span className="block text-[13px] font-medium text-text-primary">Fonts</span>
      <p className="mt-0.5 mb-3 text-[12px] leading-relaxed text-text-secondary">
        Each option sets the heading, text and number faces together. Applied to
        the Offerings pages for now, so it can be compared before it goes everywhere.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FONT_PRESETS.map((preset) => {
          const active = preset.key === current;
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => void choose(preset)}
              aria-pressed={active}
              disabled={busy !== null && busy !== preset.key}
              className={cn(
                "cursor-pointer rounded-xl border bg-white p-4 text-left transition-colors disabled:opacity-60",
                active
                  ? "border-blue-primary ring-2 ring-blue-primary/15"
                  : "border-border-light hover:border-blue-subtle"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
                  {preset.label}
                </span>
                {active && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-light px-2 py-0.5 text-[11px] font-semibold text-blue-primary">
                    <Check size={12} strokeWidth={2.6} aria-hidden="true" />
                    Current
                  </span>
                )}
              </span>
              <span
                className="mt-2 block text-[22px] leading-tight text-text-primary"
                style={preset.heading ? { fontFamily: preset.heading, fontWeight: 600 } : { fontWeight: 700 }}
              >
                Freya.Register + Agents
              </span>
              <span
                className="mt-1.5 block text-[13.5px] leading-relaxed text-text-secondary"
                style={preset.body ? { fontFamily: preset.body } : undefined}
              >
                Regulatory Information Management for a growing portfolio, with
                agents that keep every registration current.
              </span>
              <span
                className="mt-2 block text-[12.5px] text-text-primary"
                style={preset.mono ? { fontFamily: preset.mono } : undefined}
              >
                OPP-0002 · $1,000,000 · 16 Aug 2026
              </span>
              <span className="mt-2.5 block text-[11.5px] leading-snug text-text-tertiary">
                {preset.note}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

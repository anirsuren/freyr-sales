"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { DEFAULT_FONT_PRESET, FONT_PRESETS, type FontPreset } from "@/lib/fontPresets";

/**
 * PICK A FONT COMBINATION (Anir, Sep 26). Every card is drawn in its own
 * faces, so the choice is made by looking, not by name. Clicking stamps the
 * preset on <html> at once, so the whole app (this page included) changes
 * under the pointer, and saves it to the account so every device follows.
 * Sep 27: "I'm clicking it and nothing's changing": the trial had been
 * limited to Offerings, so on this page a click only moved a badge.
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
      toast(preset.key === DEFAULT_FONT_PRESET ? "Back to Freyr's own font." : `Fonts set to ${preset.label}.`);
    } catch {
      setCurrent(previous);
      document.documentElement.dataset.font = previous;
      toast("That did not save. Try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  const currentPreset = FONT_PRESETS.find((p) => p.key === current);

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="block text-[13px] font-medium text-text-primary">Fonts</span>
          <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
            One choice sets the heading, text and number faces everywhere in Freyr.
            It changes the moment you click and is saved to your account.
          </p>
        </div>
        {current !== DEFAULT_FONT_PRESET && (
          <button
            type="button"
            onClick={() => void choose(FONT_PRESETS[0])}
            disabled={busy !== null}
            className="shrink-0 text-[12px] font-medium text-blue-primary hover:underline disabled:opacity-60"
          >
            Back to Freyr default
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                "group relative cursor-pointer rounded-xl border p-4 text-left transition-all disabled:opacity-60",
                active
                  ? "border-blue-primary bg-blue-light/40 shadow-[0_0_0_3px_var(--blue-light)]"
                  : "border-border-light bg-white hover:-translate-y-px hover:border-blue-subtle hover:shadow-sm"
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                  {preset.label}
                </span>
                {active ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                    <Check size={12} strokeWidth={2.6} aria-hidden="true" />
                    Current
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-blue-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Use this
                  </span>
                )}
              </span>
              <span
                className="mt-2.5 block text-[21px] leading-tight text-text-primary"
                style={preset.heading ? { fontFamily: preset.heading, fontWeight: 600 } : { fontWeight: 700 }}
              >
                Freya.Register + Agents
              </span>
              <span
                className="mt-1.5 line-clamp-2 block text-[13px] leading-relaxed text-text-secondary"
                style={preset.body ? { fontFamily: preset.body } : undefined}
              >
                Regulatory Information Management for a growing portfolio, with
                agents that keep every registration current.
              </span>
              <span
                className="mt-2 block text-[12px] text-text-primary"
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
      {currentPreset && (
        <p className="mt-3 text-[12px] text-text-tertiary">
          Now showing: <span className="font-medium text-text-secondary">{currentPreset.label}</span>. Headings, text and numbers on every page use it, including this one.
        </p>
      )}
    </div>
  );
}

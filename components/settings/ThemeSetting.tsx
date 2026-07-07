"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

// Appearance control — lives in Settings (not on every screen's top bar).
// Writes the same `freyr.theme` key the no-flash head script reads on load.
export function ThemeSetting() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function set(next: boolean) {
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("freyr.theme", next ? "dark" : "light");
    } catch {}
  }

  const opt =
    "flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors";
  return (
    <div>
      <span className="block text-[13px] font-medium text-text-primary mb-1.5">
        Appearance
      </span>
      <div className="inline-flex gap-0.5 rounded-lg border border-border-light bg-surface p-0.5">
        <button
          type="button"
          onClick={() => set(false)}
          aria-pressed={!dark}
          className={cn(
            opt,
            !dark
              ? "bg-blue-light text-blue-primary"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          <Sun size={15} strokeWidth={1.8} /> Light
        </button>
        <button
          type="button"
          onClick={() => set(true)}
          aria-pressed={dark}
          aria-label="Toggle dark mode"
          className={cn(
            opt,
            dark
              ? "bg-blue-light text-blue-primary"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          <Moon size={15} strokeWidth={1.8} /> Dark
        </button>
      </div>
      <p className="text-[12px] text-text-tertiary mt-1.5">
        Choose how Freyr looks. Saved on this device.
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { ViewSwitch } from "@/components/ui/ViewSwitch";
import { Tooltip } from "@/components/ui/Tooltip";
import { ListTree } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * GUIDE RAILS ON THE SUMMARY TREES, AS A CHOICE (Anir, Sep 28, seeing them on
 * by default: "Why did you do some weird thing with the lines? That should be
 * an option, a setting somewhere"). Off unless this is switched on. Flipping
 * it stamps <html data-tree-guides> at once, so an open summary changes under
 * the pointer, and saves to the account so every device follows, the same
 * bargain as the font choice above it.
 */
export function TreeGuidesSetting({ compact = false }: { compact?: boolean }) {
  const { toast } = useToast();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOn(document.documentElement.dataset.treeGuides === "on");
  }, []);

  async function choose(next: boolean) {
    if (next === on || busy) return;
    const previous = on;
    setOn(next);
    setBusy(true);
    if (next) document.documentElement.dataset.treeGuides = "on";
    else delete document.documentElement.dataset.treeGuides;
    try {
      const response = await fetch("/api/profile/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ treeGuides: next }),
      });
      if (!response.ok) throw new Error("not saved");
      toast(next ? "Guide rails on." : "Guide rails off.");
    } catch {
      setOn(previous);
      if (previous) document.documentElement.dataset.treeGuides = "on";
      else delete document.documentElement.dataset.treeGuides;
      toast("That did not save. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  /* ON THE VIEW BAR ITSELF (Anir, Sep 28: "where is the option to make the
     lines disappear and appear? It should be in line with this on the right
     side"): a label and the switch, sitting where the tree is. */
  if (compact) {
    /* A VERY SUBTLE BUTTON (Anir, Sep 28, on the labelled switch: "no, no, no,
       it should just be a very subtle button"). One quiet icon at the right
       end of the bar, grey at rest, blue when the lines are on, with the
       explanation in the hover. */
    return (
      <Tooltip label={on ? "Hide the guide lines" : "Show guide lines down each open level"} className="ml-auto">
        <button
          type="button"
          onClick={() => void choose(!on)}
          aria-pressed={on}
          aria-label={on ? "Hide guide lines" : "Show guide lines"}
          disabled={busy}
          className={cn(
            "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors",
            on ? "bg-blue-light text-blue-primary" : "text-text-tertiary hover:bg-surface-secondary hover:text-text-secondary",
            busy && "opacity-60"
          )}
        >
          <ListTree size={15} strokeWidth={2} aria-hidden="true" />
        </button>
      </Tooltip>
    );
  }
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <span className="block text-[13px] font-medium text-text-primary">Guide rails on summary trees</span>
        <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
          A hairline down each open level of the Opportunities and Customers summaries, so a branch can be followed back up. Off by default.
        </p>
      </div>
      <ViewSwitch
        ariaLabel="Guide rails on summary trees"
        className="inline-flex shrink-0"
        value={on}
        onChange={(next) => void choose(next)}
        options={[
          { key: false, label: "Off" },
          { key: true, label: "On" },
        ] as const}
      />
    </div>
  );
}

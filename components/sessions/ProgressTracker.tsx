"use client";

import { Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const PIPELINE_STEPS = [
  { key: "scraping_website", label: "Reading their website" },
  { key: "linkedin", label: "Reading their LinkedIn profile" },
  { key: "analyzing", label: "Analyzing customer fit" },
  { key: "matching", label: "Matching Freyr services" },
  { key: "pitches", label: "Writing the pitch materials" },
];

export type StepStatus = "pending" | "running" | "done" | "error";

export function ProgressTracker({
  statuses,
}: {
  statuses: Record<string, StepStatus>;
}) {
  return (
    <ol className="flex flex-col gap-4">
      {PIPELINE_STEPS.map((step) => {
        const status = statuses[step.key] || "pending";
        return (
          <li key={step.key} className="flex items-center gap-3">
            <span
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-full text-[13px] shrink-0 transition-colors",
                status === "done" && "bg-blue-primary text-white",
                status === "running" &&
                  "bg-blue-light text-blue-primary border border-blue-primary",
                status === "pending" &&
                  "bg-surface text-text-tertiary border border-border-light",
                status === "error" && "bg-error text-white"
              )}
            >
              {status === "done" && <Check size={15} strokeWidth={2.5} />}
              {status === "error" && (
                <AlertCircle size={15} strokeWidth={2} />
              )}
              {status === "running" && (
                <span className="w-2 h-2 rounded-full bg-blue-primary animate-pulse" />
              )}
            </span>
            <span
              className={cn(
                "text-[15px]",
                status === "pending"
                  ? "text-text-tertiary"
                  : "text-text-primary",
                status === "running" && "font-medium"
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

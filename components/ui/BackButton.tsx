"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// A back arrow for detail pages that aren't reached from the sidebar (Suren,
// Jul 9: "there's no back arrow either"). Returns to wherever you came from,
// falling back to a sensible parent when there's no history (e.g. deep link).
export function BackButton({
  fallback = "/pipeline",
  label = "Back",
}: {
  fallback?: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="inline-flex items-center gap-1.5 -ml-1 mb-3 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
    >
      <ArrowLeft size={16} strokeWidth={1.8} />
      {label}
    </button>
  );
}

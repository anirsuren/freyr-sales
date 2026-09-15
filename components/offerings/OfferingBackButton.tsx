"use client";

import { ArrowLeft } from "lucide-react";
import {
  sectionLabelFor,
  SmartBack,
  useBackTrail,
} from "@/components/ui/BackButton";

/**
 * The offering record can be opened from the offering catalogue or from an
 * FDL component's “In offerings” list. The old fixed “All offerings” copy
 * lied in the second case even though SmartBack correctly followed the trail
 * to FDL Components. Keep the words and the destination inseparable.
 */
export function OfferingBackButton() {
  const trail = useBackTrail();
  const section = trail ? sectionLabelFor(trail) : null;
  const label =
    section === "FDL Components"
      ? "All FDL Components"
      : section && section !== "Offerings"
        ? `Back to ${section}`
        : "All offerings";

  return (
    <SmartBack
      fallback="/offerings"
      className="rise-in mb-4 inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-text-secondary hover:text-blue-primary"
    >
      <ArrowLeft size={15} strokeWidth={1.8} /> {label}
    </SmartBack>
  );
}

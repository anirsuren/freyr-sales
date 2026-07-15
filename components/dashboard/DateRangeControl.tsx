"use client";

import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { ColorSelect } from "@/components/ui/ColorSelect";

// A single date-range dropdown (Suren: "I just want a dropdown where I can
// choose 7 days, 30 days, 90 days" — no segmented pills, no separate toggle).
const RANGES = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
];

export function DateRangeControl({ value }: { value: string }) {
  const router = useRouter();
  return (
    <ColorSelect
      value={value}
      minWidth={150}
      options={RANGES.map((r) => ({ ...r, icon: Calendar }))}
      onChange={(v) => router.push(`/dashboard?range=${v}`, { scroll: false })}
    />
  );
}

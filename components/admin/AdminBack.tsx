"use client";

import { ArrowLeft } from "lucide-react";
import { SmartBack } from "@/components/ui/BackButton";

/**
 * The way back out of an Admin sub-page.
 *
 * SmartBack rather than a hardcoded link, per the standing rule: it walks the
 * in-app trail when there is one and falls back to /admin only for a deep link
 * or a fresh tab.
 */
export function AdminBack({ label }: { label: string }) {
  return (
    <SmartBack
      fallback="/admin"
      className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
    >
      <ArrowLeft size={15} strokeWidth={1.8} />
      {label}
    </SmartBack>
  );
}

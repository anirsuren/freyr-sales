"use client";

import Link from "next/link";
import { SmartBack } from "@/components/ui/BackButton";
import { ArrowLeft, Printer } from "lucide-react";

export function ReportToolbar({ customerId }: { customerId: string }) {
  return (
    <div className="print:hidden sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-border-light">
      <div className="max-w-[820px] mx-auto px-6 py-3 flex items-center justify-between">
        <SmartBack
          fallback={`/customers/${customerId}`}
          className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft size={15} strokeWidth={1.8} />
          Back to account
        </SmartBack>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-2 rounded-md bg-blue-primary text-white hover:bg-blue-hover transition-colors"
        >
          <Printer size={15} strokeWidth={1.8} />
          Print / Save as PDF
        </button>
      </div>
    </div>
  );
}

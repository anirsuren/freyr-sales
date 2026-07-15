"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { OfferingForm } from "@/components/offerings/OfferingForm";
import type { CustomerType, Market, OfferingCategory } from "@/lib/offerings";

// "New offering" as a pop-up, right on the offerings list (Suren: "all the new
// stuff should be popups"). Reuses the full OfferingForm inside a wide modal.
export function NewOfferingButton({
  customerTypes,
  markets,
  existingTypes,
  offeringCategories,
}: {
  customerTypes: CustomerType[];
  markets: Market[];
  existingTypes: string[];
  offeringCategories: OfferingCategory[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center text-[14px] font-semibold rounded-md px-5 py-2.5 bg-blue-primary text-white hover:bg-blue-hover transition-all shadow-[0_1px_2px_rgba(0,113,227,0.20)] hover:shadow-[0_4px_12px_rgba(0,113,227,0.26)]"
      >
        <Plus size={15} strokeWidth={2.2} className="mr-1" />
        New offering
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="New offering" size="wide">
        <OfferingForm
          customerTypes={customerTypes}
          markets={markets}
          existingTypes={existingTypes}
          offeringCategories={offeringCategories}
        />
      </Modal>
    </>
  );
}

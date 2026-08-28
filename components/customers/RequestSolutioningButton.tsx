"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { NewRequestDialog } from "@/components/solutioning/SolutioningModule";
import { useToast } from "@/components/ui/Toast";

/**
 * RAISE IT HERE, STAY HERE.
 *
 * Anir, Aug 28: "when I press 'Request Solutioning', why does it take me to
 * another page?" It was a plain link to /solutioning?new=1, so asking for a
 * deck meant losing the account you were reading, filling a form on a page
 * about something else, and finding your own way back.
 *
 * The leads page already got this right on Aug 27 ("just leave me there and
 * just give me the pop-up") using the very same exported dialog. This is that,
 * on the customer page: same form, same endpoint, same toast carrying the ref
 * so the request is findable. Only the journey changes.
 */
export function RequestSolutioningButton({
  customerId,
  companyName,
  customers,
  opportunities,
  members,
}: {
  customerId: string;
  companyName: string;
  customers: { id: string; name: string }[];
  opportunities: {
    id: string;
    label: string;
    customer: string;
    customerId: string | null;
  }[];
  members: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface"
      >
        <ClipboardList size={15} strokeWidth={1.7} />
        Request solutioning
      </button>

      {open && (
        <NewRequestDialog
          room="requests"
          customers={customers}
          /* Only this account's deals: the picker exists to attach the
             request to the deal it is for, and every other account's deals
             are noise on a page about this one. */
          opportunities={opportunities.filter(
            (o) => o.customerId === customerId
          )}
          members={members}
          prefillCustomerId={customerId}
          prefillOpportunityId={null}
          prefillCompany={companyName}
          prefillLead={null}
          onClose={() => setOpen(false)}
          onCreate={async (input) => {
            try {
              const res = await fetch("/api/solutioning", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ op: "create", type: "request", ...input }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok || !data.request) {
                toast(data.error || "That did not save.", "error");
                return false;
              }
              toast(`${data.request.ref} raised for ${companyName}.`);
              setOpen(false);
              /* The 360 panel above counts submissions, presentations and
                 meetings, so the count it is showing is now one behind. */
              router.refresh();
              return true;
            } catch {
              toast("That did not save.", "error");
              return false;
            }
          }}
        />
      )}
    </>
  );
}

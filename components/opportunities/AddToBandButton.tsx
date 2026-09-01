"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

/**
 * ADD ONE, FROM THE TAB THAT SAYS THERE ARE NONE.
 *
 * Anir, Aug 31, standing on the deal page: "I still can't add anything. What's
 * unclear, please tell me."
 *
 * Nothing was unclear — the button was in the wrong place. I put the add
 * actions inside the Edit deal dialog, so the tab strip could read
 * "Submissions 0" with no way to act on it, and the only route to adding one
 * ran through a dialog called Edit. Nobody opens "Edit deal" to create a
 * submission, and they should not have to.
 *
 * So it sits in the tab it belongs to, beside the link out to the module. The
 * same destination the dialog used: the room that owns this kind of work, with
 * the form open and the deal and account already chosen.
 */
export function AddToBandButton({
  bandKey,
  label,
  opportunityId,
  customerId,
}: {
  bandKey: string;
  /** The band's own word, so the button says "Add submission", not "Add". */
  label: string;
  opportunityId: string;
  customerId: string | null;
}) {
  const router = useRouter();

  function go() {
    if (bandKey === "contracts" || bandKey === "meetings") {
      /* These have their own forms with their own required fields, so they
         open where those forms live rather than growing a second half-form
         on a page about a deal. */
      const base = bandKey === "contracts" ? "/contracts" : "/meetings";
      router.push(
        `${base}?new=1&opportunity=${encodeURIComponent(opportunityId)}`
      );
      return;
    }
    const room =
      bandKey === "submissions"
        ? "submissions"
        : bandKey === "presentations"
          ? "presentations"
          : "requests";
    const params = new URLSearchParams({
      tab: room,
      new: "1",
      opportunity: opportunityId,
    });
    if (customerId) params.set("customer", customerId);
    router.push(`/solutioning?${params.toString()}`);
  }

  /* Singular, because you are adding one thing: "Add submission", not "Add
     submissions". The band labels are plural because they are counts. */
  const one = label.replace(/s$/, "").toLowerCase();

  return (
    <button
      type="button"
      onClick={go}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-primary px-3 py-1.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90"
    >
      <Plus size={13} strokeWidth={2.4} />
      Add {one}
    </button>
  );
}

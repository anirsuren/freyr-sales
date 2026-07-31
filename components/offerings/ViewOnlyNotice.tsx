import Link from "next/link";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/Card";

// Shown when someone reaches an editing screen for an offering they do not own.
// Editing is gated on OWNERSHIP now, not on holding the admin role, so the copy
// says what actually unblocks them: an admin assignment. The old text told a
// "Sales user" to switch roles or self-claim, neither of which grants access.
export function ViewOnlyNotice({
  backHref = "/offerings",
  reason = "ownership",
}: {
  backHref?: string;
  /** WHY you are being turned away. Two different rules gate this module and
   *  they need two different sentences: creating an offering is a ROLE right,
   *  changing an existing one is an OWNERSHIP right. Telling a sales user to
   *  request assignment to an offering that does not exist yet. */
  reason?: "ownership" | "role";
}) {
  if (reason === "role") {
    return (
      <Card className="mx-auto mt-8 max-w-[520px] p-8 text-center">
        <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-text-tertiary">
          <Lock size={20} strokeWidth={1.8} />
        </div>
        <h2 className="text-[16px] font-semibold text-text-primary">View only</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-secondary">
          Your account can read the offerings repository but not add to it. Ask a
          workspace admin if you need to create one.
        </p>
        <Link
          href={backHref}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-hover"
        >
          Back to offerings
        </Link>
      </Card>
    );
  }
  return (
    <Card className="mx-auto mt-8 max-w-[520px] p-8 text-center">
      <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-text-tertiary">
        <Lock size={20} strokeWidth={1.8} />
      </div>
      <h2 className="text-[16px] font-semibold text-text-primary">
        You don&apos;t own this offering
      </h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-secondary">
        Only an assigned owner can change an offering&apos;s content or its sales
        materials. Ask a workspace admin to assign you if you need edit access.
      </p>
      <Link
        href={backHref}
        className="mt-4 inline-flex items-center justify-center rounded-md bg-blue-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-hover"
      >
        Back to the offering
      </Link>
    </Card>
  );
}

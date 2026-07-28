import Link from "next/link";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/Card";

// Shown when someone reaches an editing screen for an offering they do not own.
// Editing is gated on OWNERSHIP now, not on holding the admin role, so the copy
// says what actually unblocks them: take ownership, or ask the person who has
// it. The old text told a "Sales user" to switch to Admin, which is no longer
// how any of this works.
export function ViewOnlyNotice({
  backHref = "/offerings",
}: {
  backHref?: string;
}) {
  return (
    <Card className="mx-auto mt-8 max-w-[520px] p-8 text-center">
      <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-text-tertiary">
        <Lock size={20} strokeWidth={1.8} />
      </div>
      <h2 className="text-[16px] font-semibold text-text-primary">
        You don&apos;t own this offering
      </h2>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-secondary">
        Only its owner can change an offering&apos;s content or its sales
        materials. Open the offering and use &ldquo;Ask to own this&rdquo;, and
        an admin can hand it over.
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

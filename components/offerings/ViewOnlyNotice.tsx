import Link from "next/link";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/Card";

// Shown when a Sales (view-only) user reaches an editing screen. Admins edit;
// sales only view (Suren's change #4).
export function ViewOnlyNotice({
  backHref = "/offerings",
}: {
  backHref?: string;
}) {
  return (
    <Card className="p-8 text-center max-w-[520px] mx-auto mt-8">
      <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-surface text-text-tertiary mb-3">
        <Lock size={20} strokeWidth={1.8} />
      </div>
      <h2 className="text-[16px] font-semibold text-text-primary">
        View only
      </h2>
      <p className="text-[13.5px] text-text-secondary mt-1.5 leading-relaxed">
        You&apos;re signed in as a Sales user, who can browse the repository but
        not add or change offerings. Switch to Admin on the Offerings page to
        make edits.
      </p>
      <Link
        href={backHref}
        className="inline-flex items-center justify-center text-[13px] font-semibold rounded-md px-4 py-2 mt-4 bg-blue-primary text-white hover:bg-blue-hover transition-colors"
      >
        Back to offerings
      </Link>
    </Card>
  );
}

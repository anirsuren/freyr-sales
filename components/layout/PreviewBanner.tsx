"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Eye, X } from "lucide-react";
import { roleLabel } from "@/components/ui/RoleTag";

/**
 * A ROLE PREVIEW IS NEVER INVISIBLE AGAIN.
 *
 * The old preview cookie lived for a year with no indicator, so an admin who
 * once clicked "Sales (view only)" stayed silently downgraded everywhere and
 * concluded the roles were broken (Anir, Jul 30: "I'm an admin, right? Why
 * can't I create folders?"). Whenever the effective role is below the real
 * one, this strip sits above everything on every page, names both roles, and
 * exits the preview in one click — no console, no cookie surgery, nothing to
 * know.
 */
export function PreviewBanner({
  role,
  realRole,
}: {
  role: string;
  realRole: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function exitPreview() {
    document.cookie = "freyr_preview_role=; path=/; max-age=0";
    document.cookie = "freyr_as_role=; path=/; max-age=0";
    start(() => router.refresh());
  }

  /* THE ROLE'S NAME, NOT ITS STORED ID. Title-casing the raw value printed
     "Bd_member" the moment the stored values became bd_member/bd_owner
     (found in the browser, Aug 29, previewing as a BD Member). roleLabel is
     the one place the app names a role. */
  const label = (r: string) => roleLabel(r);

  return (
    <div className="flex items-center justify-center gap-3 bg-blue-primary px-4 py-1.5 text-[12.5px] font-medium text-white">
      <Eye size={14} strokeWidth={2} className="shrink-0" />
      <span>
        Viewing as <strong className="font-bold">{label(role)}</strong>, your
        real role is {label(realRole)}, so some controls are hidden.
      </span>
      <button
        onClick={exitPreview}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-0.5 font-semibold transition-colors hover:bg-white/25 disabled:opacity-60"
      >
        <X size={13} strokeWidth={2.4} />
        {pending ? "Exiting…" : "Exit preview"}
      </button>
    </div>
  );
}

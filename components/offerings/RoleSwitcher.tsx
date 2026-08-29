"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ShieldCheck, Eye, Pencil } from "lucide-react";

// Flips the active role cookie and refreshes so the (server-rendered) edit
// controls appear/disappear. Demo stand-in for real per-user logins.
export function RoleSwitcher({ current }: { current: "admin" | "bd_owner" | "bd_member" }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function setRole(role: "admin" | "bd_owner" | "bd_member") {
    if (role === current) return;
    // Two cookies, one intent. `freyr_as_role` drives the unauthenticated
    // demo harness; `freyr_preview_role` is the signed-in preview, honored
    // server-side only when it DOWNGRADES the session's real role. SESSION
    // cookies, deliberately: the old ones lived for a YEAR with nothing on
    // screen, so one click of "Sales (view only)" silently locked an admin
    // out of admin controls until they hand-cleared cookies (Anir, Jul 30).
    // A preview now dies with the browser, and PreviewBanner keeps it
    // visible while it lives.
    document.cookie = `freyr_as_role=${role}; path=/`;
    document.cookie = `freyr_preview_role=${role}; path=/`;
    start(() => router.refresh());
  }

  const btn = (active: boolean) =>
    `inline-flex items-center gap-1.5 text-[12.5px] font-semibold rounded-md px-3 py-1.5 transition-colors ${
      active
        ? "bg-white text-blue-primary shadow-sm"
        : "text-text-secondary hover:text-text-primary"
    }`;

  return (
    <div
      role="group"
      aria-label="Viewing as"
      className={`inline-flex items-center gap-0.5 rounded-lg border border-border-light bg-surface/70 p-0.5 ${
        pending ? "opacity-60" : ""
      }`}
    >
      <span className="text-[11px] font-medium text-text-tertiary pl-2 pr-1">
        Viewing as
      </span>
      <button
        type="button"
        onClick={() => setRole("bd_owner")}
        aria-pressed={current === "bd_owner"}
        className={btn(current === "bd_owner")}
      >
        <Pencil size={13} strokeWidth={2} /> Editor
      </button>
      <button
        type="button"
        onClick={() => setRole("admin")}
        aria-pressed={current === "admin"}
        className={btn(current === "admin")}
      >
        <ShieldCheck size={13} strokeWidth={2} /> Admin
      </button>
      <button
        type="button"
        onClick={() => setRole("bd_member")}
        aria-pressed={current === "bd_member"}
        className={btn(current === "bd_member")}
      >
        <Eye size={13} strokeWidth={2} /> Sales (view only)
      </button>
    </div>
  );
}

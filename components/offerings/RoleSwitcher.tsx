"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ShieldCheck, Eye, Pencil } from "lucide-react";

// Flips the active role cookie and refreshes so the (server-rendered) edit
// controls appear/disappear. Demo stand-in for real per-user logins.
export function RoleSwitcher({ current }: { current: "admin" | "editor" | "sales" }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function setRole(role: "admin" | "editor" | "sales") {
    if (role === current) return;
    document.cookie = `freyr_role=${role}; path=/; max-age=31536000`;
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
        onClick={() => setRole("editor")}
        aria-pressed={current === "editor"}
        className={btn(current === "editor")}
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
        onClick={() => setRole("sales")}
        aria-pressed={current === "sales"}
        className={btn(current === "sales")}
      >
        <Eye size={13} strokeWidth={2} /> Sales (view only)
      </button>
    </div>
  );
}

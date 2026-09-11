"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, MoreHorizontal, Trash2 } from "lucide-react";
import { floatingMenuStyle, menuMotionVars } from "@/components/ui/ColorSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

/**
 * WHAT AN ADMIN CAN DO TO A COMPANY (Anir, Sep 10): move it between the
 * customer and competitor tabs, or delete it for everyone. Nothing is
 * "tracked for everyone" any more: a company is collected while at least one
 * person has it ticked on their own list, and stops when the last person
 * unticks it.
 *
 * `compact` (Anir, Sep 11, on the briefing header: "confusing ui and clean it
 * up. minimal space"): one "more" button with a small menu instead of a row
 * of its own. Delete is still red and still asks first.
 */
export function CompanyAdminControls({
  companyId,
  companyName,
  group,
  followers,
  compact = false,
}: {
  companyId: string;
  companyName: string;
  group: "customer" | "competitor";
  /** How many people have it on their list, for the delete warning. */
  followers: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"group" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<ReturnType<typeof floatingMenuStyle> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /* THE MENU FLOATS OVER THE PAGE, like every other dropdown here. Drawn
     inside the header it sat under the rundown card (found Sep 11: the
     rundown took the click meant for Delete). */
  const anchorMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setMenuStyle(floatingMenuStyle(rect, 220, 110));
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const onScroll = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (rect) setMenuStyle(floatingMenuStyle(rect, 220, 110));
    };
    const onResize = () => setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/market-intel/tracking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Could not save.");
    return data;
  }

  async function move() {
    setBusy("group");
    const next = group === "competitor" ? "customer" : "competitor";
    try {
      await post({ kind: "group", id: companyId, group: next });
      toast(`${companyName} moved to ${next === "competitor" ? "Competitor" : "Customer"} Intelligence.`);
      router.push(next === "competitor" ? "/market-intel?tab=competitors" : "/market-intel");
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not save.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      const res = await fetch("/api/market-intel/tracking", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "company", id: companyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not delete.");
      toast(`${companyName} is gone for everyone.`);
      router.push(group === "competitor" ? "/market-intel?tab=competitors" : "/market-intel");
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not delete.", "error");
      setBusy(null);
      setConfirming(false);
    }
  }

  const moveLabel = group === "competitor" ? "Move to customers" : "Move to competitors";
  const dialog = (
    <ConfirmDialog
      open={confirming}
      onClose={() => setConfirming(false)}
      onConfirm={() => void remove()}
      busy={busy === "delete"}
      title={`Delete ${companyName} for everyone?`}
      body={
        <>
          Everything collected about <b>{companyName}</b> is deleted, and it
          disappears for the whole team.
          {followers > 0 && (
            <>
              {" "}
              {followers} {followers === 1 ? "person has" : "people have"} it on their own list; it leaves
              theirs too.
            </>
          )}
        </>
      }
      detail="To stop collecting without deleting anything, untick it in Manage companies instead. It stops by itself once nobody has it."
      confirmLabel="Delete for everyone"
    />
  );

  if (compact) {
    return (
      <>
        <button
          ref={buttonRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`More actions for ${companyName}`}
          title="More actions"
          onClick={() => {
            if (menuOpen) {
              setMenuOpen(false);
              return;
            }
            anchorMenu();
            setMenuOpen(true);
          }}
          disabled={busy !== null}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border-light bg-white text-text-secondary transition-colors hover:border-blue-subtle hover:text-text-primary disabled:opacity-60"
        >
          <MoreHorizontal size={16} strokeWidth={2.2} />
        </button>
        {menuOpen &&
          menuStyle &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={`More actions for ${companyName}`}
              className="menu-in z-[110] flex flex-col rounded-xl border border-border-light bg-white p-1.5 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.22)]"
              style={{ ...menuStyle, ...menuMotionVars(menuStyle) }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void move();
                }}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-text-primary transition-colors hover:bg-surface"
              >
                <ArrowLeftRight size={14} strokeWidth={2} className="text-text-tertiary" />
                {moveLabel}
              </button>
              {/* DELETE IS RED AND ASKS FIRST, like every delete in the app. */}
              <button
                type="button"
                role="menuitem"
                aria-label={`Delete ${companyName} for everyone`}
                onClick={() => {
                  setMenuOpen(false);
                  setConfirming(true);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold text-[color:#B02020] transition-colors hover:bg-[rgba(176,32,32,0.08)]"
              >
                <Trash2 size={14} strokeWidth={2.2} />
                Delete for everyone
              </button>
            </div>,
            document.body
          )}
        {dialog}
      </>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => void move()}
        disabled={busy !== null}
        title={group === "competitor" ? "Move to Customer Intelligence" : "Move to Competitor Intelligence"}
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border-light bg-white px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:border-blue-subtle hover:text-blue-primary disabled:opacity-60"
      >
        <ArrowLeftRight size={13} strokeWidth={2} />
        {moveLabel}
      </button>
      {/* DELETE IS A RED SQUARE WITH A CONFIRM, like every delete in the app. */}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={busy !== null}
        aria-label={`Delete ${companyName} for everyone`}
        title="Delete for everyone"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-[color:#B02020] text-white transition-opacity hover:opacity-85 disabled:opacity-60"
      >
        <Trash2 size={14} strokeWidth={2.2} />
      </button>
      {dialog}
    </span>
  );
}

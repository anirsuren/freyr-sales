"use client";

import { createContext, useContext, useState } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * EDIT LIVES IN THE HEADER, LIKE EVERY OTHER PAGE (Anir, Sep 4: "the edit
 * button should be at the top right, bro. Literally, follow all the other
 * pages and keep it consistent").
 *
 * The deal page's Edit deal sits top right beside its other actions; this
 * page's Edit sat inside the About card, because the card's editability and
 * the button toggling it lived in the same client component. But the header
 * is server-rendered, so the toggle and the card are two client islands — and
 * this tiny provider is the bridge: page.tsx wraps both in it, the header
 * button flips the one flag, the About card reads it.
 */
const Ctx = createContext<{ editing: boolean; toggle: () => void }>({
  editing: false,
  toggle: () => {},
});

export function AccountEditProvider({ children }: { children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  return (
    <Ctx.Provider value={{ editing, toggle: () => setEditing((v) => !v) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAccountEditMode() {
  return useContext(Ctx);
}

/** The header control. Same look as the deal page's secondary actions. */
export function AccountEditButton({ canEdit }: { canEdit: boolean }) {
  const { editing, toggle } = useAccountEditMode();
  if (!canEdit) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-[13px] font-medium transition-colors",
        editing
          ? "border-blue-primary bg-blue-light text-blue-primary"
          : "border-border text-text-secondary hover:bg-surface"
      )}
    >
      <Pencil size={15} strokeWidth={1.7} />
      {editing ? "Done editing" : "Edit account"}
    </button>
  );
}

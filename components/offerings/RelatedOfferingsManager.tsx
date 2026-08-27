"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, X } from "lucide-react";
import { ColorSelect } from "@/components/ui/ColorSelect";
import { useToast } from "@/components/ui/Toast";

/**
 * THE RELATED LIST IS EDITABLE, NOT JUST ITS NOTES (Saras via Anir, Aug 27:
 * "she's saying that there's still stuff that you didn't do, like making the
 * related offering section editable").
 *
 * The list starts as the rest of this offering's category — that stays the
 * default so a brand-new offering is never an island — and an editor curates
 * it from there: pin any offering from another category in, take a neighbour
 * that does not actually sell together out. Stored as two small lists on the
 * offering (related_add / related_hide) rather than replacing the computed
 * list, so a new offering joining the category still shows up on its
 * siblings' pages without anybody re-editing them.
 *
 * Curation is this offering's voice, one-directional on purpose, exactly like
 * related_notes: hiding Freya.Label here says nothing about what Label shows.
 */
export function RelatedOfferingsEditButton({
  managing,
  onToggle,
}: {
  managing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={managing}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
        managing
          ? "border-blue-subtle bg-blue-light text-blue-primary"
          : "border-border-light bg-white text-text-secondary hover:border-blue-subtle hover:text-blue-primary"
      }`}
    >
      {managing ? (
        <>
          <Check size={13} strokeWidth={2.4} /> Done
        </>
      ) : (
        <>
          <Pencil size={13} strokeWidth={2.2} /> Edit this list
        </>
      )}
    </button>
  );
}

export function useRelatedListEdits({
  offeringId,
  relatedAdd,
  relatedHide,
}: {
  offeringId: string;
  relatedAdd: string[];
  relatedHide: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function save(nextAdd: string[], nextHide: string[], done: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ related_add: nextAdd, related_hide: nextHide }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "That didn't save.", "error");
        return;
      }
      toast(done);
      router.refresh();
    } catch {
      toast("That didn't save.", "error");
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    /** Take one offering off this page's list, whichever way it got on. */
    remove(id: string, name: string) {
      if (relatedAdd.includes(id)) {
        void save(relatedAdd.filter((x) => x !== id), relatedHide, `${name} removed.`);
      } else {
        void save(relatedAdd, Array.from(new Set([...relatedHide, id])), `${name} removed.`);
      }
    },
    /** Pin one in — and if it was hidden earlier, unhide it instead. */
    add(id: string, name: string) {
      if (relatedHide.includes(id)) {
        void save(relatedAdd, relatedHide.filter((x) => x !== id), `${name} added back.`);
      } else {
        void save(Array.from(new Set([...relatedAdd, id])), relatedHide, `${name} added.`);
      }
    },
  };
}

export function RelatedOfferingRemove({
  onRemove,
  name,
  busy,
}: {
  onRemove: () => void;
  name: string;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(event) => {
        /* The pill around this is a Link; the X must not navigate. */
        event.preventDefault();
        event.stopPropagation();
        onRemove();
      }}
      aria-label={`Remove ${name} from related offerings`}
      title={`Remove ${name} from this list`}
      className="absolute -right-2 -top-2 z-10 grid h-6 w-6 cursor-pointer place-items-center rounded-full border border-border-light bg-white text-text-tertiary shadow-sm transition-colors hover:border-[color:#DC2626]/50 hover:text-[color:#DC2626] disabled:opacity-50"
    >
      <X size={12.5} strokeWidth={2.4} />
    </button>
  );
}

export function RelatedOfferingAdd({
  options,
  onAdd,
  busy,
}: {
  /** Everything not already on the list, ready for the picker. */
  options: { id: string; name: string; category?: string }[];
  onAdd: (id: string) => void;
  busy: boolean;
}) {
  const [picking, setPicking] = useState(false);
  if (!options.length) return null;
  if (!picking) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setPicking(true)}
        className="flex min-h-[92px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border-light bg-white/60 px-4 py-3 text-[12.5px] font-semibold text-text-tertiary transition-colors hover:border-blue-subtle hover:text-blue-primary disabled:opacity-50"
      >
        <Plus size={16} strokeWidth={2.2} />
        Add a related offering
      </button>
    );
  }
  return (
    <div className="flex min-h-[92px] flex-col justify-center gap-2 rounded-2xl border border-blue-subtle bg-white px-4 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-tertiary">
        Which offering?
      </span>
      <ColorSelect
        value=""
        ariaLabel="Pick an offering to add"
        collapsible={false}
        searchable
        onChange={(v) => {
          if (v) onAdd(v);
          setPicking(false);
        }}
        options={[
          { value: "", label: "Pick an offering…", color: "#8E98A8" },
          ...options.map((option) => ({
            value: option.id,
            label: option.name,
            /* The category rides along so cross-category picks are informed. */
            description: option.category || undefined,
          })),
        ]}
      />
    </div>
  );
}

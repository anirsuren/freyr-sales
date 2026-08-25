"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, PenLine, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/**
 * WHY THESE TWO OFFERINGS BELONG TOGETHER, IN THE OWNER'S OWN WORDS.
 *
 * Anir, Aug 25, from a survey response: "it says there are three related
 * offerings which connect to the offering you're currently looking at. If a
 * sales rep can also see HOW Freya.Artwork is related to the offering I'm
 * seeing right now... whoever has editing access to this offering can just add
 * a description of how these two offerings are related to each other."
 *
 * A category grouping says these things are neighbours; it never says why one
 * would follow the other in a conversation, which is what a rep standing in
 * front of a customer actually needs. So the person who knows writes the line
 * and every rep reads it.
 *
 * DELIBERATELY ONE-DIRECTIONAL. The note lives on the offering being viewed,
 * keyed by the other one's id: Freya.Label's sentence about Freya.Artwork is
 * Label's sentence. Artwork's own page may want to say something different
 * about the same pair, and one shared sentence would make one of them wrong.
 */

/**
 * The offering's whole notes map while the page is open. Every save PATCHes the
 * full map, so without this a second edit would send the first edit's
 * pre-refresh copy and silently undo it.
 */
const liveNotes = new Map<string, Record<string, string>>();

export function RelatedOfferingNote({
  offeringId,
  relatedId,
  relatedName,
  notes,
  canEdit,
}: {
  offeringId: string;
  relatedId: string;
  relatedName: string;
  /** Every note on this offering, keyed by related offering id. */
  notes: Record<string, string>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const stored = liveNotes.get(offeringId);
  const note = (stored ?? notes)[relatedId] || "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [busy, setBusy] = useState(false);

  if (!canEdit && !note.trim()) return null;

  async function save() {
    setBusy(true);
    const text = draft.trim();
    try {
      const next = { ...(liveNotes.get(offeringId) ?? notes), [relatedId]: text };
      if (!text) delete next[relatedId];
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ related_notes: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error || "That didn't save.", "error");
        return;
      }
      liveNotes.set(offeringId, next);
      toast(
        text
          ? `Saved how ${relatedName} relates.`
          : `Removed the note on ${relatedName}.`
      );
      setEditing(false);
      router.refresh();
    } catch {
      toast("That didn't save.", "error");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <span
        // The card around this is a Link; typing must not navigate.
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="mt-1.5 block"
      >
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder={`How does ${relatedName} relate to this offering?`}
          aria-label={`How ${relatedName} relates`}
          className="w-full resize-y rounded-lg border border-blue-subtle bg-white px-2.5 py-1.5 text-[12px] leading-snug text-text-primary outline-none focus:border-blue-primary"
        />
        <span className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-blue-primary px-2.5 py-1 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Check size={12} strokeWidth={2.6} /> Save
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(note);
              setEditing(false);
            }}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            <X size={12} strokeWidth={2.4} /> Cancel
          </button>
        </span>
      </span>
    );
  }

  return (
    <span className="mt-1 flex items-start gap-1.5">
      <span className="min-w-0 flex-1 text-[12px] leading-snug text-text-secondary">
        {note.trim() || (
          <span className="italic text-text-tertiary">
            No note on how these two work together yet.
          </span>
        )}
      </span>
      {canEdit && (
        <button
          type="button"
          title={
            note.trim()
              ? "Edit how these work together"
              : "Say how these work together"
          }
          aria-label={
            note.trim()
              ? `Edit how ${relatedName} relates`
              : `Say how ${relatedName} relates`
          }
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDraft(note);
            setEditing(true);
          }}
          className="-mt-0.5 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
        >
          <PenLine size={12} strokeWidth={2.1} />
        </button>
      )}
    </span>
  );
}

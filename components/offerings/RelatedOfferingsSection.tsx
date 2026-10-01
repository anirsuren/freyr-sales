"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ViewSwitch } from "@/components/ui/ViewSwitch";
import Link from "next/link";
import { ChevronRight, LayoutGrid, Package, Rows3 } from "lucide-react";
import { AvailabilityPill } from "@/components/ui/AvailabilityPill";
import { RelatedOfferingNote } from "@/components/offerings/RelatedOfferingNote";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { UnlinkX } from "@/components/ui/UnlinkButton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

/**
 * READ-ONLY HERE, EDITED IN THE EDIT PAGE (Anir, Aug 27: "it shouldn't be a
 * separate edit thing. When they press Edit at the top, that's where it
 * should be — a separate section under Sales Materials"). This renders what
 * the curated list produced; the curation itself is the Related offerings
 * section of the offering's edit form. The per-pair note followed it there
 * (Anir, Sep 10: "can that be shifted from here to inside the edit mode").
 * The one save left here is taking a wrong one off, from its hover X (Anir,
 * Oct 1), which writes the same two curation lists the edit form does.
 */
export type RelatedPill = {
  id: string;
  name: string;
  type?: string;
  availability?: string;
  /** On the list because it shares this offering's category (taken out by
   *  hiding it), rather than because someone pinned it here. */
  sameCategory?: boolean;
};

/** Where the reader's choice of cards-or-table is kept. */
const VIEW_KEY = "freyr.relatedOfferings.view";

export function RelatedOfferingsSection({
  offeringId,
  offeringName = "this offering",
  related,
  notes,
  canEdit,
  relatedAdd,
  relatedHide,
  heading,
}: {
  offeringId: string;
  offeringName?: string;
  related: RelatedPill[];
  notes: Record<string, string>;
  canEdit: boolean;
  /** The edit form's two curation lists, so one can be taken out in place.
   *  Without both, the X stays off: a save built from a missing list would
   *  wipe every other pin and hide. */
  relatedAdd?: string[];
  relatedHide?: string[];
  heading: React.ReactNode;
}) {
  const router = useRouter();
  const { toast } = useToast();
  /** The related offering waiting on its confirm to be taken off this list. */
  const [unlinking, setUnlinking] = useState<RelatedPill | null>(null);
  const [busy, setBusy] = useState(false);
  const canUnlink = canEdit && !!relatedAdd && !!relatedHide;

  /** TAKE ONE OFF RIGHT HERE (Anir, Oct 1: "if i do something wrong, it's a
   *  huge problem. It should just be super easy to delete"). The same two
   *  lists the edit form saves: a pin comes out of related_add, and a
   *  category neighbour goes into related_hide, so it actually leaves. */
  async function takeOut() {
    if (!unlinking || !relatedAdd || !relatedHide) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/offerings/${offeringId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          related_add: relatedAdd.filter((id) => id !== unlinking.id),
          related_hide: unlinking.sameCategory
            ? Array.from(new Set([...relatedHide, unlinking.id]))
            : relatedHide,
        }),
      });
      if (!res.ok)
        throw new Error((await res.json().catch(() => ({}))).error || "Could not take it off.");
      toast(`${unlinking.name} is no longer listed as related to ${offeringName}.`);
      setUnlinking(null);
      router.refresh();
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Could not take it off.", "error");
    } finally {
      setBusy(false);
    }
  }
  /**
   * CARDS OR ONE ROW EACH (Anir, Aug 29: "I think you should have an option
   * here where it's a table where each offering is in one row, make it look
   * good tho").
   *
   * The cards read well at four or five and turn into a lot of scrolling past
   * that, because each one reserves room for a paragraph. The table answers
   * "what else is in this family" in one screen. Neither is right for
   * everybody, so it is a choice, and the choice sticks.
   *
   * Read after mount rather than during render: localStorage does not exist on
   * the server, and seeding state from it directly is the hydration mismatch
   * this codebase has been bitten by before.
   */
  const [view, setView] = useState<"cards" | "table">("cards");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "table" || saved === "cards") setView(saved);
    } catch {
      /* private mode, or storage disabled: cards is a fine answer */
    }
  }, []);

  function pick(next: "cards" | "table") {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* the view still changes; only the memory of it is lost */
    }
  }

  if (related.length === 0) return null;

  return (
    <section className="pt-7 border-t-2 border-border-light">
      {/* The toggle rides beside the heading rather than above the list, so it
          reads as a property of this section and not of the page. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{heading}</div>
        <ViewSwitch
          ariaLabel="How to show related offerings"
          className="flex"
          value={view}
          onChange={pick}
          options={
            [
            { key: "cards", label: "Cards", icon: LayoutGrid },
            { key: "table", label: "Table", icon: Rows3 },
            ] as const
          }
        />
      </div>

      {/* THE SWITCH IS AN ANIMATION, NOT A JUMP (Anir, Sep 3: "when I switch
          between cards and table, there is no animation"). Both branches wear
          the app's own `.tab-panel` fade-and-rise, and the `key` is the view,
          so React remounts on every toggle and the animation actually replays
          instead of running once on first paint. */}
      {view === "cards" ? (
        /* Floating pill cards, not hairline rows (Anir, Jul 28). */
        <div key="cards" className="tab-panel mt-5 ml-11 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {related.map((relatedOffering) => (
            /* The X rides the card's corner, beside the link and not inside
               it, and only for people who may edit this offering. */
            <div key={relatedOffering.id} className="group/unlink relative">
            <Link
              href={`/offerings/${relatedOffering.id}`}
              className="group flex h-full min-h-[92px] flex-col justify-center gap-2 rounded-2xl border border-border-light bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 hover:-translate-y-0.5 hover:border-blue-subtle hover:shadow-[0_6px_18px_rgba(16,24,40,0.08)]"
            >
              <span className="flex items-center gap-3">
                {/* No glyph in front (Anir, Sep 2: "can you just remove these
                    icons from all the offering names? They're not really
                    needed").
                    The full name, always: default wrap breaks at spaces. */}
                <span className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-text-primary group-hover:text-blue-primary">
                  {relatedOffering.name}
                </span>
                <ChevronRight size={15} strokeWidth={1.7} className="shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-blue-primary" />
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {relatedOffering.type && (
                  <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-blue-light px-1.5 py-0.5 text-[10px] font-semibold text-blue-primary">
                    <Package size={10} strokeWidth={2.3} aria-hidden="true" />
                    {relatedOffering.type}
                  </span>
                )}
                <AvailabilityPill value={relatedOffering.availability} size="sm" />
              </span>
              {/* How the two actually relate, written by someone who knows
                  (Anir, Aug 25). */}
              <RelatedOfferingNote
                relatedId={relatedOffering.id}
                notes={notes}
                canEdit={canEdit}
              />
            </Link>
            {canEdit && (
              <UnlinkX
                within="corner"
                label={`Take ${relatedOffering.name} off ${offeringName}'s related offerings`}
                onClick={() => setUnlinking(relatedOffering)}
              />
            )}
            </div>
          ))}
        </div>
      ) : (
        /* ONE ROW EACH. Same table idiom as Goal Master and User groups —
           colgroup, headed columns, the row a hover target, the chevron on the
           right — so a third list in this product does not invent a fourth
           look. The name is the link; the note keeps its own pencil, which is
           why the row is not one big anchor. */
        <div key="table" className="tab-panel mt-5 ml-11 overflow-hidden rounded-2xl border border-border-light bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
              <colgroup>
                <col style={{ width: "26%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "36%" }} />
              </colgroup>
              <thead className="bg-surface">
                <tr>
                  {["Offering", "Type", "Availability", "How they relate"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.05em] text-text-tertiary"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {related.map((relatedOffering) => (
                  <tr
                    key={relatedOffering.id}
                    className="group group/unlink align-middle transition-colors hover:bg-surface"
                  >
                    <td className="px-4 py-3 align-middle">
                      <span className="flex min-w-0 items-center">
                      {/* THE ARROW BELONGS TO THE NAME, not to the column
                          (Anir, Sep 3: "why is the arrow there? It didn't seem
                          like a good place to put the arrow"). `flex-1` on the
                          name span pushed the chevron to the far edge of the
                          OFFERING column, so it hung in white space a long way
                          from the word it points at and read as a stray glyph
                          in the middle of the table. Sized to its content, the
                          two travel together and the arrow says "this name
                          opens". */}
                      <Link
                        href={`/offerings/${relatedOffering.id}`}
                        className="inline-flex w-fit max-w-full items-center gap-1.5"
                      >
                        <span className="min-w-0 text-[13px] font-semibold leading-snug text-text-primary transition-colors group-hover:text-blue-primary">
                          {relatedOffering.name}
                        </span>
                        <ChevronRight
                          size={14}
                          strokeWidth={1.9}
                          className="shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-blue-primary"
                        />
                      </Link>
                      {canEdit && (
                        <UnlinkX
                          label={`Take ${relatedOffering.name} off ${offeringName}'s related offerings`}
                          onClick={() => setUnlinking(relatedOffering)}
                        />
                      )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {relatedOffering.type ? (
                        /* THE CHIP STAYS IN ITS COLUMN. Without max-w-full the
                           longest type — "Freya Fusion (Module + Module
                           Agent/s)" — ran straight over the Availability pill
                           beside it (seen in the browser). The full string is
                           on the title. */
                        <span
                          title={relatedOffering.type}
                          className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-light px-1.5 py-0.5 text-[10px] font-semibold text-blue-primary"
                        >
                          <Package size={10} strokeWidth={2.3} className="shrink-0" aria-hidden="true" />
                          <span className="truncate">{relatedOffering.type}</span>
                        </span>
                      ) : (
                        <span className="text-[12px] text-text-tertiary">.</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <AvailabilityPill
                        value={relatedOffering.availability}
                        size="sm"
                      />
                    </td>
                    {/* ONE ROW PER OFFERING, and he meant one row (Anir, Aug
                        29: "a table where each offering is in one row"). These
                        notes run to five or six lines, which turned every row
                        into a paragraph and the table back into the cards it
                        was meant to replace. Clamped to two lines; the pencil
                        still opens the whole thing. */}
                    <td className="px-4 py-3">
                      {/* Clamp the NOTE, not every span inside it: the old
                          rule also hit the row that holds the text and the
                          pencil, and line-clamp's display:-webkit-box killed
                          that flex row (Anir, Sep 6: "the pencil icon is on
                          another line"). */}
                      <span className="block [&_p]:line-clamp-2 [&_[data-note-text]]:line-clamp-2">
                        <RelatedOfferingNote
                          relatedId={relatedOffering.id}
                          notes={notes}
                          canEdit={canEdit}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!unlinking}
        onClose={() => {
          if (!busy) setUnlinking(null);
        }}
        onConfirm={() => void takeOut()}
        title={`Take ${unlinking?.name ?? "this offering"} off ${offeringName}'s related offerings?`}
        body={
          <>
            <strong>{unlinking?.name}</strong> stops showing as related to{" "}
            <strong>{offeringName}</strong>.
          </>
        }
        detail={`Both offerings stay as they are, and so does the note on how they relate. You can add it back from Edit.`}
        subject={unlinking ? { name: unlinking.name, kind: "offering" } : null}
        confirmLabel="Take it off"
        busy={busy}
      />
    </section>
  );
}

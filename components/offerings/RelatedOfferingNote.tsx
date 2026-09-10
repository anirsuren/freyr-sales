"use client";

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
 *
 * READ HERE, WRITTEN UNDER EDIT (Anir, Sep 10: "the edit option for how two
 * offerings are related to each other, can that be shifted from here to
 * inside the edit mode, related offering section?"). This was the last thing
 * in the Related offerings section with a pencil and a save of its own after
 * the list itself moved into the edit form on Aug 27. The note is now written
 * beside the list it belongs to and saved by the same button; this only shows
 * what was written.
 */
export function RelatedOfferingNote({
  relatedId,
  notes,
  canEdit,
}: {
  relatedId: string;
  /** Every note on this offering, keyed by related offering id. */
  notes: Record<string, string>;
  canEdit: boolean;
}) {
  const note = (notes[relatedId] || "").trim();
  if (!note) {
    /* An editor sees where to go; everyone else sees nothing rather than a
       sentence about an absence. */
    if (!canEdit) return null;
    return (
      <span className="mt-1 block text-[12px] italic leading-snug text-text-tertiary">
        No note yet. Add one from Edit at the top.
      </span>
    );
  }
  /* data-note-text so the table can clamp THIS and nothing else. */
  return (
    <span
      data-note-text
      className="mt-1 block text-[12px] leading-snug text-text-secondary"
    >
      {note}
    </span>
  );
}

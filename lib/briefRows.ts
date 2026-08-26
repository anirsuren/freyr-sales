/**
 * MOVING COMPONENT CARDS AROUND INSIDE AN OFFERING BRIEF.
 *
 * Saras, Aug 26: "An editor should be able to shuffle the order of component
 * cards" and "An editor should be able to shift a component card from one
 * group to another."
 *
 * A brief is stored as one block of text, and the editor holds it as a flat
 * list of rows: a "section" row opens a group and every "item" row after it
 * belongs to that group until the next section. So both operations are list
 * surgery, not a change to how anything is stored — which matters, because
 * this catalogue is shared and a storage change would have to be migrated.
 *
 * Card appearance travels with the row: the saved style array is derived from
 * row order, so a card that moves takes its icon and colour with it.
 *
 * Kept out of the form component so the ordering rules can be tested without
 * a browser. See tests/component-groups.test.mjs.
 */

/** The shape these functions need. The editor's row type has more on it. */
export type BriefRow = { kind: "section" | "item"; text: string };

/** The heading a row sits under, or "" for cards above the first heading. */
export function groupOf<T extends BriefRow>(rows: T[], index: number): string {
  for (let i = index; i >= 0; i--)
    if (rows[i]?.kind === "section") return rows[i].text;
  return "";
}

/**
 * Swap a card with its neighbouring card inside the same group.
 *
 * A card at the edge of its group does NOT jump the heading. Dragging past a
 * heading would silently re-file the card under a different group, which is a
 * different decision from reordering and has its own control.
 *
 * Returns the same array reference when nothing can move, so a caller can use
 * identity to decide whether to enable the control.
 */
export function shuffleCard<T extends BriefRow>(
  rows: T[],
  index: number,
  step: -1 | 1
): T[] {
  const target = index + step;
  if (rows[index]?.kind !== "item") return rows;
  if (target < 0 || target >= rows.length) return rows;
  if (rows[target].kind !== "item") return rows;
  if (groupOf(rows, index) !== groupOf(rows, target)) return rows;
  const next = rows.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Whether the up/down control should be live for this card. */
export function canMoveCard<T extends BriefRow>(
  rows: T[],
  index: number,
  step: -1 | 1
): boolean {
  return shuffleCard(rows, index, step) !== rows;
}

/**
 * Move a card under a different heading, creating that heading if the brief
 * does not have one yet. The card lands at the end of its new group.
 *
 * `heading` of "" means the run of cards above the first heading, which is
 * not a group with a title of its own.
 */
export function moveCardToGroup<T extends BriefRow>(
  rows: T[],
  index: number,
  heading: string,
  makeSection: (text: string) => T
): T[] {
  const row = rows[index];
  if (!row || row.kind !== "item") return rows;
  if (groupOf(rows, index) === heading) return rows;

  const without = rows.filter((_, i) => i !== index);

  if (!heading) {
    const firstSection = without.findIndex((r) => r.kind === "section");
    const at = firstSection === -1 ? without.length : firstSection;
    return [...without.slice(0, at), row, ...without.slice(at)];
  }

  const sectionAt = without.findIndex(
    (r) => r.kind === "section" && r.text === heading
  );

  /* A group that does not exist yet is created at the end, so nothing already
     on the page moves out from under its own heading. */
  if (sectionAt === -1) return [...without, makeSection(heading), row];

  let end = sectionAt + 1;
  while (end < without.length && without[end].kind === "item") end += 1;
  return [...without.slice(0, end), row, ...without.slice(end)];
}

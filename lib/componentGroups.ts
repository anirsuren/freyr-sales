/**
 * THE FOUR GROUPS A COMPONENT CARD CAN BELONG TO.
 *
 * Saras, Aug 26, on Offering Overview > Offering Brief: "Make the Component
 * Cards 'Groups' fixed from the back-end - Component Cards can fall under 4
 * fixed groups of 1) Modules 2) Module Agents 3) Add-on Agents 4) Services",
 * and "make it so that the groups are always visible to the end-user in a
 * fixed order in view mode - 1) Services 2) Modules 3) Module Agents 4)
 * Add-on Agents".
 *
 * Two different orders, deliberately: the editor offers them in the order she
 * listed, and the reader always sees Services first. Both live here so the
 * form and the offering page can never drift apart on either one.
 *
 * The names are spelled exactly as the live catalogue already spells them, so
 * the offerings that use this vocabulary today (Freya.intelligence and
 * Freya.GRR-PAC) need no migration to be recognised.
 */

export const COMPONENT_GROUPS = [
  "Modules",
  "Module Agents",
  "Add-on Agents",
  "Services",
] as const;

export type ComponentGroup = (typeof COMPONENT_GROUPS)[number];

/** The order the reader sees, which is not the order the editor offers. */
export const COMPONENT_GROUP_VIEW_ORDER: readonly ComponentGroup[] = [
  "Services",
  "Modules",
  "Module Agents",
  "Add-on Agents",
];

/**
 * Match a heading someone typed to one of the four, forgiving the things
 * people actually vary: case, an "s" they left off, a hyphen they wrote as a
 * space, and the "Services include:" lead-in the catalogue already contains.
 *
 * Returns undefined for a heading that is genuinely something else. Four
 * offerings in the live catalogue carry real business headings of their own
 * ("Lifecycle Submission Management", "Market Entry & Affiliate Support" and
 * six more), and quietly filing those under one of the four would delete work
 * a person did. They stay as they are until somebody decides otherwise.
 */
export function normalizeComponentGroup(
  title: string | undefined | null
): ComponentGroup | undefined {
  const cleaned = (title ?? "")
    .toLowerCase()
    .replace(/[:：]\s*$/, "")
    .replace(/\binclude(s)?\b/g, "")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;

  for (const group of COMPONENT_GROUPS) {
    const canonical = group.toLowerCase().replace(/[-–—]/g, " ");
    if (cleaned === canonical) return group;
    // "Module" for "Modules", "Add on Agent" for "Add-on Agents".
    if (cleaned === canonical.replace(/s\b/g, "")) return group;
    if (`${cleaned}s` === canonical) return group;
  }
  return undefined;
}

/** True when a heading is one of the four rather than a one-off. */
export function isComponentGroup(title: string | undefined | null): boolean {
  return normalizeComponentGroup(title) !== undefined;
}

/**
 * Sort key for a group heading.
 *
 * The four sort into the reader's order. A heading that is not one of them
 * sorts after all four, keeping the order its author wrote it in.
 *
 * Cards with NO heading at all lead, and that is not the same case. They are
 * the opening run of a brief, not a group someone named — Freya.Register
 * opens with Products, Applications, Registrations and LCM and only then gets
 * to its agents. Ranking "untitled" alongside the custom headings buried the
 * four things the offering actually is underneath its add-ons.
 */
export function componentGroupRank(title: string | undefined | null): number {
  if (!(title ?? "").trim()) return -1;
  const group = normalizeComponentGroup(title);
  if (!group) return COMPONENT_GROUP_VIEW_ORDER.length;
  return COMPONENT_GROUP_VIEW_ORDER.indexOf(group);
}

/**
 * What to call the things inside an offering.
 *
 * It used to be "modules" for Freya Fusion and "services" for everything
 * else. Anir, Aug 26: "Here it says 'four modules.' Let's make this say 'four
 * components' instead of 'modules'" — and Saras renamed the cards themselves
 * to Component Cards the same morning. One word now, with the group heading
 * saying which kind a card is.
 */
export function componentNoun(count: number): string {
  return count === 1 ? "component" : "components";
}

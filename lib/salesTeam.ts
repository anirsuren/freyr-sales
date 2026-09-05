/**
 * THE MOCK SALES FLOOR. ONE COPY, BECAUSE COPIES DRIFT.
 *
 * These twenty names are who the sample workspace is staffed by: the /team
 * roster is built from them, their headshots are generated from them, and
 * every record the fill generates has to be owned by one of them or the
 * person it names does not exist.
 *
 * WHY THIS FILE EXISTS. The roster lived in lib/pipeline, which imports
 * lucide-react for its stage icons, so the server-side stores refused to
 * import it and kept their own copies instead — a reasonable dodge that
 * produced exactly the drift it invited. lib/mockFillLife ended up staffed by
 * a completely different cast (Elena Rossi, Marcus Chen, Grace Liu…), so the
 * 517 sample meetings, the leads and the solutioning rows were all owned by
 * people the team page had never heard of. Every rep read "0 meetings", and
 * every mock rep's profile came up empty, because the join is by name and no
 * name matched. Near-misses made it hard to see: Marcus Chen against Marcus
 * Bramwell, Grace Liu against Grace Lockwood, Viktor Petrov against Victor
 * Prescott.
 *
 * This module imports nothing, so anything may import it. Add a person here
 * and the whole sample workspace agrees about them.
 */
export const SALES_TEAM: string[] = [
  "Walter Hensley",
  "Gordon Ashby",
  "Margaret Whitfield",
  "Mark Miller",
  "Eleanor Rutherford",
  "Marcus Bramwell",
  "Sylvia Ashcroft",
  "James O'Brien",
  "Audrey Kingsley",
  "Thomas Beckett",
  "Nancy Caldwell",
  "Russell Pemberton",
  "Grace Lockwood",
  "Daniel Foster",
  "Yvonne Thatcher",
  "Oliver Hastings",
  "Clara Middleton",
  "Victor Prescott",
  "Hannah Schmidt",
  "Leonard Stanton",
];

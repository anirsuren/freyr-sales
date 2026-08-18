/**
 * WHAT SHIPPED, IN WRITING (Anir, Aug 18: "if there is ever a major update
 * in the app — tech or content — emails should be going out to users to
 * inform them about it. This should be automated, not for small visual
 * differences").
 *
 * The automation IS this file: when a change is big enough to tell everyone
 * about, the release that ships it also ships a note here with major: true,
 * and the deployed app emails every active member about it exactly once.
 * Small visual work simply gets no note (or major: false, which keeps it as
 * a record without an email). Nothing here is generated — a person writes
 * what changed, in plain words, at ship time.
 */
export type ReleaseNote = {
  /** Stable and unique forever — the once-only send is keyed on it. */
  id: string;
  /** ISO day the release shipped. */
  date: string;
  title: string;
  /** One sentence a busy rep will actually read. */
  summary: string;
  /** Plain-English bullets — what a user can now do, not what code changed. */
  points: string[];
  /** Only major notes are emailed. */
  major: boolean;
};

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: "2026-08-18-pipeline-and-admin",
    date: "2026-08-18",
    title: "Your pipeline by customer, notes on activities, and monthly emails",
    summary:
      "The Opportunities page now groups your deals under each customer, deal activities take notes, and the app now sends you a monthly summary of your book.",
    points: [
      "Opportunities: deals are grouped under each customer with its own card. Fold a customer away, and see each group's weighted progress at a glance.",
      "Filters across the app are multi-select now: pick two levels, three statuses, or several customers at once.",
      "Deal activities are a proper table and each activity can carry a note. Click a note to edit it in place.",
      "The Activity Master (which goal each activity feeds) now lives on the Admin page.",
      "Once a month the app emails you your own numbers: your pipeline, activities, goals and target accounts.",
    ],
    major: true,
  },
];

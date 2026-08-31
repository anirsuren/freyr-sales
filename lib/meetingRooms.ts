/**
 * THE TWO MEETING ROOMS, AND THEIR ADDRESSES.
 *
 * Plain module for the same reason lib/adminTabs is one: the route validates
 * against this on the server while the pills draw from it on the client.
 */
export const MEETING_ROOMS = ["planned", "completed"] as const;

export type MeetingRoom = (typeof MEETING_ROOMS)[number];

/**
 * Planned is /meetings itself; completed is a static segment that sits beside
 * /meetings/[id]. Next resolves a static segment before a dynamic sibling, so
 * this wins over the meeting-detail route, and meeting ids are never the
 * literal word "completed".
 */
export const MEETING_ROOM_PATH: Record<MeetingRoom, string> = {
  planned: "/meetings",
  completed: "/meetings/completed",
};

export const MEETING_ROOM_TITLE: Record<MeetingRoom, string> = {
  planned: "Meetings",
  completed: "Completed · Meetings",
};

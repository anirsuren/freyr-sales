import { MeetingsScreen } from "../meetingsScreen";

export const metadata = { title: "Completed · Meetings" };
export const dynamic = "force-dynamic";

/**
 * A static segment beside /meetings/[id]: Next resolves static before dynamic,
 * so this wins over the meeting-detail route.
 */
export default async function CompletedMeetingsPage() {
  return <MeetingsScreen room="completed" />;
}

import { MeetingsScreen } from "./meetingsScreen";

export const metadata = { title: "Meetings" };
export const dynamic = "force-dynamic";

/** Planned is /meetings itself, so a bare visit lands on what is still to come. */
export default async function MeetingsPage() {
  return <MeetingsScreen room="planned" />;
}

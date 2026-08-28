import { notFound } from "next/navigation";
import { MeetingDetail } from "@/components/meetings/MeetingDetail";
import { readMeetings } from "@/lib/meetings";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { requireServerMemberScope } from "@/lib/memberScope";
import { requireModuleAccess } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireModuleAccess("/meetings");
  await requireServerMemberScope();

  const live = getDataMode() === "live";
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const [state, me, directory] = await Promise.all([
    readMeetings(),
    getCurrentUser(),
    live && workspace
      ? listWorkspaceAccess(workspace).catch(() => null)
      : Promise.resolve(null),
  ]);

  const meeting = state.meetings.find((m) => m.id === id);
  if (!meeting) notFound();

  const members = live
    ? [
        ...new Set(
          (directory?.members ?? [])
            .filter((m) => m.active && m.accountType === "real")
            .map((m) => m.name.trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b))
    : ["Elena Rossi", "Omar Haddad", "Nina Kowalski", "Marcus Chen"];

  return (
    <MeetingDetail
      meeting={meeting}
      meName={me.name}
      meRole={me.role}
      members={members}
    />
  );
}

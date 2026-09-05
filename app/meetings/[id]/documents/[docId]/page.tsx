import { notFound, redirect } from "next/navigation";
import { StandaloneRecordDoc } from "@/components/documents/StandaloneRecordDoc";
import { readMeetings } from "@/lib/meetings";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { formatFromFilename } from "@/lib/offeringMaterials";

/**
 * A MEETING'S DOCUMENT, ON ITS OWN PAGE.
 *
 * The exact counterpart of /offerings/[id]/materials/[materialId] — the page
 * the hover peek iframes with ?embed=1, and the page "open in a new tab" lands
 * on. Anir, Aug 28: "whenever there are files, bro, you have to do this same
 * exact thing. You already have it built. Copy everything."
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id, docId } = await params;
  const state = await readMeetings().catch(() => null);
  const meeting = state?.meetings.find((m) => m.id === id);
  const doc = meeting?.docs.find((d) => d.id === docId);
  return {
    title: doc ? `${doc.label} · ${meeting!.title}` : "Meeting document",
  };
}

export default async function MeetingDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>;
  searchParams: Promise<{ embed?: string; member?: string }>;
}) {
  const { id, docId } = await params;
  const { embed, member } = await searchParams;
  await requireModuleAccess("/meetings");

  const state = await readMeetings();
  const meeting = state.meetings.find((m) => m.id === id);
  const doc = meeting?.docs.find((d) => d.id === docId);
  /* A named entry with no file behind it has nothing to render — the row that
     links here refuses the click for the same reason. */
  /* The meeting gone -> the meetings list; the meeting fine but the file
     gone -> the meeting itself, where its documents live (Anir, Sep 4: a
     miss lands where the things are, never on a dead end). */
  if (!meeting) redirect("/meetings");
  if (!doc?.docsPath) redirect(`/meetings/${meeting.id}`);

  const q = `meetingId=${encodeURIComponent(meeting.id)}&docId=${encodeURIComponent(
    doc.id
  )}`;

  return (
    <StandaloneRecordDoc
      embed={embed === "1"}
      initialMember={typeof member === "string" && member ? member : null}
      contextName={meeting.title}
      kicker="Meeting document"
      material={{
        id: doc.id,
        kind: formatFromFilename(doc.label),
        label: doc.label,
        url: doc.url ?? "",
        docsPath: doc.docsPath,
        addedBy: doc.addedBy,
      }}
      downloadUrl={`/api/meetings/download?${q}`}
      previewBase={`/api/meetings/preview?${q}`}
      selfUrl={`/meetings/${encodeURIComponent(meeting.id)}/documents/${encodeURIComponent(
        doc.id
      )}`}
      backUrl={`/meetings/${encodeURIComponent(meeting.id)}`}
    />
  );
}

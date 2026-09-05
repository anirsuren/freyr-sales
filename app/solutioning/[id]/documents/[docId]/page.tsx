import { notFound, redirect } from "next/navigation";
import { StandaloneRecordDoc } from "@/components/documents/StandaloneRecordDoc";
import { DOC_CATEGORY_NOUN, readSolutioning } from "@/lib/solutioning";
import { reachableSolutioningDoc } from "@/lib/solutioningDocAccess";
import { formatFromFilename } from "@/lib/offeringMaterials";

/**
 * A SOLUTIONING DOCUMENT, ON ITS OWN PAGE.
 *
 * Same job as the meetings one next door, and the same reason: the hover peek
 * iframes a page, so pointing it at the preview API showed the API's JSON in
 * the card instead of the document. Access is the shared door every solutioning
 * file goes through, which also follows a `ref` to wherever the file really
 * lives.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; docId: string }>;
}) {
  const { id, docId } = await params;
  const access = await reachableSolutioningDoc(id, docId).catch(() => null);
  return { title: access?.ok ? access.label : "Document" };
}

export default async function SolutioningDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; docId: string }>;
  searchParams: Promise<{ embed?: string; member?: string }>;
}) {
  const { id, docId } = await params;
  const { embed, member } = await searchParams;

  const access = await reachableSolutioningDoc(id, docId);
  /* Miss -> the request itself, or the module list when even that is gone —
     never a dead end (Anir, Sep 4). reachableSolutioningDoc also refuses on
     PERMISSION, and that case belongs on the list too: the list shows what
     the person may see, which is the honest answer. */
  if (!access.ok) redirect(`/solutioning/${id}`);

  /* Whose record this is, for the viewer's header — the customer if there is
     one, otherwise the request itself. */
  const state = await readSolutioning().catch(() => null);
  const request = state?.requests.find((r) => r.id === id);

  const q = `requestId=${encodeURIComponent(id)}&docId=${encodeURIComponent(docId)}`;

  return (
    <StandaloneRecordDoc
      embed={embed === "1"}
      initialMember={typeof member === "string" && member ? member : null}
      contextName={request?.customer || request?.title || "This request"}
      kicker={DOC_CATEGORY_NOUN[access.doc.category]}
      material={{
        id: access.doc.id,
        kind: formatFromFilename(access.doc.fileName || access.doc.name),
        label: access.label,
        url: access.doc.url ?? "",
        docsPath: access.docsPath,
        addedBy: access.doc.addedBy,
      }}
      downloadUrl={`/api/solutioning/download?${q}`}
      previewBase={`/api/solutioning/preview?${q}`}
      selfUrl={`/solutioning/${encodeURIComponent(id)}/documents/${encodeURIComponent(
        docId
      )}`}
      backUrl={`/solutioning/${encodeURIComponent(id)}`}
    />
  );
}

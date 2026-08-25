import { notFound } from "next/navigation";
import { RequestDetail } from "@/components/solutioning/RequestDetail";
import { readSolutioning } from "@/lib/solutioning";
import { getCurrentUser } from "@/lib/currentUser";
import { getDataMode } from "@/lib/dataMode";
import { listWorkspaceAccess } from "@/lib/accessStore";
import { requireServerMemberScope } from "@/lib/memberScope";
import { requireModuleAccess } from "@/lib/moduleAccessServer";

export const dynamic = "force-dynamic";

/** One request: the four document tabs, the people on it, and its story. */
export default async function SolutioningRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModuleAccess("/solutioning");
  await requireServerMemberScope();
  const { id } = await params;
  const live = getDataMode() === "live";
  const workspace = process.env.FREYR_WORKSPACE_ID;
  const [state, me, directory] = await Promise.all([
    readSolutioning(),
    getCurrentUser(),
    live && workspace ? listWorkspaceAccess(workspace).catch(() => null) : null,
  ]);
  const request = state.requests.find((r) => r.id === id);
  if (!request) notFound();

  const members = live
    ? [
        ...new Set(
          (directory?.members ?? [])
            .filter((m) => m.active && m.accountType === "real")
            .map((m) => m.name.trim())
            .filter(Boolean)
        ),
      ].sort((a, b) => a.localeCompare(b))
    : ["Margaret Whitfield", "Walter Hensley", "Priya Raghavan", "Ethan Brooks"];

  /* Every OTHER request's documents, compactly, so "link a document from
     another request" (Suren: a meeting "can refer to a document that was
     created as part of a presentation request") has something to pick from. */
  const linkables = state.requests
    .filter((r) => r.id !== request.id && r.docs.some((d) => !d.ref))
    .map((r) => ({
      id: r.id,
      ref: r.ref,
      title: r.title,
      docs: r.docs
        .filter((d) => !d.ref)
        .map((d) => ({
          id: d.id,
          name: d.name,
          version: d.version,
          category: d.category,
        })),
    }));

  return (
    <RequestDetail
      request={request}
      live={live}
      meName={me.name}
      meRole={me.role}
      members={members}
      linkables={linkables}
    />
  );
}

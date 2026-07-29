import { NextResponse } from "next/server";
import { getOffering } from "@/lib/offerings";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";

export const dynamic = "force-dynamic";

/**
 * DOWNLOAD A SALES MATERIAL.
 *
 * Reading is NOT an owner right. Sales materials exist so reps can hand them
 * to customers, so any signed-in workspace member may download any material
 * (Anir, Jul 29: "people who are not the owner, just normal sales... they can
 * download all this stuff. Sales can then use it"). Only ADDING and DELETING
 * are gated on ownership.
 *
 * The presigned URL is minted per click and redirected to. Storing a presign
 * on the material row would rot: they expire, and a rep would click a dead
 * link with no way to tell why.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Signed in, and part of this workspace. Nothing narrower.
  const actor = await verifiedWorkflowActor(req as never);
  if (!actor)
    return NextResponse.json(
      { error: "Sign in to download sales materials" },
      { status: 403 }
    );

  const offering = getOffering(id);
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const path = new URL(req.url).searchParams.get("path");
  if (!path)
    return NextResponse.json({ error: "Which file?" }, { status: 400 });

  // The path must belong to THIS offering: without this check a member could
  // hand-craft a path and pull a file from another offering's namespace.
  if (!path.startsWith(`${id}/`))
    return NextResponse.json(
      { error: "That file does not belong to this offering" },
      { status: 403 }
    );
  if (!offering.materials.some((m) => m.docsPath === path))
    return NextResponse.json(
      { error: "That file is not on this offering" },
      { status: 404 }
    );

  if (!hasDocsStorage())
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  try {
    const { presignUrl } = await docsStorage.getDownloadUrl(path);
    return NextResponse.redirect(presignUrl, 302);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not fetch that file" },
      { status: 502 }
    );
  }
}

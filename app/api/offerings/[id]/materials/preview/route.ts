import { NextResponse } from "next/server";
import { bumpUsage } from "@/lib/usageCounters";
import { getOffering, initializeLiveOfferings } from "@/lib/offerings";
import { hasDocsStorage } from "@/lib/docsStorage";
import { extensionOf, buildMaterialPreview } from "@/lib/materialPreview";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { canViewOfferingMaterial } from "@/lib/materialAccess";

/**
 * READ A SALES MATERIAL WITHOUT DOWNLOADING IT.
 *
 * This route answers "may this person see this file". What the file LOOKS like
 * is lib/materialPreview, which a solutioning document renders through too, so
 * the two surfaces cannot drift (Anir, Aug 26: "if the customer documents are
 * the sales material... copy all that shit").
 */

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = await verifiedWorkflowActor(req as never);
  if (!actor)
    return NextResponse.json(
      { error: "Sign in to open sales materials" },
      { status: 403 }
    );

  await initializeLiveOfferings();
  const offering = getOffering(id);
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const search = new URL(req.url).searchParams;
  const path = search.get("path");
  const member = search.get("member");
  if (!path) return NextResponse.json({ error: "Which file?" }, { status: 400 });
  if (!path.startsWith(`${id}/`))
    return NextResponse.json(
      { error: "That file does not belong to this offering" },
      { status: 403 }
    );
  const material = offering.materials.find((m) => m.docsPath === path);
  if (!material || !canViewOfferingMaterial(
      offering,
      material,
      actor.userId,
      actor.role === "admin"
    ))
    return NextResponse.json(
      { error: "That file is not on this offering" },
      { status: 404 }
    );
  if (member && extensionOf(path) !== "zip")
    return NextResponse.json(
      { error: "That material is not a ZIP archive" },
      { status: 400 }
    );

  // Counted for the monthly note to reps: the rep opened this file to read it.
  // After the permission checks, so a refused request never inflates anyone's
  // number, and NOT for a `member` fetch — that is browsing inside an archive
  // already open, and counting it would report one ZIP as twenty opens.
  if (!member) bumpUsage(actor.userId, "open");

  if (!(await hasDocsStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const inlineUrl = `/api/offerings/${id}/materials/download?path=${encodeURIComponent(path)}&view=1`;
  const { body, status } = await buildMaterialPreview({
    path,
    member,
    inlineUrl,
    label: material.label,
  });
  return NextResponse.json(body, status ? { status } : undefined);
}

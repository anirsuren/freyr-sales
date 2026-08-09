import { NextResponse } from "next/server";
import { getFdlComponent, initializeLiveOfferings } from "@/lib/offerings";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { getFallbackMaterialDownloadUrl } from "@/lib/materialStorage";

export const dynamic = "force-dynamic";

/**
 * OPEN A FILE PINNED TO A FEATURE.
 *
 * Feature attachments first reused the sales-material download route by
 * uploading under a synthetic offering id (`fdl-<componentId>`). Storage
 * accepted the write, and every read 404'd: that route resolves the id as an
 * OFFERING and there is no offering called `fdl-fdl-demo-005`. So files could
 * be attached and never opened. This route is the missing read side.
 *
 * It repeats the material route's two guards, on the component instead of the
 * offering: you must be a verified workspace member, and the object path must
 * live in this component's own namespace, so a member cannot hand-craft a path
 * and pull bytes out of another component's or offering's storage.
 *
 * Bytes are streamed back INLINE, so a picture or a PDF renders in the app
 * rather than landing in the downloads folder (Anir, Aug 9: "I should be able
 * to open it without downloading it").
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = await verifiedWorkflowActor(req as never);
  if (!actor)
    return NextResponse.json(
      { error: "Sign in to open this file" },
      { status: 403 }
    );

  await initializeLiveOfferings().catch(() => undefined);
  const component = getFdlComponent(id);
  if (!component)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const search = new URL(req.url).searchParams;
  const path = search.get("path");
  if (!path)
    return NextResponse.json({ error: "Which file?" }, { status: 400 });

  // Namespace check first: cheap, and it refuses a crafted path before any
  // storage call is made.
  if (!path.startsWith(`fdl-${id}/`))
    return NextResponse.json(
      { error: "That file does not belong to this component" },
      { status: 403 }
    );

  // And it must actually be recorded on a feature. Membership alone is not
  // enough to read an arbitrary object out of the namespace.
  const known = component.features.some((feature) =>
    (feature.attachments ?? []).some((a) => a.url.includes(encodeURIComponent(path)))
  );
  if (!known)
    return NextResponse.json(
      { error: "That file is not on this component" },
      { status: 404 }
    );

  try {
    const presignUrl = (await hasDocsStorage())
      ? (await docsStorage.getDownloadUrl(path)).presignUrl
      : await getFallbackMaterialDownloadUrl(path);

    const range = req.headers.get("range");
    const upstream = await fetch(
      presignUrl,
      range ? { headers: { Range: range } } : undefined
    );
    if (!upstream.ok || !upstream.body)
      return NextResponse.json(
        { error: "Could not open that file" },
        { status: 502 }
      );

    const filename = path.split("/").pop() || "file";
    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") || "application/octet-stream"
    );
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    for (const h of ["content-range", "accept-ranges"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (!headers.has("accept-ranges")) headers.set("Accept-Ranges", "bytes");
    headers.set(
      "Content-Disposition",
      `inline; filename="${filename.replace(/"/g, "'")}"`
    );
    headers.set("Cache-Control", "private, max-age=60");
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (caught) {
    return NextResponse.json(
      {
        error:
          caught instanceof Error ? caught.message : "Could not open that file.",
      },
      { status: 502 }
    );
  }
}

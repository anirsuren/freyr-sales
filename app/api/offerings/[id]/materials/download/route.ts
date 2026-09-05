import { NextResponse } from "next/server";
import { bumpUsage } from "@/lib/usageCounters";
import { getOffering, initializeLiveOfferings } from "@/lib/offerings";
import { DocsApiError, docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { canViewOfferingMaterial } from "@/lib/materialAccess";
import { getMaterialServeUrl, materialExistsInStore } from "@/lib/materialStorage";

export const dynamic = "force-dynamic";

/**
 * DOWNLOAD A SALES MATERIAL.
 *
 * Seller-visible materials remain available to every verified workspace
 * member. Agent-only materials are different: only a recorded owner of this
 * offering may obtain their bytes, even when another member knows the object
 * path. The same rule is enforced by preview and archive-member endpoints.
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
  // First prove workspace membership; material-level authorization follows
  // after the stored row is resolved.
  const actor = await verifiedWorkflowActor(req as never);
  if (!actor)
    return NextResponse.json(
      { error: "Sign in to download sales materials" },
      { status: 403 }
    );

  /**
   * LOAD THE REAL CATALOGUE BEFORE JUDGING THE FILE.
   *
   * In live mode the offerings store starts as the static seed and is replaced
   * with the persisted catalogue by initializeLiveOfferings() — which, until
   * now, only /api/health ever called. So on a freshly started server this
   * route compared a real uploaded file against the SEED, decided the file was
   * not on the offering, and 404'd every material link until something happened
   * to hit the health endpoint. Memoised on globalThis, so this is a no-op
   * after the first call.
   */
  await initializeLiveOfferings();

  const offering = getOffering(id);
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const search = new URL(req.url).searchParams;
  const path = search.get("path");
  if (!path)
    return NextResponse.json({ error: "Which file?" }, { status: 400 });

  // The path must belong to THIS offering: without this check a member could
  // hand-craft a path and pull a file from another offering's namespace.
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

  // Counted for the monthly note to reps — the rep pulled the actual bytes down. After the
  // permission check, so a refused request never inflates anyone's number.
  bumpUsage(actor.userId, "download");

  try {
    /* Supabase is the read path — Freya.Docs is write-only archive
       (Anir, Sep 5: "pretend you don't have it when it comes to the app"). */
    const presignUrl = await getMaterialServeUrl(path);

    /**
     * VIEW IN A TAB, OR SAVE TO DISK — the rep chooses.
     *
     * Storage hands back every object with `Content-Disposition: attachment`,
     * so simply pointing a link at the presigned URL downloads the file even
     * with target="_blank": the tab opens and immediately closes, leaving a
     * file in Downloads. A rep who only wants to LOOK at a deck before a call
     * had no way to (Saras, Jul 30: "can each of the sales materials open in a
     * new tab when clicked on without automatically downloading? The sales reps
     * need to be able to simply view them").
     *
     * `?view=1` therefore streams the bytes back through this route with an
     * INLINE disposition, so the browser renders PDFs, images and video in the
     * tab. Without it the redirect stands and the file downloads as before.
     * Proxying also keeps the presigned URL off the client.
     */
    if (search.get("view") === "1") {
      /**
       * RANGE PASSES THROUGH, so video can SEEK.
       *
       * A browser jumps around a video by asking for byte ranges; this proxy
       * used to swallow the Range header and answer 200-with-everything, so
       * dragging the scrubber forced the player to buffer the whole file up to
       * that point (Anir, Jul 30: "letting me skip ahead to the video — gotta
       * know what's going on with that"). Forward the header and relay the
       * 206/Content-Range that comes back, and seeking is instant.
       */
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
      // Storage that never advertises ranges would leave the player thinking
      // seeking is impossible; presigned object stores do support them, so say
      // so when upstream stayed silent.
      if (!headers.has("accept-ranges")) headers.set("Accept-Ranges", "bytes");
      // Quotes escaped: a filename containing one would otherwise truncate the
      // header and browsers would fall back to the URL's last segment.
      headers.set(
        "Content-Disposition",
        `inline; filename="${filename.replace(/"/g, "'")}"`
      );
      // Private: a signed-in member fetched this, a shared cache must not keep it.
      headers.set("Cache-Control", "private, max-age=60");
      return new NextResponse(upstream.body, {
        // 206 must survive the relay or the browser discards the range reply.
        status: upstream.status,
        headers,
      });
    }

    return NextResponse.redirect(presignUrl, 302);
  } catch (e) {
    /* A FILE THAT IS GONE IS NOT A GATEWAY FAULT, and it must not be described
       to a person in the storage API's own words. Eight materials on of-004
       and of-005 are indexed in the catalogue with no bytes behind them in
       either bucket (found in the loop, Sep 5), and clicking one answered 502
       with "Docs API 404001: Storage object not found:
       of-005/1788437509930-Syngene_International.zip" — which the viewer then
       printed at the reader verbatim. Missing is a 404, and it is said in
       words, with the file's own name rather than its storage path. */
    if (
      (e instanceof DocsApiError && e.code === 404001) ||
      !(await materialExistsInStore(path))
    ) {
      return NextResponse.json(
        {
          error: `"${material.label || "That file"}" is listed here but its file is missing from storage. It needs uploading again.`,
        },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not fetch that file" },
      { status: 502 }
    );
  }
}

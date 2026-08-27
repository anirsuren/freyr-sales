import "server-only";

import { NextResponse } from "next/server";

/**
 * SERVING A STORED FILE, EITHER WAY THE READER WANTS IT.
 *
 * Storage hands back every object with `Content-Disposition: attachment`, so
 * pointing a link at the presigned URL downloads the file even with
 * target="_blank" — the tab opens and immediately closes, leaving something in
 * Downloads. A reader who only wants to LOOK at a deck had no way to (Saras,
 * Jul 30: "can each of the sales materials open in a new tab when clicked on
 * without automatically downloading?").
 *
 * So `inline` streams the bytes back through our own route with an inline
 * disposition, which also keeps the presigned URL off the client. RANGE PASSES
 * THROUGH so video can SEEK: a browser jumps around a video by asking for byte
 * ranges, and swallowing the header meant dragging the scrubber forced the
 * player to buffer everything up to that point (Anir, Jul 30).
 *
 * Shared by sales materials and solutioning documents, so a file behaves the
 * same wherever it is opened from.
 */
export async function streamStoredFile(
  presignUrl: string,
  options: { filename: string; range?: string | null }
): Promise<NextResponse> {
  const upstream = await fetch(
    presignUrl,
    options.range ? { headers: { Range: options.range } } : undefined
  );
  if (!upstream.ok || !upstream.body)
    return NextResponse.json({ error: "Could not open that file" }, { status: 502 });

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
  /* Storage that never advertises ranges would leave the player thinking
     seeking is impossible; presigned object stores do support them. */
  if (!headers.has("accept-ranges")) headers.set("Accept-Ranges", "bytes");
  /* Quotes escaped: a filename containing one would truncate the header and
     browsers would fall back to the URL's last segment. */
  headers.set(
    "Content-Disposition",
    `inline; filename="${options.filename.replace(/"/g, "'")}"`
  );
  // Private: a signed-in member fetched this, a shared cache must not keep it.
  headers.set("Cache-Control", "private, max-age=60");
  return new NextResponse(upstream.body, {
    // 206 must survive the relay or the browser discards the range reply.
    status: upstream.status,
    headers,
  });
}

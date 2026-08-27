import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import {
  buildOwnerDigests,
  renderOwnerDigest,
} from "@/lib/offeringOwnerDigest";

export const dynamic = "force-dynamic";

/**
 * THE OFFERING-OWNER REMINDER, AS A DRAFT (Saras, Aug 25: "can you make an
 * automated email draft for offering owners?").
 *
 * GET lists every owner who could be sent one, with the numbers that decide
 * whether they should be — how many files, how many empty folders, how stale
 * the stalest one is. GET with `?offering=&owner=` returns the written message
 * for that pairing, which the composer loads into its editor.
 *
 * It never sends. Saras asked for a draft, and a mail that goes to owners on a
 * schedule nobody agreed is not something to switch on quietly. An admin reads
 * it, edits it, and presses Send.
 */

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }
  const me = await getCurrentUser();
  if (me.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Only an admin can draft these." },
      { status: 403 }
    );
  }

  const search = req.nextUrl.searchParams;
  const offering = search.get("offering");
  const owner = search.get("owner");

  const digests = await buildOwnerDigests(offering ?? undefined);

  if (offering && owner) {
    const hit = digests.find(
      (d) => d.offeringId === offering && d.ownerName === owner
    );
    if (!hit) {
      return NextResponse.json(
        { ok: false, error: "No such owner on that offering." },
        { status: 404 }
      );
    }
    const message = renderOwnerDigest(hit);
    return NextResponse.json({
      ok: true,
      to: hit.ownerEmail ?? "",
      subject: message.subject,
      /* Already a body fragment, which is what a rich-text box can hold. The
         send shell goes on at send time, in the composer's route. */
      html: message.html,
      digest: hit,
    });
  }

  /* The list: who could be reminded, and the facts that say who needs it. */
  return NextResponse.json({
    ok: true,
    owners: digests.map((d) => ({
      offeringId: d.offeringId,
      offeringName: d.offeringName,
      ownerName: d.ownerName,
      ownerEmail: d.ownerEmail,
      ownerSince: d.ownerSince,
      totalFiles: d.totalFiles,
      emptyFolders: d.emptyFolders,
      folderCount: d.folders.length,
      stalestDays: d.stalestDays,
    })),
  });
}

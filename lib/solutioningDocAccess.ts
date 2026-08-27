import "server-only";

import { getCurrentUser } from "@/lib/currentUser";
import { canAccessModule } from "@/lib/moduleAccess";
import { readSolutioning, type SolutionDoc } from "@/lib/solutioning";

/**
 * ONE DOOR FOR EVERY SOLUTIONING FILE.
 *
 * Upload, preview and download all have to ask the same two questions before
 * they touch a byte: may this person open Solutioning at all, and does this
 * file actually belong to the request they named? Asking them in one place is
 * the only way three routes cannot drift apart on the answer.
 *
 * A document reached through a `ref` lives on ANOTHER request, so the path is
 * resolved against wherever the file really is rather than trusting the path
 * in the query string.
 */
export type DocAccess =
  | { ok: true; doc: SolutionDoc; docsPath: string; label: string }
  | { ok: false; error: string; status: number };

export async function reachableSolutioningDoc(
  requestId: string,
  docId: string
): Promise<DocAccess> {
  const me = await getCurrentUser();
  if (!canAccessModule("/solutioning", me.role))
    return { ok: false, error: "Not available on this account.", status: 403 };

  const state = await readSolutioning();
  const request = state.requests.find((r) => r.id === requestId);
  if (!request) return { ok: false, error: "That request is gone.", status: 404 };

  const doc = request.docs.find((d) => d.id === docId);
  if (!doc) return { ok: false, error: "That document is gone.", status: 404 };

  /* A reference points at a document whose file has one home. Follow it, so a
     referenced file opens without being copied into this request. */
  let real = doc;
  if (doc.ref) {
    const home = state.requests.find((r) => r.id === doc.ref!.requestId);
    const there = home?.docs.find((d) => d.id === doc.ref!.docId);
    if (!there)
      return { ok: false, error: "That document is gone from its home request.", status: 404 };
    real = there;
  }

  if (!real.docsPath)
    return { ok: false, error: "That document is a link, not a file.", status: 400 };

  return { ok: true, doc: real, docsPath: real.docsPath, label: real.name };
}

/** Everything a solutioning file is stored under, so nothing can reach out of it. */
export function solutioningNamespace(requestId: string): string {
  return `solutioning/${requestId}`;
}

/** May this person add or remove files on this request? */
export async function canWriteSolutioning(): Promise<boolean> {
  const me = await getCurrentUser();
  return canAccessModule("/solutioning", me.role);
}

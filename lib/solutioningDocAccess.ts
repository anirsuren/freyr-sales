import "server-only";

import { canOpenModule, moduleWriteRefusal } from "@/lib/moduleAccessServer";
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
  /* The doc is the minimal identity the file routes actually read — name and
     stored filename — so a comment attachment, which is not a full
     SolutionDoc, can answer through the same door. */
  | {
      ok: true;
      doc: {
        id: string;
        name: string;
        fileName?: string;
        /* Present when the answer is a real request document; absent on a
           comment attachment, which has no category, link or author line. */
        category?: SolutionDoc["category"];
        url?: string;
        addedBy?: string;
      };
      docsPath: string;
      label: string;
    }
  | { ok: false; error: string; status: number };

export async function reachableSolutioningDoc(
  requestId: string,
  docId: string
): Promise<DocAccess> {
  /* THE PRIVILEGE TABLE, NOT THE ROLE ALONE. canOpenModule's own note names
     this exact failure: "a BD Member the table grants Meetings write was told
     'Not available on this account' by the route's own guard." This file was
     never moved over, so a Sales user could raise a request and then be
     refused the file on it. One question, one answer. */
  if (!(await canOpenModule("/solutioning")))
    return { ok: false, error: "Not available on this account.", status: 403 };

  const state = await readSolutioning();
  const request = state.requests.find((r) => r.id === requestId);
  if (!request) return { ok: false, error: "That request is gone.", status: 404 };

  const doc = request.docs.find((d) => d.id === docId);
  if (!doc) {
    /* COMMENT ATTACHMENTS LIVE ON THE TIMELINE, NOT IN docs (Anir, Sep 6).
       They resolve through the same route so nothing reads a docsPath out of
       a query string: same request, same access check, just a different
       shelf. */
    for (const entry of request.activity) {
      const att = entry.attachments?.find((a) => a.id === docId);
      if (att)
        return {
          ok: true,
          doc: { id: att.id, name: att.name, fileName: att.fileName },
          docsPath: att.docsPath,
          label: att.name,
        };
    }
    return { ok: false, error: "That document is gone.", status: 404 };
  }

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

/**
 * MAY THIS PERSON ADD OR REMOVE FILES ON THIS REQUEST?
 *
 * The SAME question the record itself asks. Attaching the RFP to a request is
 * part of making the request (Suren, Aug 31: "I should have the option to
 * upload documents related to this request"), so whoever may write a
 * solutioning record may write a file onto it — asking a stricter question
 * here produced a user who could create a request and then not put the one
 * document it is about anywhere.
 */
export async function canWriteSolutioning(): Promise<boolean> {
  return (await moduleWriteRefusal("/solutioning")) === null;
}

"use client";

import { MaterialViewer } from "@/components/offerings/MaterialViewer";
import { formatFromFilename } from "@/lib/offeringMaterials";
import type { OfferingMaterial } from "@/lib/offeringMaterials";

/**
 * ONE VIEWER FOR EVERY DOCUMENT IN THE APP.
 *
 * Anir, Sep 6: "the exact same thing that you have on meetings — it looks like
 * I can open the documents — has to be on solution requests, submissions,
 * presentations, pretty much anywhere else there is a document attached to
 * anything. It should work for any type of document. Basically the sales
 * material thing."
 *
 * Meetings, solutioning and the offering materials each grew their own copy of
 * the same four lines around MaterialViewer, and every list that did NOT copy
 * them fell back to a raw browser download — the file left the app and opened
 * in whatever the operating system felt like. This is that wrapper, named once:
 * hand it a title, the endpoint that streams the bytes, and the endpoint that
 * hands over the original, and the document opens the way a sales material
 * does — same renderer, same hover peek, same Word/Excel/PowerPoint/PDF/video
 * support.
 *
 * It deliberately takes URLs rather than a docsPath: every module resolves a
 * path through its OWN record (never from a query string), which is what keeps
 * one module's files out of another module's reach.
 */
export function DocumentPeek({
  name,
  fileName,
  previewUrl,
  serverPreviewUrl,
  downloadUrl,
  contextName,
  onClose,
}: {
  /** What the document is called, as a person named it. */
  name: string;
  /** The stored filename, which is what says PDF vs Word vs video. */
  fileName?: string | null;
  /** Streams the bytes for the in-app renderer. */
  previewUrl: string;
  /**
   * The module's JSON preview endpoint (its `/preview` route), for the formats
   * a browser cannot draw from raw bytes: Excel, ZIP listings, a deck that
   * defeats the in-browser renderer. The viewer parses this as JSON, so it
   * must NEVER be the byte stream above.
   */
  serverPreviewUrl: string;
  /** Hands over the original file. */
  downloadUrl: string;
  /** What this document belongs to — the account, the contract, the request. */
  contextName?: string;
  onClose: () => void;
}) {
  /* THE VIEWER READS THE FILE TYPE OFF `path`. The first cut handed it the
     preview URL — "/api/…/download?docId=…&view=1" — whose "extension" is
     nothing, so every document, PDFs included, was sent down the
     server-preview road and the viewer tried to parse raw PDF bytes as JSON
     ("Unexpected token '%', '%PDF-1.4'… is not valid JSON", Sep 7 test
     loop, a PDF on a comment). The stored filename is what says PDF vs Word
     vs video, so that is the path; the URLs are passed on their own. */
  const typedPath = fileName || name;
  const material: OfferingMaterial = {
    id: `doc-${name}`,
    kind: formatFromFilename(typedPath),
    label: name,
    url: downloadUrl,
    docsPath: typedPath,
  };

  return (
    <MaterialViewer
      offeringId=""
      offeringName={contextName || "Document"}
      material={material}
      path={typedPath}
      label={name}
      downloadUrl={downloadUrl}
      openInNewTabUrl={downloadUrl}
      /* The member argument is the viewer's own "which file inside the ZIP"
         hook; the module's preview route resolves the file through its
         record, so the member rides along on that route's query. */
      previewUrl={(_path: string, member: string | null) =>
        member
          ? `${serverPreviewUrl}${serverPreviewUrl.includes("?") ? "&" : "?"}member=${encodeURIComponent(member)}`
          : serverPreviewUrl
      }
      memberUrl={(_path: string, member: string) =>
        `${downloadUrl}${downloadUrl.includes("?") ? "&" : "?"}member=${encodeURIComponent(member)}`
      }
      onClose={onClose}
    />
  );
}

"use client";

import { useRouter } from "next/navigation";
import { MaterialViewer } from "@/components/offerings/MaterialViewer";
import type { OfferingMaterial } from "@/lib/offeringMaterials";

/**
 * ONE DOCUMENT, ON ITS OWN PAGE — for anything that is not an offering.
 *
 * Anir, Aug 28: "you're gonna have to do it in another viewer, just like you
 * have on sales materials. Literally copy it… whenever there are files, bro,
 * you have to do this same exact thing."
 *
 * StandaloneMaterialViewer is the offerings-shaped version of this, and it
 * cannot serve a meeting or a solution request because it builds an offering
 * route for the bytes. This is the same component with the endpoints handed in,
 * so a meeting document and a sales material render through the identical
 * pipeline — docx-preview, real drawn slides, the native PDF viewer.
 *
 * WHY THE PAGE EXISTS AT ALL, rather than only the dialog: the hover peek
 * iframes a URL, and what it iframes has to be a PAGE. Pointing it at the
 * preview API gave the card the API's JSON, printed as text (found in the
 * browser, Aug 28 — the card opened, and showed
 * `{"preview":{"kind":"native"…`). Sales materials never had that bug because
 * their peek has always pointed at /offerings/…/materials/… with ?embed=1.
 */
export function StandaloneRecordDoc({
  material,
  contextName,
  kicker,
  downloadUrl,
  selfUrl,
  previewBase,
  backUrl,
  embed = false,
  initialMember = null,
}: {
  material: OfferingMaterial;
  /** What the document belongs to, shown where an offering name would be. */
  contextName: string;
  /** What kind of document it is — never "Sales material" out here. */
  kicker: string;
  /** Serves the raw file. */
  downloadUrl: string;
  /** This page, for "open in a new tab". */
  selfUrl: string;
  /** The record's preview endpoint, already carrying its own query string. */
  previewBase: string;
  /** Where closing it goes. */
  backUrl: string;
  /** Bare-document mode, for the hover peek. */
  embed?: boolean;
  initialMember?: string | null;
}) {
  const router = useRouter();

  return (
    <MaterialViewer
      standalone
      embed={embed}
      kicker={kicker}
      /* Buyer stage and Access belong to an offering's material. This is a
         file on a record, and it has neither. */
      showOfferingFacts={false}
      initialMember={initialMember}
      offeringId=""
      offeringName={contextName}
      material={material}
      path={material.docsPath!}
      label={material.label}
      downloadUrl={downloadUrl}
      openInNewTabUrl={selfUrl}
      previewUrl={(_path, member) =>
        member
          ? `${previewBase}&member=${encodeURIComponent(member)}`
          : previewBase
      }
      onClose={() => router.push(backUrl)}
    />
  );
}

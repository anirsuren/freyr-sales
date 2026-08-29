"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { copyMaterialLink, isUploadedMaterial } from "@/components/offerings/materialActions";
import type { OfferingMaterial } from "@/lib/offeringMaterials";

/**
 * COPY THE LINK TO THIS FILE, from the row (Anir, Aug 28: "I also had the copy
 * button link here in the actions").
 *
 * The viewer's header has had a copy-link since it was built, but that means
 * opening a file to share it. On the row it is one click from a list — which is
 * how somebody actually sends a deck to a colleague.
 *
 * Both materials tables use this one component so the two doors onto the same
 * files cannot end up with different actions on them, which is the rule those
 * tables have been held to since Aug 24.
 */
export function CopyMaterialLinkButton({
  offeringId,
  material,
}: {
  offeringId: string;
  material: OfferingMaterial;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const uploaded = isUploadedMaterial(material);

  return (
    <Tooltip
      label={
        copied
          ? "Copied"
          : uploaded
            ? "Copy a link to this file"
            : "Copy the link this points at"
      }
      side="top"
    >
      <button
        type="button"
        aria-label={`Copy a link to ${material.label}`}
        onClick={async () => {
          if (!(await copyMaterialLink(offeringId, material))) return;
          setCopied(true);
          if (timer.current !== null) window.clearTimeout(timer.current);
          // Long enough to be seen, short enough that the row goes back to
          // looking like every other row.
          timer.current = window.setTimeout(() => setCopied(false), 2000);
        }}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-blue-light hover:text-blue-primary"
      >
        {copied ? (
          <Check size={14} strokeWidth={2.4} className="text-success" />
        ) : (
          <Link2 size={14} strokeWidth={1.9} />
        )}
      </button>
    </Tooltip>
  );
}

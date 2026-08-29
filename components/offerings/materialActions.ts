"use client";

import type { OfferingMaterial } from "@/lib/offeringMaterials";

/**
 * OPENING AND DOWNLOADING A MATERIAL, IN ONE PLACE.
 *
 * These two behaviours were written inside the offering's own materials tab
 * and stayed there, so the cross-offering Sales Materials page shipped without
 * them and every row on it could only navigate to the offering — which is not
 * what a list of files is for (Anir, Aug 21: "when I click on it, it opens.
 * Don't take me to the offering, that's pointless then"). One module now, used
 * by both surfaces, so a fix to either behaviour reaches both.
 */

/** True when this row has bytes in storage rather than a pasted link. */
export function isUploadedMaterial(material: Pick<OfferingMaterial, "docsPath">): boolean {
  return Boolean(material.docsPath);
}

/**
 * A shareable, app-owned preview URL. The tab that opens is a dedicated
 * material page — the in-app viewer that renders Word and PowerPoint as HTML
 * instead of dropping a file in Downloads (Anir, Aug 18: "why the fuck is it
 * downloading") — not another copy of the offering page.
 */
export function materialPreviewHref(
  offeringId: string,
  material: Pick<OfferingMaterial, "id">
): string {
  return `/offerings/${offeringId}/materials/${encodeURIComponent(material.id)}`;
}

/** Open the file itself: the viewer for an upload, the destination for a link. */
export function openMaterial(
  offeringId: string,
  material: Pick<OfferingMaterial, "id" | "url" | "docsPath">
): void {
  const href = isUploadedMaterial(material)
    ? materialPreviewHref(offeringId, material)
    : material.url;
  if (!href) return;
  window.open(href, "_blank", "noopener,noreferrer");
}

/**
 * THE LINK YOU PASTE TO SOMEBODY (Anir, Aug 28: "I also had the copy button
 * link here in the actions").
 *
 * An UPLOADED file's link is its own page inside Freyr — the viewer, which
 * renders it and respects who may open it. A pasted link copies the address it
 * already points at, because that is the thing it is. Absolute either way: a
 * relative path is useless the moment it leaves the page.
 */
export function materialShareLink(
  offeringId: string,
  material: Pick<OfferingMaterial, "id" | "url" | "docsPath">
): string {
  if (!isUploadedMaterial(material)) return material.url || "";
  const path = materialPreviewHref(offeringId, material);
  return typeof window === "undefined"
    ? path
    : new URL(path, window.location.origin).toString();
}

/** Copy it, falling back to a selection when the clipboard is refused. */
export async function copyMaterialLink(
  offeringId: string,
  material: Pick<OfferingMaterial, "id" | "url" | "docsPath">
): Promise<boolean> {
  const link = materialShareLink(offeringId, material);
  if (!link) return false;
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    // No permission, or an insecure origin. Put it somewhere the keyboard can
    // still reach rather than letting the button do nothing.
    const box = document.createElement("input");
    box.value = link;
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand("copy");
    box.remove();
    return ok;
  }
}

function safeDownloadName(label: string): string {
  return (
    label
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 120) || "sales-material"
  );
}

/**
 * Uploaded assets download their original bytes. Link-only catalogue rows do
 * not have bytes in storage, so they download a small portable HTML shortcut
 * instead of silently losing the download action.
 */
export function downloadMaterialCopy(
  material: Pick<OfferingMaterial, "label" | "url" | "docsPath">
): void {
  if (material.docsPath) {
    window.location.href = material.url;
    return;
  }
  let source: URL;
  try {
    source = new URL(material.url, window.location.origin);
  } catch {
    return;
  }
  if (source.protocol !== "http:" && source.protocol !== "https:") return;
  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character] || character
    );
  const title = escapeHtml(material.label);
  const href = escapeHtml(source.toString());
  const blob = new Blob(
    [
      '<!doctype html><html><head><meta charset="utf-8">',
      `<meta http-equiv="refresh" content="0;url=${href}">`,
      `<title>${title}</title></head><body>`,
      `<p>Opening <a href="${href}">${title}</a>…</p></body></html>`,
    ],
    { type: "text/html;charset=utf-8" }
  );
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `${safeDownloadName(material.label)}.html`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

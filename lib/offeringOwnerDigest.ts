import "server-only";

import { getOffering, initializeLiveOfferings, listOfferings } from "./offerings";
import {
  canonicalMaterialFolder,
  fixedMaterialFoldersFor,
} from "./offeringMaterials";
import type { Offering, OfferingMaterial } from "./offerings";

/**
 * THE OFFERING OWNER'S REMINDER (Saras, Aug 25: "can you make an automated
 * email draft for offering owners? It'll contain the date that they were made
 * Offering Owner of their respective offering, a table of when they last
 * uploaded files in each of the 12 folders, and a general reminder to check
 * and update their sales material content").
 *
 * Sales material rots quietly. Nothing in the app has ever told an owner that
 * their Battle Cards are from March, because the only way to notice is to open
 * each folder and read the dates — and nobody opens a folder to find out it is
 * empty. This turns that into one table an owner reads in ten seconds: every
 * folder on their shelf, when it was last touched, and how long ago.
 *
 * A DRAFT, NOT A SEND. Saras asked for a draft, and an email that goes out to
 * owners on a schedule nobody agreed is not a thing to switch on quietly. This
 * builds the message; the admin composer sends it when somebody decides to.
 */

export type FolderStatus = {
  folder: string;
  lastUploadedAt: string | null;
  lastUploadedBy: string | null;
  fileCount: number;
  /** Whole days since the last upload, or null when nothing was ever added. */
  daysAgo: number | null;
};

export type OwnerDigest = {
  ownerName: string;
  ownerEmail: string | null;
  offeringId: string;
  offeringName: string;
  /** When they became owner of THIS offering. */
  ownerSince: string | null;
  folders: FolderStatus[];
  totalFiles: number;
  emptyFolders: number;
  /** The oldest "last upload" across folders that have anything at all. */
  stalestDays: number | null;
};

const DAY = 86_400_000;

function whenAdded(material: OfferingMaterial): string | null {
  const raw = (material as { addedAt?: string }).addedAt;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? raw : null;
}

/** Every folder on this offering's shelf, with what is in it and when. */
export function folderStatusFor(offering: Offering, now = Date.now()): FolderStatus[] {
  const shelf = fixedMaterialFoldersFor(offering.offering_type);
  const byFolder = new Map<string, OfferingMaterial[]>();
  for (const material of offering.materials ?? []) {
    const folder = canonicalMaterialFolder(material);
    if (!folder) continue;
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), material]);
  }
  return shelf.map((folder) => {
    const inside = byFolder.get(folder) ?? [];
    let latest: { at: string; by: string | null } | null = null;
    for (const material of inside) {
      const at = whenAdded(material);
      if (!at) continue;
      if (!latest || Date.parse(at) > Date.parse(latest.at)) {
        latest = { at, by: (material as { addedBy?: string }).addedBy ?? null };
      }
    }
    return {
      folder,
      lastUploadedAt: latest?.at ?? null,
      lastUploadedBy: latest?.by ?? null,
      fileCount: inside.length,
      daysAgo: latest ? Math.floor((now - Date.parse(latest.at)) / DAY) : null,
    };
  });
}

/**
 * One digest per OWNER PER OFFERING. Somebody who owns three offerings gets
 * three, because the reminder is about a shelf and a shelf belongs to one
 * offering — merging them would produce a table nobody could act on.
 */
export async function buildOwnerDigests(
  offeringId?: string
): Promise<OwnerDigest[]> {
  await initializeLiveOfferings();
  const offerings = offeringId
    ? [getOffering(offeringId)].filter((o): o is Offering => !!o)
    : listOfferings();
  const now = Date.now();
  const out: OwnerDigest[] = [];

  for (const offering of offerings) {
    // "requested" grants nothing and is not ownership; only real owners.
    const owners = (offering.owners ?? []).filter((o) => o.status === "owner");
    if (!owners.length) continue;
    const folders = folderStatusFor(offering, now);
    const withFiles = folders.filter((f) => f.daysAgo !== null);
    for (const owner of owners) {
      out.push({
        ownerName: owner.name,
        ownerEmail: owner.email,
        offeringId: offering.id,
        offeringName: offering.offering_name,
        ownerSince: owner.claimed_at || null,
        folders,
        totalFiles: folders.reduce((n, f) => n + f.fileCount, 0),
        emptyFolders: folders.filter((f) => f.fileCount === 0).length,
        stalestDays: withFiles.length
          ? Math.max(...withFiles.map((f) => f.daysAgo as number))
          : null,
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.ownerName.localeCompare(b.ownerName) ||
      a.offeringName.localeCompare(b.offeringName)
  );
}

function day(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function ageWords(days: number | null): string {
  if (days === null) return "Nothing uploaded yet";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 31) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "About a month ago" : `About ${months} months ago`;
}

const esc = (s: string) =>
  String(s ?? "").replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"
  );

/**
 * The message itself. Deliberately plain HTML with inline styles — a mail
 * client is not a browser, and the app's stylesheet does not travel with it.
 */
export function renderOwnerDigest(digest: OwnerDigest): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `${digest.offeringName}: check your sales material`;

  /* AMBER, NOT RED. A folder nobody has touched in a while is a nudge, not a
     failure — and red in this app means somebody rejected something. */
  const rows = digest.folders
    .map((f) => {
      const stale = f.daysAgo !== null && f.daysAgo >= 90;
      const empty = f.fileCount === 0;
      const tone = empty || stale ? "#B45309" : "#1D1D1F";
      return `<tr>
        <td style="padding:7px 12px;border-bottom:1px solid #E8E8ED">${esc(f.folder)}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #E8E8ED;text-align:right;color:#6E6E73">${f.fileCount}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #E8E8ED;white-space:nowrap">${day(f.lastUploadedAt)}</td>
        <td style="padding:7px 12px;border-bottom:1px solid #E8E8ED;white-space:nowrap;color:${tone};font-weight:${empty || stale ? 600 : 400}">${ageWords(f.daysAgo)}</td>
      </tr>`;
    })
    .join("");

  const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1D1D1F;max-width:680px">
  <p style="margin:0 0 4px">Hi ${esc(digest.ownerName.split(" ")[0] || digest.ownerName)},</p>
  <p style="margin:0 0 14px">
    You have owned <b>${esc(digest.offeringName)}</b>${
      digest.ownerSince ? ` since <b>${day(digest.ownerSince)}</b>` : ""
    }. Here is the state of its sales material today.
  </p>

  <table style="border-collapse:collapse;width:100%;font-size:13px">
    <thead>
      <tr style="text-align:left;color:#6E6E73;font-size:11px;text-transform:uppercase;letter-spacing:.04em">
        <th style="padding:6px 12px;border-bottom:2px solid #E8E8ED">Folder</th>
        <th style="padding:6px 12px;border-bottom:2px solid #E8E8ED;text-align:right">Files</th>
        <th style="padding:6px 12px;border-bottom:2px solid #E8E8ED">Last upload</th>
        <th style="padding:6px 12px;border-bottom:2px solid #E8E8ED">How long ago</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <p style="margin:16px 0 0">
    ${digest.totalFiles} ${digest.totalFiles === 1 ? "file" : "files"} in all${
      digest.emptyFolders
        ? `, and <b style="color:#B45309">${digest.emptyFolders} ${
            digest.emptyFolders === 1 ? "folder is" : "folders are"
          } still empty</b>`
        : ""
    }.
  </p>
  <p style="margin:10px 0 0">
    Please have a look through and update anything that has gone out of date —
    a rep pitching this offering is reading whatever is in these folders today.
  </p>
  <p style="margin:18px 0 0;font-size:12px;color:#6E6E73">
    Sent by Freyr Sales Intelligence because you are the offering owner.
  </p>
</div>`.trim();

  const text = [
    `Hi ${digest.ownerName.split(" ")[0] || digest.ownerName},`,
    "",
    `You have owned ${digest.offeringName}${
      digest.ownerSince ? ` since ${day(digest.ownerSince)}` : ""
    }. Here is the state of its sales material today.`,
    "",
    ...digest.folders.map(
      (f) =>
        `- ${f.folder}: ${f.fileCount} ${
          f.fileCount === 1 ? "file" : "files"
        }, last upload ${day(f.lastUploadedAt)} (${ageWords(f.daysAgo)})`
    ),
    "",
    `${digest.totalFiles} files in all${
      digest.emptyFolders ? `, and ${digest.emptyFolders} folders are still empty` : ""
    }.`,
    "",
    "Please have a look through and update anything that has gone out of date — a rep pitching this offering is reading whatever is in these folders today.",
  ].join("\n");

  return { subject, html, text };
}

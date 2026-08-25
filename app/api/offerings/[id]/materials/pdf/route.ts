import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { getOffering, initializeLiveOfferings } from "@/lib/offerings";
import { docsStorage, hasDocsStorage } from "@/lib/docsStorage";
import { verifiedWorkflowActor } from "@/lib/workflowAuthorization";
import { canViewOfferingMaterial } from "@/lib/materialAccess";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * THE FILE, AS IT ACTUALLY LOOKS (Anir, Aug 25: "What the hell is this? Does
 * that look like a PowerPoint to you?... the way it looks when I download and
 * open it is the exact way it has to look when I'm previewing it in the app.
 * No custom coding, no weird shit — it should work on any future file").
 *
 * He is right, and the in-browser renderers were never going to get there:
 * pptx-preview redraws a deck shape by shape and gives up on the shapes real
 * designers actually use, and the text fallback it left behind was a wall of
 * lines wearing a PowerPoint's name. The only honest way to show an Office
 * file is a real Office rendering engine, so this route hands the file to
 * LibreOffice headless — the industry-standard converter — and streams back
 * the PDF it prints. One code path for every deck and every document, today's
 * and any future upload alike.
 *
 * Conversions are cached by file: docsPath embeds the upload timestamp, so a
 * path can never mean different bytes and a cache entry never goes stale. The
 * first open of an 8MB deck pays ~10 seconds; every open after that is a disk
 * read.
 *
 * When LibreOffice is not installed (the answer is 501), the viewer keeps its
 * old renderers, so this route degrades to exactly yesterday's behaviour
 * rather than a broken page.
 */

/** File kinds LibreOffice converts here. Spreadsheets are deliberately NOT on
 *  the list: the in-app sheet view (real cells, fills, zoom) is the better
 *  reading of a workbook, and Anir signed it off on the real files. */
const CONVERTIBLE = new Set(["ppt", "pptx", "doc", "docx"]);

function extensionOf(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

/** Where soffice lives, or null when it is not installed on this host. */
async function findSoffice(): Promise<string | null> {
  const candidates = [
    process.env.FREYR_SOFFICE,
    "/usr/bin/soffice",
    "/usr/local/bin/soffice",
    `${os.homedir()}/Applications/LibreOffice.app/Contents/MacOS/soffice`,
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  ].filter((c): c is string => !!c);
  for (const c of candidates) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

const CACHE_DIR = nodePath.join(os.tmpdir(), "freyr-material-pdf");

/** One conversion per file at a time: two people opening the same deck must
 *  share one soffice run, not race two over the same output path. */
const inFlight = new Map<string, Promise<string>>();

async function convertToPdf(
  soffice: string,
  path: string,
  bytes: Buffer
): Promise<string> {
  const key = createHash("sha1").update(path).digest("hex");
  const outPdf = nodePath.join(CACHE_DIR, `${key}.pdf`);
  try {
    await fs.access(outPdf);
    return outPdf; // cached from an earlier open
  } catch {
    /* not converted yet */
  }
  const running = inFlight.get(key);
  if (running) return running;

  const job = (async () => {
    const workDir = nodePath.join(CACHE_DIR, `job-${key}`);
    await fs.mkdir(workDir, { recursive: true });
    const input = nodePath.join(workDir, `input.${extensionOf(path)}`);
    await fs.writeFile(input, bytes);
    await new Promise<void>((resolve, reject) => {
      execFile(
        soffice,
        [
          "--headless",
          "--norestore",
          // A private profile per job: soffice locks its profile directory,
          // and two conversions sharing one would make the second a no-op.
          `-env:UserInstallation=file://${workDir}/profile`,
          "--convert-to",
          "pdf",
          "--outdir",
          workDir,
          input,
        ],
        { timeout: 150_000 },
        (error) => (error ? reject(error) : resolve())
      );
    });
    const produced = nodePath.join(workDir, "input.pdf");
    await fs.access(produced); // soffice exits 0 even when it printed nothing
    await fs.rename(produced, outPdf);
    await fs.rm(workDir, { recursive: true, force: true });
    return outPdf;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, job);
  return job;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const actor = await verifiedWorkflowActor(req as never);
  if (!actor)
    return NextResponse.json(
      { error: "Sign in to open sales materials" },
      { status: 403 }
    );

  await initializeLiveOfferings();
  const offering = getOffering(id);
  if (!offering)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const search = new URL(req.url).searchParams;
  const path = search.get("path");
  if (!path) return NextResponse.json({ error: "Which file?" }, { status: 400 });
  if (!path.startsWith(`${id}/`))
    return NextResponse.json(
      { error: "That file does not belong to this offering" },
      { status: 403 }
    );
  const material = offering.materials.find((m) => m.docsPath === path);
  if (
    !material ||
    !canViewOfferingMaterial(offering, material, actor.userId, actor.role === "admin")
  )
    return NextResponse.json(
      { error: "That file is not on this offering" },
      { status: 404 }
    );
  if (!CONVERTIBLE.has(extensionOf(path)))
    return NextResponse.json(
      { error: "Only presentations and documents are converted to PDF" },
      { status: 400 }
    );
  if (!(await hasDocsStorage()))
    return NextResponse.json(
      { error: "Document storage is not configured here" },
      { status: 503 }
    );

  const soffice = await findSoffice();
  if (!soffice)
    // 501, so the viewer knows to fall back to its old renderers rather than
    // showing an error over a file that used to open.
    return NextResponse.json(
      { error: "PDF conversion is not available on this server" },
      { status: 501 }
    );

  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const key = createHash("sha1").update(path).digest("hex");
    const cached = nodePath.join(CACHE_DIR, `${key}.pdf`);
    let pdfPath: string;
    try {
      await fs.access(cached);
      pdfPath = cached;
    } catch {
      const { presignUrl } = await docsStorage.getDownloadUrl(path);
      const res = await fetch(presignUrl);
      if (!res.ok) throw new Error(`storage answered ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      pdfPath = await convertToPdf(soffice, path, bytes);
    }
    const pdf = await fs.readFile(pdfPath);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${encodeURIComponent(
          material.label.replace(/"/g, "")
        )}.pdf"`,
        // Private: the grant decided who may see it; no shared cache may.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[material-pdf] conversion failed:", error);
    return NextResponse.json(
      { error: "Could not convert that file to PDF" },
      { status: 502 }
    );
  }
}

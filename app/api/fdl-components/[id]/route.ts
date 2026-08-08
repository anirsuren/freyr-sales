import { NextResponse } from "next/server";
import {
  commitOfferingsChange,
  deleteFdlComponent,
  getFdlComponent,
  initializeLiveOfferings,
  updateFdlComponent,
  type FdlComponent,
  type FdlComponentType,
  type FdlFeature,
  type FdlRelease,
} from "@/lib/offerings";
import { canManageOfferings } from "@/lib/role";

export const dynamic = "force-dynamic";

const COMPONENT_TYPES: FdlComponentType[] = ["Module", "Agent", "Platform"];

function rid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Every write is normalised at the server boundary: lengths bounded, exactly
 *  one current release, feature↔version mappings only to releases that exist. */
function sanitize(
  body: Record<string, unknown>,
  existing: FdlComponent
): Partial<Omit<FdlComponent, "id">> {
  const next: Partial<Omit<FdlComponent, "id">> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 80);
    if (name) next.name = name;
  }
  if (COMPONENT_TYPES.includes(body.type as FdlComponentType)) {
    next.type = body.type as FdlComponentType;
  }
  let releases = existing.releases;
  if (Array.isArray(body.releases)) {
    releases = (body.releases as Partial<FdlRelease>[])
      .slice(0, 60)
      .map((r) => ({
        id: typeof r?.id === "string" && r.id ? r.id.slice(0, 60) : rid("rel"),
        version: String(r?.version ?? "").trim().slice(0, 40),
        date:
          typeof r?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date)
            ? r.date
            : undefined,
        status: r?.status === "next" ? ("next" as const) : ("released" as const),
        current: r?.current === true,
      }))
      .filter((r) => r.version);
    // One current version, ever — the last one marked wins.
    const lastCurrent = [...releases].reverse().find((r) => r.current);
    for (const r of releases) r.current = r === lastCurrent;
    next.releases = releases;
  }
  if (Array.isArray(body.features)) {
    const releaseIds = new Set(releases.map((r) => r.id));
    next.features = (body.features as Partial<FdlFeature>[])
      .slice(0, 200)
      .map((f) => ({
        id: typeof f?.id === "string" && f.id ? f.id.slice(0, 60) : rid("feat"),
        fid:
          typeof f?.fid === "string" && f.fid.trim()
            ? f.fid.trim().slice(0, 20)
            : undefined,
        name: String(f?.name ?? "").trim().slice(0, 120),
        description:
          typeof f?.description === "string" && f.description.trim()
            ? f.description.trim().slice(0, 500)
            : undefined,
        versionIds: Array.isArray(f?.versionIds)
          ? f.versionIds.filter(
              (v): v is string => typeof v === "string" && releaseIds.has(v)
            )
          : [],
      }))
      .filter((f) => f.name);
  } else if (next.releases) {
    // Releases changed without a feature payload: drop mappings to versions
    // that no longer exist so no feature points at a ghost.
    const releaseIds = new Set(next.releases.map((r) => r.id));
    next.features = existing.features.map((f) => ({
      ...f,
      versionIds: f.versionIds.filter((v) => releaseIds.has(v)),
    }));
  }
  return next;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await canManageOfferings())) {
    return NextResponse.json(
      { error: "Only admins and editors can edit components." },
      { status: 403 }
    );
  }
  const { id } = await params;
  await initializeLiveOfferings().catch(() => undefined);
  const existing = getFdlComponent(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const data = sanitize(body, existing);
  const component = await commitOfferingsChange(() =>
    updateFdlComponent(id, data)
  );
  return NextResponse.json({ component });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await canManageOfferings())) {
    return NextResponse.json(
      { error: "Only admins and editors can delete components." },
      { status: 403 }
    );
  }
  const { id } = await params;
  await initializeLiveOfferings().catch(() => undefined);
  const ok = await commitOfferingsChange(() => deleteFdlComponent(id));
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

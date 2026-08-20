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
import { getCurrentUser } from "@/lib/currentUser";
import { GENERIC_USER_IDENTITY } from "@/lib/userIdentity";

/**
 * The ONLY shape a feature attachment URL may take: this component's own file
 * route. Anchored at both ends so a crafted prefix or suffix cannot smuggle
 * another target in, and that route re-checks the path belongs to the
 * component before it streams a byte.
 */
const ATTACHMENT_URL = /^\/api\/fdl-components\/[A-Za-z0-9_-]+\/files\?path=[^"'\s]*$/;

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
        // Files pinned to the feature. The URL must be one our own upload
        // route produced. Both storage backends return the same relative
        // download path, so anything else — an absolute URL, a protocol-
        // relative one, a different route — is dropped rather than stored.
        // Without this, anyone able to PATCH a component could park an
        // external link on a feature and have colleagues click it believing
        // it was a Freyr document.
        attachments: Array.isArray(f?.attachments)
          ? f.attachments
              .slice(0, 10)
              .map((a) => ({
                id:
                  typeof a?.id === "string" && a.id
                    ? a.id.slice(0, 60)
                    : rid("att"),
                name: String(a?.name ?? "File").trim().slice(0, 160),
                url:
                  typeof a?.url === "string" && ATTACHMENT_URL.test(a.url)
                    ? a.url.slice(0, 2000)
                    : "",
                kind: a?.kind === "image" ? ("image" as const) : ("document" as const),
              }))
              .filter((a) => a.url)
          : undefined,
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
  /* A roadmap version is credited to the signed-in person, from the session,
     never from the body. An unidentified caller edits without minting one
     rather than crediting the change to nobody. */
  const me = await getCurrentUser();
  const savedBy = me.id === GENERIC_USER_IDENTITY.id ? undefined : me.name.trim() || undefined;
  delete (body as Record<string, unknown>).roadmap_versions;
  const component = await commitOfferingsChange(() =>
    updateFdlComponent(id, data, savedBy)
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

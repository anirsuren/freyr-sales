import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdmin } from "@/lib/role";

export const dynamic = "force-dynamic";

function splitList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string")
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

// Add a service to the knowledge base catalog.
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "Admin access is required to manage knowledge-base services." },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  const kb = await db.freyrKb.get();
  const sk = (kb?.structured_kb as any) || { services: [] };
  const services = Array.isArray(sk.services) ? [...sk.services] : [];
  services.push({
    name: body.name || "New Service",
    description: body.description || "",
    target_roles: splitList(body.target_roles),
    target_industries: splitList(body.target_industries),
    pain_points: [],
    differentiators: [],
    freyr_language: [],
  });
  await db.freyrKb.update({ structured_kb: { ...sk, services } });
  return NextResponse.json({ ok: true });
}

// Edit a service by index.
export async function PATCH(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "Admin access is required to manage knowledge-base services." },
      { status: 403 }
    );
  }
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  const kb = await db.freyrKb.get();
  const sk = (kb?.structured_kb as any) || { services: [] };
  const services = Array.isArray(sk.services) ? [...sk.services] : [];
  const i = body.index;
  if (i == null || i < 0 || i >= services.length)
    return NextResponse.json({ error: "bad index" }, { status: 400 });
  /**
   * AN INDEX IS NOT AN IDENTITY (found Aug 16, testing two admins at once).
   * Services are addressed by array position and DELETE splices, so every
   * position after a removal shifts down by one. Open the catalogue in two
   * tabs, delete anything in the first, and a save from the second lands on
   * whichever service slid into that slot: the record it meant to edit keeps
   * its old text, an unrelated one is overwritten, and the answer is still
   * {ok:true}. Reproduced end to end.
   *
   * The caller now says which service it believes sits there. When that no
   * longer matches, the write is refused instead of hitting a stranger.
   */
  if (
    typeof body.expectName === "string" &&
    services[i]?.name !== body.expectName
  ) {
    return NextResponse.json(
      {
        error:
          "This list changed while you were editing — somebody added or removed a service. Reload and try again.",
      },
      { status: 409 }
    );
  }
  services[i] = {
    ...services[i],
    name: body.name ?? services[i].name,
    description: body.description ?? services[i].description,
  };
  await db.freyrKb.update({ structured_kb: { ...sk, services } });
  return NextResponse.json({ ok: true });
}

// Remove a service by index.
export async function DELETE(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "Admin access is required to manage knowledge-base services." },
      { status: 403 }
    );
  }
  const idx = Number(new URL(req.url).searchParams.get("index"));
  const db = getDb();
  const kb = await db.freyrKb.get();
  const sk = (kb?.structured_kb as any) || { services: [] };
  const services = Array.isArray(sk.services) ? [...sk.services] : [];
  if (Number.isNaN(idx) || idx < 0 || idx >= services.length)
    return NextResponse.json({ error: "bad index" }, { status: 400 });
  // Same guard as PATCH: deleting the wrong row is worse than editing it.
  const expect = new URL(req.url).searchParams.get("expect");
  if (expect !== null && services[idx]?.name !== expect) {
    return NextResponse.json(
      {
        error:
          "This list changed while you were looking at it — somebody added or removed a service. Reload and try again.",
      },
      { status: 409 }
    );
  }
  services.splice(idx, 1);
  await db.freyrKb.update({ structured_kb: { ...sk, services } });
  return NextResponse.json({ ok: true });
}

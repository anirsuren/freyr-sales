import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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
  const body = await req.json().catch(() => ({}));
  const db = getDb();
  const kb = await db.freyrKb.get();
  const sk = (kb?.structured_kb as any) || { services: [] };
  const services = Array.isArray(sk.services) ? [...sk.services] : [];
  const i = body.index;
  if (i == null || i < 0 || i >= services.length)
    return NextResponse.json({ error: "bad index" }, { status: 400 });
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
  const idx = Number(new URL(req.url).searchParams.get("index"));
  const db = getDb();
  const kb = await db.freyrKb.get();
  const sk = (kb?.structured_kb as any) || { services: [] };
  const services = Array.isArray(sk.services) ? [...sk.services] : [];
  if (Number.isNaN(idx) || idx < 0 || idx >= services.length)
    return NextResponse.json({ error: "bad index" }, { status: 400 });
  services.splice(idx, 1);
  await db.freyrKb.update({ structured_kb: { ...sk, services } });
  return NextResponse.json({ ok: true });
}


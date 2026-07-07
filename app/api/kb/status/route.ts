import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServiceStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const kb = await db.freyrKb.get();

  let status: "fresh" | "stale" | "never" = "never";
  if (kb?.crawled_at) {
    const ageDays =
      (Date.now() - new Date(kb.crawled_at).getTime()) / (1000 * 60 * 60 * 24);
    status = ageDays > 30 ? "stale" : "fresh";
  }

  return NextResponse.json({
    kb,
    status,
    services: getServiceStatus(),
  });
}

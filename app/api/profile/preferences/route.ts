import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import {
  readMemberProfile,
  writeMemberProfile,
} from "@/lib/memberProfile";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  try {
    return NextResponse.json({ profile: await readMemberProfile(scope) });
  } catch {
    return NextResponse.json(
      { error: "Profile settings are temporarily unavailable." },
      { status: 503 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.title !== "string" || typeof body.signature !== "string") {
    return NextResponse.json(
      { error: "Title and signature must be text." },
      { status: 400 }
    );
  }
  try {
    const profile = await writeMemberProfile(scope, {
      title: body.title,
      signature: body.signature,
    });
    return NextResponse.json({ ok: true, profile });
  } catch {
    return NextResponse.json(
      { error: "Profile settings could not be saved." },
      { status: 503 }
    );
  }
}

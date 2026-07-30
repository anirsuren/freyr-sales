import { NextRequest, NextResponse } from "next/server";
import {
  DATA_MODE_COOKIE,
  getDataMode,
  isDataModeLocked,
  setDataMode,
  persistDataMode,
  type DataMode,
} from "@/lib/dataMode";
export async function GET() {
  return NextResponse.json({ mode: getDataMode(), locked: isDataModeLocked() });
}

// Every signed-in member can flip between Real (what's released today) and
// Mock (the full vision with demo data) — the app is mid-build, so the team
// needs both lenses (Anir, Jul 27: "every person needs a mock mode and real
// mode. Because the application isn't done yet", and again Jul 30: "they can
// flip it into mock mode if they want"). Real is the BOOT default, so nobody
// lands in mock by accident.
//
// This briefly required admin. That was my call, not a request, and it was the
// wrong one: mock mode shows demo data, it does not expose anything, and
// gating it took a tool away from the people the tool is for.
export async function POST(request: NextRequest) {
  if (isDataModeLocked()) {
    return NextResponse.json(
      { error: "Data mode is controlled by the deployment configuration." },
      { status: 409 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const mode: DataMode = body.mode === "live" ? "live" : "mock";
  setDataMode(mode);
  // Outlive the process, so the next deploy does not undo the choice.
  await persistDataMode(mode);
  const response = NextResponse.json({ ok: true, mode });
  response.cookies.set(DATA_MODE_COOKIE, mode, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

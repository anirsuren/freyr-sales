import { NextResponse } from "next/server";
import {
  DATA_MODE_COOKIE,
  getDataMode,
  isDataModeLocked,
  setDataMode,
  type DataMode,
} from "@/lib/dataMode";
export async function GET() {
  return NextResponse.json({ mode: getDataMode(), locked: isDataModeLocked() });
}

// Every signed-in member can flip between Real (what's released today) and
// Mock (the full vision with demo data) — the app is mid-build, so the team
// needs both lenses (Anir, Jul 27: "every person needs a mock mode and real
// mode. Because the application isn't done yet"). Real is the BOOT default,
// so nobody lands in mock by accident. NOTE: the mode is still one
// server-wide switch — flipping it changes what everyone sees until it is
// flipped back; converting it to per-person state is queued before the
// broader sales rollout.
export async function POST(request: Request) {
  if (isDataModeLocked()) {
    return NextResponse.json(
      { error: "Data mode is controlled by the deployment configuration." },
      { status: 409 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const mode: DataMode = body.mode === "live" ? "live" : "mock";
  setDataMode(mode);
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

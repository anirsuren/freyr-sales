import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, verifyAccessGrant } from "@/lib/accessControl";
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

/**
 * ONLY AN ADMIN MAY FLIP THE WORKSPACE.
 *
 * This route had NO permission check of any kind: the Settings UI disabled the
 * control for non-admins and that was the whole defence, so any signed-in Rep
 * could POST here directly and put the entire company into Mock mode. That is
 * not a cosmetic setting — the mode is ONE SERVER-WIDE VALUE, it is persisted
 * to Supabase so it survives restarts, and mock mode switches off the release
 * gate, which means every unreleased module becomes reachable, full of invented
 * data, for everyone at Freyr at once.
 *
 * Admin-only was always the intent; only the button was ever enforcing it.
 *
 * Local development is exempt because it has no configured authentication and
 * therefore no identity to check — the same exemption the rest of the app makes
 * for a developer's machine, and what keeps `npm run live` and the test suite
 * working.
 */
async function mayChangeMode(request: NextRequest): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" && !process.env.AUTH_MODE) return true;
  const grant = await verifyAccessGrant(request.cookies.get(ACCESS_COOKIE)?.value);
  return grant?.role === "admin";
}

// Admins flip between Real (what's released today) and Mock (the full vision
// with demo data), because the app is mid-build and the team needs both lenses
// (Anir, Jul 27: "every person needs a mock mode and real mode"). Real is the
// BOOT default, so nobody lands in mock by accident.
export async function POST(request: NextRequest) {
  if (!(await mayChangeMode(request))) {
    return NextResponse.json(
      { error: "Only a workspace admin can change what the workspace shows." },
      { status: 403 }
    );
  }
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

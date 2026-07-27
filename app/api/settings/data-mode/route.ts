import { NextResponse } from "next/server";
import {
  DATA_MODE_COOKIE,
  getDataMode,
  isDataModeLocked,
  setDataMode,
  type DataMode,
} from "@/lib/dataMode";
import { isAdmin } from "@/lib/role";
export async function GET() {
  return NextResponse.json({ mode: getDataMode(), locked: isDataModeLocked() });
}

// Only an ADMIN may flip the mode. Sales users and offering owners live in
// Real mode, full stop — the toggle confused test users, and Sudhir's rollout
// plan asks for Mock mode to be removed for them entirely (Saras, Jul 27).
// The mode is a server-wide switch, so an admin flipping it changes what
// EVERYONE sees — which is exactly why it belongs to admins alone.
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json(
      { error: "Only a workspace admin can change the viewing mode." },
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

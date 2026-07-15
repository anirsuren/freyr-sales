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

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
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

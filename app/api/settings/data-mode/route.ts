import { NextRequest, NextResponse } from "next/server";
import {
  DATA_MODE_COOKIE,
  getDataMode,
  isDataModeLocked,
  type DataMode,
} from "@/lib/dataMode";
export async function GET() {
  return NextResponse.json({ mode: getDataMode(), locked: isDataModeLocked() });
}

// Every signed-in member may temporarily view Mock mode. The choice lives only
// in that browser session: it never changes another person's view and never
// becomes workspace configuration. With no cookie, the answer is always Real.
export async function POST(request: NextRequest) {
  if (isDataModeLocked()) {
    return NextResponse.json(
      { error: "Data mode is controlled by the deployment configuration." },
      { status: 409 }
    );
  }
  const body = (await request.json().catch(() => ({}))) ?? {};
  if (body.mode !== "live" && body.mode !== "mock") {
    return NextResponse.json({ error: "Mode must be live or mock." }, { status: 400 });
  }
  const mode: DataMode = body.mode;
  const response = NextResponse.json({ ok: true, mode });
  if (mode === "mock") {
    response.cookies.set(DATA_MODE_COOKIE, mode, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  } else {
    response.cookies.set(DATA_MODE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    });
  }
  return response;
}

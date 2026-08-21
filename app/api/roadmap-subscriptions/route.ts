import { NextRequest, NextResponse } from "next/server";
import { verifiedRequestMemberScope } from "@/lib/memberScope";
import {
  readRoadmapSubscription,
  toggleRoadmapFollow,
  writeRoadmapSubscription,
} from "@/lib/roadmapSubscriptions";

export const dynamic = "force-dynamic";

/**
 * MY OWN ROADMAP SUBSCRIPTION, AND NOBODY ELSE'S.
 *
 * The scope comes from the verified session, never from the body, so there is
 * no shape of request that subscribes a colleague to anything or reads what
 * they follow. Two ways to write: `follow` toggles one component or offering
 * (the switch on its page), and the full object sets the "everything" flag
 * (the switch in the notification centre).
 */
function denied() {
  return NextResponse.json(
    { error: "Verified workspace access required." },
    { status: 403 }
  );
}

export async function GET(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) return denied();
  try {
    return NextResponse.json({ subscription: await readRoadmapSubscription(scope) });
  } catch {
    return NextResponse.json(
      { error: "Notification settings are temporarily unavailable." },
      { status: 503 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const scope = await verifiedRequestMemberScope(request);
  if (!scope) return denied();
  const body = (await request.json().catch(() => null)) as {
    everything?: unknown;
    follow?: { kind?: unknown; id?: unknown; on?: unknown };
  } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    if (body.follow) {
      const { kind, id, on } = body.follow;
      if ((kind !== "component" && kind !== "offering") || typeof id !== "string" || !id) {
        return NextResponse.json(
          { error: "Say which component or offering to follow." },
          { status: 400 }
        );
      }
      return NextResponse.json({
        ok: true,
        subscription: await toggleRoadmapFollow(scope, kind, id, on === true),
      });
    }
    if (typeof body.everything !== "boolean") {
      return NextResponse.json(
        { error: "Nothing to change." },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      subscription: await writeRoadmapSubscription(scope, {
        everything: body.everything,
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Notification settings could not be saved." },
      { status: 503 }
    );
  }
}

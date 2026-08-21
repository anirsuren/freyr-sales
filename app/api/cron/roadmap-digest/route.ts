import { type NextRequest, NextResponse } from "next/server";
import { mailerConfigured } from "@/lib/mailer";
import { planRoadmapDigest, sendRoadmapDigest } from "@/lib/roadmapDigest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * THE ROADMAP DIGEST, ON DEMAND.
 *
 * One mail per subscriber carrying every roadmap change since the last run
 * (Anir, Aug 21, relaying the product owner: "a guy who wants everything, he
 * should not be spammed with updates — so one email should go"). Point a
 * scheduler at it daily or weekly and the cadence is whatever that scheduler
 * says; nothing in the app arms it.
 *
 * `?dry=1` shows exactly what would leave and sends nothing — the only way
 * this should ever be run first. CRON_SECRET gates both.
 */
function unauthorized() {
  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

async function run(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }
  const offered =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (offered !== secret) return unauthorized();

  if (new URL(request.url).searchParams.get("dry") === "1") {
    const plan = await planRoadmapDigest();
    return NextResponse.json({
      dry: true,
      mailerConfigured: mailerConfigured(),
      since: plan.watermark ? new Date(plan.watermark).toISOString() : "the beginning",
      through: plan.through ? new Date(plan.through).toISOString() : null,
      changed: plan.subjects.map((s) => ({
        name: s.name,
        kind: s.kind,
        changes: s.versions.flatMap((v) => v.changes),
      })),
      wouldEmail: plan.emails.map((e) => ({ to: e.to[0], subject: e.subject })),
      skipped: plan.skipped,
    });
  }

  return NextResponse.json(await sendRoadmapDigest({ force: true }));
}

export async function GET(request: NextRequest) {
  // GET is the dry run's natural verb; a GET without ?dry=1 still sends, the
  // same shape /api/cron/announce has, so a scheduler that only does GETs works.
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}

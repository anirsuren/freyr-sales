import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  isWorkflowManager,
  verifiedWorkflowActor,
} from "@/lib/workflowAuthorization";
import { sendTransactionalEmail, type EmailAttachment } from "@/lib/email";

export const dynamic = "force-dynamic";

type FeedbackRecord = {
  id: string;
  workspaceId: string;
  userId: string;
  userName: string;
  type: "bug" | "product_feedback" | "feature_request" | "question";
  title: string;
  description: string;
  screenshot?: string;
  pageUrl: string;
  route: string;
  dataMode: "live" | "mock";
  userAgent: string;
  screen: { width: number; height: number };
  createdAt: string;
  status: "new";
};

declare global {
  // eslint-disable-next-line no-var
  var __FREYR_FEEDBACK__: FeedbackRecord[] | undefined;
}

const localFeedback = globalThis.__FREYR_FEEDBACK__ ?? [];
globalThis.__FREYR_FEEDBACK__ = localFeedback;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false } })
    : null;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function rowId(record: Pick<FeedbackRecord, "workspaceId" | "id">) {
  return `feedback:${record.workspaceId}:${record.id}`;
}

function screenshotAttachment(screenshot?: string): EmailAttachment[] {
  if (!screenshot) return [];
  const match = screenshot.match(
    /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=]+)$/i
  );
  if (!match) return [];
  const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  return [{ filename: `freyr-feedback-${Date.now()}.${extension}`, content: match[2] }];
}

function feedbackEmailBody(record: FeedbackRecord): string {
  return [
    "A new Freyr Sales Intelligence feedback report was submitted.",
    "",
    `Type: ${record.type.replaceAll("_", " ")}`,
    `Title: ${record.title}`,
    `Reporter: ${record.userName}`,
    `User ID: ${record.userId}`,
    `Workspace ID: ${record.workspaceId}`,
    `Submitted: ${record.createdAt}`,
    `Page: ${record.pageUrl || record.route || "Unknown"}`,
    `Route: ${record.route || "Unknown"}`,
    `Data mode: ${record.dataMode}`,
    `Screen: ${record.screen.width} × ${record.screen.height}`,
    `Browser: ${record.userAgent || "Unknown"}`,
    `Report ID: ${record.id}`,
    `Screenshot: ${record.screenshot ? "Attached" : "Not available"}`,
    "",
    "Description",
    "-----------",
    record.description,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  const actor = await verifiedWorkflowActor(req);
  if (!actor)
    return NextResponse.json({ error: "Verified workspace access required." }, { status: 403 });

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const type = clean(body?.type, 40) as FeedbackRecord["type"];
  const title = clean(body?.title, 160);
  const description = clean(body?.description, 5000);
  const rawScreenshot = typeof body?.screenshot === "string" ? body.screenshot.trim() : "";
  if (rawScreenshot.length > 2_800_000)
    return NextResponse.json({ error: "The screenshot is too large (2MB maximum)." }, { status: 413 });
  const screenshot = rawScreenshot;
  if (!["bug", "product_feedback", "feature_request", "question"].includes(type))
    return NextResponse.json({ error: "Choose a feedback type." }, { status: 400 });
  if (!title || !description)
    return NextResponse.json({ error: "Add a title and description." }, { status: 400 });
  if (screenshot && !/^data:image\/(png|jpeg|webp);base64,/i.test(screenshot))
    return NextResponse.json({ error: "The attachment must be a PNG, JPEG, or WebP image." }, { status: 400 });
  const rawScreen = body?.screen && typeof body.screen === "object"
    ? body.screen as Record<string, unknown>
    : {};
  const record: FeedbackRecord = {
    id: randomUUID(),
    workspaceId: actor.workspaceId,
    userId: actor.userId,
    userName: actor.name,
    type,
    title,
    description,
    ...(screenshot ? { screenshot } : {}),
    pageUrl: clean(body?.pageUrl, 2000),
    route: clean(body?.route, 500),
    dataMode: body?.dataMode === "mock" ? "mock" : "live",
    userAgent: clean(req.headers.get("user-agent"), 1000),
    screen: {
      width: Math.max(0, Math.min(20000, Number(rawScreen.width) || 0)),
      height: Math.max(0, Math.min(20000, Number(rawScreen.height) || 0)),
    },
    createdAt: new Date().toISOString(),
    status: "new",
  };

  const db = serviceClient();
  if (db) {
    const { error } = await db.from("offering_catalog_state").insert({
      id: rowId(record),
      catalog: record,
    });
    if (error)
      return NextResponse.json({ error: "Feedback could not be saved." }, { status: 503 });
  } else {
    localFeedback.push(record);
  }

  const recipient =
    process.env.FEEDBACK_RECIPIENT_EMAIL?.trim() ||
    "anir@auctalai.com";
  const emailResult = await sendTransactionalEmail({
    to: recipient,
    subject: `[Freyr feedback] ${record.type.replaceAll("_", " ")}: ${record.title.replace(/\s+/g, " ")}`,
    body: feedbackEmailBody(record),
    attachments: screenshotAttachment(record.screenshot),
  });
  if (!emailResult.ok) {
    return NextResponse.json(
      {
        error: emailResult.skipped
          ? `Feedback was saved, but email delivery to ${recipient} is not configured.`
          : `Feedback was saved, but the email to ${recipient} could not be delivered.`,
        id: record.id,
        saved: true,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: record.id,
    deliveredTo: recipient,
    delivery: emailResult.channel,
  });
}

export async function GET(req: NextRequest) {
  const actor = await verifiedWorkflowActor(req);
  if (!actor || !isWorkflowManager(actor))
    return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const db = serviceClient();
  if (!db) {
    return NextResponse.json({
      feedback: localFeedback.filter((record) => record.workspaceId === actor.workspaceId),
    });
  }
  const { data, error } = await db
    .from("offering_catalog_state")
    .select("catalog")
    .like("id", `feedback:${actor.workspaceId}:%`)
    .order("updated_at", { ascending: false })
    .limit(250);
  if (error)
    return NextResponse.json({ error: "Feedback could not be loaded." }, { status: 503 });
  return NextResponse.json({ feedback: (data || []).map((row) => row.catalog) });
}

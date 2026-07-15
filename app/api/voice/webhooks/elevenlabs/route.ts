import { NextRequest, NextResponse } from "next/server";
import type { ElConversationDetail } from "@/lib/elevenlabs";
import {
  ingestElevenLabsConversation,
  testWebhookSecret,
  upsertVoiceConversation,
  verifyElevenLabsSignature,
} from "@/lib/voiceEvents";

export const dynamic = "force-dynamic";

type WebhookEvent = {
  type?: string;
  event_timestamp?: number;
  data?: ElConversationDetail & {
    failure_reason?: string;
    metadata?: ElConversationDetail["metadata"] & {
      body?: { call_sid?: string; CallSid?: string };
    };
  };
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const secret = testWebhookSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "ELEVENLABS_WEBHOOK_SECRET is not configured." },
      { status: 503 }
    );
  }
  if (
    !verifyElevenLabsSignature(
      rawBody,
      req.headers.get("elevenlabs-signature"),
      secret
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid ElevenLabs signature." },
      { status: 401 }
    );
  }

  let event: WebhookEvent;
  try {
    event = JSON.parse(rawBody) as WebhookEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (event.type === "post_call_transcription" && event.data) {
    const record = await ingestElevenLabsConversation(event.data);
    return NextResponse.json({ ok: true, id: record.id, status: record.status });
  }

  if (event.type === "call_initiation_failure" && event.data) {
    const body = event.data.metadata?.body;
    const record = await upsertVoiceConversation({
      conversation_id: event.data.conversation_id,
      call_sid: body?.call_sid || body?.CallSid,
      agent_id: event.data.agent_id,
      agent_name: event.data.agent_name,
      direction: "outbound",
      status: "failed",
      failure_reason: event.data.failure_reason || "Call initiation failed.",
      metadata: event.data.metadata || {},
      completed_at: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, id: record.id, status: record.status });
  }

  // Audio delivery is intentionally ignored: Freyr stores transcript and
  // analysis metadata, while ElevenLabs remains the system of record for audio.
  return NextResponse.json({ ok: true, ignored: event.type || "unknown" });
}

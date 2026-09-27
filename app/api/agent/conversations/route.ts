import { NextRequest, NextResponse } from "next/server";
import {
  HistoryConflict,
  readDurableConversations,
  sanitizeConversations,
  writeDurableConversations,
} from "@/lib/agentConversationStore";
import { mergeConversationChanges } from "@/lib/conversationChanges";
import { getDb } from "@/lib/db";
import { verifiedRequestMemberScope } from "@/lib/memberScope";

export const dynamic = "force-dynamic";

/* Storage, limits and the merge live in lib/agentConversationStore (shared with
   the WhatsApp webhook since Sep 26); the route keeps the HTTP contract. */
const MAX_PAYLOAD_BYTES = 8_000_000;

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  try {
    const durable = await readDurableConversations(scope);
    if (durable) return NextResponse.json({ conversations: durable, initialized: true });
    const prefs = await getDb().agentPrefs.get(scope);
    return NextResponse.json({
      conversations: sanitizeConversations(prefs?.conversation_state) || [],
      initialized: Boolean(prefs?.conversation_state),
    });
  } catch (error) {
    console.error(
      "[agent/conversations] read failed:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Conversation history is temporarily unavailable." },
      { status: 503 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_PAYLOAD_BYTES) {
    return NextResponse.json({ error: "Conversation history is too large." }, { status: 413 });
  }
  const body = (() => {
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return null;
    }
  })();
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const conversations = sanitizeConversations(body.conversations);
  if (!conversations) {
    return NextResponse.json({ error: "Invalid conversation history." }, { status: 400 });
  }
  const base = sanitizeConversations(body.base);
  if (!base) return NextResponse.json(
    { error: "Reload conversation history before saving." }, { status: 428 }
  );
  try {
    const durable = await writeDurableConversations(scope, conversations, base);
    if (!durable) {
      /* No database: the client now sends only the conversations that
         changed, so merge them into what is stored rather than replacing the
         whole history with the delta. */
      const rawStored = body.delta === true
        ? (await getDb().agentPrefs.get(scope))?.conversation_state
        : undefined;
      const stored = rawStored === undefined ? [] : sanitizeConversations(rawStored);
      if (!stored) throw new Error("Stored conversation history is invalid.");
      const merged = body.delta === true
        ? mergeConversationChanges(base, conversations, stored)
        : conversations;
      if (!merged) throw new HistoryConflict("Another tab changed the same conversation.");
      await getDb().agentPrefs.update(scope, {
        conversation_state: merged,
      });
    }
    return NextResponse.json({ ok: true, count: conversations.length });
  } catch (error) {
    if (error instanceof HistoryConflict) return NextResponse.json(
      { error: error.message }, { status: 409 }
    );
    console.error(
      "[agent/conversations] save failed:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json(
      { error: "Conversation history could not be saved." },
      { status: 503 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifiedRequestMemberScope } from "@/lib/memberScope";

export const dynamic = "force-dynamic";

const MAX_CONVERSATIONS = 500;
const MAX_MESSAGES_PER_CONVERSATION = 500;
const MAX_TEXT_LENGTH = 50_000;
const MAX_PAYLOAD_BYTES = 4_000_000;

type StoredMessage = {
  role: "user" | "agent";
  text: string;
  ts: number;
};

type StoredConversation = {
  id: string;
  title: string;
  messages: StoredMessage[];
  updated: number;
  excludedSources?: string[];
  offeringContext?: { id: string; name: string };
};

function cleanString(value: unknown, max = 500): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function sanitizeConversation(value: unknown): StoredConversation | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = cleanString(raw.id, 200);
  if (!id || !Array.isArray(raw.messages)) return null;
  if (raw.messages.length > MAX_MESSAGES_PER_CONVERSATION) return null;

  const messages: StoredMessage[] = [];
  for (const item of raw.messages) {
    if (!item || typeof item !== "object") return null;
    const message = item as Record<string, unknown>;
    if (message.role !== "user" && message.role !== "agent") return null;
    const text = cleanString(message.text, MAX_TEXT_LENGTH);
    if (!text) return null;
    messages.push({
      role: message.role,
      text,
      ts: typeof message.ts === "number" ? message.ts : Date.now(),
    });
  }

  const excludedSources = Array.isArray(raw.excludedSources)
    ? raw.excludedSources
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.slice(0, 200))
    : undefined;
  const rawOffering =
    raw.offeringContext && typeof raw.offeringContext === "object"
      ? (raw.offeringContext as Record<string, unknown>)
      : null;
  const offeringId = cleanString(rawOffering?.id, 200);
  const offeringName = cleanString(rawOffering?.name, 500);

  return {
    id,
    title: cleanString(raw.title, 500),
    messages,
    updated: typeof raw.updated === "number" ? raw.updated : Date.now(),
    ...(excludedSources?.length ? { excludedSources } : {}),
    ...(offeringId && offeringName
      ? { offeringContext: { id: offeringId, name: offeringName } }
      : {}),
  };
}

function sanitizeConversations(value: unknown): StoredConversation[] | null {
  if (!Array.isArray(value) || value.length > MAX_CONVERSATIONS) return null;
  const clean: StoredConversation[] = [];
  for (const item of value) {
    const conversation = sanitizeConversation(item);
    if (!conversation) return null;
    clean.push(conversation);
  }
  return clean;
}

export async function GET(req: NextRequest) {
  const scope = await verifiedRequestMemberScope(req);
  if (!scope) {
    return NextResponse.json(
      { error: "Verified workspace access required." },
      { status: 403 }
    );
  }
  const prefs = await getDb().agentPrefs.get(scope);
  const conversations = sanitizeConversations(prefs?.conversation_state) || [];
  return NextResponse.json({ conversations });
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
  await getDb().agentPrefs.update(scope, { conversation_state: conversations });
  return NextResponse.json({ ok: true, count: conversations.length });
}

import { NextRequest, NextResponse } from "next/server";
import { listConversations, getConversation } from "@/lib/elevenlabs";
import { hasElevenLabs } from "@/lib/env";
import {
  ingestElevenLabsConversation,
  listStoredVoiceConversations,
} from "@/lib/voiceEvents";
import agentIds from "@/lib/voiceAgents.json";

export const dynamic = "force-dynamic";

interface RefreshState {
  promise: Promise<void> | null;
  lastRun: number;
}

function refreshState(): RefreshState {
  const g = globalThis as typeof globalThis & { __freyrVoiceRefresh?: RefreshState };
  if (!g.__freyrVoiceRefresh) g.__freyrVoiceRefresh = { promise: null, lastRun: 0 };
  return g.__freyrVoiceRefresh;
}

async function refreshFromElevenLabs() {
  const state = refreshState();
  if (state.promise) return state.promise;
  if (Date.now() - state.lastRun < 3_000) return;
  state.lastRun = Date.now();
  state.promise = (async () => {
    const ids = new Set(Object.values(agentIds as Record<string, string>));
    const conversations = (await listConversations(30)).filter((item) =>
      ids.has(item.agent_id)
    );
    await Promise.all(
      conversations.slice(0, 12).map(async (item) => {
        const detail = await getConversation(item.conversation_id);
        if (detail) await ingestElevenLabsConversation(detail);
      })
    );
  })().finally(() => {
    state.promise = null;
  });
  return state.promise;
}

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  if (
    refresh &&
    hasElevenLabs() &&
    process.env.AGENT_FORCE_MOCK !== "1"
  ) {
    await refreshFromElevenLabs().catch(() => {});
  }
  const conversations = await listStoredVoiceConversations(100);
  return NextResponse.json({ ok: true, conversations });
}

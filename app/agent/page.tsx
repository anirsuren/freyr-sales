import { AgentChat } from "@/components/agent/AgentChat";

export const metadata = { title: "Agent" };
export const dynamic = "force-dynamic";

// The agent front door — a full-screen chat. The goal workspace, to-do queue,
// and settings live one click away (in the chat's side rail / tabs).
// `?ask=` seeds a NEW conversation with the question — the global search's
// Enter key lands here (Anir: "like Gemini").
export default async function AgentPage({
  searchParams,
}: {
  searchParams?: Promise<{ ask?: string }>;
}) {
  const params = await searchParams;
  const ask = typeof params?.ask === "string" ? params.ask.trim() : "";
  return <AgentChat initialAsk={ask || undefined} />;
}

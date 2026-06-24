import { AgentChat } from "@/components/agent/AgentChat";

export const metadata = { title: "Agent" };
export const dynamic = "force-dynamic";

// The agent front door — a full-screen chat. The goal workspace, to-do queue,
// and settings live one click away (in the chat's side rail / tabs).
export default function AgentPage() {
  return <AgentChat />;
}

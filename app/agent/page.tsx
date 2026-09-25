import { AgentChat } from "@/components/agent/AgentChat";
import { canOpenModule, requireModuleAccess } from "@/lib/moduleAccessServer";
import { getOffering, initializeLiveOfferings } from "@/lib/offerings";

export const metadata = { title: "Agent" };
export const dynamic = "force-dynamic";

// The agent front door — a full-screen chat. The goal workspace, to-do queue,
// and settings live one click away (in the chat's side rail / tabs).
// `?ask=` seeds a NEW conversation with the question — the global search's
// Enter key lands here (Anir: "like Gemini").
export default async function AgentPage({
  searchParams,
}: {
  searchParams?: Promise<{ ask?: string; offering?: string; conversation?: string }>;
}) {
  await requireModuleAccess("/agent");
  const params = await searchParams;
  const ask = typeof params?.ask === "string" ? params.ask.trim() : "";
  const conversationId =
    typeof params?.conversation === "string"
      ? params.conversation.trim().slice(0, 160)
      : "";
  const offeringId =
    typeof params?.offering === "string" ? params.offering.trim().slice(0, 120) : "";
  let initialOffering: { id: string; name: string } | undefined;
  if (offeringId && await canOpenModule("/offerings")) {
    await initializeLiveOfferings().catch(() => undefined);
    const offering = getOffering(offeringId);
    if (offering) {
      initialOffering = { id: offering.id, name: offering.offering_name };
    }
  }
  return (
    <AgentChat
      initialAsk={ask || undefined}
      initialConversation={conversationId || undefined}
      initialOffering={initialOffering}
      offeringsOnly={!(await canOpenModule("/customers"))}
    />
  );
}

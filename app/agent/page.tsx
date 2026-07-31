import { AgentChat } from "@/components/agent/AgentChat";
import { isOfferingsOnly } from "@/lib/release";
import { getDataMode } from "@/lib/dataMode";
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
  searchParams?: Promise<{ ask?: string; offering?: string }>;
}) {
  const params = await searchParams;
  const ask = typeof params?.ask === "string" ? params.ask.trim() : "";
  const offeringId =
    typeof params?.offering === "string" ? params.offering.trim().slice(0, 120) : "";
  let initialOffering: { id: string; name: string } | undefined;
  if (offeringId) {
    await initializeLiveOfferings().catch(() => undefined);
    const offering = getOffering(offeringId);
    if (offering) {
      initialOffering = { id: offering.id, name: offering.offering_name };
    }
  }
  // The page's own furniture has to obey the same rule as the answers: in real
  // mode there is no pipeline, so nothing here may ask about one.
  return (
    <AgentChat
      initialAsk={ask || undefined}
      initialOffering={initialOffering}
      offeringsOnly={isOfferingsOnly(getDataMode())}
    />
  );
}

import AgentPage from "../../page";
import { requireModuleAccess } from "@/lib/moduleAccessServer";
import { requireServerMemberScope } from "@/lib/memberScope";
import { readDurableConversations } from "@/lib/agentConversationStore";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  try {
    await requireModuleAccess("/agent");
    const scope = await requireServerMemberScope();
    const history = await readDurableConversations(scope);
    const { id } = await params;
    return { title: history?.find(chat => chat.id === id)?.title || "Chat" };
  } catch {
    return { title: "Chat" };
  }
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return AgentPage({ searchParams: Promise.resolve({ conversation: id }) });
}

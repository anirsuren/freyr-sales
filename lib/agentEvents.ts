export const ASK_AGENT_EVENT = "freyr:ask-agent";

export type AgentOfferingContext = {
  id: string;
  name: string;
};

export type AskAgentDetail = {
  prompt?: string;
  offering?: AgentOfferingContext;
  /** Start a clean thread while leaving older account history intact. */
  newConversation?: boolean;
};

export function askFreyrAgent(detail: AskAgentDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AskAgentDetail>(ASK_AGENT_EVENT, { detail })
  );
}

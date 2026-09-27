import {
  agentConverseAgentic as claudeConverseAgentic,
  claudeStatus,
  hasClaudeClient,
  hydrateAnthropicKey,
  type AgentToolDef,
} from "./claude";
import {
  isVertexConfigured,
  vertexConverseAgentic,
  vertexStatus,
} from "./vertex";

export type AgentProvider = "anthropic" | "vertex";

export function configuredAgentProvider(): AgentProvider {
  return process.env.AGENT_PROVIDER?.trim().toLowerCase() === "vertex"
    ? "vertex"
    : "anthropic";
}

export function activeAgentStatus(): string {
  return configuredAgentProvider() === "vertex"
    ? vertexStatus()
    : claudeStatus();
}

type AgentResult = NonNullable<Awaited<ReturnType<typeof claudeConverseAgentic>>>;

/**
 * ONE QUESTION, ONE ANSWER, WHICHEVER MODEL IS UP.
 *
 * Vertex is the provider (Anir, Sep 26: "it's definitely supposed to use
 * Vertex because it's faster"). If a Vertex call fails outright, the same
 * question is asked of Anthropic when a key exists, rather than showing an
 * outage: the tools and permission boundaries are identical, so only the
 * voice changes. `/api/health` still reports the Vertex failure, so a broken
 * federation is visible without the agent going dark. The result names the
 * provider that actually answered.
 *
 * `signal` is the route's time budget; `onReset` tells a streaming client to
 * clear words that turned out to be preamble to a tool call.
 */
export async function agentConversePrimary(
  system: string,
  turns: { role: "user" | "assistant"; content: string }[],
  tools: AgentToolDef[],
  runTool: (
    name: string,
    input: unknown
  ) => Promise<{ content: string; did?: string }>,
  maxSteps?: number,
  onText?: (delta: string) => void,
  onReset?: () => void,
  signal?: AbortSignal,
): Promise<(AgentResult & { provider: AgentProvider }) | null> {
  if (configuredAgentProvider() === "vertex") {
    if (isVertexConfigured()) {
      const result = await vertexConverseAgentic(system, turns, tools, runTool, maxSteps, onText, onReset, signal);
      if (result) return { ...result, provider: "vertex" };
    }
    if (signal?.aborted) return null;
    // Anthropic can be configured in the database rather than the process
    // environment. Load that key before deciding whether a fallback exists.
    await hydrateAnthropicKey();
    if (signal?.aborted || !hasClaudeClient()) return null;
    console.warn(
      `[agent] Vertex ${isVertexConfigured() ? "failed" : "is not configured"}; answering this question through Anthropic`
    );
    onReset?.();
  }
  const result = await claudeConverseAgentic(system, turns, tools, runTool, maxSteps, onText, onReset, signal);
  return result ? { ...result, provider: "anthropic" } : null;
}

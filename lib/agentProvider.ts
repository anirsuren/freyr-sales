import {
  agentConverseAgentic as claudeConverseAgentic,
  claudeStatus,
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

export async function agentConversePrimary(
  system: string,
  turns: { role: "user" | "assistant"; content: string }[],
  tools: AgentToolDef[],
  runTool: (
    name: string,
    input: unknown
  ) => Promise<{ content: string; did?: string }>,
  maxSteps?: number
) {
  if (configuredAgentProvider() === "vertex") {
    if (!isVertexConfigured()) return null;
    return vertexConverseAgentic(system, turns, tools, runTool, maxSteps);
  }
  return claudeConverseAgentic(system, turns, tools, runTool, maxSteps);
}

import "server-only";

import { NextResponse } from "next/server";
import { getDataMode } from "./dataMode";

export const REAL_MODE_AGENT_MUTATION_CODE = "AGENT_REAL_MODE_READ_ONLY";

/**
 * Real workspaces currently expose the assistant as a read-only copilot. Until
 * the product explicitly enables an action, the server must refuse it before
 * touching customer, sequence, review, cadence, send, or agent-run state.
 * Mock mode deliberately keeps the interactive demo actions available.
 */
export function rejectRealModeAgentMutation(): NextResponse | null {
  if (getDataMode() !== "live") return null;
  return NextResponse.json(
    {
      error:
        "Agent actions are disabled in Real mode. Nothing in the workspace was changed.",
      code: REAL_MODE_AGENT_MUTATION_CODE,
    },
    { status: 403 }
  );
}

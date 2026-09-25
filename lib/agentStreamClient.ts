/** Read the agent's progressive reply, with the ordinary JSON route as fallback. */
export async function readAgentResponse(
  response: Response,
  onDelta: (answerSoFar: string) => void,
): Promise<{ reply: string; suggestions?: string[]; entityContext?: string[] }> {
  if (!response.ok) throw new Error("assistant unreachable");
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    return response.json();
  }
  if (!response.body) throw new Error("empty agent stream");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let preview = "";
  let result: { reply: string; suggestions?: string[]; entityContext?: string[] } | null = null;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "delta" && typeof event.text === "string") {
      preview += event.text;
      const marker = "<followups>";
      const metadataStart = preview.indexOf(marker);
      const unfinishedTag = preview.lastIndexOf("<");
      const unfinished = unfinishedTag >= 0 &&
        marker.startsWith(preview.slice(unfinishedTag));
      const visibleEnd = metadataStart >= 0 ? metadataStart : unfinished ? unfinishedTag : preview.length;
      onDelta(preview.slice(0, visibleEnd));
    } else if (event.type === "done" && typeof event.reply === "string") {
      result = event;
    } else if (event.type === "error") {
      throw new Error(event.error || "assistant unreachable");
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
  } finally {
    reader.releaseLock();
  }
  if (!result) throw new Error("agent stream ended without an answer");
  return result;
}

/** Retry a transient connection failure once, but never repeat a request after
 * streamed text has arrived (which could duplicate an answer). */
export async function requestAgentResponse(
  body: Record<string, unknown>,
  signal: AbortSignal,
  onDelta: (answerSoFar: string) => void,
) {
  let startedReply = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("/api/agent/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      if (response.status === 429 || (response.status >= 400 && response.status < 500))
        throw new Error(`agent request failed: ${response.status}`);
      return await readAgentResponse(response, (text) => {
        startedReply = true;
        onDelta(text);
      });
    } catch (error) {
      if (attempt || startedReply || signal.aborted ||
        (error instanceof Error && /agent request failed: 4\d\d/.test(error.message))) throw error;
    }
  }
  throw new Error("assistant unreachable");
}

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

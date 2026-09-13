/** Shared wire format: each update describes completed work, never a timer estimate. */
export type TrackStage = "identity" | "sources" | "briefing" | "saving";
export type TrackProgress = { stage: TrackStage; name?: string; detail?: string };

export async function readTrackingResponse(response: Response, onProgress: (value: TrackProgress) => void): Promise<any> {
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not start tracking.");
    return result;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The connection ended before tracking was confirmed. Check Manage companies before retrying.");
  let buffer = "", result: any;
  const decoder = new TextDecoder();
  function consume(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "progress") onProgress(event.value);
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "complete") result = event.value;
  }
  try {
    while (true) {
      const {value,done} = await reader.read();
      buffer += decoder.decode(value, {stream:!done});
      let index: number;
      while ((index=buffer.indexOf("\n"))>=0) {consume(buffer.slice(0,index));buffer=buffer.slice(index+1);}
      if (done) break;
    }
    consume(buffer);
  } finally { reader.releaseLock(); }
  if (!result) throw new Error("The connection ended before tracking was confirmed. Check Manage companies before retrying.");
  return result;
}

/**
 * UPLOAD THE CHAT HISTORY TO THE ACCOUNT.
 *
 * One implementation for both agent surfaces, because they had the same bug
 * and only one of them showed it.
 *
 * `keepalive` is what lets a save finish after the tab closes, which is worth
 * having on a chat that autosaves as you type. What it cannot do is carry a
 * large body: the Fetch standard caps a keepalive request at 64KB total, and
 * a browser rejects the entire call with a bare "Failed to fetch" past that.
 *
 * Anir hit it on Aug 14, 2026. His history had grown beyond 64KB, so every
 * save threw and the chat page's "Saved on this device. Account sync will
 * retry with your next change." banner became permanent, while the endpoint
 * was healthy the whole time. The dock had the identical call with the error
 * swallowed, so it failed the same way and said nothing at all.
 *
 * Measured that day against /api/agent/conversations:
 *
 *     60KB   keepalive -> 200        no keepalive -> 200
 *     70KB   keepalive -> THREW      no keepalive -> 200
 *    120KB   keepalive -> THREW      no keepalive -> 200
 *
 * So: keep keepalive while it is allowed to work, drop it when it is not.
 * Losing one in-flight save on a very large history is the cheap outcome
 * anyway, since the next change re-uploads the whole snapshot.
 */

/** Below the 64KB spec limit with room for headers and the JSON envelope. */
const KEEPALIVE_MAX_BYTES = 60 * 1024;

export async function putConversations(conversations: unknown[]): Promise<void> {
  const body = JSON.stringify({ conversations });
  const response = await fetch("/api/agent/conversations", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: new Blob([body]).size <= KEEPALIVE_MAX_BYTES,
  });
  if (!response.ok)
    throw new Error("Conversation history was not saved to your account.");
}

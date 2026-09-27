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

/**
 * SEND ONLY WHAT CHANGED (Anir, Sep 26: every message re-uploaded all 144 of
 * his conversations). The server merges per conversation id, so it only
 * needs the before and after of the ids that moved. A brand new chat has no
 * before; a deleted one has no after; an untouched one is not sent at all.
 * The 64KB keepalive ceiling above stops mattering for ordinary messages.
 */
function changedOnly(conversations: unknown[], base: unknown[]) {
  const idOf = (item: unknown) => (item as { id?: string })?.id ?? "";
  const before = new Map(base.map((item) => [idOf(item), item]));
  const after = new Map(conversations.map((item) => [idOf(item), item]));
  const changedBase: unknown[] = [];
  const changedNext: unknown[] = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const was = before.get(id);
    const now = after.get(id);
    if (JSON.stringify(was) === JSON.stringify(now)) continue;
    if (was !== undefined) changedBase.push(was);
    if (now !== undefined) changedNext.push(now);
  }
  return { changedBase, changedNext };
}

export async function putConversations(conversations: unknown[], base: unknown[]): Promise<void> {
  const { changedBase, changedNext } = changedOnly(conversations, base);
  if (!changedBase.length && !changedNext.length) return;
  const body = JSON.stringify({ conversations: changedNext, base: changedBase, delta: true });
  const response = await fetch("/api/agent/conversations", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: new Blob([body]).size <= KEEPALIVE_MAX_BYTES,
  });
  if (!response.ok)
    throw new Error("Conversation history was not saved to your account.");
}

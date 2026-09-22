export const AGENT_DOCK_ACTIVE_KEY = "freyr.agent.dock.active.v1";
const AGENT_DOCK_NAVIGATION_HANDOFF_KEY =
  "freyr.agent.dock.navigation-handoff.v1";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function scopedKey(base: string, userId: string): string {
  return `${base}:${encodeURIComponent(userId)}`;
}

/** Keep the active full-page chat attached to an internal record navigation. */
export function queueAgentNavigationHandoff(
  userId: string,
  conversationId: string,
  storage: BrowserStorage = window.localStorage
) {
  storage.setItem(
    scopedKey(AGENT_DOCK_ACTIVE_KEY, userId),
    conversationId
  );
  storage.setItem(
    scopedKey(AGENT_DOCK_NAVIGATION_HANDOFF_KEY, userId),
    "1"
  );
}

/** Return true exactly once after the Agent page navigates to a record. */
export function consumeAgentNavigationHandoff(
  userId: string,
  storage: BrowserStorage = window.localStorage
): boolean {
  const key = scopedKey(
    AGENT_DOCK_NAVIGATION_HANDOFF_KEY,
    userId
  );
  if (storage.getItem(key) !== "1") return false;
  storage.removeItem(key);
  return true;
}

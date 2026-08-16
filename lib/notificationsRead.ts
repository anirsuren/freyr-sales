/**
 * ONE READ-SET, TWO SURFACES (found Aug 16, driving the notification centre).
 *
 * The bell in the header and the Notifications page both keep "which alerts
 * have I already seen" in the same localStorage key, and both read it exactly
 * once, in an effect, on mount. So pressing "Mark all read" on the page took
 * its own counters to zero while the bell went on announcing 9+ — through
 * every client navigation after it, because the header never unmounts. Only a
 * hard reload cleared it. You cannot tell someone their inbox is empty and
 * keep a badge on it.
 *
 * This is the same shape as the donut hover bus: a module-level set of
 * listeners, notified by whoever writes. Anything that marks something read
 * goes through `persistNotifRead`, and every surface showing a count
 * subscribes. The browser's own `storage` event is folded in as well, so a
 * second tab agrees too — that event never fires in the tab that wrote, which
 * is exactly the case this bus exists to cover.
 */

type Listener = (key: string) => void;

const listeners = new Set<Listener>();
let wiredCrossTab = false;

function wireCrossTab() {
  if (wiredCrossTab || typeof window === "undefined") return;
  wiredCrossTab = true;
  window.addEventListener("storage", (e) => {
    if (!e.key) return;
    for (const fn of listeners) fn(e.key);
  });
}

export function readNotifRead(key: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(key);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set<string>();
  }
}

/**
 * Merge ids into the stored set, write it, and tell every other surface. The
 * merge is against what is ON DISK rather than against React state, so two
 * components marking different things in the same tick cannot clobber each
 * other. Returns the merged set for the caller to render optimistically.
 */
export function persistNotifRead(
  key: string,
  ids: Iterable<string>
): Set<string> {
  const merged = readNotifRead(key);
  for (const id of ids) merged.add(id);
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(merged)));
  } catch {
    /* private mode, quota, or no storage: the session still shows it read */
  }
  for (const fn of listeners) fn(key);
  return merged;
}

/** Subscribe to changes. The listener is handed the key that moved. */
export function subscribeNotifRead(fn: Listener): () => void {
  wireCrossTab();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
